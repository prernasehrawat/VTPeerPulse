import type { AIProvider, ChatMessage } from "./provider";

/** Deterministic offline provider used in tests and when no API key is configured. */
export class MockAIProvider implements AIProvider {
  readonly model = "mock-model";

  async complete(messages: ChatMessage[]): Promise<string> {
    const user = messages.find((m) => m.role === "user")?.content ?? "";
    const commentCount = (user.match(/^- /gm) ?? []).length;
    return `[Mock AI summary] Based on ${commentCount} comment(s), feedback themes were identified. Configure AI_API_KEY to enable real AI-generated summaries.`;
  }
}
