import { NextResponse } from "next/server";
import { apiHandler, requireProfessor } from "@/lib/guards";
import { computeTrends } from "@/server/services/analytics";

export const GET = apiHandler(async () => {
  await requireProfessor();
  return NextResponse.json(await computeTrends());
});
