import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { getSubmissionTracker } from "@/server/services/evaluations";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const { id } = await ctx.params;
  return NextResponse.json(await getSubmissionTracker(id, courseId));
});
