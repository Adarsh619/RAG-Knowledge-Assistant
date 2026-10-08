export type LlmMode = "mock" | "openai";

export const MAX_MESSAGE_LENGTH = 4000;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: LlmMode;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  mode: LlmMode;
  message: { role: "assistant"; content: string };
}

export interface ChatErrorResponse {
  error: string;
}

export interface LlmProvider {
  mode: LlmMode;
  enabled: boolean;
  reply(message: string): Promise<string>;
}
