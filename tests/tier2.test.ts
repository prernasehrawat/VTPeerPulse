import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { setAIProvider } from "@/server/ai";
import { setEmailProvider, type EmailMessage } from "@/server/email";
import { HttpError } from "@/lib/errors";
import {
  getDraft,
  getSubmissionTracker,
  nudgeRound,
  saveDraft,
} from "@/server/services/evaluations";
import {
  enqueueBulkSummary,
  getBulkSummaryStatus,
} from "@/server/services/summaries";
import { rolloverCourse } from "@/server/services/courses";
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
  setAIProvider({
    model: "fake-model",
    async complete() {
      return "Anonymized constructive feedback.";
    },
  });
});

afterEach(() => {
  setEmailProvider(null);
  setAIProvider(null);
});

/** Polls a bulk-summary job until it reaches a terminal state. */
async function waitForBulk(jobId: string, courseId: string) {
  for (let i = 0; i < 200; i++) {
    const s = await getBulkSummaryStatus(jobId, courseId);
    if (s.status === "done" || s.status === "failed") return s;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("bulk summary job did not finish in time");
}

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

describe("bulk summary generation", () => {
  it("generates a summary for every student who received feedback", async () => {
    const { course, professor, students, round, rating } = await createCourseFixture();
    const [a, b, c] = students;
    // Everyone comments on their teammates, so all three receive feedback.
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4, "great work");
    await submitFor(b!.id, round.id, [a!.id, c!.id], rating.id, 4, "reliable");
    await submitFor(c!.id, round.id, [a!.id, b!.id], rating.id, 4, "helpful");

    const { jobId, total } = await enqueueBulkSummary(course.id, professor.id, {
      roundId: round.id,
      subjectType: "STUDENT",
      kind: "STUDENT_FEEDBACK",
    });
    expect(total).toBe(3);

    const status = await waitForBulk(jobId, course.id);
    expect(status.status).toBe("done");
    expect(status.done).toBe(3);

    const summaries = await db.aISummary.count({
      where: { roundId: round.id, kind: "STUDENT_FEEDBACK", subjectType: "STUDENT" },
    });
    expect(summaries).toBe(3);
  });

  it("is idempotent — a second run creates no duplicates", async () => {
    const { course, professor, students, round, rating } = await createCourseFixture();
    const [a, b, c] = students;
    await submitFor(a!.id, round.id, [b!.id, c!.id], rating.id, 4, "great");
    await submitFor(b!.id, round.id, [a!.id, c!.id], rating.id, 4, "solid");

    const first = await enqueueBulkSummary(course.id, professor.id, {
      roundId: round.id,
      subjectType: "STUDENT",
      kind: "CONSTRUCTIVE",
    });
    await waitForBulk(first.jobId, course.id);
    const afterFirst = await db.aISummary.count({ where: { roundId: round.id, kind: "CONSTRUCTIVE" } });

    const second = await enqueueBulkSummary(course.id, professor.id, {
      roundId: round.id,
      subjectType: "STUDENT",
      kind: "CONSTRUCTIVE",
    });
    const status = await waitForBulk(second.jobId, course.id);
    expect(status.status).toBe("done");
    const afterSecond = await db.aISummary.count({ where: { roundId: round.id, kind: "CONSTRUCTIVE" } });
    expect(afterSecond).toBe(afterFirst);
  });

  it("rejects when the round has no written feedback", async () => {
    const { course, professor, round } = await createCourseFixture();
    await expect(
      enqueueBulkSummary(course.id, professor.id, {
        roundId: round.id,
        subjectType: "STUDENT",
        kind: "STUDENT_FEEDBACK",
      }),
    ).rejects.toThrow(/no written feedback/i);
  });

  it("rejects a round belonging to another course", async () => {
    const { round } = await createCourseFixture();
    const other = await createCourseFixture(["Dan D", "Eve E", "Fay F"]);
    await expect(
      enqueueBulkSummary(other.course.id, other.professor.id, {
        roundId: round.id,
        subjectType: "STUDENT",
        kind: "STUDENT_FEEDBACK",
      }),
    ).rejects.toThrow(HttpError);
  });
});

describe("semester rollover", () => {
  it("clones questions, roster, and teams but not rounds or submissions", async () => {
    const { course, professor, students, round, rating, team } = await createCourseFixture();
    // Generate some round activity that must NOT carry over.
    await submitFor(students[0]!.id, round.id, students.slice(1).map((s) => s.id), rating.id, 4);

    const next = await rolloverCourse(course.id, professor.id, {
      code: course.code,
      name: course.name,
      term: "Spring 2027",
      copyRoster: true,
      copyTeams: true,
    });
    expect(next.id).not.toBe(course.id);
    expect(next.term).toBe("Spring 2027");

    const [questions, enrollments, teams, rounds, submissions] = await Promise.all([
      db.question.count({ where: { courseId: next.id } }),
      db.courseEnrollment.count({ where: { courseId: next.id } }),
      db.team.findMany({ where: { courseId: next.id }, include: { memberships: true } }),
      db.evaluationRound.count({ where: { courseId: next.id } }),
      db.submission.count({ where: { round: { courseId: next.id } } }),
    ]);
    expect(questions).toBe(2); // rating + text from the fixture
    // 3 students + 1 professor enrolled in the source, all carried over.
    expect(enrollments).toBe(4);
    expect(teams).toHaveLength(1);
    expect(teams[0]!.name).toBe(team.name);
    expect(teams[0]!.memberships).toHaveLength(3);
    expect(rounds).toBe(0);
    expect(submissions).toBe(0);
  });

  it("copies questions only when roster and teams are skipped, but keeps the creator enrolled", async () => {
    const { course, professor } = await createCourseFixture();
    const next = await rolloverCourse(course.id, professor.id, {
      code: "CS 9999",
      name: "Fresh Section",
      term: "Spring 2027",
      copyRoster: false,
      copyTeams: false,
    });
    const enrollments = await db.courseEnrollment.findMany({ where: { courseId: next.id } });
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]!.userId).toBe(professor.id);
    expect(enrollments[0]!.role).toBe("INSTRUCTOR");
    expect(await db.team.count({ where: { courseId: next.id } })).toBe(0);
    expect(await db.question.count({ where: { courseId: next.id } })).toBe(2);
  });

  it("forces the roster to come along when teams are copied", async () => {
    const { course, professor } = await createCourseFixture();
    const next = await rolloverCourse(course.id, professor.id, {
      code: "CS 8888",
      name: "Section",
      term: "Spring 2027",
      copyRoster: false,
      copyTeams: true,
    });
    // Teams need members, so the roster is carried despite copyRoster: false.
    expect(await db.courseEnrollment.count({ where: { courseId: next.id } })).toBe(4);
    const teams = await db.team.findMany({ where: { courseId: next.id }, include: { memberships: true } });
    expect(teams[0]!.memberships).toHaveLength(3);
  });

  it("rejects a duplicate code+term", async () => {
    const { course, professor } = await createCourseFixture();
    await expect(
      rolloverCourse(course.id, professor.id, {
        code: course.code,
        name: course.name,
        term: course.term, // same term as source → clash
        copyRoster: true,
        copyTeams: true,
      }),
    ).rejects.toThrow(/already exists/);
  });
});
