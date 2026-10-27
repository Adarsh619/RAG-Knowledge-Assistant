import "server-only";
import { resolve } from "node:path";
import { RAG_LIMITS } from "../rag/config.ts";

export type LocalRuntime = "ollama" | "embedded";

// Reviewed in-process models. Weights and revision are pinned like MiniLM:
// prepared once from public Hub URLs, then loaded with remote access disabled.
export const EMBEDDED_MODELS = Object.freeze({
  "qwen3-0.6b": Object.freeze({
    id: "onnx-community/Qwen3-0.6B-ONNX",
    revision: "58ca03a5e7b354b480b1a82b34bde8dc7b854cc0",
    label: "Qwen3 0.6B",
    dtype: "q4" as const,
  }),
  "qwen3-1.7b": Object.freeze({
    id: "onnx-community/Qwen3-1.7B-ONNX",
    revision: "3231b522c6e703b2f9b3cd8ea27426a1289a02f2",
    label: "Qwen3 1.7B",
    dtype: "q4" as const,
  }),
});
export type EmbeddedModelId = keyof typeof EMBEDDED_MODELS;
export const DEFAULT_EMBEDDED_MODEL: EmbeddedModelId = "qwen3-0.6b";
export const EMBEDDED_MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "chat_template.jinja",
  "onnx/model_q4.onnx",
] as const;
export const EMBEDDED_CACHE_DIRECTORY = resolve(".setup-cache/transformers");

// An explicit loopback address prevents DNS resolution, remote configuration,
// browser-controlled endpoints and hosted generative API access.
export const OLLAMA_ORIGIN = "http://127.0.0.1:11434";
export const LOCAL_MODEL = Object.freeze({
  name: "qwen3:4b-instruct",
  // SHA-256 of the official Ollama manifest reviewed for Phase 10.
  digest: "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0",
});

export class LocalLlmError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

export function getLocalModelName() {
  const name = process.env.OLLAMA_MODEL?.trim() || LOCAL_MODEL.name;
  if (name !== LOCAL_MODEL.name)
    throw new LocalLlmError(
      `Only the reviewed local ${LOCAL_MODEL.name} model is enabled. Cloud models and other model names are blocked.`,
    );
  return name;
}

export function getLocalOrigin() {
  const configured = process.env.OLLAMA_BASE_URL?.trim() || OLLAMA_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "11434" || url.pathname !== "/" || url.search || url.hash ||
        url.username || url.password) throw new Error("Not the local endpoint");
  } catch {
    throw new LocalLlmError("OLLAMA_BASE_URL must be http://localhost:11434 or http://127.0.0.1:11434. Remote endpoints are blocked.");
  }
  // Canonical IP avoids DNS lookup even when configuration says localhost.
  return OLLAMA_ORIGIN;
}

// Ollama remains the default so existing local installs behave unchanged.
export function getLocalRuntime(): LocalRuntime {
  const runtime = process.env.LOCAL_RUNTIME?.trim() || "ollama";
  if (runtime !== "ollama" && runtime !== "embedded")
    throw new LocalLlmError("LOCAL_RUNTIME must be ollama or embedded.");
  return runtime;
}

export function getEmbeddedModel() {
  const key = process.env.LOCAL_MODEL_ID?.trim() || DEFAULT_EMBEDDED_MODEL;
  if (!Object.hasOwn(EMBEDDED_MODELS, key))
    throw new LocalLlmError(
      `LOCAL_MODEL_ID must be one of the reviewed models: ${Object.keys(EMBEDDED_MODELS).join(", ")}.`,
    );
  const model = EMBEDDED_MODELS[key as EmbeddedModelId];
  return { key: key as EmbeddedModelId, ...model,
    directory: resolve(EMBEDDED_CACHE_DIRECTORY, model.id, model.revision) };
}

/** The model recorded with answers and shown in status, for the configured runtime. */
export function getActiveLocalModel() {
  if (getLocalRuntime() === "embedded") {
    const model = getEmbeddedModel();
    return { name: model.id, label: model.label };
  }
  return { name: getLocalModelName(), label: "Qwen3 4B" };
}

// Free shared CPUs are slower than a desktop; the bound still prevents runaway requests.
export function getGenerationTimeoutMs() {
  const configured = Number(process.env.GENERATION_TIMEOUT_MS?.trim());
  return Number.isSafeInteger(configured) && configured >= 30000 && configured <= 300000
    ? configured : RAG_LIMITS.generationTimeoutMs;
}
