import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { paginationSchema } from "@/lib/schemas";
import { listAlerts } from "@/server/services/analytics";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const url = new URL(req.url);
  const includeResolved = url.searchParams.get("includeResolved") === "true";
  const pagination = paginationSchema.parse(Object.fromEntries(url.searchParams));
  return NextResponse.json(await listAlerts(courseId, pagination, includeResolved));
});
