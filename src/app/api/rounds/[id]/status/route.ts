import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { roundStatusSchema } from "@/lib/schemas";
import { setRoundStatus } from "@/server/services/rounds";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  const { status } = await parseBody(req, roundStatusSchema);
  return NextResponse.json(await setRoundStatus(id, courseId, status, user.id));
});
