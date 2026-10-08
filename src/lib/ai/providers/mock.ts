import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";

export const mockProvider: LlmProvider = {
  mode: "mock",
  enabled: true,
  async reply(message) {
    // A short local delay makes the loading state visible. No network call.
    await new Promise((resolve) => setTimeout(resolve, 600));

    return [
      "Local mock response — no AI model was called.",
      `The backend received your message: “${message}”`,
      "Your message traveled through the chat API and the mock provider. This is a development confirmation, not an AI answer. Document retrieval is not connected yet.",
    ].join("\n\n");
  },
};
