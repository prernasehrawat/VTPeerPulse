import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { getThresholds } from "./settings";
import type { Prisma } from "@/generated/prisma/client";

export type StudentStat = {
  userId: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  average: number | null;
  ratingsCount: number;
  submitted: boolean;
};

export type TeamStat = {
  teamId: string;
  name: string;
  average: number | null;
  memberCount: number;
  submittedCount: number;
  completionPct: number;
};

export type QuestionStat = {
  questionId: string;
  prompt: string;
  average: number | null;
  count: number;
  distribution: [number, number, number, number, number];
};

export type RoundAnalytics = {
  roundId: string;
  roundName: string;
  sprint: number;
  overallAverage: number | null;
  totalStudents: number;
  submittedCount: number;
  completionPct: number;
  teams: TeamStat[];
  students: StudentStat[];
  questions: QuestionStat[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length === 0 ? null : round2(xs.reduce((a, b) => a + b, 0) / xs.length));

export async function computeRoundAnalytics(roundId: string): Promise<RoundAnalytics> {
  const round = await db.evaluationRound.findUnique({ where: { id: roundId } });
  if (!round) throw new HttpError(404, "Round not found");

  const [students, answers, submissions] = await Promise.all([
    db.user.findMany({
      where: { role: "STUDENT", active: true },
      include: { membership: { include: { team: true } } },
    }),
    db.answer.findMany({
      where: { rating: { not: null }, peerEvaluation: { submission: { roundId } } },
      include: {
        peerEvaluation: { select: { evaluateeId: true } },
        question: { select: { id: true, prompt: true } },
      },
    }),
    db.submission.findMany({ where: { roundId }, select: { evaluatorId: true } }),
  ]);

  const submittedBy = new Set(submissions.map((s) => s.evaluatorId));
  const ratingsByStudent = new Map<string, number[]>();
  const ratingsByQuestion = new Map<string, { prompt: string; ratings: number[] }>();
  const allRatings: number[] = [];

  for (const a of answers) {
    const rating = a.rating!;
    allRatings.push(rating);
    const sid = a.peerEvaluation.evaluateeId;
    (ratingsByStudent.get(sid) ?? ratingsByStudent.set(sid, []).get(sid)!).push(rating);
    const q = ratingsByQuestion.get(a.question.id) ?? { prompt: a.question.prompt, ratings: [] };
    q.ratings.push(rating);
    ratingsByQuestion.set(a.question.id, q);
  }

  const studentStats: StudentStat[] = students.map((s) => {
    const ratings = ratingsByStudent.get(s.id) ?? [];
    return {
      userId: s.id,
      name: s.name,
      teamId: s.membership?.teamId ?? null,
      teamName: s.membership?.team.name ?? null,
      average: avg(ratings),
      ratingsCount: ratings.length,
      submitted: submittedBy.has(s.id),
    };
  });

  const teamMap = new Map<string, { name: string; members: StudentStat[] }>();
  for (const s of studentStats) {
    if (!s.teamId || !s.teamName) continue;
    const t = teamMap.get(s.teamId) ?? { name: s.teamName, members: [] };
    t.members.push(s);
    teamMap.set(s.teamId, t);
  }
  const teamStats: TeamStat[] = [...teamMap.entries()]
    .map(([teamId, t]) => {
      const memberAvgs = t.members.map((m) => m.average).filter((x): x is number => x !== null);
      const submittedCount = t.members.filter((m) => m.submitted).length;
      return {
        teamId,
        name: t.name,
        average: avg(memberAvgs),
        memberCount: t.members.length,
        submittedCount,
        completionPct: t.members.length === 0 ? 0 : round2((submittedCount / t.members.length) * 100),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const questionStats: QuestionStat[] = [...ratingsByQuestion.entries()].map(([questionId, q]) => {
    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const r of q.ratings) distribution[r - 1] = (distribution[r - 1] ?? 0) + 1;
    return { questionId, prompt: q.prompt, average: avg(q.ratings), count: q.ratings.length, distribution };
  });

  const teamedStudents = studentStats.filter((s) => s.teamId !== null);
  return {
    roundId,
    roundName: round.name,
    sprint: round.sprint,
    overallAverage: avg(allRatings),
    totalStudents: teamedStudents.length,
    submittedCount: teamedStudents.filter((s) => s.submitted).length,
    completionPct:
      teamedStudents.length === 0
        ? 0
        : round2((teamedStudents.filter((s) => s.submitted).length / teamedStudents.length) * 100),
    teams: teamStats,
    students: studentStats.sort((a, b) => a.name.localeCompare(b.name)),
    questions: questionStats,
  };
}

export type TrendPoint = {
  roundId: string;
  roundName: string;
  sprint: number;
  overallAverage: number | null;
  completionPct: number;
  teams: Record<string, number | null>;
  students: Record<string, number | null>;
};

/** Score history across all rounds that have submissions (oldest first). */
export async function computeTrends(): Promise<TrendPoint[]> {
  const rounds = await db.evaluationRound.findMany({
    where: { submissions: { some: {} } },
    orderBy: { sprint: "asc" },
    select: { id: true },
  });
  const points: TrendPoint[] = [];
  for (const r of rounds) {
    const a = await computeRoundAnalytics(r.id);
    points.push({
      roundId: a.roundId,
      roundName: a.roundName,
      sprint: a.sprint,
      overallAverage: a.overallAverage,
      completionPct: a.completionPct,
      teams: Object.fromEntries(a.teams.map((t) => [t.name, t.average])),
      students: Object.fromEntries(a.students.map((s) => [s.userId, s.average])),
    });
  }
  return points;
}

/** Snapshots analytics and (re)generates alerts for a round. Called on round close. */
export async function generateRoundArtifacts(roundId: string) {
  const analytics = await computeRoundAnalytics(roundId);
  const thresholds = await getThresholds();
  const trends = await computeTrends();

  await db.analyticsSnapshot.create({
    data: { roundId, data: analytics as unknown as Prisma.InputJsonValue },
  });

  // Recompute alerts idempotently for this round.
  await db.alert.deleteMany({ where: { roundId } });
  const alerts: Prisma.AlertCreateManyInput[] = [];

  for (const s of analytics.students) {
    if (s.teamId === null) continue;
    if (!s.submitted) {
      alerts.push({
        roundId,
        type: "MISSING_SUBMISSION",
        severity: "WARNING",
        userId: s.userId,
        teamId: s.teamId,
        message: `${s.name} did not submit an evaluation for ${analytics.roundName}.`,
      });
    }
    if (s.average !== null && s.average < thresholds.lowAverage) {
      alerts.push({
        roundId,
        type: "LOW_AVERAGE",
        severity: s.average < thresholds.lowAverage - 1 ? "CRITICAL" : "WARNING",
        userId: s.userId,
        teamId: s.teamId,
        message: `${s.name} received an average of ${s.average} (threshold ${thresholds.lowAverage}).`,
      });
    }
  }

  for (const t of analytics.teams) {
    if (t.average !== null && t.average < thresholds.lowAverage) {
      alerts.push({
        roundId,
        type: "LOW_AVERAGE",
        severity: "WARNING",
        teamId: t.teamId,
        message: `Team ${t.name} average is ${t.average} (threshold ${thresholds.lowAverage}).`,
      });
    }
  }

  // Trend-based alerts need at least two data points, current round last.
  const idx = trends.findIndex((p) => p.roundId === roundId);
  if (idx > 0) {
    const current = trends[idx]!;
    const previous = trends[idx - 1]!;
    for (const s of analytics.students) {
      const now = current.students[s.userId];
      const before = previous.students[s.userId];
      if (now != null && before != null && before - now >= thresholds.trendDrop) {
        alerts.push({
          roundId,
          type: "DOWNWARD_TREND",
          severity: "WARNING",
          userId: s.userId,
          teamId: s.teamId ?? undefined,
          message: `${s.name}'s average dropped from ${before} to ${now}.`,
        });
      }
    }
    // Repeated concern: below threshold for N consecutive rounds ending now.
    const windowSize = thresholds.repeatedConcernRounds;
    if (idx + 1 >= windowSize) {
      const window = trends.slice(idx + 1 - windowSize, idx + 1);
      for (const s of analytics.students) {
        const belowInAll = window.every((p) => {
          const v = p.students[s.userId];
          return v != null && v < thresholds.lowAverage;
        });
        if (belowInAll) {
          alerts.push({
            roundId,
            type: "REPEATED_CONCERN",
            severity: "CRITICAL",
            userId: s.userId,
            teamId: s.teamId ?? undefined,
            message: `${s.name} has been below the ${thresholds.lowAverage} threshold for ${windowSize} consecutive rounds.`,
          });
        }
      }
    }
  }

  if (alerts.length > 0) await db.alert.createMany({ data: alerts });
  return { analytics, alertCount: alerts.length };
}

export function listAlerts(includeResolved = false) {
  return db.alert.findMany({
    where: includeResolved ? undefined : { resolved: false },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      round: { select: { id: true, name: true, sprint: true } },
    },
  });
}

export async function resolveAlert(id: string) {
  const alert = await db.alert.findUnique({ where: { id } });
  if (!alert) throw new HttpError(404, "Alert not found");
  return db.alert.update({ where: { id }, data: { resolved: true } });
}
