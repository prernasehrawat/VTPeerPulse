import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { importRoster, parseRosterCsv } from "@/server/services/csv-import";
import { createCourse, createProfessor, resetDb } from "./helpers";

describe("parseRosterCsv", () => {
  it("parses valid rows with canonical headers", () => {
    const { rows, errors } = parseRosterCsv(
      "Team,Student Name,University Email\nAlpha,Joe Miller,joe@vt.edu\nAlpha,Sarah Lopez,sarah@vt.edu",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { team: "Alpha", name: "Joe Miller", email: "joe@vt.edu" },
      { team: "Alpha", name: "Sarah Lopez", email: "sarah@vt.edu" },
    ]);
  });

  it("accepts alias headers and normalizes email case", () => {
    const { rows, errors } = parseRosterCsv("team,name,email\nBeta,Ana,ANA@VT.EDU");
    expect(errors).toEqual([]);
    expect(rows[0]?.email).toBe("ana@vt.edu");
  });

  it("reports missing required columns", () => {
    const { rows, errors } = parseRosterCsv("Team,Student Name\nAlpha,Joe");
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toContain('Missing required column: "email"');
  });

  it("rejects empty CSVs", () => {
    const { errors } = parseRosterCsv("");
    expect(errors[0]?.message).toContain("no data rows");
  });

  it("flags invalid emails and blank fields with row numbers", () => {
    const { rows, errors } = parseRosterCsv(
      "Team,Student Name,University Email\nAlpha,Joe,not-an-email\n,Sarah,sarah@vt.edu\nAlpha,Ok Person,ok@vt.edu",
    );
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.row).toBe(2);
    expect(errors[1]?.row).toBe(3);
  });

  it("rejects non-university email domains", () => {
    const { rows, errors } = parseRosterCsv(
      "Team,Student Name,University Email\nAlpha,Joe,joe@gmail.com",
    );
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toContain("not an allowed university domain");
  });

  it("flags duplicate emails", () => {
    const { rows, errors } = parseRosterCsv(
      "Team,Student Name,University Email\nAlpha,Joe,joe@vt.edu\nBeta,Joe Again,joe@vt.edu",
    );
    expect(rows).toHaveLength(1);
    expect(errors[0]?.message).toContain("Duplicate email");
  });
});

describe("importRoster", () => {
  let actorId: string;
  let courseId: string;

  beforeEach(async () => {
    await resetDb();
    courseId = (await createCourse()).id;
    actorId = (await createProfessor(courseId)).id;
  });

  it("creates teams, users, and memberships", async () => {
    const result = await importRoster(
      courseId,
      "Team,Student Name,University Email\nAlpha,Joe,joe@vt.edu\nBeta,Sarah,sarah@vt.edu",
      actorId,
      { sendInvites: false },
    );
    expect(result).toMatchObject({ created: 2, updated: 0, teamsCreated: 2, errors: [] });
    const joe = await db.user.findUnique({
      where: { email: "joe@vt.edu" },
      include: { memberships: { include: { team: true } } },
    });
    expect(joe?.role).toBe("STUDENT");
    expect(joe?.memberships[0]?.team.name).toBe("Alpha");
  });

  it("updates existing users and reassigns teams without touching role or password", async () => {
    await importRoster(
courseId,
"Team,Student Name,University Email\nAlpha,Joe,joe@vt.edu", actorId);
    await db.user.update({
      where: { email: "joe@vt.edu" },
      data: { passwordHash: "keep-me" },
    });
    const result = await importRoster(
      courseId,
      "Team,Student Name,University Email\nBeta,Joseph Miller,joe@vt.edu",
      actorId,
      { sendInvites: false },
    );
    expect(result).toMatchObject({ created: 0, updated: 1, teamsCreated: 1 });
    const joe = await db.user.findUnique({
      where: { email: "joe@vt.edu" },
      include: { memberships: { include: { team: true } } },
    });
    expect(joe?.name).toBe("Joseph Miller");
    expect(joe?.passwordHash).toBe("keep-me");
    expect(joe?.memberships[0]?.team.name).toBe("Beta");
  });

  it("imports valid rows while reporting invalid ones", async () => {
    const result = await importRoster(
      courseId,
      "Team,Student Name,University Email\nAlpha,Joe,joe@vt.edu\nAlpha,Bad,bad@gmail.com",
      actorId,
      { sendInvites: false },
    );
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("writes an audit log entry", async () => {
    await importRoster(
courseId,
"Team,Student Name,University Email\nAlpha,Joe,joe@vt.edu", actorId);
    const log = await db.auditLog.findFirst({ where: { action: "roster.import" } });
    expect(log?.actorId).toBe(actorId);
  });
});
