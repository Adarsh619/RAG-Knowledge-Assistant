import type { SearchInput } from "../../types/retrieval.ts";
import { InputError } from "../storage/document-handler.ts";
import { SEARCH_DEFAULTS, SEARCH_LIMITS } from "./config.ts";

export function parseSearchInput(value: unknown): SearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("A search request is required.", 400);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["question", "topK", "minSimilarity", "documentId"].includes(key)))
    throw new InputError("Unsupported search field.", 400);
  if (typeof input.question !== "string")
    throw new InputError("Enter a question.", 400);
  const question = input.question.trim();
  if (!question || question.length > SEARCH_LIMITS.maxQuestionCharacters)
    throw new InputError("Enter a question between 1 and 1,000 characters.", 400);
  const topK = input.topK === undefined ? SEARCH_DEFAULTS.topK : input.topK;
  if (typeof topK !== "number" || !Number.isInteger(topK) || topK < 1 || topK > SEARCH_LIMITS.maxTopK)
    throw new InputError("Top-k must be an integer between 1 and 20.", 400);
  const minSimilarity = input.minSimilarity === undefined ? SEARCH_DEFAULTS.minSimilarity : input.minSimilarity;
  if (typeof minSimilarity !== "number" || !Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1)
    throw new InputError("Minimum similarity must be between -1 and 1.", 400);
  const documentId = input.documentId === undefined ? null : input.documentId;
  if (documentId !== null && (typeof documentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)))
    throw new InputError("Select a valid document.", 400);
  return { question, topK, minSimilarity, documentId };
}
