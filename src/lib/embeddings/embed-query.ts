import "server-only";
import { EMBEDDING_MODEL } from "./config.ts";
import { localChunkEmbedder, EmbeddingError } from "./embed-chunks.ts";
import type { SearchResponse } from "../../types/retrieval.ts";

export interface QueryEmbedding {
  vector: number[];
  metadata: SearchResponse["embedding"];
}

export function createQueryEmbedder(
  embedChunks = localChunkEmbedder.embedChunks,
) {
  return async function embedQuery(question: string): Promise<QueryEmbedding> {
    try {
      // Adapt one question to the existing embedding contract. This does not
      // split, persist, or attach the question to any document. Only the vector
      // and model metadata survive this adapter, sharing the ingestion singleton.
      const result = await embedChunks([{
        documentId: "temporary-query",
        chunkIndex: 0,
        text: question,
        characterCount: question.length,
        pageNumbers: [],
        startOffset: 0,
        endOffset: question.length,
        overlapWithPrevious: 0,
        forcedWordSplit: false,
      }]);
      const chunk = result.chunks[0];
      if (result.chunks.length !== 1 || result.model !== EMBEDDING_MODEL.id ||
          result.revision !== EMBEDDING_MODEL.revision || result.dimension !== 384 ||
          result.normalized !== true || !chunk || chunk.embedding.length !== 384 ||
          !chunk.embedding.every(Number.isFinite) || Math.abs(Math.hypot(...chunk.embedding) - 1) >= 0.0001)
        throw new EmbeddingError("The local query embedding is invalid.");
      return {
        vector: chunk.embedding,
        metadata: {
          model: result.model,
          revision: result.revision,
          dimension: result.dimension,
          normalized: true,
          tokenCount: chunk.tokenCount,
          modelReused: result.modelReused,
        },
      };
    } catch (cause) {
      if (cause instanceof EmbeddingError && cause.status === 422)
        throw new EmbeddingError("The question exceeds the local model's 512-token limit. Shorten it and retry; no text was truncated.", 422);
      throw cause;
    }
  };
}

export const embedQuery = createQueryEmbedder();
