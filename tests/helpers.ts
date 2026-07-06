import { hashSync } from "bcryptjs";
import { db } from "@/lib/db";

export async function resetDb() {
  await db.$executeRawUnsafe(`
    TRUNCATE "User","Team","TeamMembership","EvaluationRound","Question","Submission",
      "PeerEvaluation","Answer","AnalyticsSnapshot","AISummary","Alert","Notification",
      "AuditLog","Setting" RESTART IDENTITY CASCADE
  `);
}

export const PASSWORD_HASH = hashSync("password123", 4);

export async function createProfessor(email = "prof@vt.edu") {
  return db.user.create({
    data: { email, name: "Prof Test", role: "PROFESSOR", passwordHash: PASSWORD_HASH },
  });
}

export async function createTeamWithStudents(teamName: string, names: string[]) {
  const team = await db.team.create({ data: { name: teamName } });
  const students = [];
  for (const name of names) {
    const email = `${name.toLowerCase().replaceAll(" ", ".")}@vt.edu`;
    const user = await db.user.create({
      data: {
        email,
        name,
        role: "STUDENT",
        passwordHash: PASSWORD_HASH,
        membership: { create: { teamId: team.id } },
      },
    });
    students.push(user);
  }
  return { team, students };
}

export async function createQuestions() {
  const rating = await db.question.create({
    data: { prompt: "Rate communication", type: "RATING", order: 1 },
  });
  const text = await db.question.create({
    data: { prompt: "Any feedback?", type: "TEXT", required: false, order: 2 },
  });
  return { rating, text };
}

export function createOpenRound(sprint = 1) {
  return db.evaluationRound.create({
    data: { name: `Sprint ${sprint} Evaluation`, sprint, status: "OPEN", opensAt: new Date() },
  });
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
