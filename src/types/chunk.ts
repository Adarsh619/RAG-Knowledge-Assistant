export interface ChunkingOptions {
  maxCharacters: number;
  overlapCharacters: number;
}

export interface DocumentChunk {
  chunkIndex: number;
  documentId: string;
  text: string;
  characterCount: number;
  pageNumbers: number[];
  // Half-open offsets into the normalized, joined page text: [start, end).
  startOffset: number;
  endOffset: number;
  overlapWithPrevious: number;
  forcedWordSplit: boolean;
}

export interface ChunkingResult {
  options: ChunkingOptions;
  sourceCharacterCount: number;
  chunks: DocumentChunk[];
}
