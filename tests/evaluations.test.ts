import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import {
  getCurrentEvaluationContext,
  getOwnSubmissions,
  getTeammates,
  submitEvaluation,
} from "@/server/services/evaluations";
import type { User, Question, EvaluationRound } from "@/generated/prisma/client";
import {
  createOpenRound, createQuestions, createTeamWithStudents, resetDb, submitFor,
} from "./helpers";

let joe: User, peter: User, sarah: User, outsider: User;
let rating: Question, text: Question;
let round: EvaluationRound;

beforeEach(async () => {
  await resetDb();
  const alpha = await createTeamWithStudents("Alpha", ["Joe", "Peter", "Sarah"]);
  const beta = await createTeamWithStudents("Beta", ["Outsider"]);
  [joe, peter, sarah] = alpha.students as [User, User, User];
  outsider = beta.students[0]!;
  ({ rating, text } = await createQuestions());
  round = await createOpenRound();
});

const answersFor = (evaluateeId: string, r = 4) => ({
  evaluateeId,
  answers: [
    { questionId: rating.id, rating: r },
    { questionId: text.id, comment: "solid work" },
  ],
});

describe("getTeammates", () => {
  it("returns team members excluding self", async () => {
    const { team, teammates } = await getTeammates(joe.id);
    expect(team?.name).toBe("Alpha");
    expect(teammates.map((t) => t.name).sort()).toEqual(["Peter", "Sarah"]);
  });

  it("returns empty for unassigned students", async () => {
    const solo = await db.user.create({
      data: { email: "solo@vt.edu", name: "Solo", role: "STUDENT" },
    });
    const { team, teammates } = await getTeammates(solo.id);
    expect(team).toBeNull();
    expect(teammates).toEqual([]);
  });
});

describe("submitEvaluation", () => {
  it("accepts a valid submission covering all teammates", async () => {
    const submission = await submitEvaluation(joe.id, {
      roundId: round.id,
      evaluations: [answersFor(peter.id), answersFor(sarah.id, 5)],
    });
    expect(submission.id).toBeTruthy();
    const answers = await db.answer.count();
    expect(answers).toBe(4);
  });

  it("rejects self-evaluation", async () => {
    await expect(
      submitEvaluation(joe.id, {
        roundId: round.id,
        evaluations: [answersFor(joe.id), answersFor(peter.id)],
      }),
    ).rejects.toThrow("cannot evaluate yourself");
  });

  it("rejects evaluating a non-teammate", async () => {
    await expect(
      submitEvaluation(joe.id, {
        roundId: round.id,
        evaluations: [answersFor(peter.id), answersFor(outsider.id)],
      }),
    ).rejects.toThrow("only evaluate your teammates");
  });

  it("requires evaluating every teammate", async () => {
    await expect(
      submitEvaluation(joe.id, { roundId: round.id, evaluations: [answersFor(peter.id)] }),
    ).rejects.toThrow("every teammate");
  });

  it("enforces one submission per round (immutable)", async () => {
    await submitEvaluation(joe.id, {
      roundId: round.id,
      evaluations: [answersFor(peter.id), answersFor(sarah.id)],
    });
    await expect(
      submitEvaluation(joe.id, {
        roundId: round.id,
        evaluations: [answersFor(peter.id), answersFor(sarah.id)],
      }),
    ).rejects.toThrow("already submitted");
  });

  it("rejects submissions to a closed round", async () => {
    await db.evaluationRound.update({ where: { id: round.id }, data: { status: "CLOSED" } });
    await expect(
      submitEvaluation(joe.id, {
        roundId: round.id,
        evaluations: [answersFor(peter.id), answersFor(sarah.id)],
      }),
    ).rejects.toThrow("not open");
  });

  it("requires ratings on required rating questions", async () => {
    await expect(
      submitEvaluation(joe.id, {
        roundId: round.id,
        evaluations: [
          { evaluateeId: peter.id, answers: [{ questionId: text.id, comment: "hi" }] },
          answersFor(sarah.id),
        ],
      }),
    ).rejects.toThrow("Missing answer for required question");
  });

  it("rejects answers to unknown or inactive questions", async () => {
    await db.question.update({ where: { id: text.id }, data: { active: false } });
    await expect(
      submitEvaluation(joe.id, {
        roundId: round.id,
        evaluations: [answersFor(peter.id), answersFor(sarah.id)],
      }),
    ).rejects.toThrow("Unknown or inactive question");
  });

  it("throws 400 for students without a team", async () => {
    const solo = await db.user.create({
      data: { email: "solo@vt.edu", name: "Solo", role: "STUDENT" },
    });
    await expect(
      submitEvaluation(solo.id, { roundId: round.id, evaluations: [answersFor(peter.id)] }),
    ).rejects.toThrowError(HttpError);
  });
});

describe("student views", () => {
  it("getCurrentEvaluationContext reflects submission status", async () => {
    let ctx = await getCurrentEvaluationContext(joe.id);
    expect(ctx.round?.id).toBe(round.id);
    expect(ctx.submission).toBeNull();
    expect(ctx.questions.map((q) => q.id)).toEqual([rating.id, text.id]);

    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 4);
    ctx = await getCurrentEvaluationContext(joe.id);
    expect(ctx.submission).not.toBeNull();
  });

  it("getOwnSubmissions returns only the student's own submissions", async () => {
    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 4);
    await submitFor(peter.id, round.id, [joe.id, sarah.id], rating.id, 2);

    const mine = await getOwnSubmissions(joe.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.evaluations.map((e) => e.evaluatee.name).sort()).toEqual(["Peter", "Sarah"]);
  });
});
