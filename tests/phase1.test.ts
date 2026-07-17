import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";
import { setAIProvider } from "@/server/ai";
import { setEmailProvider, type EmailMessage } from "@/server/email";
import { requestPasswordReset, sendInvite, setPasswordWithToken } from "@/server/services/accounts";
import { getRoundAnalytics } from "@/server/services/analytics";
import { importRoster } from "@/server/services/csv-import";
import { updateQuestion } from "@/server/services/questions";
import { setRoundStatus } from "@/server/services/rounds";
import {
  generateSummary,
  getReleasedFeedbackFor,
  releaseSummary,
  scrubRosterNames,
} from "@/server/services/summaries";
import { createCourseFixture, resetDb, submitFor } from "./helpers";

let sentEmails: EmailMessage[] = [];

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  sentEmails = [];
  setEmailProvider({
    name: "test",
    async send(message) {
      sentEmails.push(message);
    },
  });
  setAIProvider({
    model: "fake-model",
    async complete() {
      return "Constructive feedback for the student.";
    },
  });
});

afterEach(() => {
  setEmailProvider(null);
  setAIProvider(null);
});

const tokenFromEmail = (email: EmailMessage) =>
  decodeURIComponent(email.text.match(/token=([^\s]+)/)?.[1] ?? "");

describe("invite & password flows", () => {
  it("invite email lets a student set a password once", async () => {
    const { students } = await createCourseFixture();
    const student = students[0]!;
    await db.user.update({ where: { id: student.id }, data: { passwordHash: null } });

    await sendInvite(student.id);
    expect(sentEmails).toHaveLength(1);
    const token = tokenFromEmail(sentEmails[0]!);
    expect(token.length).toBeGreaterThan(20);

    await setPasswordWithToken(token, "brand-new-password");
    const updated = await db.user.findUnique({ where: { id: student.id } });
    expect(updated?.passwordHash).toBeTruthy();

    // Single use.
    await expect(setPasswordWithToken(token, "another-password")).rejects.toThrow(
      "already been used",
    );
  });

  it("password reset is silent for unknown emails and works for known ones", async () => {
    const { students } = await createCourseFixture();
    await requestPasswordReset("nobody@vt.edu");
    expect(sentEmails).toHaveLength(0);

    await requestPasswordReset(students[0]!.email);
    expect(sentEmails).toHaveLength(1);
    const token = tokenFromEmail(sentEmails[0]!);
    await setPasswordWithToken(token, "resetted-password");
  });

  it("rejects garbage and expired tokens", async () => {
    await expect(setPasswordWithToken("not-a-real-token", "whatever-pass")).rejects.toThrow(
      "invalid",
    );
    const { students } = await createCourseFixture();
    await sendInvite(students[0]!.id);
    const token = tokenFromEmail(sentEmails[0]!);
    await db.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(setPasswordWithToken(token, "whatever-pass")).rejects.toThrow("expired");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("k", opts)).toBe(true);
    expect(checkRateLimit("k", opts)).toBe(true);
    expect(checkRateLimit("k", opts)).toBe(true);
    expect(checkRateLimit("k", opts)).toBe(false);
    expect(checkRateLimit("other-key", opts)).toBe(true);
  });
});

describe("frozen closed-round analytics", () => {
  it("serves closed rounds from the snapshot even after roster changes", async () => {
    const { course, students, rating, round } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4);
    await submitFor(b!.id, round.id, [a!.id, c!.id], rating.id, 4);
    await setRoundStatus(round.id, course.id, "CLOSED", null);

    const before = await getRoundAnalytics(round.id);
    expect(before.totalStudents).toBe(3);

    // Roster changes after close must not rewrite history.
    await db.user.update({ where: { id: c!.id }, data: { active: false } });
    const after = await getRoundAnalytics(round.id);
    expect(after.totalStudents).toBe(3);
    expect(after).toEqual(before);
  });

  it("reopening clears the stale snapshot and alerts", async () => {
    const { course, students, rating, round } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 2);
    await setRoundStatus(round.id, course.id, "CLOSED", null);
    expect(await db.analyticsSnapshot.count({ where: { roundId: round.id } })).toBe(1);
    expect(await db.alert.count({ where: { roundId: round.id } })).toBeGreaterThan(0);

    await setRoundStatus(round.id, course.id, "OPEN", null);
    expect(await db.analyticsSnapshot.count({ where: { roundId: round.id } })).toBe(0);
    expect(await db.alert.count({ where: { roundId: round.id } })).toBe(0);
  });
});

