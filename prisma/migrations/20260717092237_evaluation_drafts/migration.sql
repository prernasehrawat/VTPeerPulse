-- CreateTable
CREATE TABLE "EvaluationDraft" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationDraft_roundId_idx" ON "EvaluationDraft"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationDraft_roundId_evaluatorId_key" ON "EvaluationDraft"("roundId", "evaluatorId");

-- AddForeignKey
ALTER TABLE "EvaluationDraft" ADD CONSTRAINT "EvaluationDraft_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "EvaluationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDraft" ADD CONSTRAINT "EvaluationDraft_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

