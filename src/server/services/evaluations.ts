import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { SubmissionInput } from "@/lib/schemas";
import { audit } from "./audit";

/** Teammates of a student (their team minus themselves). */
export async function getTeammates(userId: string) {
  const membership = await db.teamMembership.findUnique({
    where: { userId },
    include: { team: { include: { memberships: { include: { user: true } } } } },
  });
  if (!membership) return { team: null, teammates: [] };
  const teammates = membership.team.memberships
    .filter((m) => m.userId !== userId && m.user.active)
    .map((m) => ({ id: m.user.id, name: m.user.name }));
  return { team: { id: membership.team.id, name: membership.team.name }, teammates };
}

/** Student-facing view of the currently open round: questions, teammates, own status. */
export async function getCurrentEvaluationContext(userId: string) {
  const round = await db.evaluationRound.findFirst({ where: { status: "OPEN" } });
  const { team, teammates } = await getTeammates(userId);
  if (!round) return { round: null, team, teammates, questions: [], submission: null };
  const [questions, submission] = await Promise.all([
    db.question.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
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

  const existing = await db.submission.findUnique({
    where: { roundId_evaluatorId: { roundId: round.id, evaluatorId: userId } },
  });
  if (existing) throw new HttpError(409, "You have already submitted for this round");

  const { teammates } = await getTeammates(userId);
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

  const questions = await db.question.findMany({ where: { active: true } });
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

  await audit(userId, "evaluation.submit", "Submission", submission.id, { roundId: round.id });
  return submission;
}

/** A student's own past submissions (read-only, never others'). */
export function getOwnSubmissions(userId: string) {
  return db.submission.findMany({
    where: { evaluatorId: userId },
    orderBy: { round: { sprint: "desc" } },
    include: {
      round: { select: { id: true, name: true, sprint: true, status: true } },
      evaluations: {
        include: {
          evaluatee: { select: { id: true, name: true } },
          answers: { include: { question: { select: { id: true, prompt: true, type: true, order: true } } } },
        },
      },
    },
  });
}

/** Professor-only: all submissions for a round including evaluator identity. */
export function getRoundSubmissions(roundId: string) {
  return db.submission.findMany({
    where: { roundId },
    include: {
      evaluator: { select: { id: true, name: true, email: true, membership: { select: { team: true } } } },
      evaluations: {
        include: {
          evaluatee: { select: { id: true, name: true, email: true } },
          answers: { include: { question: { select: { id: true, prompt: true, type: true, order: true } } } },
        },
      },
    },
  });
}
