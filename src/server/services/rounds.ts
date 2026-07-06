import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { roundCreateSchema, roundUpdateSchema } from "@/lib/schemas";
import type { RoundStatus } from "@/generated/prisma/enums";
import { audit } from "./audit";

export function listRounds() {
  return db.evaluationRound.findMany({
    orderBy: { sprint: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
}

export function getOpenRound() {
  return db.evaluationRound.findFirst({ where: { status: "OPEN" } });
}

export async function createRound(input: z.infer<typeof roundCreateSchema>, actorId: string) {
  const clash = await db.evaluationRound.findUnique({ where: { sprint: input.sprint } });
  if (clash) throw new HttpError(409, `A round for sprint ${input.sprint} already exists`);
  const round = await db.evaluationRound.create({ data: input });
  await audit(actorId, "round.create", "EvaluationRound", round.id);
  return round;
}

export async function updateRound(
  id: string,
  input: z.infer<typeof roundUpdateSchema>,
  actorId: string,
) {
  const existing = await db.evaluationRound.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Round not found");
  const round = await db.evaluationRound.update({ where: { id }, data: input });
  await audit(actorId, "round.update", "EvaluationRound", id);
  return round;
}

const TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN"], // allow reopening if closed by mistake
};

export async function setRoundStatus(id: string, status: RoundStatus, actorId: string) {
  const round = await db.evaluationRound.findUnique({ where: { id } });
  if (!round) throw new HttpError(404, "Round not found");
  if (round.status === status) return round;
  if (!TRANSITIONS[round.status].includes(status)) {
    throw new HttpError(400, `Cannot move round from ${round.status} to ${status}`);
  }
  if (status === "OPEN") {
    const open = await db.evaluationRound.findFirst({ where: { status: "OPEN", id: { not: id } } });
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
  return updated;
}

export async function deleteRound(id: string, actorId: string) {
  const existing = await db.evaluationRound.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!existing) throw new HttpError(404, "Round not found");
  if (existing._count.submissions > 0) {
    throw new HttpError(400, "Cannot delete a round that has submissions");
  }
  await db.evaluationRound.delete({ where: { id } });
  await audit(actorId, "round.delete", "EvaluationRound", id);
}
