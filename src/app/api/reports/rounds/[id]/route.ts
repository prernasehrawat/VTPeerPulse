import { apiHandler, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { roundAnalyticsCsv, roundResponsesCsv } from "@/server/services/reports";
import { getRoundInCourse } from "@/server/services/rounds";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (req: Request, ctx: Ctx) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  const { id } = await ctx.params;
  await getRoundInCourse(id, courseId);
  const kind = new URL(req.url).searchParams.get("kind") ?? "analytics";
  const { filename, csv } =
    kind === "responses" ? await roundResponsesCsv(id) : await roundAnalyticsCsv(id);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
