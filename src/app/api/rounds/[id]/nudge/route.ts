import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { nudgeRoundSchema } from "@/lib/schemas";
import { nudgeRound } from "@/server/services/evaluations";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId, true);
  const { id } = await ctx.params;
  const { userIds } = await parseBody(req, nudgeRoundSchema);
  return NextResponse.json(await nudgeRound(id, courseId, user.id, userIds));
});
