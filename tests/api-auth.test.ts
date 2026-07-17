import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/guards";
import {
  createCourse,
  createOpenRound,
  createProfessor,
  createQuestions,
  createTeamWithStudents,
  resetDb,
} from "./helpers";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

function loginAs(user: SessionUser | null) {
  mockAuth.mockResolvedValue(user ? { user } : null);
}

beforeEach(async () => {
  await resetDb();
  mockAuth.mockReset();
  const { resetRateLimits } = await import("@/lib/rate-limit");
  resetRateLimits();
});

describe("API authorization", () => {
  it("returns 401 for unauthenticated requests", async () => {
    loginAs(null);
    const { GET } = await import("@/app/api/students/route");
    const res = await GET(new Request("http://test/api/students?courseId=whatever"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for sessions whose user no longer exists or is deactivated", async () => {
    // Stale/forged JWT: the id doesn't exist in the database.
    loginAs({ id: "ghost-user", role: "PROFESSOR" });
    const { GET } = await import("@/app/api/courses/route");
    expect((await GET()).status).toBe(401);

    // Deactivated user: token is still within its lifetime, access ends anyway.
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    const { db } = await import("@/lib/db");
    await db.user.update({ where: { id: prof.id }, data: { active: false } });
    loginAs({ id: prof.id, role: "PROFESSOR" });
    expect((await GET()).status).toBe(401);
  });

  it("returns 403 when a student calls professor endpoints", async () => {
    const course = await createCourse();
    const { students } = await createTeamWithStudents(course.id, "Alpha", ["Some Student"]);
    loginAs({ id: students[0]!.id, role: "STUDENT" });
    for (const [mod, path] of [
      ["@/app/api/students/route", "/api/students"],
      ["@/app/api/teams/route", "/api/teams"],
      ["@/app/api/rounds/route", "/api/rounds"],
      ["@/app/api/alerts/route", "/api/alerts"],
      ["@/app/api/summaries/route", "/api/summaries"],
      ["@/app/api/analytics/trends/route", "/api/analytics/trends"],
      ["@/app/api/settings/thresholds/route", "/api/settings/thresholds"],
    ] as const) {
      const { GET } = (await import(mod)) as unknown as {
        GET: (req?: Request) => Promise<Response>;
      };
      const res = await GET(new Request(`http://test${path}?courseId=${course.id}`));
      expect(res.status, path).toBe(403);
    }
  });

  it("returns 403 when a professor teaches a different course", async () => {
    const course = await createCourse();
    await createProfessor(course.id, "owner@vt.edu");
    const otherCourse = await createCourse();
    const intruder = await createProfessor(otherCourse.id, "intruder@vt.edu");
    loginAs({ id: intruder.id, role: "PROFESSOR" });
    const { GET } = await import("@/app/api/students/route");
    const res = await GET(new Request(`http://test/api/students?courseId=${course.id}`));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("not an instructor for this course");
  });

  it("returns 403 when a professor calls student endpoints", async () => {
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { GET } = await import("@/app/api/evaluations/current/route");
    const res = await GET(new Request(`http://test/api/evaluations/current?courseId=${course.id}`));
    expect(res.status).toBe(403);
  });

  it("returns 400 when courseId is missing on scoped endpoints", async () => {
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { GET } = await import("@/app/api/rounds/route");
    const res = await GET(new Request("http://test/api/rounds"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("courseId");
  });

  it("returns 400 with details for invalid bodies, tagged with a request id", async () => {
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST } = await import("@/app/api/questions/route");
    const res = await POST(
      new Request(`http://test/api/questions?courseId=${course.id}`, {
        method: "POST",
        body: JSON.stringify({ prompt: "x" }), // too short
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeTruthy();
    expect(body.requestId).toBeTruthy();
  });

  it("returns 400 for malformed JSON", async () => {
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST } = await import("@/app/api/rounds/route");
    const res = await POST(
      new Request(`http://test/api/rounds?courseId=${course.id}`, {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("lets a professor create a question end-to-end", async () => {
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST, GET } = await import("@/app/api/questions/route");
    const create = await POST(
      new Request(`http://test/api/questions?courseId=${course.id}`, {
        method: "POST",
        body: JSON.stringify({ prompt: "How was communication?", type: "RATING" }),
      }),
    );
    expect(create.status).toBe(201);

    const { rating, text } = await createQuestions(course.id);
    const { db } = await import("@/lib/db");
    await db.question.update({ where: { id: text.id }, data: { active: false } });

    // Students only see active questions.
    const { students } = await createTeamWithStudents(course.id, "Alpha", ["A Student"]);
    loginAs({ id: students[0]!.id, role: "STUDENT" });
    const res = await GET(new Request(`http://test/api/questions?courseId=${course.id}`));
    const questions = (await res.json()) as { id: string }[];
    expect(questions.map((q) => q.id)).toContain(rating.id);
    expect(questions.map((q) => q.id)).not.toContain(text.id);
  });

  it("lets a student submit an evaluation through the API", async () => {
    const course = await createCourse();
    const { students } = await createTeamWithStudents(course.id, "Alpha", [
      "A Student",
      "B Student",
    ]);
    const { rating } = await createQuestions(course.id);
    const round = await createOpenRound(course.id);
    loginAs({ id: students[0]!.id, role: "STUDENT" });

    const { POST } = await import("@/app/api/evaluations/route");
    const res = await POST(
      new Request("http://test/api/evaluations", {
        method: "POST",
        body: JSON.stringify({
          roundId: round.id,
          evaluations: [
            { evaluateeId: students[1]!.id, answers: [{ questionId: rating.id, rating: 5 }] },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("CSV import rejects oversized files", async () => {
    const course = await createCourse();
    const prof = await createProfessor(course.id);
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST } = await import("@/app/api/import/route");

    const form = new FormData();
    form.append("file", new File(["x".repeat(1024 * 1024 + 1)], "big.csv", { type: "text/csv" }));
    const res = await POST(
      new Request(`http://test/api/import?courseId=${course.id}`, { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("too large");
  });

  it("health endpoint responds without authentication", async () => {
    loginAs(null);
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });
});
