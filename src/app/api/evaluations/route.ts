import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireStudent } from "@/lib/guards";
import { submissionSchema } from "@/lib/schemas";
import { submitEvaluation } from "@/server/services/evaluations";

export const POST = apiHandler(async (req: Request) => {
  const user = await requireStudent();
  const input = await parseBody(req, submissionSchema);
  const submission = await submitEvaluation(user.id, input);
  return NextResponse.json({ id: submission.id, submittedAt: submission.submittedAt }, { status: 201 });
});
