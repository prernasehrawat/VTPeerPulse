import { NextResponse } from "next/server";
import {
  apiHandler,
  parseBody,
  requireCourseInstructor,
  requireCourseParam,
  requireCourseStudent,
  requireUser,
} from "@/lib/guards";
import { questionCreateSchema } from "@/lib/schemas";
import { createQuestion, listQuestions } from "@/server/services/questions";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireUser();
  if (user.role === "STUDENT") {
    await requireCourseStudent(courseId);
    // Students only ever see active questions.
    return NextResponse.json(await listQuestions(courseId, true));
  }
  await requireCourseInstructor(courseId, true);
  return NextResponse.json(await listQuestions(courseId));
});

export const POST = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const input = await parseBody(req, questionCreateSchema);
  const question = await createQuestion(courseId, input, user.id);
  return NextResponse.json(question, { status: 201 });
});
