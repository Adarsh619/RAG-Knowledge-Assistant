import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";
import { LocalLlmError } from "../local-config.ts";

// Retrieval-only deployments: document questions return stored evidence, and nothing
// is generated, so there is no model to run, download or pay for.
export const evidenceProvider: LlmProvider = {
  mode: "local",
  enabled: true,
  evidenceOnly: true,
  async reply() {
    throw new LocalLlmError("This deployment answers with document evidence only. General AI answers need an answer generator.", 503);
  },
};
