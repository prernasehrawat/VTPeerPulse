import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { releaseSummary } from "@/server/services/summaries";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  return NextResponse.json(await releaseSummary(id, courseId, user.id));
});
