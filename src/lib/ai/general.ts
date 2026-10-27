import "server-only";
import type { LlmProvider, ChatMode } from "../../types/chat.ts";
import type { RagSummary } from "../../types/rag.ts";
import { LocalLlmError, getActiveLocalModel } from "./local-config.ts";

export const GENERAL_SYSTEM_PROMPT = [
  "You are a helpful local AI assistant. Answer clearly and concisely using your general knowledge.",
  "You have not been given any uploaded documents. Never claim your answer is based on the user's documents or invent citations, filenames or page references.",
  "Be honest about uncertainty and limitations. Do not claim to have browsed the internet or accessed current information.",
].join("\n");

export async function answerGenerally(
  question: string, provider: LlmProvider, chatMode: ChatMode, signal?: AbortSignal, onText?: (text: string) => void,
) {
  if (provider.mode !== "local" || !provider.enabled)
    throw new LocalLlmError("General AI requires the local provider. No hosted fallback is available.");
  const content = await provider.reply(question, { system: GENERAL_SYSTEM_PROMPT, signal, onText });
  const rag: RagSummary = { status: "general", chatMode, model: getActiveLocalModel().name,
    retrievedChunkCount: 0, contextChunkCount: 0, contextBytes: 0 };
  return { content, rag, sources: [] };
}
