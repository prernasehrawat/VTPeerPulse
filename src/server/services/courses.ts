import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { courseCreateSchema, courseUpdateSchema } from "@/lib/schemas";
import { audit } from "./audit";

/** Courses where the user teaches (professors) or is enrolled (students). */
export function listCoursesFor(userId: string, role: "PROFESSOR" | "STUDENT") {
  return db.course.findMany({
    where: {
      enrollments: {
        some: {
          userId,
          role: role === "PROFESSOR" ? { in: ["INSTRUCTOR", "TA"] } : "STUDENT",
        },
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { enrollments: true, teams: true, rounds: true } } },
  });
}

/** Creates a course and enrolls the creator as its instructor. */
export async function createCourse(
  input: z.infer<typeof courseCreateSchema>,
  actorId: string,
) {
  const clash = await db.course.findUnique({
    where: { code_term: { code: input.code, term: input.term } },
  });
  if (clash) throw new HttpError(409, `${input.code} (${input.term}) already exists`);
  const course = await db.course.create({
    data: { ...input, enrollments: { create: { userId: actorId, role: "INSTRUCTOR" } } },
  });
  await audit(actorId, "course.create", "Course", course.id);
  return course;
}

export async function updateCourse(
  id: string,
  input: z.infer<typeof courseUpdateSchema>,
  actorId: string,
) {
  const existing = await db.course.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Course not found");
  const course = await db.course.update({ where: { id }, data: input });
  await audit(actorId, "course.update", "Course", id);
  return course;
}
