import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { summaryRequestSchema } from "@/lib/schemas";
import { generateSummary, listSummaries } from "@/server/services/summaries";

export const GET = apiHandler(async (req: Request) => {
  await requireProfessor();
  const roundId = new URL(req.url).searchParams.get("roundId") ?? undefined;
  return NextResponse.json(await listSummaries(roundId));
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireProfessor();
  const input = await parseBody(req, summaryRequestSchema);
  const summary = await generateSummary(input, user.id);
  return NextResponse.json(summary, { status: 201 });
});
