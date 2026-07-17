import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor } from "@/lib/guards";
import { courseRolloverSchema } from "@/lib/schemas";
import { rolloverCourse } from "@/server/services/courses";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireCourseInstructor(id);
  const input = await parseBody(req, courseRolloverSchema);
  const course = await rolloverCourse(id, user.id, input);
  return NextResponse.json(course, { status: 201 });
});
