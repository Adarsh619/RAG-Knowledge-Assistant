import "server-only";
import type { DocumentContext } from "../storage/document-handler.ts";
import type { ExtractionResponse } from "../../types/extraction.ts";
import type { EmbeddingResponse } from "../../types/embedding.ts";
import { handleExtractDocument } from "../pdf/extraction-handler.ts";
import { EmbeddingError, localChunkEmbedder } from "./embed-chunks.ts";

export async function handleEmbedDocument(
  request: Request,
  context: DocumentContext | null,
  embedChunks = localChunkEmbedder.embedChunks,
) {
  // Reuse the complete existing authenticated/validated download flow. Text and
  // chunks come from the owner's stored PDF, never from the browser request.
  const extractionResponse = await handleExtractDocument(request, context);
  if (!extractionResponse.ok) return extractionResponse;
  try {
    const { document, chunking } =
      (await extractionResponse.json()) as ExtractionResponse;
    const embeddings = await embedChunks(chunking.chunks);
    return Response.json({ document, embeddings } satisfies EmbeddingResponse, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (cause) {
    return Response.json(
      {
        error:
          cause instanceof EmbeddingError
            ? cause.message
            : "Local embeddings could not be generated. Try again.",
      },
      {
        status: cause instanceof EmbeddingError ? cause.status : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
