import "server-only";
import type { ChatResponse, TurnStreamEvent } from "../../types/chat.ts";
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
    const input = await body(request, ["message", "documentId", "requestId", "chatMode"]);
    const requestId = requireUuid(input.requestId, "request ID");
    const validated = validateChatInput({ message: input.message, documentId: input.documentId, chatMode: input.chatMode });
    request.signal.throwIfAborted();
    const started = await context!.conversations.begin(id, requestId, validated.message, validated.search?.documentId ?? null);
    if (started.assistantMessage) {
      if ((started.assistantMessage.rag?.chatMode ?? "documents") !== validated.chatMode)
        throw new InputError("This saved request used another chat mode. Send a new question instead of replaying it.", 409);
      return json({ conversation: started.conversation, userMessage: started.userMessage, assistantMessage: started.assistantMessage });
    }
    pending = { requestId, attemptId: started.attemptId };
    const attemptId = started.attemptId;
    // Reuse the existing authenticated RAG/mock handler. No history, citations or owner can be supplied by the browser.
    const generationRequest = new Request(request.url, { method: "POST",
      headers: { "Content-Type": "application/json", origin: new URL(request.url).origin },
      body: JSON.stringify({ message: validated.message, documentId: validated.search?.documentId ?? null, chatMode: validated.chatMode }),
      signal: request.signal,
    });
    // Saving is identical with or without streaming: the answer and evidence are persisted once, after generation.
    const finish = async (onText?: (text: string) => void) => {
      try {
        const generated = await generate(generationRequest, context!, undefined, undefined, onText);
        if (!generated.ok) {
          await context!.conversations.fail(id, requestId, attemptId);
          return generated;
        }
        request.signal.throwIfAborted();
        const reply = await generated.json() as ChatResponse;
        return json(await context!.conversations.complete(id, requestId, attemptId, reply));
      } catch (cause) {
        await failPending(context, id, pending);
        return error(cause);
      }
    };
    return wantsStream(request) ? streamTurn(finish) : await finish();
  } catch (cause) {
    await failPending(context, id, pending);
    return error(cause);
  }
}

async function failPending(context: ConversationContext | null, id: string,
  pending: { requestId: string; attemptId: string } | null) {
  if (!pending || !context) return;
  try { await context.conversations.fail(id, pending.requestId, pending.attemptId); }
  catch { /* A transport outage leaves an honestly pending row; lease expiry permits retry. */ }
}

function wantsStream(request: Request) {
  return request.headers.get("accept")?.split(",").some(type => type.split(";")[0].trim() === "application/x-ndjson") ?? false;
}

// Streams text as it is generated, then one final event carrying the same body the JSON response would.
// Errors before generation starts still return ordinary JSON with their HTTP status.
function streamTurn(finish: (onText: (text: string) => void) => Promise<Response>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: TurnStreamEvent<unknown>) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch { open = false; } // The browser disconnected; generation is cancelled through the request signal.
      };
      try {
        const response = await finish(text => { if (text) send({ type: "delta", text }); });
        const data: unknown = await response.json();
        send(response.ok ? { type: "done", data } : { type: "error", status: response.status,
          error: data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error : "The reply could not be completed." });
      } catch {
        send({ type: "error", status: 500, error: "The reply could not be completed. Refresh to check saved messages before retrying." });
      } finally {
        if (open) try { controller.close(); } catch { /* Already closed by the browser. */ }
      }
    },
  });
  return new Response(body, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Accel-Buffering": "no", // Ask reverse proxies not to hold back partial answers.
  } });
}
