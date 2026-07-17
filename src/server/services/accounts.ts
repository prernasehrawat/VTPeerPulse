import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { sendEmail } from "@/server/email";
import { audit } from "./audit";
import { consumeToken, issueToken } from "./tokens";

const setPasswordUrl = (token: string) =>
  `${env().APP_BASE_URL}/set-password?token=${encodeURIComponent(token)}`;

/** Emails an account invite with a set-password link. */
export async function sendInvite(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new HttpError(404, "User not found");
  const token = await issueToken(userId, "INVITE");
  return sendEmail({
    to: user.email,
    subject: "You've been added to VT PeerPulse",
    text: [
      `Hi ${user.name},`,
      "",
      "An instructor added you to VT PeerPulse, the peer-evaluation platform for your course.",
      "Set your password to activate your account (link valid for 7 days):",
      "",
      setPasswordUrl(token),
      "",
      "If you weren't expecting this, you can ignore this email.",
    ].join("\n"),
  });
}

/**
 * Invites every enrolled student in a course who cannot log in yet
 * (no password set). Returns how many invites were sent.
 */
export async function inviteCourseStudents(courseId: string, actorId: string) {
  const enrollments = await db.courseEnrollment.findMany({
    where: { courseId, role: "STUDENT", user: { active: true, passwordHash: null } },
    select: { userId: true },
  });
  let sent = 0;
  for (const e of enrollments) {
    if (await sendInvite(e.userId)) sent++;
  }
  await audit(actorId, "invite.bulk", "Course", courseId, { sent });
  return { invited: enrollments.length, sent };
}

/**
 * Emails a password-reset link. Intentionally silent when the email is
 * unknown so the endpoint can't be used to probe for accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return;
  const token = await issueToken(user.id, "PASSWORD_RESET");
  await sendEmail({
    to: user.email,
    subject: "Reset your VT PeerPulse password",
    text: [
      `Hi ${user.name},`,
      "",
      "Someone requested a password reset for your VT PeerPulse account.",
      "Use this link to choose a new password (valid for 2 hours):",
      "",
      setPasswordUrl(token),
      "",
      "If this wasn't you, you can ignore this email — your password is unchanged.",
    ].join("\n"),
  });
}

/** Sets a password from an invite or reset token. */
export async function setPasswordWithToken(rawToken: string, password: string): Promise<void> {
  const userId = await consumeToken(rawToken, ["INVITE", "PASSWORD_RESET"]);
  const passwordHash = await hash(password, 10);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  await audit(userId, "account.set-password", "User", userId);
}
