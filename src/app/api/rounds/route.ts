import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { roundCreateSchema } from "@/lib/schemas";
import { createRound, listRounds } from "@/server/services/rounds";

export const GET = apiHandler(async () => {
  await requireProfessor();
  return NextResponse.json(await listRounds());
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireProfessor();
  const input = await parseBody(req, roundCreateSchema);
  const round = await createRound(input, user.id);
  return NextResponse.json(round, { status: 201 });
});
