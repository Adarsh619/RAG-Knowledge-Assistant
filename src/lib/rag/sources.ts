import "server-only";
import type { RetrievedChunk } from "../../types/retrieval.ts";
import type { RagSource } from "../../types/rag.ts";

export const SOURCE_EXCERPT_CHARACTERS = 360;

// Take an exact prefix: no paraphrasing or normalization of the stored text.
function excerpt(text: string) {
  if (text.length <= SOURCE_EXCERPT_CHARACTERS) return text;
  let end = SOURCE_EXCERPT_CHARACTERS;
  // Avoid cutting a surrogate pair (e.g. an emoji) in half.
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  const prefix = text.slice(0, end);
  const boundary = prefix.search(/\s+\S*$/u);
  if (boundary > end / 2) end = boundary;
  return text.slice(0, end);
}

/** Call only with the selected chunks actually supplied to the generator. */
export function buildRagSources(contextChunks: readonly RetrievedChunk[]): RagSource[] {
  const seen = new Set<string>();
  return contextChunks.filter((chunk) => {
    if (seen.has(chunk.chunkId)) return false;
    seen.add(chunk.chunkId);
    return true;
  }).map((chunk, index) => {
    const preview = excerpt(chunk.content);
    return {
      rank: index + 1,
      documentId: chunk.documentId,
      chunkId: chunk.chunkId,
      originalFilename: chunk.originalFilename,
      chunkIndex: chunk.chunkIndex,
      pageNumbers: [...chunk.pageNumbers],
      similarity: chunk.similarity,
      excerpt: preview,
      excerptTruncated: preview.length < chunk.content.length,
    };
  });
}
