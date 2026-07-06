import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/guards";
import {
  createOpenRound, createProfessor, createQuestions, createTeamWithStudents, resetDb,
} from "./helpers";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

function loginAs(user: SessionUser | null) {
  mockAuth.mockResolvedValue(user ? { user } : null);
}

const professor: SessionUser = { id: "prof-id", role: "PROFESSOR" };
const student: SessionUser = { id: "student-id", role: "STUDENT" };

beforeEach(async () => {
  await resetDb();
  mockAuth.mockReset();
});

describe("API authorization", () => {
  it("returns 401 for unauthenticated requests", async () => {
    loginAs(null);
    const { GET } = await import("@/app/api/students/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when a student calls professor endpoints", async () => {
    loginAs(student);
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
      const res = await GET(new Request(`http://test${path}`));
      expect(res.status, path).toBe(403);
    }
  });

  it("returns 403 when a professor calls student endpoints", async () => {
    loginAs(professor);
    const { GET } = await import("@/app/api/evaluations/current/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 with details for invalid bodies", async () => {
    const prof = await createProfessor();
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST } = await import("@/app/api/questions/route");
    const res = await POST(
      new Request("http://test/api/questions", {
        method: "POST",
        body: JSON.stringify({ prompt: "x" }), // too short
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeTruthy();
  });

  it("returns 400 for malformed JSON", async () => {
    const prof = await createProfessor();
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST } = await import("@/app/api/rounds/route");
    const res = await POST(
      new Request("http://test/api/rounds", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("lets a professor create a question end-to-end", async () => {
    const prof = await createProfessor();
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST, GET } = await import("@/app/api/questions/route");
    const create = await POST(
      new Request("http://test/api/questions", {
        method: "POST",
        body: JSON.stringify({ prompt: "How was communication?", type: "RATING" }),
      }),
    );
    expect(create.status).toBe(201);

    const list = await GET();
    expect(list.status).toBe(200);
    expect(await list.json()).toHaveLength(1);
  });

  it("students only receive active questions", async () => {
    const { rating, text } = await createQuestions();
    const { db } = await import("@/lib/db");
    await db.question.update({ where: { id: text.id }, data: { active: false } });

    loginAs(student);
    const { GET } = await import("@/app/api/questions/route");
    const res = await GET();
    const questions = (await res.json()) as { id: string }[];
    expect(questions.map((q) => q.id)).toEqual([rating.id]);
  });

  it("lets a student submit an evaluation through the API", async () => {
    const { students } = await createTeamWithStudents("Alpha", ["A Student", "B Student"]);
    const { rating } = await createQuestions();
    const round = await createOpenRound();
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

  it("CSV import rejects non-form-data and oversized files", async () => {
    const prof = await createProfessor();
    loginAs({ id: prof.id, role: "PROFESSOR" });
    const { POST } = await import("@/app/api/import/route");

    const form = new FormData();
    form.append("file", new File(["x".repeat(1024 * 1024 + 1)], "big.csv", { type: "text/csv" }));
    const res = await POST(new Request("http://test/api/import", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("too large");
  });
});
