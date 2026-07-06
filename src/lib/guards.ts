import { NextResponse } from "next/server";
import { auth } from "./auth";
import type { Role } from "@/generated/prisma/enums";

import { HttpError } from "./errors";

export { HttpError };

export type SessionUser = { id: string; role: Role; email?: string | null; name?: string | null };

/** Returns the authenticated user or throws 401/403. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Not authenticated");
  if (role && session.user.role !== role) throw new HttpError(403, "Forbidden");
  return session.user;
}

export const requireProfessor = () => requireUser("PROFESSOR");
export const requireStudent = () => requireUser("STUDENT");

/** Wraps a route handler with uniform error -> JSON response mapping. */
export function apiHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { error: err.message, details: err.details ?? null },
          { status: err.status },
        );
      }
      const { logger } = await import("./logger");
      logger.error({ err }, "Unhandled API error");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
