import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor, requireUser } from "@/lib/guards";
import { courseCreateSchema } from "@/lib/schemas";
import { createCourse, listCoursesFor } from "@/server/services/courses";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json(await listCoursesFor(user.id, user.role));
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireProfessor();
  const input = await parseBody(req, courseCreateSchema);
  const course = await createCourse(input, user.id);
  return NextResponse.json(course, { status: 201 });
});
