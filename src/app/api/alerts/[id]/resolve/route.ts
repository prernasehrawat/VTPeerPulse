import { NextResponse } from "next/server";
import { apiHandler, requireProfessor } from "@/lib/guards";
import { resolveAlert } from "@/server/services/analytics";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (_req: Request, ctx: Ctx) => {
  await requireProfessor();
  const { id } = await ctx.params;
  return NextResponse.json(await resolveAlert(id));
});
