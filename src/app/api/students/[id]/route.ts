import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { userUpdateSchema } from "@/lib/schemas";
import { updateStudent } from "@/server/services/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  const input = await parseBody(req, userUpdateSchema);
  return NextResponse.json(await updateStudent(id, courseId, input, user.id));
});
