import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { questionReorderSchema } from "@/lib/schemas";
import { reorderQuestions } from "@/server/services/questions";

export const POST = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const input = await parseBody(req, questionReorderSchema);
  const questions = await reorderQuestions(courseId, input, user.id);
  return NextResponse.json(questions);
});
