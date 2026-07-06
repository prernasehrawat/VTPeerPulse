import { apiHandler, requireProfessor } from "@/lib/guards";
import { roundAnalyticsCsv, roundResponsesCsv } from "@/server/services/reports";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (req: Request, ctx: Ctx) => {
  await requireProfessor();
  const { id } = await ctx.params;
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
