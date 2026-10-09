// Client-safe development controls. The RPC independently enforces these bounds.
export const SEARCH_DEFAULTS = Object.freeze({ topK: 5, minSimilarity: 0.30 });
export const SEARCH_LIMITS = Object.freeze({
  maxTopK: 20,
  maxQuestionCharacters: 1000,
  maxBodyBytes: 8192,
});
