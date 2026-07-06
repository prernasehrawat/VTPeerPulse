import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { roundStatusSchema } from "@/lib/schemas";
import { setRoundStatus } from "@/server/services/rounds";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const user = await requireProfessor();
  const { id } = await ctx.params;
  const { status } = await parseBody(req, roundStatusSchema);
  return NextResponse.json(await setRoundStatus(id, status, user.id));
});
