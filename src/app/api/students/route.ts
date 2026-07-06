import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { paginationSchema } from "@/lib/schemas";
import { listStudents } from "@/server/services/users";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const pagination = paginationSchema.parse(params);
  return NextResponse.json(await listStudents(courseId, pagination));
});
