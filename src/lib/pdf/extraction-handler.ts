import "server-only";
import type { ExtractionResponse } from "../../types/extraction.ts";
import type { DocumentContext } from "../storage/document-handler.ts";
import {
  InputError,
  isSameOrigin,
  readLimitedBody,
} from "../storage/document-handler.ts";
import {
  DOCUMENT_BUCKET,
  MAX_PDF_BYTES,
  documentDisplayName,
  hasPdfHeader,
  isDocumentId,
} from "../storage/documents.ts";
import { extractPdfText, PdfExtractionError } from "./extract-text.ts";
import { chunkDocument } from "../rag/chunk-document.ts";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function handleExtractDocument(
  request: Request,
  context: DocumentContext | null,
) {
  if (!context) return json({ error: "Sign in to manage documents." }, 401);
  if (!isSameOrigin(request))
    return json({ error: "Request extraction from this application." }, 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    return json({ error: "Send the document ID as JSON." }, 415);
  }
  try {
    const bodyBytes = await readLimitedBody(request, 1024);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
      return json({ error: "Send a valid document ID." }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("id" in body) ||
      !isDocumentId(body.id) ||
      Object.keys(body).length !== 1
    ) {
      return json(
        { error: "Send a valid document ID, without a folder or user ID." },
        400,
      );
    }
    // Only the verified session supplies the owner folder. Storage also enforces RLS.
    const { data: file, error } = await context.storage
      .from(DOCUMENT_BUCKET)
      .download(`${context.userId}/${body.id}`, {}, { cache: "no-store" });
    if (error || !file) {
      const statusCode =
        error && "statusCode" in error ? String(error.statusCode) : "";
      if (
        statusCode === "400" ||
        statusCode === "404" ||
        statusCode === "403"
      ) {
        return json(
          {
            error:
              "The PDF was not found in your library or is unavailable to this account.",
          },
          404,
        );
      }
      return json(
        { error: "Document storage could not be reached. Try again." },
        503,
      );
    }
    if (!file.size || file.size > MAX_PDF_BYTES) {
      return json(
        { error: "Choose a nonempty PDF no larger than 4 MiB." },
        413,
      );
    }
    if (!(await hasPdfHeader(file))) {
      return json(
        { error: "The stored file does not have a PDF header." },
        422,
      );
    }
    const extraction = await extractPdfText(
      new Uint8Array(await file.arrayBuffer()),
    );
    return json({
      document: { id: body.id, name: documentDisplayName(body.id) },
      extraction,
      chunking: chunkDocument(body.id, extraction.pages),
    } satisfies ExtractionResponse);
  } catch (cause) {
    if (cause instanceof InputError || cause instanceof PdfExtractionError) {
      return json({ error: cause.message }, cause.status);
    }
    return json(
      { error: "Text extraction could not be completed. Try again." },
      503,
    );
  }
}
