-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York';
