import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";

export const OPENAI_DISABLED_MESSAGE =
  "OpenAI is disabled in Phase 2. Set LLM_MODE=mock and restart the server to use local chat. No external request was made.";

export const openaiProvider: LlmProvider = {
  mode: "openai",
  enabled: false,
  async reply() {
    // Future integration point. Intentionally no SDK, key access, or HTTP call.
    throw new Error(OPENAI_DISABLED_MESSAGE);
  },
};
