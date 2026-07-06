import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createQuestion, deleteQuestion, listQuestions, reorderQuestions, updateQuestion,
} from "@/server/services/questions";
import { createRound, deleteRound, setRoundStatus } from "@/server/services/rounds";
import {
  createOpenRound, createProfessor, createQuestions, createTeamWithStudents, resetDb, submitFor,
} from "./helpers";

let actorId: string;

beforeEach(async () => {
  await resetDb();
  actorId = (await createProfessor()).id;
});

describe("questions service", () => {
  it("creates questions with incrementing order", async () => {
    const q1 = await createQuestion({ prompt: "First question", type: "RATING", required: true, active: true }, actorId);
    const q2 = await createQuestion({ prompt: "Second question", type: "TEXT", required: false, active: true }, actorId);
    expect(q1.order).toBe(1);
    expect(q2.order).toBe(2);
  });

  it("updates and toggles questions", async () => {
    const q = await createQuestion({ prompt: "Editable question", type: "RATING", required: true, active: true }, actorId);
    const updated = await updateQuestion(q.id, { prompt: "Edited question", active: false }, actorId);
    expect(updated.prompt).toBe("Edited question");
    expect(updated.active).toBe(false);
  });

  it("hard-deletes questions without answers", async () => {
    const q = await createQuestion({ prompt: "Deletable question", type: "RATING", required: true, active: true }, actorId);
    const result = await deleteQuestion(q.id, actorId);
    expect(result.deleted).toBe(true);
    expect(await db.question.count()).toBe(0);
  });

  it("deactivates instead of deleting questions with answers", async () => {
    const { students } = await createTeamWithStudents("Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions();
    const round = await createOpenRound();
    await submitFor(students[0]!.id, round.id, [students[1]!.id], rating.id, 4);

    const result = await deleteQuestion(rating.id, actorId);
    expect(result).toEqual({ deleted: false, deactivated: true });
    const q = await db.question.findUnique({ where: { id: rating.id } });
    expect(q?.active).toBe(false);
  });

  it("reorders questions and validates the id set", async () => {
    const { rating, text } = await createQuestions();
    await reorderQuestions({ orderedIds: [text.id, rating.id] }, actorId);
    const ordered = await listQuestions();
    expect(ordered.map((q) => q.id)).toEqual([text.id, rating.id]);

    await expect(reorderQuestions({ orderedIds: [text.id] }, actorId)).rejects.toThrow(
      "every question id",
    );
  });
});

describe("rounds service", () => {
  it("rejects duplicate sprints", async () => {
    await createRound({ name: "Sprint 1", sprint: 1 }, actorId);
    await expect(createRound({ name: "Again", sprint: 1 }, actorId)).rejects.toThrow(
      "already exists",
    );
  });

  it("allows only one open round at a time", async () => {
    const r1 = await createRound({ name: "Sprint 1", sprint: 1 }, actorId);
    const r2 = await createRound({ name: "Sprint 2", sprint: 2 }, actorId);
    await setRoundStatus(r1.id, "OPEN", actorId);
    await expect(setRoundStatus(r2.id, "OPEN", actorId)).rejects.toThrow("already open");
  });

  it("enforces valid status transitions", async () => {
    const r = await createRound({ name: "Sprint 1", sprint: 1 }, actorId);
    await expect(setRoundStatus(r.id, "CLOSED", actorId)).rejects.toThrow("Cannot move round");
  });

  it("generates analytics snapshot when a round closes", async () => {
    const { students } = await createTeamWithStudents("Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions();
    const r = await createRound({ name: "Sprint 1", sprint: 1 }, actorId);
    await setRoundStatus(r.id, "OPEN", actorId);
    await submitFor(students[0]!.id, r.id, [students[1]!.id], rating.id, 4);
    await setRoundStatus(r.id, "CLOSED", actorId);

    expect(await db.analyticsSnapshot.count({ where: { roundId: r.id } })).toBe(1);
    const closed = await db.evaluationRound.findUnique({ where: { id: r.id } });
    expect(closed?.closesAt).not.toBeNull();
  });

  it("refuses to delete rounds with submissions", async () => {
    const { students } = await createTeamWithStudents("Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions();
    const r = await createOpenRound();
    await submitFor(students[0]!.id, r.id, [students[1]!.id], rating.id, 4);
    await expect(deleteRound(r.id, actorId)).rejects.toThrow("has submissions");
  });
});
