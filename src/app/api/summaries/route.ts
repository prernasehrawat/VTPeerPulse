import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam, parseBody } from "@/lib/guards";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { paginationSchema, summaryRequestSchema } from "@/lib/schemas";
import { generateSummary, listSummaries } from "@/server/services/summaries";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const url = new URL(req.url);
  const roundId = url.searchParams.get("roundId") ?? undefined;
  const pagination = paginationSchema.parse(Object.fromEntries(url.searchParams));
  return NextResponse.json(await listSummaries(courseId, pagination, roundId));
});

export const POST = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  enforceRateLimit(`ai:${user.id}`, LIMITS.aiGeneration, "Too many AI requests — wait a minute.");
  const input = await parseBody(req, summaryRequestSchema);
  const summary = await generateSummary(input, courseId, user.id);
  return NextResponse.json(summary, { status: 201 });
});
