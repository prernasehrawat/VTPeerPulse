import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { roundUpdateSchema } from "@/lib/schemas";
import { deleteRound, updateRound } from "@/server/services/rounds";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const user = await requireProfessor();
  const { id } = await ctx.params;
  const input = await parseBody(req, roundUpdateSchema);
  return NextResponse.json(await updateRound(id, input, user.id));
});

export const DELETE = apiHandler(async (_req: Request, ctx: Ctx) => {
  const user = await requireProfessor();
  const { id } = await ctx.params;
  await deleteRound(id, user.id);
  return NextResponse.json({ ok: true });
});
