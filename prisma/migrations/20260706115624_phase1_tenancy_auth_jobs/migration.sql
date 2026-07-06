-- Phase 1: multi-course tenancy, auth tokens, summary release workflow, job queue.
-- Hand-edited from `prisma migrate diff` to backfill existing single-course data
-- into a default course before NOT NULL constraints are applied.

-- CreateEnum
CREATE TYPE "CourseRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'TA');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('DRAFT', 'RELEASED');

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- Backfill: create a default course for all pre-tenancy data, only if any exists.
INSERT INTO "Course" ("id", "code", "name", "term", "updatedAt")
SELECT 'default-course', 'DEFAULT', 'Default Course', 'Migrated', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Team")
   OR EXISTS (SELECT 1 FROM "Question")
   OR EXISTS (SELECT 1 FROM "EvaluationRound")
   OR EXISTS (SELECT 1 FROM "User");

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CourseRole" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

-- Backfill: enroll every existing user in the default course, mapping global role.
INSERT INTO "CourseEnrollment" ("id", "courseId", "userId", "role")
SELECT 'enr-' || u."id", 'default-course', u."id",
       CASE WHEN u."role" = 'PROFESSOR' THEN 'INSTRUCTOR'::"CourseRole" ELSE 'STUDENT'::"CourseRole" END
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Course" WHERE "id" = 'default-course');

-- DropIndex
DROP INDEX "EvaluationRound_sprint_key";

-- DropIndex
DROP INDEX "Question_active_order_idx";

-- DropIndex
DROP INDEX "Team_name_key";

-- DropIndex
DROP INDEX "TeamMembership_userId_key";

-- AlterTable
ALTER TABLE "AISummary" ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "status" "SummaryStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable + backfill + constrain: Alert
ALTER TABLE "Alert" ADD COLUMN "courseId" TEXT;
UPDATE "Alert" SET "courseId" = 'default-course';
ALTER TABLE "Alert" ALTER COLUMN "courseId" SET NOT NULL;

-- AlterTable + backfill + constrain: EvaluationRound
ALTER TABLE "EvaluationRound" ADD COLUMN "courseId" TEXT;
UPDATE "EvaluationRound" SET "courseId" = 'default-course';
ALTER TABLE "EvaluationRound" ALTER COLUMN "courseId" SET NOT NULL;

-- AlterTable + backfill + constrain: Question
ALTER TABLE "Question" ADD COLUMN "courseId" TEXT;
UPDATE "Question" SET "courseId" = 'default-course';
ALTER TABLE "Question" ALTER COLUMN "courseId" SET NOT NULL;

-- AlterTable + backfill + constrain: Team
ALTER TABLE "Team" ADD COLUMN "courseId" TEXT;
UPDATE "Team" SET "courseId" = 'default-course';
ALTER TABLE "Team" ALTER COLUMN "courseId" SET NOT NULL;

-- AlterTable + backfill + constrain: TeamMembership
ALTER TABLE "TeamMembership" ADD COLUMN "courseId" TEXT;
UPDATE "TeamMembership" SET "courseId" = 'default-course';
ALTER TABLE "TeamMembership" ALTER COLUMN "courseId" SET NOT NULL;

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "runAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_term_key" ON "Course"("code", "term");

-- CreateIndex
CREATE INDEX "CourseEnrollment_userId_idx" ON "CourseEnrollment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_courseId_userId_key" ON "CourseEnrollment"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "Job_completedAt_runAt_idx" ON "Job"("completedAt", "runAt");

-- CreateIndex
CREATE INDEX "Alert_courseId_resolved_idx" ON "Alert"("courseId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRound_courseId_sprint_key" ON "EvaluationRound"("courseId", "sprint");

-- CreateIndex
CREATE INDEX "Question_courseId_active_order_idx" ON "Question"("courseId", "active", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Team_courseId_name_key" ON "Team"("courseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_userId_courseId_key" ON "TeamMembership"("userId", "courseId");

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRound" ADD CONSTRAINT "EvaluationRound_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