describe("question immutability", () => {
  it("freezes wording once a question has answers", async () => {
    const { course, students, rating, round } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4);
    await expect(
      updateQuestion(rating.id, course.id, { prompt: "Rewritten prompt" }, a!.id),
    ).rejects.toThrow("wording can't change");
    // Non-wording changes stay allowed.
    const toggled = await updateQuestion(rating.id, course.id, { active: false }, a!.id);
    expect(toggled.active).toBe(false);
  });
});

describe("CSV import dry run and invites", () => {
  it("dryRun computes the outcome without writing", async () => {
    const { course, professor } = await createCourseFixture();
    const before = await db.user.count();
    const result = await importRoster(
      course.id,
      "Team,Student Name,University Email\nGamma,New Kid,new.kid@vt.edu",
      professor.id,
      { dryRun: true },
    );
    expect(result).toMatchObject({ dryRun: true, created: 1, teamsCreated: 1 });
    expect(await db.user.count()).toBe(before);
  });

  it("real import creates accounts and sends invites to passwordless students", async () => {
    const { course, professor } = await createCourseFixture();
    const result = await importRoster(
      course.id,
      "Team,Student Name,University Email\nGamma,New Kid,new.kid@vt.edu",
      professor.id,
    );
    expect(result).toMatchObject({ created: 1, invitesSent: 1 });
    expect(sentEmails[0]?.to).toBe("new.kid@vt.edu");
    expect(sentEmails[0]?.text).toContain("/set-password?token=");
  });
});

describe("student feedback release workflow", () => {
  it("students see feedback only after release, and only their own", async () => {
    const { course, professor, students, rating, round } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4, "Great collaborator");
    const summary = await generateSummary(
      { roundId: round.id, subjectType: "STUDENT", subjectId: b!.id, kind: "STUDENT_FEEDBACK" },
      course.id,
      professor.id,
    );
    expect(summary.status).toBe("DRAFT");
    expect(await getReleasedFeedbackFor(b!.id)).toHaveLength(0);

    await releaseSummary(summary.id, course.id, professor.id);
    expect(await getReleasedFeedbackFor(b!.id)).toHaveLength(1);
    expect(await getReleasedFeedbackFor(a!.id)).toHaveLength(0);
    // Release notifies the student.
    expect(sentEmails.some((e) => e.to === b!.email)).toBe(true);
  });

  it("only student feedback summaries can be released", async () => {
    const { course, professor, students, rating, round } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4, "comment");
    const briefing = await generateSummary(
      { roundId: round.id, subjectType: "ROUND", kind: "INSTRUCTOR" },
      course.id,
      professor.id,
    );
    await expect(releaseSummary(briefing.id, course.id, professor.id)).rejects.toThrow(
      "Only per-student feedback",
    );
  });

  it("scrubs roster names from student-shareable text", async () => {
    const { course, students } = await createCourseFixture(["Alice Anderson", "Bob Brown", "Cara Cruz"]);
    const scrubbed = await scrubRosterNames(
      ["Alice Anderson and Bob helped me finish while Cara Cruz was absent."],
      course.id,
      students[2]!.id, // keep Cara (the subject)
    );
    expect(scrubbed[0]).not.toContain("Alice");
    expect(scrubbed[0]).not.toContain("Bob");
    expect(scrubbed[0]).toContain("Cara Cruz");
    expect(scrubbed[0]).toContain("a teammate");
  });
});
