import { expect, test, type Page } from "@playwright/test";

// Uses seeded accounts (prisma/seed.ts): professor@vt.edu and joe@vt.edu, password123.

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("rejects invalid credentials", async ({ page }) => {
  await login(page, "professor@vt.edu", "wrong-password");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/professor");
  await expect(page).toHaveURL(/\/login/);
});

test("professor can sign in and browse the dashboard", async ({ page }) => {
  await login(page, "professor@vt.edu");
  await expect(page).toHaveURL(/\/professor/);
  await expect(page.getByText("Active students")).toBeVisible();

  await page.getByRole("link", { name: "Questions" }).click();
  await expect(page.getByText("How well did this teammate communicate")).toBeVisible();

  await page.getByRole("link", { name: "Rounds" }).click();
  await expect(page.getByText("Sprint 1 Evaluation")).toBeVisible();

  await page.getByRole("link", { name: "Teams & Students" }).click();
  await expect(page.getByRole("heading", { name: "Team Alpha" })).toBeVisible();
});

test("student sees only teammates in the evaluation form", async ({ page }) => {
  await login(page, "joe@vt.edu");
  await expect(page).toHaveURL(/\/student/);

  // Wait for the round to render before branching, so the count below is not
  // taken from a still-loading page.
  await expect(page.getByText(/Sprint \d+ Evaluation/)).toBeVisible();
  const submitted = await page.getByText("Submitted", { exact: false }).count();
  if (submitted === 0) {
    // Joe (Team Alpha) sees Peter and Sarah, never himself or Team Beta members.
    await expect(page.getByRole("heading", { name: "Peter Chen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sarah Lopez" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Joe Miller" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Aisha Khan" })).toHaveCount(0);
  }
});

test("student cannot access professor pages", async ({ page }) => {
  await login(page, "joe@vt.edu");
  await expect(page).toHaveURL(/\/student/); // wait for the session before navigating
  await page.goto("/professor");
  await expect(page).toHaveURL(/\/student/);
});
