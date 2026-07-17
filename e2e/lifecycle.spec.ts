import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashSync } from "bcryptjs";
import { Client } from "pg";

/**
 * Full product lifecycle through the real browser:
 * course creation → roster import (preview + confirm) → question setup →
 * round open → student submissions → close → alerts → AI feedback release →
 * student reads it → invite/set-password flow.
 *
 * Uses the dev database directly only where the browser can't reach:
 * setting imported students' passwords (invite tokens are emailed and hashed)
 * and inserting a known auth token for the set-password flow.
 */

const suffix = Date.now().toString(36);
const COURSE_CODE = `E2E ${suffix}`;
const LOW = { name: "Lois Low", email: `lois.${suffix}@vt.edu` };
const HIGH = { name: "Hank High", email: `hank.${suffix}@vt.edu` };
const PASSWORD = "password123";

async function login(page: Page, email: string, password = PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"));
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("full course lifecycle", async ({ page }) => {
  test.setTimeout(180_000);

  // --- Professor: create a fresh course (switcher cookie updates automatically)
  await login(page, "professor@vt.edu");
  await page.goto("/professor/courses");
  // Wait for query-loaded content: guarantees React has hydrated before we type.
  await expect(page.getByRole("row", { name: /CS 3704|Default Course/ }).first()).toBeVisible();
  await page.locator("#c-code").fill(COURSE_CODE);
  await page.locator("#c-name").fill("Lifecycle E2E Course");
  await page.locator("#c-term").fill("Fall 2026");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(COURSE_CODE) })).toBeVisible();

  // --- Roster import with preview
  await page.goto("/professor/teams");
  await expect(page.getByText("No teams yet — import a roster above.")).toBeVisible();
  const csv = `Team,Student Name,University Email\nLifecycle Team,${LOW.name},${LOW.email}\nLifecycle Team,${HIGH.name},${HIGH.email}\n`;
  await page.setInputFiles('input[type="file"]', {
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("Preview — nothing has been imported yet")).toBeVisible();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("Roster imported")).toBeVisible();
  await expect(page.getByRole("cell", { name: LOW.name })).toBeVisible();

  // --- Question setup (new courses start with no questions)
  await page.goto("/professor/questions");
  await expect(page.getByText("No questions yet — add one above.")).toBeVisible();
  await page.locator("#q-prompt").fill("How effective was this teammate?");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Question added")).toBeVisible();

  // --- Create and open a round
  await page.goto("/professor/rounds");
  await expect(page.getByText("No rounds yet.")).toBeVisible();
  await page.locator("#round-name").fill("Lifecycle Round");
  await page.locator("#round-sprint").fill("1");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Round created")).toBeVisible();
  await page.getByRole("row", { name: /Lifecycle Round/ }).getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Round opened")).toBeVisible();

  // --- Give the imported students passwords (their invite tokens went to email)
  const passwordHash = hashSync(PASSWORD, 4);
  await withDb((db) =>
    db.query('UPDATE "User" SET "passwordHash" = $1 WHERE email = ANY($2)', [
      passwordHash,
      [LOW.email, HIGH.email],
    ]),
  );

  // --- Student 1 rates their teammate low, with a concerning comment
  await login(page, HIGH.email);
  await expect(page.getByRole("heading", { name: LOW.name })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: HIGH.name })).toHaveCount(0); // never self
  await page.getByRole("radio", { name: "1", exact: true }).click();
  await page
    .getByPlaceholder("Optional comment…")
    .fill("Missed every meeting this sprint and left tasks unfinished.");
  await page.getByRole("button", { name: "Submit evaluation" }).click();
  await expect(page.getByText("Evaluation submitted")).toBeVisible();
  await expect(page.getByText("Submissions are final and cannot be edited")).toBeVisible();

  // --- Student 2 rates their teammate high
  await login(page, LOW.email);
  await expect(page.getByRole("heading", { name: HIGH.name })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await page.getByPlaceholder("Optional comment…").fill("Carried the sprint, great communication.");
  await page.getByRole("button", { name: "Submit evaluation" }).click();
  await expect(page.getByText("Evaluation submitted")).toBeVisible();

  // --- Professor closes the round; alerts are generated
  await login(page, "professor@vt.edu");
  await page.goto("/professor/rounds");
  await expect(page.getByRole("row", { name: /Lifecycle Round/ })).toBeVisible();
  await page.getByRole("row", { name: /Lifecycle Round/ }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Round closed — analytics generated")).toBeVisible();

  await page.goto("/professor/alerts");
  await expect(page.getByText(`${LOW.name} received an average of 1`)).toBeVisible();

  // --- Generate student-shareable AI feedback and release it
  await page.goto("/professor/summaries");
  await expect(page.getByText("No summaries generated yet.")).toBeVisible();
  // Scope to main content: the header course switcher is also a combobox.
  const combos = page.locator("#main").getByRole("combobox");
  await combos.nth(0).click();
  await page.getByRole("option", { name: /Lifecycle Round/ }).click();
  await combos.nth(1).click();
  await page.getByRole("option", { name: "Student-shareable feedback" }).click();
  await combos.nth(2).click();
  await page.getByRole("option", { name: "Student", exact: true }).click();
  await combos.nth(3).click();
  await page.getByRole("option", { name: LOW.name }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByText("Summary generated")).toBeVisible();
  await expect(page.getByText("Not released")).toBeVisible();
  await page.getByRole("button", { name: "Release to student" }).click();
  await expect(page.getByText("Released to student")).toBeVisible();

  // --- The student sees the released feedback (and only after release)
  await login(page, LOW.email);
  await page.goto("/student/feedback");
  await expect(page.getByText(/Mock AI summary/).first()).toBeVisible();
  await expect(page.getByText(/Lifecycle Round/).first()).toBeVisible();

  // --- Invite/set-password flow with a known token
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await withDb((db) =>
    db.query(
      `INSERT INTO "AuthToken" (id, "userId", "tokenHash", purpose, "expiresAt")
       SELECT 'e2e-' || $1, id, $2, 'PASSWORD_RESET', (NOW() AT TIME ZONE 'UTC') + interval '1 hour'
       FROM "User" WHERE email = $3`,
      [suffix, tokenHash, HIGH.email],
    ),
  );
  await page.context().clearCookies();
  await page.goto(`/set-password?token=${rawToken}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New password").fill("a-brand-new-password");
  await page.getByLabel("Confirm password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await page.waitForURL(/\/login/);
  await login(page, HIGH.email, "a-brand-new-password");
  await expect(page).toHaveURL(/\/student/);
});

test.afterAll(async () => {
  // Leave no fixture behind: a stale extra course would change which course
  // the seeded professor's switcher defaults to in later specs.
  await withDb(async (db) => {
    await db.query(
      `DELETE FROM "Submission" WHERE "roundId" IN
         (SELECT id FROM "EvaluationRound" WHERE "courseId" IN
           (SELECT id FROM "Course" WHERE code = $1))`,
      [COURSE_CODE],
    );
    await db.query('DELETE FROM "Course" WHERE code = $1', [COURSE_CODE]);
    await db.query('DELETE FROM "User" WHERE email = ANY($1)', [[LOW.email, HIGH.email]]);
  });
});
