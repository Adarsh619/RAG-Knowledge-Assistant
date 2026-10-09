import { SEARCH_DEFAULTS, SEARCH_LIMITS } from "../retrieval/config.ts";

// Client-safe limits. Changing the model/context settings requires review.
export const RAG_LIMITS = Object.freeze({
  topK: SEARCH_DEFAULTS.topK,
  minSimilarity: SEARCH_DEFAULTS.minSimilarity,
  maxQuestionCharacters: SEARCH_LIMITS.maxQuestionCharacters,
  maxContextBytes: 6000,
  maxPromptBytes: 7000,
  contextTokens: 8192,
  maxOutputTokens: 384,
  generationTimeoutMs: 120000,
});

export const INSUFFICIENT_CONTEXT_MESSAGE =
  "Your ingested documents do not provide enough relevant information to answer this question. Try a more specific question or ingest a document that covers the topic.";
