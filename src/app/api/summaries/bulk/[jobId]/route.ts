import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { getBulkSummaryStatus } from "@/server/services/summaries";

type Ctx = { params: Promise<{ jobId: string }> };

export const GET = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const { jobId } = await ctx.params;
  return NextResponse.json(await getBulkSummaryStatus(jobId, courseId));
});
