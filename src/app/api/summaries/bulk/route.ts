import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { bulkSummarySchema } from "@/lib/schemas";
import { enqueueBulkSummary } from "@/server/services/summaries";

export const POST = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  enforceRateLimit(`ai:${user.id}`, LIMITS.aiGeneration, "Too many AI requests — wait a minute.");
  const input = await parseBody(req, bulkSummarySchema);
  const result = await enqueueBulkSummary(courseId, user.id, input);
  return NextResponse.json(result, { status: 202 });
});
