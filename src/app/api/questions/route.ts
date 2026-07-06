import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor, requireUser } from "@/lib/guards";
import { questionCreateSchema } from "@/lib/schemas";
import { createQuestion, listQuestions } from "@/server/services/questions";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  // Students only ever see active questions.
  const questions = await listQuestions(user.role === "STUDENT");
  return NextResponse.json(questions);
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireProfessor();
  const input = await parseBody(req, questionCreateSchema);
  const question = await createQuestion(input, user.id);
  return NextResponse.json(question, { status: 201 });
});
