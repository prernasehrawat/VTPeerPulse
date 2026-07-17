import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { getRoundAnalytics } from "@/server/services/analytics";
import { getRoundInCourse } from "@/server/services/rounds";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const { id } = await ctx.params;
  await getRoundInCourse(id, courseId);
  return NextResponse.json(await getRoundAnalytics(id));
});
