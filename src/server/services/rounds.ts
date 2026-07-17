import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { roundCreateSchema, roundUpdateSchema } from "@/lib/schemas";
import type { RoundStatus } from "@/generated/prisma/enums";
import { audit } from "./audit";

export function listRounds(courseId: string) {
  return db.evaluationRound.findMany({
    where: { courseId },
    orderBy: { sprint: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
}

export function getOpenRound(courseId: string) {
  return db.evaluationRound.findFirst({ where: { courseId, status: "OPEN" } });
}

export async function getRoundInCourse(id: string, courseId: string) {
  const round = await db.evaluationRound.findUnique({ where: { id } });
  if (!round || round.courseId !== courseId) throw new HttpError(404, "Round not found");
  return round;
}

export async function createRound(
  courseId: string,
  input: z.infer<typeof roundCreateSchema>,
  actorId: string,
) {
  const clash = await db.evaluationRound.findUnique({
    where: { courseId_sprint: { courseId, sprint: input.sprint } },
  });
  if (clash) throw new HttpError(409, `A round for sprint ${input.sprint} already exists`);
  if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
    throw new HttpError(400, "closesAt must be after opensAt");
  }
  const round = await db.evaluationRound.create({ data: { ...input, courseId } });
  await audit(actorId, "round.create", "EvaluationRound", round.id, { courseId });
  return round;
}

export async function updateRound(
  id: string,
  courseId: string,
  input: z.infer<typeof roundUpdateSchema>,
  actorId: string,
) {
  await getRoundInCourse(id, courseId);
  const round = await db.evaluationRound.update({ where: { id }, data: input });
  await audit(actorId, "round.update", "EvaluationRound", id);
  return round;
}

const TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN"], // allow reopening if closed by mistake
};

export async function setRoundStatus(
  id: string,
  courseId: string,
  status: RoundStatus,
  actorId: string | null,
) {
  const round = await getRoundInCourse(id, courseId);
  if (round.status === status) return round;
  if (!TRANSITIONS[round.status].includes(status)) {
    throw new HttpError(400, `Cannot move round from ${round.status} to ${status}`);
  }
  if (status === "OPEN") {
    const open = await db.evaluationRound.findFirst({
      where: { courseId, status: "OPEN", id: { not: id } },
    });
    if (open) throw new HttpError(409, `Round "${open.name}" is already open. Close it first.`);
  }
  const data: { status: RoundStatus; opensAt?: Date; closesAt?: Date } = { status };
  if (status === "OPEN" && !round.opensAt) data.opensAt = new Date();
  if (status === "CLOSED") data.closesAt = new Date();
  const updated = await db.evaluationRound.update({ where: { id }, data });
  await audit(actorId, `round.${status.toLowerCase()}`, "EvaluationRound", id);

  if (status === "CLOSED") {
    // Snapshot analytics and raise alerts when a round closes.
    const { generateRoundArtifacts } = await import("./analytics");
    await generateRoundArtifacts(id);
  }
  if (status === "OPEN") {
    if (round.status === "CLOSED") {
      // Reopening: the frozen snapshot and generated alerts no longer describe
      // a finished round. Remove them; closing again regenerates both.
      await db.analyticsSnapshot.deleteMany({ where: { roundId: id } });
      await db.alert.deleteMany({ where: { roundId: id } });
    }
    const { notifyRoundOpened } = await import("./notifications");
    await notifyRoundOpened(updated.id);
  }
  return updated;
}

export async function deleteRound(id: string, courseId: string, actorId: string) {
  const existing = await db.evaluationRound.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!existing || existing.courseId !== courseId) throw new HttpError(404, "Round not found");
  if (existing._count.submissions > 0) {
    throw new HttpError(400, "Cannot delete a round that has submissions");
  }
  await db.evaluationRound.delete({ where: { id } });
  await audit(actorId, "round.delete", "EvaluationRound", id);
}
