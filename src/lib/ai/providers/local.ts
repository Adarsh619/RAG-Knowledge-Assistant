import "server-only";
import type { LlmProvider } from "../../../types/chat.ts";
import { RAG_LIMITS } from "../../rag/config.ts";
import {
  LOCAL_MODEL, LocalLlmError, getLocalModelName, getLocalOrigin,
} from "../local-config.ts";
import { InputError, readLimitedBody } from "../../storage/document-handler.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesReviewedModel(model: Record<string, unknown>) {
  const details = model.details;
  return model.digest === LOCAL_MODEL.digest && !model.remote_host && !model.remote_model &&
    isRecord(details) && details.format === "gguf" && details.family === "qwen3" &&
    details.quantization_level === "Q4_K_M";
}

function installedModel(data: Record<string, unknown>, name: string) {
  if (!Array.isArray(data.models))
    throw new LocalLlmError("Ollama returned an invalid model inventory. Restart Ollama and retry.", 502);
  return data.models.find((item: unknown): item is Record<string, unknown> => isRecord(item) && item.name === name);
}

async function readLocalJson(response: Response): Promise<Record<string, unknown>> {
  try {
    if (!response.body) throw new SyntaxError();
    const bytes = await readLimitedBody(new Request("http://local-response", {
      method: "POST", body: response.body, duplex: "half",
    } as RequestInit), 256 * 1024);
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(data)) throw new SyntaxError();
    return data;
  } catch (cause) {
    if (cause instanceof SyntaxError || cause instanceof InputError)
      throw new LocalLlmError("Ollama returned an invalid or oversized response. Restart Ollama and retry; no answer was saved.", 502);
    throw cause;
  }
}

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
      return await readLocalJson(response);
    } catch (cause) {
      if (init.signal?.aborted)
        throw new LocalLlmError("Local generation was cancelled or timed out. Check Ollama, then retry the saved question with a smaller document scope.", 504);
      if (cause instanceof LocalLlmError) throw cause;
      throw new LocalLlmError("Ollama is unavailable. Start the Ollama desktop app or run ollama serve, then retry the saved question. No external fallback was attempted.");
    }
  }

  async function checkModel(signal: AbortSignal) {
    const name = getLocalModelName();
    const data = await localJson("/api/tags", { signal });
    const model = installedModel(data, name);
    if (!model)
      throw new LocalLlmError(`The reviewed local ${LOCAL_MODEL.name} model is missing. Run ollama list to inspect installed models and follow the manual setup guide. The app never downloads models.`);
    if (!matchesReviewedModel(model))
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
        if (data.done !== true || data.done_reason !== "stop" ||
            !isRecord(data.message) || data.message.role !== "assistant" ||
            typeof data.message.content !== "string" || !data.message.content.trim() ||
            data.message.content.length > 12000 ||
            (data.message.tool_calls !== undefined && (!Array.isArray(data.message.tool_calls) || data.message.tool_calls.length)) ||
            /<\/?think>/i.test(data.message.content))
          throw new LocalLlmError("The local model returned an incomplete or invalid answer. Try a shorter question or smaller document scope; no answer was saved.", 502);
        return data.message.content.trim();
      } finally { active = false; }
    },
  };
}

export const localProvider = createLocalProvider();

// Read-only manual diagnostic; never loads a model or sends a prompt.
export async function checkLocalRuntime(transport: typeof fetch = fetch) {
  const name = getLocalModelName();
  const response = await transport(`${getLocalOrigin()}/api/tags`, {
    signal: AbortSignal.timeout(5000), redirect: "error", cache: "no-store",
  });
  if (!response.ok) throw new LocalLlmError("Ollama's local model inventory is unavailable.");
  const data = await readLocalJson(response);
  const model = installedModel(data, name);
  return {
    runtimeAvailable: true,
    modelInstalled: Boolean(model),
    modelMatches: Boolean(model && matchesReviewedModel(model)),
  };
}
