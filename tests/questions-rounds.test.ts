import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createQuestion, deleteQuestion, listQuestions, reorderQuestions, updateQuestion,
} from "@/server/services/questions";
import { createRound, deleteRound, setRoundStatus } from "@/server/services/rounds";
import type { Course } from "@/generated/prisma/client";
import {
  createCourse, createOpenRound, createProfessor, createQuestions, createTeamWithStudents,
  resetDb, submitFor,
} from "./helpers";

let course: Course;
let actorId: string;

beforeEach(async () => {
  await resetDb();
  course = await createCourse();
  actorId = (await createProfessor(course.id)).id;
});

describe("questions service", () => {
  it("creates questions with incrementing order", async () => {
    const q1 = await createQuestion(course.id, { prompt: "First question", type: "RATING", required: true, active: true }, actorId);
    const q2 = await createQuestion(course.id, { prompt: "Second question", type: "TEXT", required: false, active: true }, actorId);
    expect(q1.order).toBe(1);
    expect(q2.order).toBe(2);
  });

  it("updates and toggles questions", async () => {
    const q = await createQuestion(course.id, { prompt: "Editable question", type: "RATING", required: true, active: true }, actorId);
    const updated = await updateQuestion(q.id, course.id, { prompt: "Edited question", active: false }, actorId);
    expect(updated.prompt).toBe("Edited question");
    expect(updated.active).toBe(false);
  });

  it("hard-deletes questions without answers", async () => {
    const q = await createQuestion(course.id, { prompt: "Deletable question", type: "RATING", required: true, active: true }, actorId);
    const result = await deleteQuestion(q.id, course.id, actorId);
    expect(result.deleted).toBe(true);
    expect(await db.question.count()).toBe(0);
  });

  it("deactivates instead of deleting questions with answers", async () => {
    const { students } = await createTeamWithStudents(course.id, "Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions(course.id);
    const round = await createOpenRound(course.id);
    await submitFor(students[0]!.id, round.id, [students[1]!.id], rating.id, 4);

    const result = await deleteQuestion(rating.id, course.id, actorId);
    expect(result).toEqual({ deleted: false, deactivated: true });
    const q = await db.question.findUnique({ where: { id: rating.id } });
    expect(q?.active).toBe(false);
  });

  it("reorders questions and validates the id set", async () => {
    const { rating, text } = await createQuestions(course.id);
    await reorderQuestions(course.id, { orderedIds: [text.id, rating.id] }, actorId);
    const ordered = await listQuestions(course.id);
    expect(ordered.map((q) => q.id)).toEqual([text.id, rating.id]);

    await expect(reorderQuestions(course.id, { orderedIds: [text.id] }, actorId)).rejects.toThrow(
      "every question id",
    );
  });
});

describe("rounds service", () => {
  it("rejects duplicate sprints", async () => {
    await createRound(course.id, { name: "Sprint 1", sprint: 1 }, actorId);
    await expect(createRound(course.id, { name: "Again", sprint: 1 }, actorId)).rejects.toThrow(
      "already exists",
    );
  });

  it("allows only one open round at a time", async () => {
    const r1 = await createRound(course.id, { name: "Sprint 1", sprint: 1 }, actorId);
    const r2 = await createRound(course.id, { name: "Sprint 2", sprint: 2 }, actorId);
    await setRoundStatus(r1.id, course.id, "OPEN", actorId);
    await expect(setRoundStatus(r2.id, course.id, "OPEN", actorId)).rejects.toThrow("already open");
  });

  it("enforces valid status transitions", async () => {
    const r = await createRound(course.id, { name: "Sprint 1", sprint: 1 }, actorId);
    await expect(setRoundStatus(r.id, course.id, "CLOSED", actorId)).rejects.toThrow("Cannot move round");
  });

  it("generates analytics snapshot when a round closes", async () => {
    const { students } = await createTeamWithStudents(course.id, "Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions(course.id);
    const r = await createRound(course.id, { name: "Sprint 1", sprint: 1 }, actorId);
    await setRoundStatus(r.id, course.id, "OPEN", actorId);
    await submitFor(students[0]!.id, r.id, [students[1]!.id], rating.id, 4);
    await setRoundStatus(r.id, course.id, "CLOSED", actorId);

    expect(await db.analyticsSnapshot.count({ where: { roundId: r.id } })).toBe(1);
    const closed = await db.evaluationRound.findUnique({ where: { id: r.id } });
    expect(closed?.closesAt).not.toBeNull();
  });

  it("refuses to delete rounds with submissions", async () => {
    const { students } = await createTeamWithStudents(course.id, "Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions(course.id);
    const r = await createOpenRound(course.id);
    await submitFor(students[0]!.id, r.id, [students[1]!.id], rating.id, 4);
    await expect(deleteRound(r.id, course.id, actorId)).rejects.toThrow("has submissions");
  });
});
