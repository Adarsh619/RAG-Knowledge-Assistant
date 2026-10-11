import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";

export const OPENAI_DISABLED_MESSAGE =
  "OpenAI is disabled. Set LLM_MODE=mock for demo replies or LLM_MODE=local for localhost Ollama, then restart the server. No external request was made.";

export const openaiProvider: LlmProvider = {
  mode: "openai",
  enabled: false,
  async reply() {
    // Future integration point. Intentionally no SDK, key access, or HTTP call.
    throw new Error(OPENAI_DISABLED_MESSAGE);
  },
};
