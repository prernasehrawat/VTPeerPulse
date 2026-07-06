import { NextResponse } from "next/server";
import { apiHandler, requireCourseParam, requireCourseStudent } from "@/lib/guards";
import { getCurrentEvaluationContext } from "@/server/services/evaluations";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseStudent(courseId);
  return NextResponse.json(await getCurrentEvaluationContext(user.id, courseId));
});
