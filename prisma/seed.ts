import "dotenv/config";
import { hashSync } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const COURSE = { code: "CS 3704", name: "Software Engineering Capstone", term: "Fall 2026" };

const DEFAULT_QUESTIONS = [
  { prompt: "How well did this teammate communicate with the team?", type: "RATING" as const },
  { prompt: "How would you rate the quality of this teammate's work?", type: "RATING" as const },
  { prompt: "How reliably did this teammate meet deadlines and commitments?", type: "RATING" as const },
  { prompt: "How well did this teammate collaborate and support others?", type: "RATING" as const },
  {
    prompt: "What feedback do you have for this teammate? (strengths, concerns, suggestions)",
    type: "TEXT" as const,
    required: false,
  },
];

const TEAMS: Record<string, { name: string; email: string }[]> = {
  "Team Alpha": [
    { name: "Joe Miller", email: "joe@vt.edu" },
    { name: "Peter Chen", email: "peter@vt.edu" },
    { name: "Sarah Lopez", email: "sarah@vt.edu" },
  ],
  "Team Beta": [
    { name: "Aisha Khan", email: "aisha@vt.edu" },
    { name: "Marcus Reed", email: "marcus@vt.edu" },
    { name: "Elena Petrova", email: "elena@vt.edu" },
    { name: "David Park", email: "david@vt.edu" },
  ],
};

async function main() {
  const password = hashSync("password123", 10);

  const course = await db.course.upsert({
    where: { code_term: { code: COURSE.code, term: COURSE.term } },
    create: COURSE,
    update: {},
  });

  const professor = await db.user.upsert({
    where: { email: "professor@vt.edu" },
    create: {
      email: "professor@vt.edu",
      name: "Prof. Ada Lovelace",
      role: "PROFESSOR",
      passwordHash: password,
    },
    update: {},
  });
  await db.courseEnrollment.upsert({
    where: { courseId_userId: { courseId: course.id, userId: professor.id } },
    create: { courseId: course.id, userId: professor.id, role: "INSTRUCTOR" },
    update: { role: "INSTRUCTOR" },
  });

  for (const [i, q] of DEFAULT_QUESTIONS.entries()) {
    const existing = await db.question.findFirst({
      where: { courseId: course.id, prompt: q.prompt },
    });
    if (!existing) {
      await db.question.create({
        data: {
          courseId: course.id,
          prompt: q.prompt,
          type: q.type,
          required: q.required ?? true,
          order: i + 1,
        },
      });
    }
  }

  for (const [teamName, members] of Object.entries(TEAMS)) {
    const team = await db.team.upsert({
      where: { courseId_name: { courseId: course.id, name: teamName } },
      create: { courseId: course.id, name: teamName },
      update: {},
    });
    for (const m of members) {
      const user = await db.user.upsert({
        where: { email: m.email },
        create: { email: m.email, name: m.name, role: "STUDENT", passwordHash: password },
        update: { passwordHash: password },
      });
      await db.courseEnrollment.upsert({
        where: { courseId_userId: { courseId: course.id, userId: user.id } },
        create: { courseId: course.id, userId: user.id, role: "STUDENT" },
        update: {},
      });
      await db.teamMembership.upsert({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
        create: { userId: user.id, teamId: team.id, courseId: course.id },
        update: { teamId: team.id },
      });
    }
  }

  await db.evaluationRound.upsert({
    where: { courseId_sprint: { courseId: course.id, sprint: 1 } },
    create: {
      courseId: course.id,
      name: "Sprint 1 Evaluation",
      sprint: 1,
      status: "OPEN",
      opensAt: new Date(),
    },
    update: {},
  });

  console.log("Seed complete.");
  console.log(`  Course:    ${COURSE.code} — ${COURSE.name} (${COURSE.term})`);
  console.log("  Professor: professor@vt.edu / password123");
  console.log("  Students:  joe@vt.edu, peter@vt.edu, sarah@vt.edu, ... / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
