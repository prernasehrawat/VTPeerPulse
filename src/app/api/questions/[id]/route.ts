import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { questionUpdateSchema } from "@/lib/schemas";
import { deleteQuestion, updateQuestion } from "@/server/services/questions";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const user = await requireProfessor();
  const { id } = await ctx.params;
  const input = await parseBody(req, questionUpdateSchema);
  const question = await updateQuestion(id, input, user.id);
  return NextResponse.json(question);
});

export const DELETE = apiHandler(async (_req: Request, ctx: Ctx) => {
  const user = await requireProfessor();
  const { id } = await ctx.params;
  const result = await deleteQuestion(id, user.id);
  return NextResponse.json(result);
});
