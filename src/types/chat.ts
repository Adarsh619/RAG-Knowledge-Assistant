import type { RagSummary } from "./rag.ts";

export type LlmMode = "mock" | "local" | "openai";

export const MAX_MESSAGE_LENGTH = 4000;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: LlmMode;
  rag?: RagSummary;
}

export interface ChatRequest {
  message: string;
  documentId?: string | null;
}

export interface ChatResponse {
  mode: LlmMode;
  message: { role: "assistant"; content: string };
  rag?: RagSummary;
}

export interface ChatErrorResponse {
  error: string;
}

export interface LlmProvider {
  mode: LlmMode;
  enabled: boolean;
  reply(message: string, options?: LlmReplyOptions): Promise<string>;
}

export interface LlmReplyOptions {
  system: string;
  signal?: AbortSignal;
}
