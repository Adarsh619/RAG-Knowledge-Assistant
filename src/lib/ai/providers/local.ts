import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";
import { RAG_LIMITS } from "../../rag/config.ts";
import {
  LOCAL_MODEL, LocalLlmError, getLocalModelName, getLocalOrigin,
} from "../local-config.ts";

// Injected transport is for offline tests. Production uses only loopback fetch.
export function createLocalProvider(transport: typeof fetch = fetch): LlmProvider {
  let active = false;

  async function localJson(path: "/api/tags" | "/api/chat", init: RequestInit) {
    try {
      const response = await transport(`${getLocalOrigin()}${path}`, {
        ...init, redirect: "error", cache: "no-store",
      });
      if (!response.ok)
        throw new LocalLlmError(
          response.status === 404
            ? `The reviewed ${LOCAL_MODEL.name} model is unavailable. Check the existing local Ollama model inventory.`
            : "Ollama could not complete the local request. Check its local status and retry.",
        );
      // Bound the actual response, not merely its Content-Length header.
      const { readLimitedBody } = await import("../../storage/document-handler.ts");
      const bytes = await readLimitedBody(new Request("http://local-response", {
        method: "POST", body: response.body, duplex: "half",
      } as RequestInit), 256 * 1024);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (cause) {
      if (cause instanceof LocalLlmError) throw cause;
      if (init.signal?.aborted)
        throw new LocalLlmError("Local generation was cancelled or timed out. Retry with a shorter question.", 504);
      throw new LocalLlmError("Ollama is unavailable. Check that your existing local runtime is running; no external fallback was attempted.");
    }
  }

  async function checkModel(signal: AbortSignal) {
    const name = getLocalModelName();
    const data = await localJson("/api/tags", { signal });
    const model = Array.isArray(data.models)
      ? data.models.find((item: { name?: string }) => item.name === name)
      : null;
    if (!model)
      throw new LocalLlmError(`The reviewed local ${LOCAL_MODEL.name} model is missing. Check the existing model inventory. The app never downloads models.`);
    if (model.digest !== LOCAL_MODEL.digest || model.remote_host || model.remote_model ||
        model.details?.format !== "gguf" || model.details?.family !== "qwen3" ||
        model.details?.quantization_level !== "Q4_K_M")
      throw new LocalLlmError("The installed model does not match the reviewed local weights. Generation is blocked; cloud or changed models are not accepted.");
    return name;
  }

  return {
    mode: "local",
    enabled: true,
    async reply(message, options) {
      if (!options?.system?.trim() || !message.trim())
        throw new LocalLlmError("Local generation requires an assembled grounded prompt.");
      if (Buffer.byteLength(options.system + message, "utf8") > RAG_LIMITS.maxPromptBytes)
        throw new LocalLlmError("The local prompt exceeds the development context budget.", 422);
      if (active) throw new LocalLlmError("The local generator is busy. Try again shortly.", 409);
      const model = getLocalModelName();
      getLocalOrigin(); // Reject remote configuration before any model request.
      active = true;
      try {
        // Metadata preflight sends no document content. No pull endpoint exists.
        await checkModel(AbortSignal.any([
          ...(options.signal ? [options.signal] : []), AbortSignal.timeout(5000),
        ]));
        const signal = AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(RAG_LIMITS.generationTimeoutMs),
        ]);
        const data = await localJson("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: options.system },
              { role: "user", content: message },
            ],
            stream: false,
            think: false,
            keep_alive: "5m",
            options: {
              temperature: 0,
              num_ctx: RAG_LIMITS.contextTokens,
              num_predict: RAG_LIMITS.maxOutputTokens,
            },
          }),
        });
        if (data.done !== true || data.done_reason === "length" ||
            data.message?.role !== "assistant" ||
            typeof data.message.content !== "string" || !data.message.content.trim() ||
            data.message.content.length > 12000 || data.message.tool_calls?.length ||
            /<\/?think>/i.test(data.message.content))
          throw new LocalLlmError("The local model returned an incomplete or invalid answer. Try a shorter question or smaller document scope.");
        return data.message.content.trim();
      } finally { active = false; }
    },
  };
}

export const localProvider = createLocalProvider();

// Read-only manual diagnostic; never loads a model or sends a prompt.
export async function checkLocalRuntime(transport: typeof fetch = fetch) {
  const response = await transport(`${getLocalOrigin()}/api/tags`, {
    signal: AbortSignal.timeout(5000), redirect: "error", cache: "no-store",
  });
  if (!response.ok) throw new LocalLlmError("Ollama's local model inventory is unavailable.");
  const data = await response.json();
  const name = getLocalModelName();
  const model = data.models?.find((item: { name: string }) => item.name === name);
  return {
    runtimeAvailable: true,
    modelInstalled: Boolean(model),
    modelMatches: Boolean(model && model.digest === LOCAL_MODEL.digest &&
      !model.remote_host && !model.remote_model && model.details?.format === "gguf" &&
      model.details?.family === "qwen3" && model.details?.quantization_level === "Q4_K_M"),
  };
}
