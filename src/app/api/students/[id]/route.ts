import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireProfessor } from "@/lib/guards";
import { userUpdateSchema } from "@/lib/schemas";
import { updateStudent } from "@/server/services/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: Request, ctx: Ctx) => {
  const user = await requireProfessor();
  const { id } = await ctx.params;
  const input = await parseBody(req, userUpdateSchema);
  return NextResponse.json(await updateStudent(id, input, user.id));
});
