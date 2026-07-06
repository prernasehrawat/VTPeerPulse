import { HttpError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider, ChatMessage } from "./provider";

/** Works with any OpenAI-compatible chat completions endpoint. */
export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    public readonly model: string,
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.4 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body: body.slice(0, 500) }, "AI provider error");
      throw new HttpError(502, "AI provider request failed");
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "AI provider returned an empty response");
    return content;
  }
}
