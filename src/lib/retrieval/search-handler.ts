import "server-only";
import type { RetrievedChunk, SearchInput, SearchResponse } from "../../types/retrieval.ts";
import { embedQuery, type QueryEmbedding } from "../embeddings/embed-query.ts";
import { EmbeddingError } from "../embeddings/embed-chunks.ts";
import { InputError, isSameOrigin, readLimitedBody } from "../storage/document-handler.ts";
import { SEARCH_LIMITS } from "./config.ts";
import { parseSearchInput } from "./input.ts";
import { RetrievalError } from "./repository.ts";

export interface SearchContext {
  repository: { search(vector: number[], input: SearchInput): Promise<RetrievedChunk[]> };
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleSearchDocuments(
  request: Request,
  context: SearchContext | null,
  generateQuery: (question: string) => Promise<QueryEmbedding> = embedQuery,
) {
  if (!context) return json({ error: "Sign in to search documents." }, 401);
  if (!isSameOrigin(request)) return json({ error: "Cross-site search is not allowed." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return json({ error: "Send the question as JSON." }, 415);
  try {
    const bytes = await readLimitedBody(request, SEARCH_LIMITS.maxBodyBytes);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new InputError("The search request contains invalid JSON.", 400); }
    const query = parseSearchInput(value);
    const embedding = await generateQuery(query.question);
    const matches = await context.repository.search(embedding.vector, query);
    return json({ query, embedding: embedding.metadata, matches } satisfies SearchResponse);
  } catch (cause) {
    if (cause instanceof InputError)
      return json({ error: cause.status === 413 ? "The search request is too large." : cause.message }, cause.status);
    if (cause instanceof EmbeddingError)
      return json({ error: cause.message }, cause.status);
    if (cause instanceof RetrievalError)
      return json({ error: cause.message }, 503);
    return json({ error: "Document search failed. Try again." }, 503);
  }
}
