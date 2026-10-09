export interface SearchInput {
  question: string;
  topK: number;
  minSimilarity: number;
  documentId: string | null;
}

export interface RetrievedChunk {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  characterCount: number;
  pageNumbers: number[];
  startOffset: number;
  endOffset: number;
  originalFilename: string;
  processedAt: string;
  similarity: number;
}

export interface SearchResponse {
  query: SearchInput;
  embedding: {
    model: string;
    revision: string;
    dimension: number;
    normalized: true;
    tokenCount: number;
    modelReused: boolean;
  };
  matches: RetrievedChunk[];
}
