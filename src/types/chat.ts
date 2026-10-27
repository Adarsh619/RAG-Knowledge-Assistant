import type { RagSource, RagSummary } from "./rag.ts";

export type LlmMode = "mock" | "local" | "openai";
export type ChatMode = "documents" | "general" | "auto";

export const MAX_MESSAGE_LENGTH = 4000;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: LlmMode;
  rag?: RagSummary;
  sources?: RagSource[];
}

export interface ChatRequest {
  message: string;
  chatMode?: ChatMode;
  documentId?: string | null;
}

export interface ChatResponse {
  mode: LlmMode;
  message: { role: "assistant"; content: string };
  rag?: RagSummary;
  sources: RagSource[];
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
  /** Receives text as it is generated. Providers that cannot stream simply never call it. */
  onText?: (text: string) => void;
}

/** One line of an application/x-ndjson conversation turn stream. */
export type TurnStreamEvent<T> =
  | { type: "delta"; text: string }
  | { type: "done"; data: T }
  | { type: "error"; status: number; error: string };
