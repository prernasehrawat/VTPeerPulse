import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { userUpdateSchema } from "@/lib/schemas";
import { audit } from "./audit";

export function listStudents() {
  return db.user.findMany({
    where: { role: "STUDENT" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      membership: { select: { team: { select: { id: true, name: true } } } },
    },
  });
}

export function listTeams() {
  return db.team.findMany({
    orderBy: { name: "asc" },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, active: true } } },
      },
    },
  });
}

export async function updateStudent(
  id: string,
  input: z.infer<typeof userUpdateSchema>,
  actorId: string,
) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== "STUDENT") throw new HttpError(404, "Student not found");

  const { teamId, ...rest } = input;
  await db.$transaction(async (tx) => {
    if (Object.keys(rest).length > 0) {
      await tx.user.update({ where: { id }, data: rest });
    }
    if (teamId !== undefined) {
      if (teamId === null) {
        await tx.teamMembership.deleteMany({ where: { userId: id } });
      } else {
        const team = await tx.team.findUnique({ where: { id: teamId } });
        if (!team) throw new HttpError(404, "Team not found");
        await tx.teamMembership.upsert({
          where: { userId: id },
          create: { userId: id, teamId },
          update: { teamId },
        });
      }
    }
  });
  await audit(actorId, "student.update", "User", id);
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      membership: { select: { team: { select: { id: true, name: true } } } },
    },
  });
}
