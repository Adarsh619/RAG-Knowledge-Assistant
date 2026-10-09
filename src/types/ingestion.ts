export interface IngestedDocument {
  id: string;
  storageName: string;
  storagePath: string;
  originalFilename: string;
  fileSize: number;
  status: "ready" | "deleting";
  pageCount: number | null;
  extractedCharacters: number | null;
  sourceCharacters: number | null;
  chunkCount: number;
  embeddingModel: string | null;
  embeddingRevision: string | null;
  embeddingDimension: number | null;
  processedAt: string | null;
  createdAt: string;
}

export interface IngestionResponse {
  document: IngestedDocument;
  message: string;
}
