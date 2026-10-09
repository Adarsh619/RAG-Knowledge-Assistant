import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestedDocument } from "../../types/ingestion.ts";
import type { ExtractionResponse } from "../../types/extraction.ts";
import type { EmbeddingResult } from "../../types/embedding.ts";

export const MAX_STORED_CHUNKS = 500;
const columns =
  "id,storage_name,storage_path,original_filename,file_size,ingestion_status,page_count,extracted_characters,source_characters,chunk_count,embedding_model,embedding_revision,embedding_dimension,processed_at,created_at";

interface DocumentRow {
  id: string;
  storage_name: string;
  storage_path: string;
  original_filename: string;
  file_size: number;
  ingestion_status: "ready" | "deleting";
  page_count: number | null;
  extracted_characters: number | null;
  source_characters: number | null;
  chunk_count: number;
  embedding_model: string | null;
  embedding_revision: string | null;
  embedding_dimension: number | null;
  processed_at: string | null;
  created_at: string;
}
function mapRow(row: DocumentRow): IngestedDocument {
  return {
    id: row.id,
    storageName: row.storage_name,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    fileSize: row.file_size,
    status: row.ingestion_status,
    pageCount: row.page_count,
    extractedCharacters: row.extracted_characters,
    sourceCharacters: row.source_characters,
    chunkCount: row.chunk_count,
    embeddingModel: row.embedding_model,
    embeddingRevision: row.embedding_revision,
    embeddingDimension: row.embedding_dimension,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

export class PersistenceError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}
function checkError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "P0001" || error.code === "23505")
    throw new PersistenceError(
      "The document is already ingested or deletion is pending. Refresh the list and retry the appropriate action.",
      409,
    );
  if (error.code === "P0002")
    throw new PersistenceError(
      "The PDF is unavailable in your private library.",
      404,
    );
  throw new PersistenceError(
    "Document persistence could not be completed. Check the Phase 8 migration and retry.",
  );
}

// All calls use the cookie-authenticated client; RLS independently checks auth.uid().
export interface KnowledgeRepository {
  get(name: string): Promise<IngestedDocument | null>;
  list(names: string[]): Promise<IngestedDocument[]>;
  pending(offset: number): Promise<IngestedDocument[]>;
  persist(
    source: ExtractionResponse,
    result: EmbeddingResult,
    reingest: boolean,
  ): Promise<IngestedDocument>;
  beginDeletion(name: string): Promise<string | null>;
  finishDeletion(name: string): Promise<void>;
}

export function createKnowledgeRepository(
  client: SupabaseClient,
  owner: string,
): KnowledgeRepository {
  return {
    async get(name) {
      const { data, error } = await client
        .from("documents")
        .select(columns)
        .eq("owner_id", owner)
        .eq("storage_name", name)
        .maybeSingle();
      checkError(error);
      return data ? mapRow(data as DocumentRow) : null;
    },
    async list(names) {
      if (!names.length) return [];
      const { data, error } = await client
        .from("documents")
        .select(columns)
        .eq("owner_id", owner)
        .in("storage_name", names);
      checkError(error);
      return (data as DocumentRow[]).map(mapRow);
    },
    async pending(offset) {
      const { data, error } = await client
        .from("documents")
        .select(columns)
        .eq("owner_id", owner)
        .eq("ingestion_status", "deleting")
        .order("created_at", { ascending: false })
        .range(offset, offset + 50);
      checkError(error);
      return (data as DocumentRow[]).map(mapRow);
    },
    async persist(source, result, reingest) {
      // pgvector accepts its textual array representation through PostgREST JSON.
      // The database validates vector length, normalization and chunk constraints.
      const { data, error } = await client
        .rpc("persist_document_ingestion", {
          p_storage_name: source.document.id,
          p_file_size: source.document.size,
          p_page_count: source.extraction.pageCount,
          p_extracted_characters: source.extraction.characterCount,
          p_source_characters: source.chunking.sourceCharacterCount,
          p_embedding_model: result.model,
          p_embedding_revision: result.revision,
          p_embedding_dimension: result.dimension,
          p_reingest: reingest,
          p_chunks: result.chunks.map((chunk) => ({
            chunk_index: chunk.chunkIndex,
            content: chunk.text,
            character_count: chunk.characterCount,
            page_numbers: chunk.pageNumbers,
            start_offset: chunk.startOffset,
            end_offset: chunk.endOffset,
            overlap_with_previous: chunk.overlapWithPrevious,
            forced_word_split: chunk.forcedWordSplit,
            token_count: chunk.tokenCount,
            embedding: JSON.stringify(chunk.embedding),
          })),
        })
        .single();
      checkError(error);
      if (!data)
        throw new PersistenceError("No persisted document was returned.");
      return mapRow(data as DocumentRow);
    },
    async beginDeletion(name) {
      const { data, error } = await client.rpc("begin_document_deletion", {
        p_storage_name: name,
      });
      checkError(error);
      return data as string | null;
    },
    async finishDeletion(name) {
      const { data, error } = await client.rpc("finish_document_deletion", {
        p_storage_name: name,
      });
      checkError(error);
      if (data !== true)
        throw new PersistenceError(
          "Deletion cleanup has not completed. Retry deletion.",
        );
    },
  };
}
