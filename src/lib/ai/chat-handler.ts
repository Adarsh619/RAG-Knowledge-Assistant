import "server-only";
import { getLlmMode, getLlmProvider } from "./provider.ts";
import { OPENAI_DISABLED_MESSAGE } from "./providers/openai.ts";
import { LocalLlmError } from "./local-config.ts";
import { MAX_MESSAGE_LENGTH } from "../../types/chat.ts";
import type { ChatErrorResponse, ChatResponse } from "../../types/chat.ts";
import type { SearchContext } from "../retrieval/search-handler.ts";
import { InputError, isSameOrigin, readLimitedBody } from "../storage/document-handler.ts";
import { EmbeddingError } from "../embeddings/embed-chunks.ts";
import { RetrievalError } from "../retrieval/repository.ts";
import { parseSearchInput } from "../retrieval/input.ts";
import { RAG_LIMITS } from "../rag/config.ts";
import { answerFromDocuments } from "../rag/answer.ts";

function errorResponse(error: string, status: number) {
  return Response.json({ error } satisfies ChatErrorResponse, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

export async function handleChatRequest(
  request: Request,
  context: SearchContext | null,
  runRag = answerFromDocuments,
) {
  if (!context) return errorResponse("Sign in to use chat.", 401);
  if (!isSameOrigin(request)) return errorResponse("Cross-site chat is not allowed.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return errorResponse("Send the message as JSON.", 415);
  try {
    const bytes = await readLimitedBody(request, 24576);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new InputError("Send a valid JSON body containing a message.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new InputError("A message must be provided as text.", 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["message", "documentId"].includes(key)))
      throw new InputError("Unsupported chat field.", 400);
    if (typeof input.message !== "string" || !input.message.trim())
      throw new InputError("Enter a message before sending.", 400);
    const message = input.message.trim();
    if (message.length > MAX_MESSAGE_LENGTH)
      throw new InputError(`Keep messages to ${MAX_MESSAGE_LENGTH} characters or fewer.`, 400);

    const mode = getLlmMode();
    if (!mode) return errorResponse("Unsupported LLM_MODE. Set LLM_MODE=mock and restart the server.", 503);
    const provider = getLlmProvider();
    if (!provider.enabled) return errorResponse(OPENAI_DISABLED_MESSAGE, 503);

    if (mode === "local") {
      const search = parseSearchInput({
        question: message,
        documentId: input.documentId,
        topK: RAG_LIMITS.topK,
        minSimilarity: RAG_LIMITS.minSimilarity,
      });
      const result = await runRag(search, context, { provider, signal: request.signal });
      return Response.json({
        mode, message: { role: "assistant", content: result.content }, rag: result.rag,
      } satisfies ChatResponse, { headers: { "Cache-Control": "private, no-store" } });
    }
    // Mock mode deliberately performs no retrieval, embedding or inference.
    if (input.documentId !== undefined && input.documentId !== null)
      throw new InputError("Document scope is available only in local RAG mode.", 400);
    const content = await provider.reply(message);
    return Response.json({
      mode: provider.mode, message: { role: "assistant", content },
    } satisfies ChatResponse, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (cause instanceof InputError)
      return errorResponse(cause.status === 413 ? "The chat request is too large." : cause.message, cause.status);
    if (cause instanceof LocalLlmError || cause instanceof EmbeddingError)
      return errorResponse(cause.message, cause.status);
    if (cause instanceof RetrievalError) return errorResponse(cause.message, 503);
    if (request.signal.aborted) return errorResponse("The local chat request was cancelled.", 504);
    return errorResponse("The local response could not be created. Please try again.", 500);
  }
}
