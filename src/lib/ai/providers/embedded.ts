import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";
import { RAG_LIMITS } from "../../rag/config.ts";
import { LocalLlmError, getEmbeddedModel, getGenerationTimeoutMs } from "../local-config.ts";
import { hasEmbeddedModelFiles, loadEmbeddedGenerator } from "../embedded-model.ts";
import type { EmbeddedGenerator } from "../embedded-model.ts";

// Generation runs inside this Node process: no second server, port or API key.
// The injected loader is for offline tests. Production uses the prepared weights.
export function createEmbeddedProvider(
  loadGenerator: () => Promise<EmbeddedGenerator> = loadEmbeddedGenerator,
): LlmProvider {
  let generatorPromise: Promise<EmbeddedGenerator> | null = null;
  let active = false;

  function getGenerator() {
    if (!generatorPromise)
      generatorPromise = loadGenerator().catch(() => {
        generatorPromise = null; // Permit a retry after model preparation is fixed.
        throw new LocalLlmError("The embedded model could not be loaded. Run npm run models:prepare, then restart. Nothing is downloaded at runtime.");
      });
    return generatorPromise;
  }

  return {
    mode: "local",
    enabled: true,
    async reply(message, options) {
      if (!options?.system?.trim() || !message.trim())
        throw new LocalLlmError("Local generation requires an assembled grounded prompt.");
      if (Buffer.byteLength(options.system + message, "utf8") > RAG_LIMITS.maxPromptBytes)
        throw new LocalLlmError("The local prompt exceeds the development context budget.", 422);
      getEmbeddedModel(); // Reject an unreviewed model before loading anything.
      if (active) throw new LocalLlmError("The local generator is busy. Try again shortly.", 409);
      active = true;
      try {
        const generator = await getGenerator();
        const signal = AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(getGenerationTimeoutMs()),
        ]);
        let result: { text: string; finished: boolean };
        try {
          result = await generator.generate([
            { role: "system", content: options.system },
            { role: "user", content: message },
          ], { maxNewTokens: RAG_LIMITS.maxOutputTokens, signal, onText: options.onText });
        } catch (cause) {
          if (cause instanceof LocalLlmError) throw cause;
          if (signal.aborted)
            throw new LocalLlmError("Local generation was cancelled or timed out. Retry the saved question with a smaller document scope.", 504);
          throw new LocalLlmError("The embedded model could not complete the request. Retry the saved question.", 502);
        }
        if (signal.aborted)
          throw new LocalLlmError("Local generation was cancelled or timed out. Retry the saved question with a smaller document scope.", 504);
        const content = result.text.trim();
        if (!result.finished || !content || content.length > 12000 || /<\/?think>/i.test(content))
          throw new LocalLlmError("The local model returned an incomplete or invalid answer. Try a shorter question or smaller document scope; no answer was saved.", 502);
        return content;
      } finally { active = false; }
    },
  };
}

export const embeddedProvider = createEmbeddedProvider();

// Read-only diagnostic; checks prepared files without loading weights.
export async function checkEmbeddedRuntime(check = hasEmbeddedModelFiles) {
  const installed = await check();
  return { runtimeAvailable: true, modelInstalled: installed, modelMatches: installed };
}
