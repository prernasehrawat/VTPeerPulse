import { NextResponse } from "next/server";
import { apiHandler, parseBody, requireCourseInstructor, requireCourseParam } from "@/lib/guards";
import { roundCreateSchema } from "@/lib/schemas";
import { createRound, listRounds } from "@/server/services/rounds";

export const GET = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  await requireCourseInstructor(courseId, true);
  return NextResponse.json(await listRounds(courseId));
});

export const POST = apiHandler(async (req: Request) => {
  const courseId = requireCourseParam(req);
  const user = await requireCourseInstructor(courseId);
  const input = await parseBody(req, roundCreateSchema);
  const round = await createRound(courseId, input, user.id);
  return NextResponse.json(round, { status: 201 });
});
