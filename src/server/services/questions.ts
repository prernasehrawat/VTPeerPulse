import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import {
  questionCreateSchema,
  questionReorderSchema,
  questionUpdateSchema,
} from "@/lib/schemas";
import { audit } from "./audit";

export function listQuestions(activeOnly = false) {
  return db.question.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { order: "asc" },
  });
}

export async function createQuestion(input: z.infer<typeof questionCreateSchema>, actorId: string) {
  const max = await db.question.aggregate({ _max: { order: true } });
  const question = await db.question.create({
    data: { ...input, order: (max._max.order ?? 0) + 1 },
  });
  await audit(actorId, "question.create", "Question", question.id);
  return question;
}

export async function updateQuestion(
  id: string,
  input: z.infer<typeof questionUpdateSchema>,
  actorId: string,
) {
  const existing = await db.question.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Question not found");
  const question = await db.question.update({ where: { id }, data: input });
  await audit(actorId, "question.update", "Question", id);
  return question;
}

export async function deleteQuestion(id: string, actorId: string) {
  const existing = await db.question.findUnique({
    where: { id },
    include: { _count: { select: { answers: true } } },
  });
  if (!existing) throw new HttpError(404, "Question not found");
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
  input: z.infer<typeof questionReorderSchema>,
  actorId: string,
) {
  const questions = await db.question.findMany({ select: { id: true } });
  const known = new Set(questions.map((q) => q.id));
  if (input.orderedIds.length !== known.size || !input.orderedIds.every((id) => known.has(id))) {
    throw new HttpError(400, "orderedIds must contain every question id exactly once");
  }
  await db.$transaction(
    input.orderedIds.map((id, i) => db.question.update({ where: { id }, data: { order: i + 1 } })),
  );
  await audit(actorId, "question.reorder", "Question");
  return listQuestions();
}
