import Papa from "papaparse";
import { computeRoundAnalytics } from "./analytics";
import { getRoundSubmissions } from "./evaluations";

/** CSV of per-student analytics for a round. */
export async function roundAnalyticsCsv(roundId: string): Promise<{ filename: string; csv: string }> {
  const a = await computeRoundAnalytics(roundId);
  const csv = Papa.unparse(
    a.students.map((s) => ({
      Student: s.name,
      Team: s.teamName ?? "",
      "Average Received": s.average ?? "",
      "Ratings Received": s.ratingsCount,
      Submitted: s.submitted ? "Yes" : "No",
    })),
  );
  return { filename: `round-${a.sprint}-analytics.csv`, csv };
}

/** CSV of every response in a round (professor-only detail, includes evaluator). */
export async function roundResponsesCsv(roundId: string): Promise<{ filename: string; csv: string }> {
  const submissions = await getRoundSubmissions(roundId);
  const rows: Record<string, string | number>[] = [];
  for (const s of submissions) {
    for (const e of s.evaluations) {
      for (const ans of e.answers) {
        rows.push({
          Evaluator: s.evaluator.name,
          "Evaluator Team": s.evaluator.membership?.team.name ?? "",
          Evaluatee: e.evaluatee.name,
          Question: ans.question.prompt,
          Rating: ans.rating ?? "",
          Comment: ans.comment ?? "",
          "Submitted At": s.submittedAt.toISOString(),
        });
      }
    }
  }
  const csv = Papa.unparse(rows);
  return { filename: `round-responses-${roundId}.csv`, csv };
}
