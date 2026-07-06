import { NextResponse } from "next/server";
import { apiHandler, requireCourseInstructor } from "@/lib/guards";
import { inviteCourseStudents } from "@/server/services/accounts";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireCourseInstructor(id);
  return NextResponse.json(await inviteCourseStudents(id, user.id));
});
