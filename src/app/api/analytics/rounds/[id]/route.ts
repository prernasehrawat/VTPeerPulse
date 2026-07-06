import { NextResponse } from "next/server";
import { apiHandler, requireProfessor } from "@/lib/guards";
import { computeRoundAnalytics } from "@/server/services/analytics";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: Request, ctx: Ctx) => {
  await requireProfessor();
  const { id } = await ctx.params;
  return NextResponse.json(await computeRoundAnalytics(id));
});
