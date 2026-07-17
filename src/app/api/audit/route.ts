import { NextResponse } from "next/server";
import { apiHandler, requireProfessor } from "@/lib/guards";
import { paginationSchema } from "@/lib/schemas";
import { listAuditLogs } from "@/server/services/audit";

export const GET = apiHandler(async (req: Request) => {
  await requireProfessor();
  const pagination = paginationSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listAuditLogs(pagination));
});
