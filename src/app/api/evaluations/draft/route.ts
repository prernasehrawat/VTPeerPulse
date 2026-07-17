import { NextResponse } from "next/server";
import { HttpError } from "@/lib/errors";
import { apiHandler, parseBody, requireStudent } from "@/lib/guards";
import { draftSaveSchema } from "@/lib/schemas";
import { getDraft, saveDraft } from "@/server/services/evaluations";

export const GET = apiHandler(async (req: Request) => {
  const user = await requireStudent();
  const roundId = new URL(req.url).searchParams.get("roundId");
  if (!roundId) throw new HttpError(400, "roundId query parameter is required");
  return NextResponse.json(await getDraft(user.id, roundId));
});

export const PUT = apiHandler(async (req: Request) => {
  const user = await requireStudent();
  const input = await parseBody(req, draftSaveSchema);
  const draft = await saveDraft(user.id, input);
  return NextResponse.json({ updatedAt: draft.updatedAt });
});
