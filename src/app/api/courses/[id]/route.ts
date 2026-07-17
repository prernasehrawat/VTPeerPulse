import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor } from "@/lib/guards";
import { courseUpdateSchema } from "@/lib/schemas";
import { updateCourse } from "@/server/services/courses";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireCourseInstructor(id);
  const input = await parseBody(req, courseUpdateSchema);
  return NextResponse.json(await updateCourse(id, input, user.id));
});
