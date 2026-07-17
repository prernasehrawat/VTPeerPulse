import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const POLL_INTERVAL_MS = 60_000;
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * In-process scheduler for time-based round lifecycle work:
 *  - opens DRAFT rounds whose opensAt has passed,
 *  - closes OPEN rounds whose closesAt has passed (snapshotting analytics),
 *  - emails a reminder to non-submitters ~24h before a round closes.
 *
 * Reminder deduplication is persisted in the Job table, so restarts never
 * double-send. Suitable for the current single-instance deployment; for
 * multi-instance, move this loop to a dedicated worker.
 */
async function tick() {
  const now = new Date();

  // Auto-open scheduled rounds.
  const toOpen = await db.evaluationRound.findMany({
    where: { status: "DRAFT", opensAt: { not: null, lte: now } },
  });
  for (const round of toOpen) {
    try {
      const { setRoundStatus } = await import("./services/rounds");
      await setRoundStatus(round.id, round.courseId, "OPEN", null);
      logger.info({ roundId: round.id }, "scheduler: opened round");
    } catch (err) {
      // Usually another round is still open in the course; retry next tick.
      logger.warn({ err, roundId: round.id }, "scheduler: could not open round");
    }
  }

  // Auto-close overdue rounds.
  const toClose = await db.evaluationRound.findMany({
    where: { status: "OPEN", closesAt: { not: null, lte: now } },
  });
  for (const round of toClose) {
    try {
      const { setRoundStatus } = await import("./services/rounds");
      await setRoundStatus(round.id, round.courseId, "CLOSED", null);
      logger.info({ roundId: round.id }, "scheduler: closed round");
    } catch (err) {
      logger.error({ err, roundId: round.id }, "scheduler: could not close round");
    }
  }

  // Drain any queued bulk-summary jobs (reliable fallback to the eager run
  // kicked at enqueue time).
  try {
    const { processPendingBulkSummaries } = await import("./services/summaries");
    await processPendingBulkSummaries();
  } catch (err) {
    logger.error({ err }, "scheduler: bulk summary drain failed");
  }

  // Deadline reminders (once per round, ~24h before close).
  const closingSoon = await db.evaluationRound.findMany({
    where: {
      status: "OPEN",
      closesAt: { not: null, gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
  });
  for (const round of closingSoon) {
    const jobType = "ROUND_REMINDER";
    const existing = await db.job.findFirst({
      where: { type: jobType, payload: { equals: { roundId: round.id } } },
    });
    if (existing) continue;
    const job = await db.job.create({
      data: { type: jobType, payload: { roundId: round.id }, runAt: now, startedAt: now, attempts: 1 },
    });
    try {
      const { notifyRoundReminder } = await import("./services/notifications");
      const reminded = await notifyRoundReminder(round.id);
      await db.job.update({ where: { id: job.id }, data: { completedAt: new Date() } });
      logger.info({ roundId: round.id, reminded }, "scheduler: sent round reminders");
    } catch (err) {
      await db.job.update({
        where: { id: job.id },
        data: { failedAt: new Date(), lastError: String(err) },
      });
      logger.error({ err, roundId: round.id }, "scheduler: reminder failed");
    }
  }
}

declare global {
  var __peerpulseSchedulerStarted: boolean | undefined;
}

export function startScheduler() {
  // Dev hot-reload and multiple imports must not stack intervals.
  if (globalThis.__peerpulseSchedulerStarted) return;
  globalThis.__peerpulseSchedulerStarted = true;
  logger.info("scheduler started");
  const run = () =>
    tick().catch((err) => logger.error({ err }, "scheduler tick failed"));
  setTimeout(run, 5_000); // first pass shortly after boot
  setInterval(run, POLL_INTERVAL_MS).unref();
}
