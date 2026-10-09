export interface RagSummary {
  status: "generated" | "insufficient_context";
  model: string | null;
  retrievedChunkCount: number;
  contextChunkCount: number;
  contextBytes: number;
}
