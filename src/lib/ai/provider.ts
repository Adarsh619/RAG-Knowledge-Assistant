import "server-only";
import type { LlmMode, LlmProvider } from "../../types/chat.ts";
import { mockProvider } from "./providers/mock.ts";
import { openaiProvider } from "./providers/openai.ts";
import { localProvider } from "./providers/local.ts";

// Only configuration selects the provider. A key never enables OpenAI.
export function getLlmMode(): LlmMode | null {
  const mode = process.env.LLM_MODE?.trim() || "mock";
  return mode === "mock" || mode === "local" || mode === "openai" ? mode : null;
}

export function getLlmProvider(): LlmProvider {
  switch (getLlmMode()) {
    case "mock":
      return mockProvider;
    case "openai":
      return openaiProvider;
    case "local":
      return localProvider;
    default:
      throw new Error(
        "Unsupported LLM_MODE. Set LLM_MODE=mock and restart the server.",
      );
  }
}
