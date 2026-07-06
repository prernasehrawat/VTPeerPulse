import { NextResponse } from "next/server";
import { apiHandler, requireStudent } from "@/lib/guards";
import { getReleasedFeedbackFor } from "@/server/services/summaries";

export const GET = apiHandler(async () => {
  const user = await requireStudent();
  return NextResponse.json(await getReleasedFeedbackFor(user.id));
});
