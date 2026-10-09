import "server-only";
import type { DocumentChunk } from "../../types/chunk.ts";
import type { EmbeddedChunk, EmbeddingResult } from "../../types/embedding.ts";
import { EMBEDDING_MODEL } from "./config.ts";
import { loadLocalEmbeddingModel } from "./local-model.ts";
import type { LocalEmbeddingPipeline } from "./local-model.ts";

export class EmbeddingError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

export function createChunkEmbedder(
  loadModel: () => Promise<LocalEmbeddingPipeline> = loadLocalEmbeddingModel,
) {
  let modelPromise: Promise<LocalEmbeddingPipeline> | null = null;
  let active = false;
  let initializationCount = 0;
  let completedBatchCount = 0;

  async function getModel() {
    if (!modelPromise) {
      initializationCount++;
      modelPromise = loadModel().catch(() => {
        modelPromise = null; // Permit a retry after model preparation is fixed.
        throw new EmbeddingError(
          "The local embedding model could not be loaded. Run npm run embeddings:prepare, then retry. No remote inference was attempted.",
        );
      });
    }
    return modelPromise;
  }

  async function embedChunks(
    chunks: DocumentChunk[],
  ): Promise<EmbeddingResult> {
    const modelReused = chunks.length > 0 && modelPromise !== null;
    const embedded: EmbeddedChunk[] = [];
    const metadata = {
      model: EMBEDDING_MODEL.id,
      revision: EMBEDDING_MODEL.revision,
      dimension: EMBEDDING_MODEL.dimension,
      normalized: true as const,
      device: EMBEDDING_MODEL.device,
      dtype: EMBEDDING_MODEL.dtype,
      modelReused,
    };
    if (!chunks.length) {
      return { ...metadata, embeddedChunkCount: 0, batchCount: 0, chunks: [] };
    }
    // One document at a time keeps simultaneous native inference bounded.
    // Fail quickly rather than accumulate a queue of private document content.
    if (active)
      throw new EmbeddingError(
        "The local model is busy. Try again shortly.",
        409,
      );
    active = true;
    try {
      if (chunks.some((chunk) => !chunk.text.trim())) {
        throw new EmbeddingError("A chunk has no text to embed.", 422);
      }
      const model = await getModel();
      const tokenCounts = chunks.map((chunk) => model.countTokens(chunk.text));
      if (
        tokenCounts.some((count) => !Number.isSafeInteger(count) || count < 1)
      ) {
        throw new EmbeddingError(
          "The local tokenizer returned an invalid result.",
        );
      }
      const oversizedIndex = tokenCounts.findIndex(
        (count) => count > EMBEDDING_MODEL.maxInputTokens,
      );
      if (oversizedIndex !== -1) {
        throw new EmbeddingError(
          `Chunk ${chunks[oversizedIndex].chunkIndex} exceeds the local model's 512-token input limit. This document needs smaller token-aware chunks before embedding; no text was truncated.`,
          422,
        );
      }
      let batchCount = 0;
      for (
        let offset = 0;
        offset < chunks.length;
        offset += EMBEDDING_MODEL.batchSize
      ) {
        const batch = chunks.slice(offset, offset + EMBEDDING_MODEL.batchSize);
        const output = await model(
          batch.map((chunk) => chunk.text),
          { pooling: "mean", normalize: true },
        );
        if (
          output.dims.length !== 2 ||
          output.dims[0] !== batch.length ||
          output.dims[1] !== EMBEDDING_MODEL.dimension ||
          output.data.length !== batch.length * EMBEDDING_MODEL.dimension
        ) {
          throw new EmbeddingError(
            "The local model returned an unexpected embedding dimension.",
          );
        }
        for (const [index, chunk] of batch.entries()) {
          const vector = Array.from(
            { length: EMBEDDING_MODEL.dimension },
            (_, dimension) =>
              output.data[index * EMBEDDING_MODEL.dimension + dimension],
          );
          if (
            !vector.every(Number.isFinite) ||
            Math.abs(Math.hypot(...vector) - 1) > 0.0001
          ) {
            throw new EmbeddingError(
              "The local model returned an invalid or unnormalized embedding.",
            );
          }
          embedded.push({
            ...chunk,
            pageNumbers: [...chunk.pageNumbers],
            embedding: vector,
            tokenCount: tokenCounts[offset + index],
          });
        }
        batchCount++;
        completedBatchCount++;
      }
      return {
        ...metadata,
        embeddedChunkCount: embedded.length,
        batchCount,
        chunks: embedded,
      };
    } catch (cause) {
      if (cause instanceof EmbeddingError) throw cause;
      throw new EmbeddingError(
        "Local embedding generation failed. Try again; no remote inference was attempted.",
      );
    } finally {
      active = false;
    }
  }

  return {
    embedChunks,
    getStatistics: () => ({ initializationCount, completedBatchCount, active }),
  };
}

// Preserve the same lazy service across development module reloads. This
// holds only model resources and counters, never a cache of users' documents.
const serverGlobal = globalThis as typeof globalThis & {
  ragLocalChunkEmbedder?: ReturnType<typeof createChunkEmbedder>;
};
export const localChunkEmbedder = (serverGlobal.ragLocalChunkEmbedder ??=
  createChunkEmbedder());
