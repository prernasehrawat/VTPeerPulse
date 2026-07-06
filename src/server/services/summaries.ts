import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { SummaryRequest } from "@/lib/schemas";
import { getAIProvider } from "@/server/ai";
import type { ChatMessage } from "@/server/ai/provider";
import { audit } from "./audit";

const KIND_INSTRUCTIONS: Record<SummaryRequest["kind"], string> = {
  COMPLAINTS:
    "Summarize the recurring complaints and concerns raised in the feedback. Group related concerns together.",
  POSITIVES:
    "Summarize the positive feedback and strengths mentioned. Group related strengths together.",
  CONSTRUCTIVE:
    "Turn the feedback into specific, actionable, constructive suggestions for improvement. Be encouraging and concrete.",
  INSTRUCTOR:
    "Write a briefing for the course instructor: overall team health, notable risks, students who may need support, and suggested interventions.",
  STUDENT_FEEDBACK:
    "Write anonymized, constructive feedback suitable to share directly with the student. Never reveal or hint at who wrote any comment.",
};

async function collectComments(req: SummaryRequest): Promise<{ label: string; comments: string[] }> {
  const where = {
    comment: { not: null },
    peerEvaluation: {
      submission: { roundId: req.roundId },
      ...(req.subjectType === "STUDENT" ? { evaluateeId: req.subjectId } : {}),
      ...(req.subjectType === "TEAM"
        ? { evaluatee: { membership: { teamId: req.subjectId } } }
        : {}),
    },
  };
  const answers = await db.answer.findMany({
    where,
    select: { comment: true },
    orderBy: { id: "asc" },
  });

  let label = "the whole round";
  if (req.subjectType === "STUDENT") {
    const user = await db.user.findUnique({ where: { id: req.subjectId ?? "" } });
    if (!user) throw new HttpError(404, "Student not found");
    label = `student ${user.name}`;
  } else if (req.subjectType === "TEAM") {
    const team = await db.team.findUnique({ where: { id: req.subjectId ?? "" } });
    if (!team) throw new HttpError(404, "Team not found");
    label = `team ${team.name}`;
  }

  return {
    label,
    comments: answers.map((a) => a.comment!.trim()).filter(Boolean),
  };
}

export async function generateSummary(req: SummaryRequest, actorId: string) {
  if (req.subjectType !== "ROUND" && !req.subjectId) {
    throw new HttpError(400, "subjectId is required for TEAM and STUDENT summaries");
  }
  const round = await db.evaluationRound.findUnique({ where: { id: req.roundId } });
  if (!round) throw new HttpError(404, "Round not found");

  const { label, comments } = await collectComments(req);
  if (comments.length === 0) {
    throw new HttpError(400, "No comments available to summarize for this selection");
  }

  const provider = getAIProvider();
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You summarize anonymous university peer-evaluation feedback. Be concise, professional, and constructive. " +
        "Never fabricate feedback, never identify or speculate about authors, and never quote text that could identify a reviewer. " +
        KIND_INSTRUCTIONS[req.kind],
    },
    {
      role: "user",
      content: `Peer feedback for ${label} in round "${round.name}":\n\n${comments
        .map((c) => `- ${c}`)
        .join("\n")}`,
    },
  ];
  const content = await provider.complete(messages);

  const summary = await db.aISummary.create({
    data: {
      roundId: req.roundId,
      subjectType: req.subjectType,
      subjectId: req.subjectId ?? null,
      kind: req.kind,
      content,
      model: provider.model,
    },
  });
  await audit(actorId, "summary.generate", "AISummary", summary.id, {
    roundId: req.roundId,
    kind: req.kind,
  });
  return summary;
}

export function listSummaries(roundId?: string) {
  return db.aISummary.findMany({
    where: roundId ? { roundId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { round: { select: { id: true, name: true, sprint: true } } },
  });
}
