import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import {
  questionCreateSchema,
  questionReorderSchema,
  questionUpdateSchema,
} from "@/lib/schemas";
import { audit } from "./audit";

export function listQuestions(courseId: string, activeOnly = false) {
  return db.question.findMany({
    where: { courseId, ...(activeOnly ? { active: true } : {}) },
    orderBy: { order: "asc" },
  });
}

export async function createQuestion(
  courseId: string,
  input: z.infer<typeof questionCreateSchema>,
  actorId: string,
) {
  const max = await db.question.aggregate({ where: { courseId }, _max: { order: true } });
  const question = await db.question.create({
    data: { ...input, courseId, order: (max._max.order ?? 0) + 1 },
  });
  await audit(actorId, "question.create", "Question", question.id, { courseId });
  return question;
}

export async function updateQuestion(
  id: string,
  courseId: string,
  input: z.infer<typeof questionUpdateSchema>,
  actorId: string,
) {
  const existing = await db.question.findUnique({
    where: { id },
    include: { _count: { select: { answers: true } } },
  });
  if (!existing || existing.courseId !== courseId) throw new HttpError(404, "Question not found");
  // Once a question has answers, its wording and type are frozen: editing them
  // would silently rewrite what historical responses meant. Create a new
  // question (and deactivate this one) instead.
  if (existing._count.answers > 0) {
    if (input.prompt !== undefined && input.prompt !== existing.prompt) {
      throw new HttpError(
        400,
        "This question already has responses, so its wording can't change. Disable it and create a new question instead.",
      );
    }
    if (input.type !== undefined && input.type !== existing.type) {
      throw new HttpError(400, "This question already has responses, so its type can't change.");
    }
  }
  const question = await db.question.update({ where: { id }, data: input });
  await audit(actorId, "question.update", "Question", id);
  return question;
}

export async function deleteQuestion(id: string, courseId: string, actorId: string) {
  const existing = await db.question.findUnique({
    where: { id },
    include: { _count: { select: { answers: true } } },
  });
  if (!existing || existing.courseId !== courseId) throw new HttpError(404, "Question not found");
  if (existing._count.answers > 0) {
    // Preserve historical answers: deactivate instead of hard delete.
    await db.question.update({ where: { id }, data: { active: false } });
    await audit(actorId, "question.deactivate", "Question", id);
    return { deleted: false, deactivated: true };
  }
  await db.question.delete({ where: { id } });
  await audit(actorId, "question.delete", "Question", id);
  return { deleted: true, deactivated: false };
}

export async function reorderQuestions(
  courseId: string,
  input: z.infer<typeof questionReorderSchema>,
  actorId: string,
) {
  const questions = await db.question.findMany({ where: { courseId }, select: { id: true } });
  const known = new Set(questions.map((q) => q.id));
  if (input.orderedIds.length !== known.size || !input.orderedIds.every((id) => known.has(id))) {
    throw new HttpError(400, "orderedIds must contain every question id exactly once");
  }
  await db.$transaction(
    input.orderedIds.map((id, i) => db.question.update({ where: { id }, data: { order: i + 1 } })),
  );
  await audit(actorId, "question.reorder", "Question", undefined, { courseId });
  return listQuestions(courseId);
}
