import { hashSync } from "bcryptjs";
import { db } from "@/lib/db";

export async function resetDb() {
  await db.$executeRawUnsafe(`
    TRUNCATE "User","Course","CourseEnrollment","Team","TeamMembership","EvaluationRound",
      "Question","Submission","PeerEvaluation","Answer","AnalyticsSnapshot","AISummary",
      "EvaluationDraft","Alert","Notification","AuditLog","Setting","AuthToken","Job"
      RESTART IDENTITY CASCADE
  `);
}

export const PASSWORD_HASH = hashSync("password123", 4);

let courseCounter = 0;

export async function createCourse(code = `CS ${1000 + ++courseCounter}`) {
  return db.course.create({
    data: { code, name: `Test Course ${code}`, term: "Fall 2026" },
  });
}

export async function createProfessor(courseId: string, email = "prof@vt.edu") {
  return db.user.create({
    data: {
      email,
      name: "Prof Test",
      role: "PROFESSOR",
      passwordHash: PASSWORD_HASH,
      enrollments: { create: { courseId, role: "INSTRUCTOR" } },
    },
  });
}

export async function createTeamWithStudents(courseId: string, teamName: string, names: string[]) {
  const team = await db.team.create({ data: { courseId, name: teamName } });
  const students = [];
  for (const name of names) {
    const email = `${name.toLowerCase().replaceAll(" ", ".")}@vt.edu`;
    const user = await db.user.create({
      data: {
        email,
        name,
        role: "STUDENT",
        passwordHash: PASSWORD_HASH,
        enrollments: { create: { courseId, role: "STUDENT" } },
        memberships: { create: { teamId: team.id, courseId } },
      },
    });
    students.push(user);
  }
  return { team, students };
}

export async function createQuestions(courseId: string) {
  const rating = await db.question.create({
    data: { courseId, prompt: "Rate communication", type: "RATING", order: 1 },
  });
  const text = await db.question.create({
    data: { courseId, prompt: "Any feedback?", type: "TEXT", required: false, order: 2 },
  });
  return { rating, text };
}

export function createOpenRound(courseId: string, sprint = 1) {
  return db.evaluationRound.create({
    data: {
      courseId,
      name: `Sprint ${sprint} Evaluation`,
      sprint,
      status: "OPEN",
      opensAt: new Date(),
    },
  });
}

/** One call that stands up a full course fixture. */
export async function createCourseFixture(names: string[] = ["Alice A", "Bob B", "Cara C"]) {
  const course = await createCourse();
  const professor = await createProfessor(
    course.id,
    `prof.${course.code.replaceAll(" ", "").toLowerCase()}@vt.edu`,
  );
  const { team, students } = await createTeamWithStudents(course.id, "Team Test", names);
  const { rating, text } = await createQuestions(course.id);
  const round = await createOpenRound(course.id);
  return { course, professor, team, students, rating, text, round };
}

/** Submits a full evaluation from one student to all teammates with the given rating. */
export async function submitFor(
  evaluatorId: string,
  roundId: string,
  teammateIds: string[],
  questionId: string,
  rating: number,
  comment?: string,
) {
  const { submitEvaluation } = await import("@/server/services/evaluations");
  return submitEvaluation(evaluatorId, {
    roundId,
    evaluations: teammateIds.map((evaluateeId) => ({
      evaluateeId,
      answers: [{ questionId, rating, comment }],
    })),
  });
}

export const PAGE1 = { page: 1, pageSize: 50 };
