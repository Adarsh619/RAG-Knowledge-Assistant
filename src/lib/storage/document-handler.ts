import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DocumentListResponse,
  DocumentMutationResponse,
} from "../../types/document.ts";
import {
  DOCUMENT_BUCKET,
  DOCUMENT_PAGE_SIZE,
  MAX_PDF_BYTES,
  PDF_MIME_TYPE,
  createDocumentId,
  documentDisplayName,
  hasPdfHeader,
  isDocumentId,
  validatePdfSelection,
} from "./documents.ts";

export interface DocumentContext {
  userId: string;
  storage: SupabaseClient["storage"];
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function error(message: string, status: number) {
  return json({ error: message }, status);
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    request.headers.get("sec-fetch-site") !== "cross-site" &&
    (!origin || origin === new URL(request.url).origin)
  );
}

class InputError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Bound the actual body, including requests without a Content-Length header.
async function readLimitedBody(request: Request, limit: number) {
  const declaredSize = Number(request.headers.get("content-length"));
  if (declaredSize > limit)
    throw new InputError("The upload request is too large.", 413);
  if (!request.body) throw new InputError("A request body is required.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new InputError("The upload request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleListDocuments(
  request: Request,
  context: DocumentContext | null,
) {
  if (!context) return error("Sign in to manage documents.", 401);
  const offsetValue = new URL(request.url).searchParams.get("offset") ?? "0";
  if (!/^\d{1,6}$/.test(offsetValue))
    return error("Invalid document list offset.", 400);
  const offset = Number(offsetValue);
  try {
    const { data, error: listError } = await context.storage
      .from(DOCUMENT_BUCKET)
      .list(context.userId, {
        limit: DOCUMENT_PAGE_SIZE + 1,
        offset,
        sortBy: { column: "created_at", order: "desc" },
      });
    if (listError || !data)
      return error(
        "The document list could not be loaded. Check Storage setup and retry.",
        503,
      );
    const documents = data
      .slice(0, DOCUMENT_PAGE_SIZE)
      .filter((file) => file.id && isDocumentId(file.name))
      .map((file) => ({
        id: file.name,
        name: documentDisplayName(file.name),
        size:
          typeof file.metadata?.size === "number" ? file.metadata.size : null,
        uploadedAt: file.created_at,
      }));
    return json({
      documents,
      nextOffset:
        data.length > DOCUMENT_PAGE_SIZE ? offset + DOCUMENT_PAGE_SIZE : null,
    } satisfies DocumentListResponse);
  } catch {
    return error("Document storage could not be reached. Try again.", 503);
  }
}

export async function handleUploadDocument(
  request: Request,
  context: DocumentContext | null,
) {
  if (!context) return error("Sign in to manage documents.", 401);
  if (!isSameOrigin(request))
    return error("Submit document changes from this application.", 403);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return error("Send a PDF using multipart form data.", 415);
  }
  try {
    // A small allowance covers the multipart boundary and file headers.
    const body = await readLimitedBody(request, MAX_PDF_BYTES + 64 * 1024);
    let form: FormData;
    try {
      form = await new Response(body, {
        headers: { "Content-Type": contentType },
      }).formData();
    } catch {
      return error("The upload form is invalid.", 400);
    }
    if (
      [...form.keys()].some((key) => key !== "file") ||
      form.getAll("file").length !== 1
    ) {
      return error("Upload exactly one PDF using the file field.", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) return error("Choose a PDF to upload.", 400);
    const validationError = validatePdfSelection(file);
    if (validationError)
      return error(validationError, file.size > MAX_PDF_BYTES ? 413 : 400);
    if (!(await hasPdfHeader(file)))
      return error(
        "The file does not have a PDF header. Choose a PDF file.",
        400,
      );

    const id = createDocumentId(file.name);
    const { error: uploadError } = await context.storage
      .from(DOCUMENT_BUCKET)
      .upload(`${context.userId}/${id}`, file, {
        contentType: PDF_MIME_TYPE,
        cacheControl: "0",
        upsert: false,
      });
    if (uploadError)
      return error(
        "The PDF could not be uploaded. Check Storage setup and retry.",
        503,
      );
    return json(
      {
        message: `${documentDisplayName(id)} was uploaded to your private library.`,
      } satisfies DocumentMutationResponse,
      201,
    );
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status);
    return error("Document storage could not be reached. Try again.", 503);
  }
}

export async function handleDeleteDocument(
  request: Request,
  context: DocumentContext | null,
) {
  if (!context) return error("Sign in to manage documents.", 401);
  if (!isSameOrigin(request))
    return error("Submit document changes from this application.", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    return error("Send the document ID as JSON.", 415);
  }
  try {
    const bytes = await readLimitedBody(request, 1024);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return error("Send a valid document ID.", 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("id" in body) ||
      !isDocumentId(body.id) ||
      Object.keys(body).length !== 1
    ) {
      return error(
        "Send a valid document ID, without a folder or user ID.",
        400,
      );
    }
    // Never accept an arbitrary path or owner supplied by the browser.
    const { data, error: deleteError } = await context.storage
      .from(DOCUMENT_BUCKET)
      .remove([`${context.userId}/${body.id}`]);
    if (deleteError)
      return error("The document could not be deleted. Try again.", 503);
    if (!data?.length)
      return error("The document was not found in your library.", 404);
    return json({
      message: "The document was deleted from your private library.",
    } satisfies DocumentMutationResponse);
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status);
    return error("Document storage could not be reached. Try again.", 503);
  }
}
