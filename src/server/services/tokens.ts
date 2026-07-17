import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { TokenPurpose } from "@/generated/prisma/enums";

const TTL_HOURS: Record<TokenPurpose, number> = {
  INVITE: 7 * 24,
  PASSWORD_RESET: 2,
};

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * Issues a one-time token for a user. Only the SHA-256 hash is stored;
 * the raw token appears exactly once — in the email link.
 * Any previous unused tokens for the same purpose are invalidated.
 */
export async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS[purpose] * 3600_000);
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    db.authToken.create({ data: { userId, purpose, tokenHash: hash(raw), expiresAt } }),
  ]);
  return raw;
}

/**
 * Validates and consumes a one-time token. Throws 400 on invalid/expired/used.
 * Returns the owning user's id.
 */
export async function consumeToken(
  raw: string,
  purpose: TokenPurpose | TokenPurpose[],
): Promise<string> {
  const purposes = Array.isArray(purpose) ? purpose : [purpose];
  const token = await db.authToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!token || !purposes.includes(token.purpose)) {
    throw new HttpError(400, "This link is invalid. Request a new one.");
  }
  if (token.usedAt) throw new HttpError(400, "This link has already been used. Request a new one.");
  if (token.expiresAt < new Date()) {
    throw new HttpError(400, "This link has expired. Request a new one.");
  }
  await db.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  return token.userId;
}
