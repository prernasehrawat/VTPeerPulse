import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { setEmailProvider, type EmailMessage } from "@/server/email";
import { HttpError } from "@/lib/errors";
import {
  getDraft,
  getSubmissionTracker,
  nudgeRound,
  saveDraft,
} from "@/server/services/evaluations";
import { setRoundStatus } from "@/server/services/rounds";
import { createCourseFixture, submitFor } from "./helpers";

let sentEmails: EmailMessage[] = [];

beforeEach(async () => {
  const { resetDb } = await import("./helpers");
  await resetDb();
  sentEmails = [];
  setEmailProvider({
    name: "test",
    async send(message) {
      sentEmails.push(message);
    },
  });
});

afterEach(() => {
  setEmailProvider(null);
});

describe("server-side evaluation drafts", () => {
  it("saves, updates, and reloads a draft for an open round", async () => {
    const { students, round, rating } = await createCourseFixture();
    const me = students[0]!;
    const key = `${students[1]!.id}:${rating.id}`;

    await saveDraft(me.id, { roundId: round.id, data: { [key]: { rating: 3, comment: "wip" } } });
    let draft = await getDraft(me.id, round.id);
    expect((draft?.data as Record<string, { rating: number }>)[key]?.rating).toBe(3);

    await saveDraft(me.id, { roundId: round.id, data: { [key]: { rating: 5 } } });
    draft = await getDraft(me.id, round.id);
    expect((draft?.data as Record<string, { rating: number }>)[key]?.rating).toBe(5);
  });

  it("returns null when no draft exists", async () => {
    const { students, round } = await createCourseFixture();
    expect(await getDraft(students[0]!.id, round.id)).toBeNull();
  });

  it("deletes the draft once the evaluation is submitted", async () => {
    const { students, round, rating } = await createCourseFixture();
    const me = students[0]!;
    const teammateIds = students.slice(1).map((s) => s.id);
    await saveDraft(me.id, {
      roundId: round.id,
      data: { [`${teammateIds[0]}:${rating.id}`]: { rating: 4 } },
    });

    await submitFor(me.id, round.id, teammateIds, rating.id, 4);

    expect(await getDraft(me.id, round.id)).toBeNull();
  });

  it("refuses a draft once the round is closed", async () => {
    const { students, round, professor } = await createCourseFixture();
    await setRoundStatus(round.id, round.courseId, "CLOSED", professor.id);
    await expect(saveDraft(students[0]!.id, { roundId: round.id, data: {} })).rejects.toThrow(
      HttpError,
    );
  });

  it("refuses a draft after the student already submitted", async () => {
    const { students, round, rating } = await createCourseFixture();
    const me = students[0]!;
    await submitFor(me.id, round.id, students.slice(1).map((s) => s.id), rating.id, 4);
    await expect(saveDraft(me.id, { roundId: round.id, data: {} })).rejects.toThrow(/already submitted/);
  });
});

describe("submission tracker", () => {
  it("classifies students as submitted / started / pending", async () => {
    const { course, students, round, rating } = await createCourseFixture();
    const [a, b, c] = students;

    // a submits, b has a draft, c does nothing.
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4);
    await saveDraft(b!.id, {
      roundId: round.id,
      data: { [`${a!.id}:${rating.id}`]: { rating: 2 } },
    });

    const tracker = await getSubmissionTracker(round.id, course.id);
    const byId = new Map(tracker.students.map((s) => [s.id, s]));
    expect(byId.get(a!.id)?.status).toBe("submitted");
    expect(byId.get(b!.id)?.status).toBe("started");
    expect(byId.get(c!.id)?.status).toBe("pending");
    expect(tracker.counts).toEqual({ total: 3, submitted: 1, started: 1, pending: 2 });
    // Outstanding students sort ahead of submitted ones.
    expect(tracker.students[tracker.students.length - 1]?.id).toBe(a!.id);
  });

  it("rejects a tracker request for a round in another course", async () => {
    const { round } = await createCourseFixture();
    const other = await createCourseFixture(["Dan D", "Eve E", "Fay F"]);
    await expect(getSubmissionTracker(round.id, other.course.id)).rejects.toThrow(HttpError);
  });
});

describe("manual nudge", () => {
  it("reminds only non-submitters and records an audit entry", async () => {
    const { course, professor, students, round, rating } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4);

    const { nudged } = await nudgeRound(round.id, course.id, professor.id);
    expect(nudged).toBe(2); // b and c
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails.every((e) => e.to !== a!.email)).toBe(true);

    const log = await db.auditLog.findFirst({
      where: { action: "round.nudge", entityId: round.id },
    });
    expect(log).toBeTruthy();
  });

  it("targets a specific subset of students", async () => {
    const { course, professor, students, round } = await createCourseFixture();
    const { nudged } = await nudgeRound(round.id, course.id, professor.id, [students[1]!.id]);
    expect(nudged).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(students[1]!.email);
  });

  it("enforces a cooldown between nudges", async () => {
    const { course, professor, round } = await createCourseFixture();
    await nudgeRound(round.id, course.id, professor.id);
    await expect(nudgeRound(round.id, course.id, professor.id)).rejects.toThrow(/recently/);
  });

  it("refuses to nudge for a round that is not open", async () => {
    const { course, professor, round } = await createCourseFixture();
    await setRoundStatus(round.id, course.id, "CLOSED", professor.id);
    await expect(nudgeRound(round.id, course.id, professor.id)).rejects.toThrow(/open/);
  });
});
