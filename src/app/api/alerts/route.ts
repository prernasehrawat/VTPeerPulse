import { NextResponse } from "next/server";
import { apiHandler, requireProfessor } from "@/lib/guards";
import { listAlerts } from "@/server/services/analytics";

export const GET = apiHandler(async (req: Request) => {
  await requireProfessor();
  const includeResolved = new URL(req.url).searchParams.get("includeResolved") === "true";
  return NextResponse.json(await listAlerts(includeResolved));
});
