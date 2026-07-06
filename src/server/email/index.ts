import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Logs emails instead of sending — used in dev/test and when no provider is configured. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<void> {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      "email (console provider — not sent)",
    );
  }
}

/** Resend-compatible HTTP API provider (POST {url} with { from, to, subject, text, html }). */
class HttpEmailProvider implements EmailProvider {
  readonly name = "resend";

  async send(message: EmailMessage): Promise<void> {
    const { EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM } = env();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(EMAIL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${EMAIL_API_KEY}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Email provider responded ${res.status}: ${body.slice(0, 300)}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

let override: EmailProvider | null = null;

/** Test seam: inject a fake email provider. */
export function setEmailProvider(provider: EmailProvider | null) {
  override = provider;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  const { EMAIL_PROVIDER, EMAIL_API_KEY } = env();
  if (EMAIL_PROVIDER === "resend" && EMAIL_API_KEY) return new HttpEmailProvider();
  return new ConsoleEmailProvider();
}

/**
 * Sends an email, logging failures without throwing: notification delivery must
 * never break the primary action (e.g. a round still opens if the mail API is down).
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  try {
    await getEmailProvider().send(message);
    return true;
  } catch (err) {
    logger.error({ err, to: message.to, subject: message.subject }, "email send failed");
    return false;
  }
}
