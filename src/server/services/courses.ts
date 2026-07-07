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

/**
 * Adds a co-instructor or TA to a course by email. Staff accounts that don't
 * exist yet are created (global PROFESSOR role, since course staff must pass
 * the professor page/API guards) and receive a set-password invite. Existing
 * student accounts are rejected — promoting a student to staff is an explicit
 * administrative decision, not a side effect.
 */
export async function addCourseStaff(
  courseId: string,
  email: string,
  role: "INSTRUCTOR" | "TA",
  actorId: string,
) {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) throw new HttpError(404, "Course not found");
  const normalized = email.toLowerCase().trim();
  let user = await db.user.findUnique({ where: { email: normalized } });
  let created = false;
  if (user && user.role === "STUDENT") {
    throw new HttpError(
      400,
      "This email belongs to a student account. Course staff need a staff account — contact your administrator.",
    );
  }
  if (!user) {
    user = await db.user.create({
      data: { email: normalized, name: normalized.split("@")[0] ?? normalized, role: "PROFESSOR" },
    });
    created = true;
  }
  await db.courseEnrollment.upsert({
    where: { courseId_userId: { courseId, userId: user.id } },
    create: { courseId, userId: user.id, role },
    update: { role },
  });
  if (created) {
    const { sendInvite } = await import("./accounts");
    await sendInvite(user.id);
  }
  await audit(actorId, "course.staff-add", "Course", courseId, { email: normalized, role });
  return { userId: user.id, created, role };
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
