import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk, SearchInput } from "../../types/retrieval.ts";

export class RetrievalError extends Error {}

interface SearchRow {
  document_id: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  character_count: number;
  page_numbers: number[];
  start_offset: number;
  end_offset: number;
  original_filename: string;
  processed_at: string;
  similarity: number;
}

export function createRetrievalRepository(client: SupabaseClient) {
  return {
    async search(vector: number[], input: SearchInput): Promise<RetrievedChunk[]> {
      // This client carries the user's session. PostgreSQL applies RLS inside
      // the invoker RPC; ownership is never supplied by the browser.
      const { data, error } = await client.rpc("search_document_chunks", {
        p_query_embedding: JSON.stringify(vector),
        p_top_k: input.topK,
        p_document_id: input.documentId,
        p_min_similarity: input.minSimilarity,
      });
      if (error || !Array.isArray(data))
        throw new RetrievalError("Document search is unavailable. Check the Phase 9 migration and retry.");
      return (data as SearchRow[]).map((row) => {
        if (!Number.isFinite(row.similarity) || row.similarity < -1 || row.similarity > 1)
          throw new RetrievalError("Document search returned an invalid score.");
        return {
          documentId: row.document_id,
          chunkId: row.chunk_id,
          chunkIndex: row.chunk_index,
          content: row.content,
          characterCount: row.character_count,
          pageNumbers: row.page_numbers,
          startOffset: row.start_offset,
          endOffset: row.end_offset,
          originalFilename: row.original_filename,
          processedAt: row.processed_at,
          similarity: row.similarity,
        };
      });
    },
  };
}
