import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/server/email";

/**
 * Notification fan-out: writes an in-app Notification row and sends an email
 * for each recipient. Delivery failures are logged, never thrown — the
 * triggering action (opening a round, releasing feedback) must not fail
 * because a mailbox is unreachable.
 */
async function notify(
  recipients: { id: string; email: string; name: string }[],
  message: string,
  email: { subject: string; text: (name: string) => string },
) {
  if (recipients.length === 0) return;
  try {
    await db.notification.createMany({
      data: recipients.map((r) => ({ userId: r.id, message })),
    });
  } catch (err) {
    logger.error({ err }, "failed to write in-app notifications");
  }
  for (const r of recipients) {
    await sendEmail({ to: r.email, subject: email.subject, text: email.text(r.name) });
  }
}

/** Notifies all enrolled students that a round is open for submissions. */
export async function notifyRoundOpened(roundId: string) {
  const round = await db.evaluationRound.findUnique({
    where: { id: roundId },
    include: { course: true },
  });
  if (!round) return;
  const enrollments = await db.courseEnrollment.findMany({
    where: { courseId: round.courseId, role: "STUDENT", user: { active: true } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  const deadline = round.closesAt
    ? ` It closes on ${round.closesAt.toLocaleDateString("en-US", { dateStyle: "long" })}.`
    : "";
  await notify(
    enrollments.map((e) => e.user),
    `${round.name} is open — evaluate your teammates in ${round.course.code}.`,
    {
      subject: `${round.course.code}: ${round.name} is open`,
      text: (name) =>
        [
          `Hi ${name},`,
          "",
          `${round.name} is now open in ${round.course.code} (${round.course.name}).` + deadline,
          "Sign in to evaluate your teammates:",
          "",
          `${env().APP_BASE_URL}/student`,
        ].join("\n"),
    },
  );
}

/** Reminds students who have not yet submitted for an open round. */
export async function notifyRoundReminder(roundId: string) {
  const round = await db.evaluationRound.findUnique({
    where: { id: roundId },
    include: { course: true, submissions: { select: { evaluatorId: true } } },
  });
  if (!round || round.status !== "OPEN") return 0;
  const submitted = new Set(round.submissions.map((s) => s.evaluatorId));
  const enrollments = await db.courseEnrollment.findMany({
    where: { courseId: round.courseId, role: "STUDENT", user: { active: true } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  const pending = enrollments.filter((e) => !submitted.has(e.userId)).map((e) => e.user);
  const deadline = round.closesAt
    ? ` before it closes on ${round.closesAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`
    : "";
  await notify(
    pending,
    `Reminder: submit your ${round.name} evaluation for ${round.course.code}.`,
    {
      subject: `Reminder — ${round.course.code}: ${round.name} closes soon`,
      text: (name) =>
        [
          `Hi ${name},`,
          "",
          `You haven't submitted your peer evaluation for ${round.name} in ${round.course.code} yet.`,
          `Please submit${deadline}:`,
          "",
          `${env().APP_BASE_URL}/student`,
        ].join("\n"),
    },
  );
  return pending.length;
}

/** Tells a student that feedback from a round has been shared with them. */
export async function notifyFeedbackReleased(userId: string, roundName: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, active: true },
  });
  if (!user || !user.active) return;
  await notify([user], `Feedback from ${roundName} has been shared with you.`, {
    subject: `Your ${roundName} feedback is ready`,
    text: (name) =>
      [
        `Hi ${name},`,
        "",
        `Your instructor shared anonymized peer feedback from ${roundName} with you.`,
        "Read it here:",
        "",
        `${env().APP_BASE_URL}/student/feedback`,
      ].join("\n"),
  });
}

/** A user's in-app notifications, newest first. */
export function listNotifications(userId: string, limit = 20) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationsRead(userId: string) {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
