export interface StoredDocument {
  /** The filename inside the user's folder, including its generated UUID. */
  id: string;
  name: string;
  size: number | null;
  uploadedAt: string | null;
}

export interface DocumentListResponse {
  documents: StoredDocument[];
  nextOffset: number | null;
}

export interface DocumentMutationResponse {
  message: string;
}
