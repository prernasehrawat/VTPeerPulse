/**
 * Next.js instrumentation hook — runs once per server boot.
 * Starts the in-process scheduler (scheduled round open/close + reminders).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.SCHEDULER_ENABLED === "false" || process.env.SCHEDULER_ENABLED === "0") return;
  const { startScheduler } = await import("./server/scheduler");
  startScheduler();
}
