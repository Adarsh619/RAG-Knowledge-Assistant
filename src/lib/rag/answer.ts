import "server-only";
import type { SearchInput } from "../../types/retrieval.ts";
import type { RagSource, RagSummary } from "../../types/rag.ts";
import type { LlmProvider } from "../../types/chat.ts";
import type { SearchContext } from "../retrieval/search-handler.ts";
import { embedQuery } from "../embeddings/embed-query.ts";
import { localProvider } from "../ai/providers/local.ts";
import { LOCAL_MODEL, LocalLlmError } from "../ai/local-config.ts";
import { RAG_LIMITS, INSUFFICIENT_CONTEXT_MESSAGE } from "./config.ts";
import { assembleRagPrompt } from "./prompt.ts";
import { buildRagSources } from "./sources.ts";

export async function answerFromDocuments(
  input: SearchInput,
  context: SearchContext,
  options: { provider?: LlmProvider; generateQuery?: typeof embedQuery; signal?: AbortSignal } = {},
): Promise<{ content: string; rag: RagSummary; sources: RagSource[] }> {
  const provider = options.provider ?? localProvider;
  if (provider.mode !== "local" || !provider.enabled)
    throw new LocalLlmError("Document generation requires the local provider. No external fallback is available.");
  options.signal?.throwIfAborted();
  const query = await (options.generateQuery ?? embedQuery)(input.question);
  const matches = await context.repository.search(query.vector, {
    ...input, topK: RAG_LIMITS.topK, minSimilarity: RAG_LIMITS.minSimilarity,
  });
  options.signal?.throwIfAborted();
  const prompt = assembleRagPrompt(input.question, matches);
  const summary = {
    retrievedChunkCount: matches.length,
    contextChunkCount: prompt.chunks.length,
    contextBytes: prompt.contextBytes,
  };
  if (!prompt.chunks.length)
    return {
      content: INSUFFICIENT_CONTEXT_MESSAGE,
      sources: [],
      rag: { ...summary, status: "insufficient_context", model: null },
    };
  const content = await provider.reply(prompt.user, {
    system: prompt.system, signal: options.signal,
  });
  return {
    content,
    sources: buildRagSources(prompt.chunks),
    rag: { ...summary, status: "generated", model: LOCAL_MODEL.name },
  };
}
