import "server-only";
import type {
  DocumentListResponse,
  StoredDocument,
} from "../../types/document.ts";
import type { ExtractionResponse } from "../../types/extraction.ts";
import type { IngestionResponse } from "../../types/ingestion.ts";
import type { EmbeddingResult } from "../../types/embedding.ts";
import { handleExtractDocument } from "../pdf/extraction-handler.ts";
import {
  localChunkEmbedder,
  EmbeddingError,
} from "../embeddings/embed-chunks.ts";
import { EMBEDDING_MODEL } from "../embeddings/config.ts";
import {
  handleListDocuments,
  InputError,
  isSameOrigin,
  readLimitedBody,
} from "../storage/document-handler.ts";
import type { DocumentContext } from "../storage/document-handler.ts";
import {
  DOCUMENT_BUCKET,
  DOCUMENT_PAGE_SIZE,
  isDocumentId,
} from "../storage/documents.ts";
import { MAX_STORED_CHUNKS, PersistenceError } from "./repository.ts";
import type { KnowledgeRepository } from "./repository.ts";

export interface KnowledgeContext extends DocumentContext {
  repository: KnowledgeRepository;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(cause: unknown) {
  if (
    cause instanceof InputError ||
    cause instanceof PersistenceError ||
    cause instanceof EmbeddingError
  )
    return json({ error: cause.message }, cause.status);
  return json(
    { error: "The document request could not be completed. Try again." },
    503,
  );
}
async function readInput(request: Request, allowReingest = false) {
  if (!isSameOrigin(request))
    throw new InputError("Submit document changes from this application.", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new InputError("Send the document ID as JSON.", 415);
  let body;
  try {
    body = JSON.parse(
      new TextDecoder().decode(await readLimitedBody(request, 1024)),
    );
  } catch (cause) {
    if (cause instanceof InputError) throw cause;
    throw new InputError("Send a valid document ID.", 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !isDocumentId(body.id) ||
    Object.keys(body).some(
      (key) => key !== "id" && !(allowReingest && key === "reingest"),
    ) ||
    ("reingest" in body && typeof body.reingest !== "boolean")
  )
    throw new InputError(
      "Send a valid document ID, without a folder or user ID.",
      400,
    );
  return { id: body.id as string, reingest: body.reingest === true };
}

// Reuse the existing trusted download/parser/chunker; never accept client chunks/vectors.
export async function handleIngestDocument(
  request: Request,
  context: KnowledgeContext | null,
  embed: (
    chunks: ExtractionResponse["chunking"]["chunks"],
  ) => Promise<EmbeddingResult> = localChunkEmbedder.embedChunks,
) {
  if (!context) return json({ error: "Sign in to manage documents." }, 401);
  try {
    const input = await readInput(request, true);
    const previous = await context.repository.get(input.id);
    if (previous?.status === "deleting")
      throw new PersistenceError(
        "Deletion is pending. Complete deletion before ingesting.",
        409,
      );
    if (previous && !input.reingest)
      throw new PersistenceError(
        "Already ingested. Use Re-ingest to replace the existing chunks.",
        409,
      );
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const parsed = await handleExtractDocument(
      new Request(request.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: input.id }),
      }),
      context,
    );
    if (!parsed.ok) return parsed;
    const source = (await parsed.json()) as ExtractionResponse;
    if (!source.chunking.chunks.length)
      return json(
        {
          error:
            "This PDF has no extractable text. Nothing was persisted; OCR is not included.",
        },
        422,
      );
    if (source.chunking.chunks.length > MAX_STORED_CHUNKS)
      return json(
        { error: "This document exceeds the 500-chunk development limit." },
        422,
      );
    const embeddings = await embed(source.chunking.chunks);
    if (
      embeddings.dimension !== EMBEDDING_MODEL.dimension ||
      embeddings.model !== EMBEDDING_MODEL.id ||
      embeddings.revision !== EMBEDDING_MODEL.revision ||
      embeddings.chunks.length !== source.chunking.chunks.length
    )
      throw new PersistenceError(
        "The local embedding result does not match the configured model.",
      );
    const document = await context.repository.persist(
      source,
      embeddings,
      input.reingest,
    );
    return json({
      document,
      message: `${document.originalFilename} is ready: ${document.chunkCount} chunks persisted with local ${document.embeddingDimension}-dimensional embeddings.`,
    } satisfies IngestionResponse);
  } catch (cause) {
    return failure(cause);
  }
}

export async function handlePersistentList(
  request: Request,
  context: KnowledgeContext | null,
) {
  const response = await handleListDocuments(request, context);
  if (!response.ok || !context) return response;
  try {
    const body = (await response.json()) as DocumentListResponse;
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    const [records, pending] = await Promise.all([
      context.repository.list(body.documents.map((doc) => doc.id)),
      context.repository.pending(offset),
    ]);
    const byName = new Map(
      [...records, ...pending].map((row) => [row.storageName, row]),
    );
    const documents: StoredDocument[] = body.documents.map((doc) => ({
      ...doc,
      name: byName.get(doc.id)?.originalFilename ?? doc.name,
      ingestion: byName.get(doc.id) ?? null,
    }));
    // A removed PDF with unfinished DB cleanup remains visible for explicit retry.
    for (const row of pending.slice(0, DOCUMENT_PAGE_SIZE)) {
      if (documents.some((doc) => doc.id === row.storageName)) continue;
      const { data, error } = await context.storage
        .from(DOCUMENT_BUCKET)
        .info(`${context.userId}/${row.storageName}`);
      if (
        error &&
        !["400", "403", "404"].includes(
          String("statusCode" in error ? error.statusCode : ""),
        )
      )
        throw new PersistenceError(
          "Pending deletions could not be checked. Retry loading.",
        );
      documents.push({
        id: row.storageName,
        name: row.originalFilename,
        size: row.fileSize,
        uploadedAt: row.createdAt,
        ingestion: row,
        storageMissing: !data,
      });
    }
    return json({
      documents,
      nextOffset:
        body.nextOffset ??
        (pending.length > DOCUMENT_PAGE_SIZE
          ? offset + DOCUMENT_PAGE_SIZE
          : null),
    } satisfies DocumentListResponse);
  } catch (cause) {
    return failure(cause);
  }
}

export async function handlePersistentDeletion(
  request: Request,
  context: KnowledgeContext | null,
) {
  if (!context) return json({ error: "Sign in to manage documents." }, 401);
  try {
    const { id } = await readInput(request);
    if (!(await context.repository.beginDeletion(id)))
      return json(
        { error: "The document was not found in your library." },
        404,
      );
    const { error } = await context.storage
      .from(DOCUMENT_BUCKET)
      .remove([`${context.userId}/${id}`]);
    if (error)
      throw new PersistenceError(
        "Deletion is pending. The PDF could not be removed; retry deletion.",
      );
    try {
      await context.repository.finishDeletion(id);
    } catch {
      throw new PersistenceError(
        "The PDF was removed, but database cleanup is pending. Retry deletion to finish.",
      );
    }
    return json({
      message:
        "The PDF, document metadata, chunks and embeddings were deleted from your private library.",
    });
  } catch (cause) {
    return failure(cause);
  }
}
