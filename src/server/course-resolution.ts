import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { CourseInfo } from "@/components/course-context";
import type { Role } from "@/generated/prisma/enums";

export const COURSE_COOKIE = "peerpulse-course";

/**
 * Resolves the user's course list and active course for server components.
 * The active course comes from the course cookie when it points at a course
 * the user belongs to; otherwise the most recent course is used.
 */
export async function resolveCourses(
  userId: string,
  role: Role,
): Promise<{ courses: CourseInfo[]; active: CourseInfo | null }> {
  const enrollments = await db.courseEnrollment.findMany({
    where: {
      userId,
      role: role === "PROFESSOR" ? { in: ["INSTRUCTOR", "TA"] } : "STUDENT",
      course: { active: true },
    },
    orderBy: { course: { createdAt: "desc" } },
    include: { course: { select: { id: true, code: true, name: true, term: true } } },
  });
  const courses = enrollments.map((e) => e.course);
  if (courses.length === 0) return { courses, active: null };
  const requested = (await cookies()).get(COURSE_COOKIE)?.value;
  const active = courses.find((c) => c.id === requested) ?? courses[0]!;
  return { courses, active };
}
