import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { computeTrends } from "@/server/services/analytics";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  return NextResponse.json(await computeTrends(courseId));
});
