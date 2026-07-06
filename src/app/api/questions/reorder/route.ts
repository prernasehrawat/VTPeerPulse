import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { questionReorderSchema } from "@/lib/schemas";
import { reorderQuestions } from "@/server/services/questions";

export const POST = apiHandler(async (req: Request) => {
  const user = await requireProfessor();
  const input = await parseBody(req, questionReorderSchema);
  const questions = await reorderQuestions(input, user.id);
  return NextResponse.json(questions);
});
