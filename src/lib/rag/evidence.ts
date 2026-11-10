import "server-only";
import type { RagSource } from "../../types/rag.ts";
import { formatSourcePages } from "./source-presentation.ts";

export const EVIDENCE_INTRO =
  "No AI-written answer is available right now, so here are the most relevant passages from your documents.";

/** Answer text made only of stored excerpts: nothing is generated or paraphrased. */
export function buildEvidenceAnswer(sources: readonly RagSource[]) {
  return [EVIDENCE_INTRO, ...sources.map(source =>
    `[${source.rank}] ${source.originalFilename}, ${formatSourcePages(source.pageNumbers)}:\n` +
    `“${source.excerpt}${source.excerptTruncated ? "…" : ""}”`,
  )].join("\n\n");
}
