import "server-only";
import { resolve } from "node:path";

// Pin the weights as well as the package: vectors from different revisions
// must not be mixed in a future index, even if their dimensions match.
export const EMBEDDING_MODEL = Object.freeze({
  id: "Xenova/all-MiniLM-L6-v2",
  revision: "751bff37182d3f1213fa05d7196b954e230abad9",
  dimension: 384,
  dtype: "q8" as const,
  device: "cpu" as const,
  maxInputTokens: 512,
  batchSize: 4,
});

export const EMBEDDING_CACHE_DIRECTORY = resolve(".setup-cache/transformers");
export const EMBEDDING_LOCAL_MODEL_DIRECTORY = resolve(
  EMBEDDING_CACHE_DIRECTORY,
  EMBEDDING_MODEL.id,
  EMBEDDING_MODEL.revision,
);
export const EMBEDDING_MODEL_FILES = [
  "config.json",
  "tokenizer_config.json",
  "tokenizer.json",
  "onnx/model_quantized.onnx",
] as const;
