import type { IngestedDocument } from "./ingestion.ts";

export interface StoredDocument {
  /** The filename inside the user's folder, including its generated UUID. */
  id: string;
  name: string;
  size: number | null;
  uploadedAt: string | null;
  ingestion?: IngestedDocument | null;
  storageMissing?: boolean;
}

export interface DocumentListResponse {
  documents: StoredDocument[];
  nextOffset: number | null;
}

export interface DocumentMutationResponse {
  message: string;
}
