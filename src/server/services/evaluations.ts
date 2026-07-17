import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { DraftSaveInput, SubmissionInput } from "@/lib/schemas";
import { audit } from "./audit";

/** Teammates of a student within a course (their team minus themselves). */
export async function getTeammates(userId: string, courseId: string) {
  const membership = await db.teamMembership.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { team: { include: { memberships: { include: { user: true } } } } },
  });
  if (!membership) return { team: null, teammates: [] };
  const teammates = membership.team.memberships
    .filter((m) => m.userId !== userId && m.user.active)
    .map((m) => ({ id: m.user.id, name: m.user.name }));
  return { team: { id: membership.team.id, name: membership.team.name }, teammates };
}

/** Student-facing view of a course's open round: questions, teammates, own status. */
export async function getCurrentEvaluationContext(userId: string, courseId: string) {
  const round = await db.evaluationRound.findFirst({ where: { courseId, status: "OPEN" } });
  const { team, teammates } = await getTeammates(userId, courseId);
  if (!round) return { round: null, team, teammates, questions: [], submission: null };
  const [questions, submission] = await Promise.all([
    db.question.findMany({ where: { courseId, active: true }, orderBy: { order: "asc" } }),
    db.submission.findUnique({
      where: { roundId_evaluatorId: { roundId: round.id, evaluatorId: userId } },
      select: { id: true, submittedAt: true },
    }),
  ]);
  return { round, team, teammates, questions, submission };
}

/** Submits a student's one-per-round evaluation of all teammates. Immutable once created. */
export async function submitEvaluation(userId: string, input: SubmissionInput) {
  const round = await db.evaluationRound.findUnique({ where: { id: input.roundId } });
  if (!round) throw new HttpError(404, "Round not found");
  if (round.status !== "OPEN") throw new HttpError(400, "This round is not open for submissions");

  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId: round.courseId, userId } },
  });
  if (!enrollment || enrollment.role !== "STUDENT") {
    throw new HttpError(403, "You are not enrolled in this course");
  }

  const existing = await db.submission.findUnique({
    where: { roundId_evaluatorId: { roundId: round.id, evaluatorId: userId } },
  });
  if (existing) throw new HttpError(409, "You have already submitted for this round");

  const { teammates } = await getTeammates(userId, round.courseId);
  if (teammates.length === 0) throw new HttpError(400, "You are not assigned to a team");

  const teammateIds = new Set(teammates.map((t) => t.id));
  const submittedIds = input.evaluations.map((e) => e.evaluateeId);
  if (new Set(submittedIds).size !== submittedIds.length) {
    throw new HttpError(400, "Duplicate evaluatee in submission");
  }
  for (const id of submittedIds) {
    if (id === userId) throw new HttpError(400, "You cannot evaluate yourself");
    if (!teammateIds.has(id)) throw new HttpError(403, "You can only evaluate your teammates");
  }
  if (submittedIds.length !== teammateIds.size) {
    throw new HttpError(400, "You must evaluate every teammate");
  }

  const questions = await db.question.findMany({
    where: { courseId: round.courseId, active: true },
  });
  const questionById = new Map(questions.map((q) => [q.id, q]));

  for (const evaluation of input.evaluations) {
    const answered = new Set<string>();
    for (const answer of evaluation.answers) {
      const q = questionById.get(answer.questionId);
      if (!q) throw new HttpError(400, `Unknown or inactive question: ${answer.questionId}`);
      if (answered.has(q.id)) throw new HttpError(400, "Duplicate answer for a question");
      answered.add(q.id);
      if (q.type === "RATING" && q.required && answer.rating === undefined) {
        throw new HttpError(400, `Question "${q.prompt}" requires a 1-5 rating`);
      }
      if (q.type === "TEXT" && q.required && !answer.comment?.trim()) {
        throw new HttpError(400, `Question "${q.prompt}" requires a comment`);
      }
    }
    for (const q of questions) {
      if (q.required && !answered.has(q.id)) {
        throw new HttpError(400, `Missing answer for required question "${q.prompt}"`);
      }
    }
  }

  const submission = await db.submission.create({
    data: {
      roundId: round.id,
      evaluatorId: userId,
      evaluations: {
        create: input.evaluations.map((e) => ({
          evaluateeId: e.evaluateeId,
          answers: {
            create: e.answers.map((a) => ({
              questionId: a.questionId,
              rating: a.rating ?? null,
              comment: a.comment?.trim() || null,
            })),
          },
        })),
      },
    },
  });

  // The submission is now the immutable record of truth; discard the draft.
  await db.evaluationDraft.deleteMany({ where: { roundId: round.id, evaluatorId: userId } });

  await audit(userId, "evaluation.submit", "Submission", submission.id, { roundId: round.id });
  return submission;
}

/**
 * Upserts a student's in-progress draft for an open round. Server-side storage
 * lets a student resume on any device and lets instructors see who has started
 * (but not yet submitted). Refuses once a round is closed or already submitted.
 */
