import "dotenv/config";
import { hashSync } from "bcryptjs";

/**
 * Deadline-rush load test.
 *
 * Simulates the worst real-world moment: an entire course logging in and
 * submitting peer evaluations in a short window while the professor watches
 * analytics. Runs over HTTP against a live server using the real auth flow.
 *
 * Provisioning and cleanup use the database directly; everything measured
 * happens through the HTTP API.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts
 *   STUDENTS=200 CONCURRENCY=40 BASE_URL=https://staging.example npx tsx scripts/load-test.ts
 *
 * Note: unique X-Forwarded-For values are sent per simulated student so the
 * per-IP login throttle behaves as it would with real distinct clients.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STUDENTS = Number(process.env.STUDENTS ?? 100);
const TEAM_SIZE = Number(process.env.TEAM_SIZE ?? 4);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const PASSWORD = "load-test-password";
const suffix = Date.now().toString(36);

type Timing = { ms: number; ok: boolean; label: string };
const timings: Timing[] = [];

class Session {
  private cookies = new Map<string, string>();
  constructor(private readonly ip: string) {}

  private absorb(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const eq = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, eq), pair!.slice(eq + 1));
    }
  }

  private header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async fetch(path: string, init: RequestInit = {}, label = path): Promise<Response> {
    const start = performance.now();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        ...init.headers,
        cookie: this.header(),
        "x-forwarded-for": this.ip,
      },
    });
    this.absorb(res);
    timings.push({ ms: performance.now() - start, ok: res.status < 400, label });
    return res;
  }

  async login(email: string): Promise<boolean> {
    const csrfRes = await this.fetch("/api/auth/csrf", {}, "auth:csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const res = await this.fetch(
      "/api/auth/callback/credentials",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, password: PASSWORD, csrfToken }).toString(),
      },
      "auth:login",
    );
    return res.status === 302 && [...this.cookies.keys()].some((k) => k.includes("session-token"));
  }
}

async function pool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function report(label: string, subset: Timing[]) {
  if (subset.length === 0) return;
  const ok = subset.filter((t) => t.ok);
  const times = subset.map((t) => t.ms);
  console.log(
    `  ${label.padEnd(24)} n=${String(subset.length).padStart(4)}  ` +
      `errors=${subset.length - ok.length}  ` +
      `p50=${percentile(times, 50).toFixed(0)}ms  ` +
      `p95=${percentile(times, 95).toFixed(0)}ms  ` +
      `max=${Math.max(...times).toFixed(0)}ms`,
  );
}

async function main() {
  console.log(`\nLoad test: ${STUDENTS} students (teams of ${TEAM_SIZE}), concurrency ${CONCURRENCY}, target ${BASE}`);
  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) throw new Error(`Server not healthy at ${BASE}`);

  const { db } = await import("../src/lib/db");

  // ---- Provision fixture
  console.log("Provisioning course fixture…");
  const course = await db.course.create({
    data: { code: `LOAD ${suffix}`, name: "Load Test Course", term: "Load" },
  });
  const professor = await db.user.create({
    data: {
      name: "Load Professor",
      email: `load.prof.${suffix}@vt.edu`,
      role: "PROFESSOR",
      passwordHash: hashSync(PASSWORD, 4),
      enrollments: { create: { courseId: course.id, role: "INSTRUCTOR" } },
    },
  });
  const question = await db.question.create({
    data: { courseId: course.id, prompt: "Load rating", type: "RATING", order: 1 },
  });
  const teamCount = Math.ceil(STUDENTS / TEAM_SIZE);
  const emails: string[] = [];
  for (let t = 0; t < teamCount; t++) {
    const team = await db.team.create({ data: { courseId: course.id, name: `Load Team ${t}` } });
    const members = Math.min(TEAM_SIZE, STUDENTS - t * TEAM_SIZE);
    for (let m = 0; m < members; m++) {
      const email = `load.s${t}x${m}.${suffix}@vt.edu`;
      emails.push(email);
      await db.user.create({
        data: {
          name: `Load Student ${t}-${m}`,
          email,
          role: "STUDENT",
          passwordHash: hashSync(PASSWORD, 4),
          enrollments: { create: { courseId: course.id, role: "STUDENT" } },
          memberships: { create: { courseId: course.id, teamId: team.id } },
        },
      });
    }
  }
  const round = await db.evaluationRound.create({
    data: { courseId: course.id, name: "Load Round", sprint: 1, status: "OPEN" },
  });

  const wallStart = performance.now();
  try {
    // ---- The rush: every student logs in, loads their form, submits
    console.log("Running the deadline rush…");
    let submitted = 0;
    let failures = 0;
    await pool(emails, CONCURRENCY, async (email, i) => {
      const session = new Session(`10.1.${Math.floor(i / 250)}.${(i % 250) + 1}`);
      try {
        if (!(await session.login(email))) throw new Error("login failed");
        const ctxRes = await session.fetch(
          `/api/evaluations/current?courseId=${course.id}`,
          {},
          "evaluations:current",
        );
        const ctx = (await ctxRes.json()) as {
          round: { id: string };
          teammates: { id: string }[];
        };
        const res = await session.fetch(
          "/api/evaluations",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              roundId: ctx.round.id,
              evaluations: ctx.teammates.map((t) => ({
                evaluateeId: t.id,
                answers: [{ questionId: question.id, rating: 1 + ((i + t.id.length) % 5) }],
              })),
            }),
          },
          "evaluations:submit",
        );
        if (res.status === 201) submitted++;
        else throw new Error(`submit ${res.status}`);
      } catch {
        failures++;
      }
    });

    // ---- Professor hammers analytics while data is fresh
    const prof = new Session("10.9.9.9");
    if (!(await prof.login(professor.email))) throw new Error("professor login failed");
    await pool(Array.from({ length: 20 }), 5, async () => {
      await prof.fetch(
        `/api/analytics/rounds/${round.id}?courseId=${course.id}`,
        {},
        "analytics:round",
      );
    });
    await prof.fetch(`/api/analytics/trends?courseId=${course.id}`, {}, "analytics:trends");

    const wallSeconds = (performance.now() - wallStart) / 1000;
    const requests = timings.length;
    console.log(`\nResults (${requests} HTTP requests in ${wallSeconds.toFixed(1)}s ≈ ${(requests / wallSeconds).toFixed(0)} req/s):`);
    for (const label of ["auth:csrf", "auth:login", "evaluations:current", "evaluations:submit", "analytics:round"]) {
      report(label, timings.filter((t) => t.label === label));
    }
    console.log(`\n  Submissions: ${submitted}/${STUDENTS} succeeded, ${failures} failed`);
    const dbCount = await db.submission.count({ where: { roundId: round.id } });
    console.log(`  Database submission rows: ${dbCount} (must equal successes: ${dbCount === submitted ? "OK" : "MISMATCH"})`);
    if (failures > 0 || dbCount !== submitted) process.exitCode = 1;
  } finally {
    console.log("Cleaning up fixture…");
    await db.submission.deleteMany({ where: { roundId: round.id } });
    await db.course.delete({ where: { id: course.id } });
    await db.user.deleteMany({ where: { email: { contains: `.${suffix}@vt.edu` } } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
