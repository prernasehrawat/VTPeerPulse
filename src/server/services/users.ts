import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { Pagination, userUpdateSchema } from "@/lib/schemas";
import { audit } from "./audit";

type StudentRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  canLogIn: boolean;
  team: { id: string; name: string } | null;
};

/** Paginated students enrolled in a course, with their team in that course. */
export async function listStudents(courseId: string, { page, pageSize }: Pagination) {
  const where = { courseId, role: "STUDENT" as const };
  const [total, enrollments] = await Promise.all([
    db.courseEnrollment.count({ where }),
    db.courseEnrollment.findMany({
      where,
      orderBy: { user: { name: "asc" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            passwordHash: true,
            memberships: {
              where: { courseId },
              select: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);
  const items: StudentRow[] = enrollments.map((e) => ({
    id: e.user.id,
    name: e.user.name,
    email: e.user.email,
    active: e.user.active,
    canLogIn: e.user.passwordHash !== null,
    team: e.user.memberships[0]?.team ?? null,
  }));
  return { items, total, page, pageSize };
}

export function listTeams(courseId: string) {
  return db.team.findMany({
    where: { courseId },
    orderBy: { name: "asc" },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, active: true } } },
      },
    },
  });
}

/** Updates a student's profile/active flag and their team within a course. */
export async function updateStudent(
  id: string,
  courseId: string,
  input: z.infer<typeof userUpdateSchema>,
  actorId: string,
) {
  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId, userId: id } },
    include: { user: true },
  });
  if (!enrollment || enrollment.user.role !== "STUDENT") {
    throw new HttpError(404, "Student not found in this course");
  }

  const { teamId, ...rest } = input;
  await db.$transaction(async (tx) => {
    if (Object.keys(rest).length > 0) {
      await tx.user.update({ where: { id }, data: rest });
    }
    if (teamId !== undefined) {
      if (teamId === null) {
        await tx.teamMembership.deleteMany({ where: { userId: id, courseId } });
      } else {
        const team = await tx.team.findUnique({ where: { id: teamId } });
        if (!team || team.courseId !== courseId) throw new HttpError(404, "Team not found");
        await tx.teamMembership.upsert({
          where: { userId_courseId: { userId: id, courseId } },
          create: { userId: id, teamId, courseId },
          update: { teamId },
        });
      }
    }
  });
  await audit(actorId, "student.update", "User", id, { courseId });
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      memberships: { where: { courseId }, select: { team: { select: { id: true, name: true } } } },
    },
  });
}
