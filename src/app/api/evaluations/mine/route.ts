import { NextResponse } from "next/server";
import { apiHandler, requireStudent } from "@/lib/guards";
import { getOwnSubmissions } from "@/server/services/evaluations";

export const GET = apiHandler(async () => {
  const user = await requireStudent();
  return NextResponse.json(await getOwnSubmissions(user.id));
});
