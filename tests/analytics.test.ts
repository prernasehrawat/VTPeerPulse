import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  computeRoundAnalytics, computeTrends, generateRoundArtifacts, listAlerts, resolveAlert,
} from "@/server/services/analytics";
import { setThresholds } from "@/server/services/settings";
import type { User, Question, EvaluationRound, Course } from "@/generated/prisma/client";
import {
  createCourse, createOpenRound, createQuestions, createTeamWithStudents, PAGE1, resetDb, submitFor,
} from "./helpers";

let course: Course;
let joe: User, peter: User, sarah: User;
let rating: Question;
let round: EvaluationRound;

beforeEach(async () => {
  await resetDb();
  course = await createCourse();
  const alpha = await createTeamWithStudents(course.id, "Alpha", ["Joe", "Peter", "Sarah"]);
  [joe, peter, sarah] = alpha.students as [User, User, User];
  ({ rating } = await createQuestions(course.id));
  round = await createOpenRound(course.id);
});

describe("computeRoundAnalytics", () => {
  it("computes student averages, team averages, completion, and question stats", async () => {
    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 4);
    await submitFor(peter.id, round.id, [joe.id, sarah.id], rating.id, 2);
    // Sarah does not submit.

    const a = await computeRoundAnalytics(round.id);
    const byName = Object.fromEntries(a.students.map((s) => [s.name, s]));

    expect(byName.Joe?.average).toBe(2); // rated once by Peter
    expect(byName.Peter?.average).toBe(4); // rated once by Joe
    expect(byName.Sarah?.average).toBe(3); // 4 from Joe, 2 from Peter
    expect(byName.Sarah?.submitted).toBe(false);

    expect(a.submittedCount).toBe(2);
    expect(a.totalStudents).toBe(3);
    expect(a.completionPct).toBe(66.67);
    expect(a.teams[0]?.average).toBe(3);
    expect(a.overallAverage).toBe(3);

    const qStat = a.questions.find((q) => q.questionId === rating.id);
    expect(qStat?.count).toBe(4);
    expect(qStat?.distribution).toEqual([0, 2, 0, 2, 0]);
  });

  it("handles rounds with no submissions", async () => {
    const a = await computeRoundAnalytics(round.id);
    expect(a.overallAverage).toBeNull();
    expect(a.completionPct).toBe(0);
  });

  it("throws 404 for unknown rounds", async () => {
    await expect(computeRoundAnalytics("nope")).rejects.toThrow("Round not found");
  });
});

describe("alerts on round close", () => {
  it("flags low averages and missing submissions", async () => {
    await setThresholds({ lowAverage: 3, trendDrop: 0.5, repeatedConcernRounds: 2 });
    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 1);
    await submitFor(peter.id, round.id, [joe.id, sarah.id], rating.id, 5);

    const { alertCount } = await generateRoundArtifacts(round.id);
    const { items: alerts } = await listAlerts(course.id, PAGE1);
    expect(alertCount).toBe(alerts.length);

    const types = alerts.map((a) => a.type);
    expect(types).toContain("MISSING_SUBMISSION"); // Sarah
    expect(types).toContain("LOW_AVERAGE"); // Peter got 1, Sarah avg 3? no — Sarah got (1+5)/2=3, not below
    const lowAvg = alerts.filter((a) => a.type === "LOW_AVERAGE" && a.user);
    expect(lowAvg.map((a) => a.user?.name)).toContain("Peter");
    // Peter's 1 is more than a full point below threshold → critical
    expect(lowAvg.find((a) => a.user?.name === "Peter")?.severity).toBe("CRITICAL");
  });

  it("snapshots analytics and is idempotent per round", async () => {
    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 2);
    await generateRoundArtifacts(round.id);
    await generateRoundArtifacts(round.id);
    // Snapshots are replaced, never duplicated.
    const snapshots = await db.analyticsSnapshot.count({ where: { roundId: round.id } });
    expect(snapshots).toBe(1);
    // Alerts are recomputed, not duplicated.
    const missing = await db.alert.count({ where: { roundId: round.id, type: "MISSING_SUBMISSION" } });
    expect(missing).toBe(2); // Peter and Sarah didn't submit
  });

  it("flags downward trends and repeated concerns across rounds", async () => {
    await setThresholds({ lowAverage: 3, trendDrop: 0.5, repeatedConcernRounds: 2 });

    // Round 1: Peter averages 2.
    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 2);
    await submitFor(sarah.id, round.id, [joe.id, peter.id], rating.id, 2);
    await generateRoundArtifacts(round.id);

    // Round 2: Peter drops to 1.
    const round2 = await db.evaluationRound.create({
      data: { courseId: course.id, name: "Sprint 2", sprint: 2, status: "OPEN" },
    });
    await submitFor(joe.id, round2.id, [peter.id, sarah.id], rating.id, 1);
    await submitFor(sarah.id, round2.id, [joe.id, peter.id], rating.id, 1);
    await generateRoundArtifacts(round2.id);

    const alerts = await db.alert.findMany({ where: { roundId: round2.id } });
    const peterAlerts = alerts.filter((a) => a.userId === peter.id).map((a) => a.type);
    expect(peterAlerts).toContain("DOWNWARD_TREND");
    expect(peterAlerts).toContain("REPEATED_CONCERN");
  });

  it("resolveAlert marks alerts resolved and is course-scoped", async () => {
    await generateRoundArtifacts(round.id); // everyone missing
    const alert = (await listAlerts(course.id, PAGE1)).items[0]!;
    const other = await createCourse();
    await expect(resolveAlert(alert.id, other.id)).rejects.toThrow("Alert not found");
    await resolveAlert(alert.id, course.id);
    const open = await listAlerts(course.id, PAGE1);
    expect(open.items.find((a) => a.id === alert.id)).toBeUndefined();
  });
});

describe("computeTrends", () => {
  it("returns points ordered by sprint with team and student series", async () => {
    await submitFor(joe.id, round.id, [peter.id, sarah.id], rating.id, 4);
    const round2 = await db.evaluationRound.create({
      data: { courseId: course.id, name: "Sprint 2", sprint: 2, status: "OPEN" },
    });
    await submitFor(joe.id, round2.id, [peter.id, sarah.id], rating.id, 2);

    const trends = await computeTrends(course.id);
    expect(trends.map((t) => t.sprint)).toEqual([1, 2]);
    expect(trends[0]?.teams.Alpha).toBe(4);
    expect(trends[1]?.teams.Alpha).toBe(2);
    expect(trends[1]?.students[peter.id]).toBe(2);
  });
});
