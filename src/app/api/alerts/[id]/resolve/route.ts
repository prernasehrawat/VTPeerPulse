import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { resolveAlert } from "@/server/services/analytics";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  return NextResponse.json(await resolveAlert(id, courseId));
});
