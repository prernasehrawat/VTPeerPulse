import { NextResponse } from "next/server";
import { apiHandler, requireStudent } from "@/lib/guards";
import { getCurrentEvaluationContext } from "@/server/services/evaluations";

export const GET = apiHandler(async () => {
  const user = await requireStudent();
  return NextResponse.json(await getCurrentEvaluationContext(user.id));
});
