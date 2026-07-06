import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider, ChatMessage } from "./provider";

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Works with any OpenAI-compatible chat completions endpoint. */
export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    public readonly model: string,
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env().AI_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: this.model, messages, temperature: 0.4 }),
          signal: controller.signal,
        });
      } catch (err) {
        // Timeout or network failure — retryable.
        clearTimeout(timer);
        logger.warn({ err, attempt }, "AI provider request failed (network/timeout)");
        if (attempt < MAX_ATTEMPTS) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw new HttpError(502, "AI provider is unreachable. Try again in a moment.");
      }
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.error({ status: res.status, attempt, body: body.slice(0, 500) }, "AI provider error");
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw new HttpError(502, "AI provider request failed");
      }

      const json = (await res.json().catch(() => null)) as
        | { choices?: { message?: { content?: string } }[] }
        | null;
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new HttpError(502, "AI provider returned an empty response");
      return content;
    }
    throw new HttpError(502, "AI provider request failed after multiple attempts");
  }
}
