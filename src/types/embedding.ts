import type { DocumentChunk } from "./chunk.ts";

export interface EmbeddedChunk extends DocumentChunk {
  embedding: number[];
  tokenCount: number;
}

export interface EmbeddingResult {
  model: string;
  revision: string;
  dimension: number;
  normalized: true;
  device: "cpu";
  dtype: "q8";
  embeddedChunkCount: number;
  batchCount: number;
  modelReused: boolean;
  chunks: EmbeddedChunk[];
}

export interface EmbeddingResponse {
  document: { id: string; name: string };
  embeddings: EmbeddingResult;
}
