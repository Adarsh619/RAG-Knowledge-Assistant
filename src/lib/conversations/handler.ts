import "server-only";
import type { ChatResponse } from "../../types/chat.ts";
import type { SearchContext } from "../retrieval/search-handler.ts";
import { handleChatRequest, validateChatInput } from "../ai/chat-handler.ts";
import { LocalLlmError } from "../ai/local-config.ts";
import { ConversationError, type ConversationRepository } from "./repository.ts";
import { InputError, isSameOrigin, readLimitedBody } from "../storage/document-handler.ts";

export interface ConversationContext extends SearchContext { conversations: ConversationRepository }
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function error(cause: unknown) {
  if (cause instanceof InputError || cause instanceof ConversationError || cause instanceof LocalLlmError)
    return json({ error: cause.message }, cause.status);
  return json({ error: "Conversation request failed. Refresh to check saved messages before retrying." }, 503);
}
export function requireUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new InputError(`Select a valid ${label}.`, 400);
  return value;
}
function offset(request: Request) {
  const value = new URL(request.url).searchParams.get("offset") ?? "0";
  if (!/^\d{1,6}$/.test(value)) throw new InputError("Invalid history offset.", 400);
  return Number(value);
}
async function body(request: Request, keys: string[]) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    throw new InputError("Send JSON for this request.", 415);
  const bytes = await readLimitedBody(request, 24576);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new InputError("Send valid JSON.", 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
    Object.keys(parsed).some(key => !keys.includes(key))) throw new InputError("Unsupported conversation request fields.", 400);
  return parsed as Record<string, unknown>;
}
function gate(request: Request, context: ConversationContext | null) {
  if (!context) throw new InputError("Sign in to use conversation history.", 401);
  if (!isSameOrigin(request)) throw new InputError("Cross-site conversation requests are not allowed.", 403);
}

export async function handleConversations(request: Request, context: ConversationContext | null) {
  try {
    gate(request, context);
    if (request.method === "GET") return json(await context!.conversations.list(offset(request)));
    const input = await body(request, ["documentId"]);
    const documentId = input.documentId == null ? null : requireUuid(input.documentId, "document");
    return json({ conversation: await context!.conversations.create(documentId) }, 201);
  } catch (cause) { return error(cause); }
}

export async function handleConversation(request: Request, context: ConversationContext | null, id: string) {
  try {
    gate(request, context); requireUuid(id, "conversation");
    if (request.method === "GET") return json(await context!.conversations.get(id, offset(request)));
    await context!.conversations.remove(id);
    return json({ deleted: true });
  } catch (cause) { return error(cause); }
}

export async function handleConversationTurn(
  request: Request, context: ConversationContext | null, id: string, generate = handleChatRequest,
) {
  let pending: { requestId: string; attemptId: string } | null = null;
  try {
    gate(request, context); requireUuid(id, "conversation");
    const input = await body(request, ["message", "documentId", "requestId"]);
    const requestId = requireUuid(input.requestId, "request ID");
    const validated = validateChatInput({ message: input.message, documentId: input.documentId });
    request.signal.throwIfAborted();
    const started = await context!.conversations.begin(id, requestId, validated.message, validated.search?.documentId ?? null);
    if (started.assistantMessage) return json({ conversation: started.conversation,
      userMessage: started.userMessage, assistantMessage: started.assistantMessage });
    pending = { requestId, attemptId: started.attemptId };
    // Reuse the existing authenticated RAG/mock handler. No history, citations or owner can be supplied by the browser.
    const generationRequest = new Request(request.url, { method: "POST",
      headers: { "Content-Type": "application/json", origin: new URL(request.url).origin },
      body: JSON.stringify({ message: validated.message, documentId: validated.search?.documentId ?? null }),
      signal: request.signal,
    });
    const generated = await generate(generationRequest, context!);
    if (!generated.ok) {
      await context!.conversations.fail(id, requestId, pending.attemptId);
      return generated;
    }
    request.signal.throwIfAborted();
    const reply = await generated.json() as ChatResponse;
    return json(await context!.conversations.complete(id, requestId, pending.attemptId, reply));
  } catch (cause) {
    if (pending && context) {
      try { await context.conversations.fail(id, pending.requestId, pending.attemptId); }
      catch { /* A transport outage leaves an honestly pending row; lease expiry permits retry. */ }
    }
    return error(cause);
  }
}
