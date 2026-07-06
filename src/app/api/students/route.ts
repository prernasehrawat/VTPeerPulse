import { NextResponse } from "next/server";
import { apiHandler, requireProfessor } from "@/lib/guards";
import { listStudents } from "@/server/services/users";

export const GET = apiHandler(async () => {
  await requireProfessor();
  return NextResponse.json(await listStudents());
});
