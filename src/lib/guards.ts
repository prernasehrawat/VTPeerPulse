import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { db } from "./db";
import type { CourseRole, Role } from "@/generated/prisma/enums";

import { HttpError } from "./errors";

export { HttpError };

export type SessionUser = { id: string; role: Role; email?: string | null; name?: string | null };

/**
 * Returns the authenticated user or throws 401/403.
 *
 * Revalidates the JWT against the database on every call: a deactivated user
 * or a changed role takes effect immediately, not at token expiry.
 */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Not authenticated");
  const current = await db.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, role: true },
  });
  if (!current || !current.active) throw new HttpError(401, "Account is not active");
  if (role && current.role !== role) throw new HttpError(403, "Forbidden");
  return { ...session.user, role: current.role };
}

export const requireProfessor = () => requireUser("PROFESSOR");
export const requireStudent = () => requireUser("STUDENT");

/**
 * Professors act within a course: verifies the professor is enrolled as
 * INSTRUCTOR (or TA when allowed) in the course. Throws 403 otherwise.
 */
export async function requireCourseInstructor(
  courseId: string,
  allowTA = false,
): Promise<SessionUser> {
  const user = await requireProfessor();
  const roles: CourseRole[] = allowTA ? ["INSTRUCTOR", "TA"] : ["INSTRUCTOR"];
  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
  });
  if (!enrollment || !roles.includes(enrollment.role)) {
    throw new HttpError(403, "You are not an instructor for this course");
  }
  return user;
}

/** Verifies a student is enrolled in the course. */
export async function requireCourseStudent(courseId: string): Promise<SessionUser> {
  const user = await requireStudent();
  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
  });
  if (!enrollment || enrollment.role !== "STUDENT") {
    throw new HttpError(403, "You are not enrolled in this course");
  }
  return user;
}

/** Reads a required courseId from the query string. */
export function requireCourseParam(req: Request): string {
  const courseId = new URL(req.url).searchParams.get("courseId");
  if (!courseId) throw new HttpError(400, "courseId query parameter is required");
  return courseId;
}

/**
 * Wraps a route handler with request-ID tagging and uniform error -> JSON mapping.
 * Every response carries `x-request-id`; unhandled errors are logged with it.
 */
export function apiHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const requestId = randomUUID();
    try {
      const res = await fn(...args);
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { error: err.message, details: err.details ?? null, requestId },
          { status: err.status, headers: { "x-request-id": requestId } },
        );
      }
      const { logger } = await import("./logger");
      logger.error({ err, requestId }, "Unhandled API error");
      return NextResponse.json(
        { error: "Internal server error", requestId },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  };
}

/** Parses a request body against a Zod schema, throwing 400 on failure. */
export async function parseBody<T>(
  req: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } },
): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new HttpError(400, "Validation failed", parsed.error.flatten());
  return parsed.data;
}
