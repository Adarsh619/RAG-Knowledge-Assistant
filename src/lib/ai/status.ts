import "server-only";
import type { AiStatus } from "../../types/ai-status.ts";
import { getLlmMode } from "./provider.ts";
import { checkLocalRuntime } from "./providers/local.ts";

// Metadata only: never loads weights, sends a prompt or downloads a model.
export async function getAiStatus(check = checkLocalRuntime): Promise<AiStatus> {
  const mode = getLlmMode();
  if (mode === "mock") return { mode, available: true, model: null, detail: "Demo replies only. No AI model or document retrieval is used." };
  if (mode !== "local") return { mode: "disabled", available: false, model: null, detail: "AI is disabled. Choose a supported local or demo mode in your server configuration." };
  try {
    const result = await check();
    return { mode, available: result.modelMatches, model: "Qwen3 4B", detail: result.modelMatches
      ? "Your reviewed model is available on this computer. Documents are never sent to a hosted AI provider."
      : "The reviewed local model is unavailable. Check installed models in Ollama. Nothing is downloaded automatically." };
  } catch {
    return { mode, available: false, model: "Qwen3 4B", detail: "Start Ollama on this computer, then check again. No hosted AI fallback is used." };
  }
}
