import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { roundUpdateSchema } from "@/lib/schemas";
import { deleteRound, updateRound } from "@/server/services/rounds";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  const input = await parseBody(req, roundUpdateSchema);
  return NextResponse.json(await updateRound(id, courseId, input, user.id));
});

export const DELETE = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  await deleteRound(id, courseId, user.id);
  return NextResponse.json({ ok: true });
});
