import "server-only";
import type { AiStatus } from "../../types/ai-status.ts";
import { getLlmMode } from "./provider.ts";
import { checkLocalRuntime } from "./providers/local.ts";
import { checkEmbeddedRuntime } from "./providers/embedded.ts";
import { getActiveLocalModel, getLocalRuntime } from "./local-config.ts";

// Server-only flag for hosted demos on shared CPUs; it only changes UI guidance.
export function isPublicDemo() {
  return process.env.PUBLIC_DEMO?.trim() === "true";
}

// Metadata only: never loads weights, sends a prompt or downloads a model.
export async function getAiStatus(
  check = checkLocalRuntime, checkEmbedded = checkEmbeddedRuntime,
): Promise<AiStatus> {
  const mode = getLlmMode();
  const publicDemo = isPublicDemo();
  if (mode === "mock") return { mode, available: true, model: null, runtime: null, publicDemo, detail: "Demo replies only. No AI model or document retrieval is used." };
  if (mode !== "local") return { mode: "disabled", available: false, model: null, runtime: null, publicDemo, detail: "AI is disabled. Choose a supported local or demo mode in your server configuration." };
  let model: string | null = null;
  let runtime: AiStatus["runtime"] = null;
  try {
    runtime = getLocalRuntime();
    model = getActiveLocalModel().label;
    const result = await (runtime === "embedded" ? checkEmbedded() : check());
    return { mode, available: result.modelMatches, model, runtime, publicDemo, detail: result.modelMatches
      ? "The reviewed model is available on the app's server. Documents are never sent to a hosted AI provider."
      : runtime === "embedded"
        ? "The reviewed model files are not prepared on the app's server. Run npm run models:prepare. Nothing is downloaded at runtime."
        : "The reviewed local model is unavailable. Check installed models in Ollama. Nothing is downloaded automatically." };
  } catch {
    return { mode, available: false, model, runtime, publicDemo, detail: runtime === "embedded"
      ? "The embedded AI model is misconfigured. Check LOCAL_MODEL_ID on the app's server, then check again. No hosted AI fallback is used."
      : "Start Ollama on the app's server, then check again. No hosted AI fallback is used." };
  }
}
