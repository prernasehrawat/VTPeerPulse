import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { thresholdsSchema } from "@/lib/schemas";
import { getThresholds, setThresholds } from "@/server/services/settings";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  return NextResponse.json(await getThresholds(courseId));
});

export const PUT = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId);
  const input = await parseBody(req, thresholdsSchema);
  return NextResponse.json(await setThresholds(courseId, input));
});
