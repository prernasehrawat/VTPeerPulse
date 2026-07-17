import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody, requireCourseInstructor } from "@/lib/guards";
import { addCourseStaff } from "@/server/services/courses";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["INSTRUCTOR", "TA"]).default("TA"),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireCourseInstructor(id);
  const { email, role } = await parseBody(req, schema);
  return NextResponse.json(await addCourseStaff(id, email, role, user.id), { status: 201 });
});