export async function saveDraft(userId: string, input: DraftSaveInput) {
  const round = await db.evaluationRound.findUnique({ where: { id: input.roundId } });
  if (!round) throw new HttpError(404, "Round not found");
  if (round.status !== "OPEN") throw new HttpError(400, "This round is not open for submissions");

  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId: round.courseId, userId } },
  });
  if (!enrollment || enrollment.role !== "STUDENT") {
    throw new HttpError(403, "You are not enrolled in this course");
  }

  const submitted = await db.submission.findUnique({
    where: { roundId_evaluatorId: { roundId: round.id, evaluatorId: userId } },
    select: { id: true },
  });
  if (submitted) throw new HttpError(409, "You have already submitted for this round");

  return db.evaluationDraft.upsert({
    where: { roundId_evaluatorId: { roundId: round.id, evaluatorId: userId } },
    create: { roundId: round.id, evaluatorId: userId, data: input.data },
    update: { data: input.data },
    select: { updatedAt: true },
  });
}

/** A student's saved draft for a round, or null if none exists. */
export function getDraft(userId: string, roundId: string) {
  return db.evaluationDraft.findUnique({
    where: { roundId_evaluatorId: { roundId, evaluatorId: userId } },
    select: { data: true, updatedAt: true },
  });
}

/** A student's own past submissions (read-only, never others'). */
export function getOwnSubmissions(userId: string) {
  return db.submission.findMany({
    where: { evaluatorId: userId },
    orderBy: { round: { sprint: "desc" } },
    include: {
      round: {
        select: {
          id: true,
          name: true,
          sprint: true,
          status: true,
          course: { select: { id: true, code: true, term: true } },
        },
      },
      evaluations: {
        include: {
          evaluatee: { select: { id: true, name: true } },
          answers: { include: { question: { select: { id: true, prompt: true, type: true, order: true } } } },
        },
      },
    },
  });
}

export type TrackerStatus = "submitted" | "started" | "pending";

/**
 * Instructor view: every active enrolled student's status for a round.
 * "submitted" = final Submission exists; "started" = an autosaved draft but no
 * submission; "pending" = neither. Ordered so those needing a nudge surface first.
 */
export async function getSubmissionTracker(roundId: string, courseId: string) {
  const round = await db.evaluationRound.findUnique({ where: { id: roundId } });
  if (!round || round.courseId !== courseId) throw new HttpError(404, "Round not found");

  const [enrollments, submissions, drafts] = await Promise.all([
    db.courseEnrollment.findMany({
      where: { courseId, role: "STUDENT", user: { active: true } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            memberships: {
              where: { courseId },
              select: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
    db.submission.findMany({ where: { roundId }, select: { evaluatorId: true, submittedAt: true } }),
    db.evaluationDraft.findMany({ where: { roundId }, select: { evaluatorId: true, updatedAt: true } }),
  ]);

  const submittedAt = new Map(submissions.map((s) => [s.evaluatorId, s.submittedAt]));
  const draftAt = new Map(drafts.map((d) => [d.evaluatorId, d.updatedAt]));

  const students = enrollments.map((e) => {
    const u = e.user;
    const submitted = submittedAt.get(u.id) ?? null;
    const started = draftAt.get(u.id) ?? null;
    const status: TrackerStatus = submitted ? "submitted" : started ? "started" : "pending";
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      team: u.memberships[0]?.team ?? null,
      status,
      submittedAt: submitted,
      startedAt: submitted ? null : started,
    };
  });

  const rank: Record<TrackerStatus, number> = { pending: 0, started: 1, submitted: 2 };
  students.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));

  const counts = {
    total: students.length,
    submitted: students.filter((s) => s.status === "submitted").length,
    started: students.filter((s) => s.status === "started").length,
    pending: students.filter((s) => s.status !== "submitted").length,
  };
  return { roundStatus: round.status, students, counts };
}

/** Minutes an instructor must wait between manual nudges for the same round. */
const NUDGE_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Sends a manual "please submit" reminder to non-submitters of an open round,
 * optionally targeting specific students. A short per-round cooldown prevents
 * accidental double-fires and student spam. Returns how many were reminded.
 */
export async function nudgeRound(
  roundId: string,
  courseId: string,
  actorId: string,
  userIds?: string[],
) {
  const round = await db.evaluationRound.findUnique({ where: { id: roundId } });
  if (!round || round.courseId !== courseId) throw new HttpError(404, "Round not found");
  if (round.status !== "OPEN") throw new HttpError(400, "You can only nudge students for an open round");

  const recent = await db.auditLog.findFirst({
    where: {
      action: "round.nudge",
      entity: "EvaluationRound",
      entityId: roundId,
      createdAt: { gt: new Date(Date.now() - NUDGE_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    const waitMin = Math.ceil((NUDGE_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 60_000);
    throw new HttpError(429, `A reminder was sent recently. Try again in ${waitMin} minute(s).`);
  }

  const { notifyRoundReminder } = await import("./notifications");
  const nudged = await notifyRoundReminder(roundId, userIds);
  await audit(actorId, "round.nudge", "EvaluationRound", roundId, {
    nudged,
    targeted: userIds?.length ?? null,
  });
  return { nudged };
}

/** Professor-only: all submissions for a round including evaluator identity. */
export async function getRoundSubmissions(roundId: string) {
  const round = await db.evaluationRound.findUnique({ where: { id: roundId } });
  if (!round) throw new HttpError(404, "Round not found");
  return db.submission.findMany({
    where: { roundId },
    include: {
      evaluator: {
        select: {
          id: true,
          name: true,
          email: true,
          memberships: { where: { courseId: round.courseId }, select: { team: true } },
        },
      },
      evaluations: {
        include: {
          evaluatee: { select: { id: true, name: true, email: true } },
          answers: { include: { question: { select: { id: true, prompt: true, type: true, order: true } } } },
        },
      },
    },
  });
}
