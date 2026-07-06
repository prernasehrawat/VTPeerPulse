export type ChatMessage = { role: "system" | "user"; content: string };

export interface AIProvider {
  readonly model: string;
  complete(messages: ChatMessage[]): Promise<string>;
}
