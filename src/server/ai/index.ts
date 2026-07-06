import { env } from "@/lib/env";
import { MockAIProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./provider";

let override: AIProvider | null = null;

/** Test seam: inject a fake provider. */
export function setAIProvider(provider: AIProvider | null) {
  override = provider;
}

export function getAIProvider(): AIProvider {
  if (override) return override;
  const { AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL } = env();
  if (AI_PROVIDER === "mock" || !AI_API_KEY) return new MockAIProvider();
  return new OpenAIProvider(AI_API_KEY, AI_BASE_URL, AI_MODEL);
}
