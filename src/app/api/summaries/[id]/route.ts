import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { summaryEditSchema } from "@/lib/schemas";
import { editSummary } from "@/server/services/summaries";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const { id } = await ctx.params;
  const { content } = await parseBody(req, summaryEditSchema);
  return NextResponse.json(await editSummary(id, courseId, user.id, content));
});
