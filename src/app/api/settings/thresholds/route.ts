import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { thresholdsSchema } from "@/lib/schemas";
import { getThresholds, setThresholds } from "@/server/services/settings";

export const GET = apiHandler(async () => {
  await requireProfessor();
  return NextResponse.json(await getThresholds());
});

export const PUT = apiHandler(async (req: Request) => {
  await requireProfessor();
  const input = await parseBody(req, thresholdsSchema);
  return NextResponse.json(await setThresholds(input));
});
