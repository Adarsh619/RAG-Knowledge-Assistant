"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { ChatSources } from "./chat-sources";
import { ConversationHistory } from "./conversation-history";
import { useRouter } from "next/navigation";
import { REPLY_LEASE_MS } from "@/types/conversation";
import type { Conversation, SavedMessage, ConversationListResponse, ConversationDetailResponse, ConversationTurnResponse } from "@/types/conversation";
import { MAX_MESSAGE_LENGTH } from "@/types/chat";
import { RAG_LIMITS } from "@/lib/rag/config";
import type { StoredDocument, DocumentListResponse } from "@/types/document";
import type {
  LlmMode,
} from "@/types/chat";

export function ChatWorkspace({
  configuredMode,
  providerEnabled,
}: {
  configuredMode: LlmMode | null;
  providerEnabled: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [historyNext, setHistoryNext] = useState<number | null>(null);
  const [messageNext, setMessageNext] = useState<number | null>(null);
  const [historyBusy, setHistoryBusy] = useState(true);
  const [clock, setClock] = useState(0);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const historyOperation = useRef(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const isMock = configuredMode === "mock";
  const isLocal = configuredMode === "local";
  const messageLimit = isLocal ? RAG_LIMITS.maxQuestionCharacters : MAX_MESSAGE_LENGTH;
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const chatRequest = useRef<AbortController | null>(null);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Conversation request failed.");
    return data as T;
  }
  function select(data: ConversationDetailResponse) {
    setActive(data.conversation); setMessages(data.messages); setMessageNext(data.nextOffset);
    setDocumentId(data.conversation.documentId ?? ""); setDraft("");
    router.replace(`/chat?conversation=${data.conversation.id}`, { scroll: false });
  }
  async function refreshHistory(offset = 0) {
    const data = await api<ConversationListResponse>(`/api/conversations?offset=${offset}`);
    setConversations(current => offset === 0 ? data.conversations :
      [...new Map([...current, ...data.conversations].map(item => [item.id, item])).values()]);
    setHistoryNext(data.nextOffset);
    return data;
  }
  async function historyAction(action: () => Promise<void>) {
    if (sending.current || historyOperation.current) return;
    historyOperation.current = true; setHistoryBusy(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load saved history."); }
    finally { historyOperation.current = false; setHistoryBusy(false); }
  }
  async function newConversation() {
    const data = await api<{ conversation: Conversation }>("/api/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    select({ conversation: data.conversation, messages: [], nextOffset: null });
    await refreshHistory();
    return data.conversation;
  }
  async function deleteConversation(id: string) {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    if (active?.id === id) {
      setActive(null); setMessages([]); setMessageNext(null); setDraft(""); setDocumentId("");
      router.replace("/chat", { scroll: false });
    }
    await refreshHistory();
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const list = await api<ConversationListResponse>("/api/conversations", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setConversations(list.conversations); setHistoryNext(list.nextOffset);
        const id = new URL(window.location.href).searchParams.get("conversation");
        if (id) {
          const detail = await api<ConversationDetailResponse>(`/api/conversations/${encodeURIComponent(id)}`, { signal: controller.signal });
          if (!controller.signal.aborted) {
            setActive(detail.conversation); setMessages(detail.messages); setMessageNext(detail.nextOffset);
            setDocumentId(detail.conversation.documentId ?? "");
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "History could not be loaded.");
      } finally { if (!controller.signal.aborted) setHistoryBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    setClock(Date.now());
    return () => clearInterval(timer);
  }, []);
  const activePending = messages.some(message => message.status === "pending" && clock - Date.parse(message.startedAt) < REPLY_LEASE_MS);

  useEffect(() => () => { chatRequest.current?.abort(); }, []);
  useEffect(() => {
    if (!isLocal) return; // Mock mode needs neither document listing nor inference.
    const controller = new AbortController();
    async function load() {
      setLoadingDocuments(true);
      setDocumentError(null);
      try {
        const response = await fetch(`/api/documents?offset=${listOffset}`, {
          cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Document choices could not be loaded.");
        if (controller.signal.aborted) return;
        const data = body as DocumentListResponse;
        setDocuments((current) => listOffset === 0 ? data.documents : [...current, ...data.documents]);
        setNextOffset(data.nextOffset);
      } catch (cause) {
        if (!controller.signal.aborted)
          setDocumentError(cause instanceof Error ? cause.message : "Document choices could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoadingDocuments(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [isLocal, listOffset]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending.current || historyBusy || historyOperation.current || activePending) return;
    if (message.length > messageLimit) {
      setError(`Keep messages to ${messageLimit} characters or fewer.`);
      return;
    }

    await submitTurn(message, crypto.randomUUID(), isLocal ? documentId || null : null);
  }

  async function submitTurn(message: string, requestId: string, scope: string | null) {
    if (sending.current || historyOperation.current) return;
    sending.current = true; setLoading(true); setError(null);
    setPendingText(message); setDraft("");
    let conversationId = active?.id;

    try {
      if (!conversationId) conversationId = (await newConversation()).id;
      const controller = new AbortController();
      chatRequest.current = controller;
      const data = await api<ConversationTurnResponse>(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message, documentId: scope, requestId,
        }),
        signal: AbortSignal.any([
          controller.signal, AbortSignal.timeout(isLocal ? 150000 : 15000),
        ]),
      });
      setActive(data.conversation); setDocumentId(data.conversation.documentId ?? "");
      setMessages(current => [...current.filter(item => item.requestId !== requestId), data.userMessage, data.assistantMessage]
        .sort((a, b) => a.turnIndex - b.turnIndex || (a.role === "user" ? -1 : 1)));
      await refreshHistory();
    } catch (caught) {
      // Reconcile with the database before offering a retry. A lost response may already have committed.
      if (conversationId) {
        try {
          const detail = await api<ConversationDetailResponse>(`/api/conversations/${conversationId}`);
          select(detail);
          if (!detail.messages.some(item => item.requestId === requestId)) setDraft(message);
          await refreshHistory();
        } catch { /* Keep the error visible; Refresh history is the safe recovery path. */ }
      } else setDraft(message);
      setError(
        caught instanceof Error &&
          !(caught instanceof SyntaxError) &&
          caught.name !== "TypeError" &&
          caught.name !== "TimeoutError"
          ? caught.message
          : "Could not reach the chat API. Refresh history to check saved messages before retrying.",
      );
    } finally {
      sending.current = false;
      setLoading(false);
      setPendingText(null);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section aria-label="Chat workspace" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="chat" className="text-emerald-700" /> {active?.title ?? "Persistent local chat"}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs ${isMock ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        >
          {!providerEnabled
            ? "Provider disabled · no external LLM calls"
            : isMock
              ? "Mock mode · no external LLM calls"
              : "Local RAG · Ollama · no hosted AI calls"}
        </span>
      </div>

      <ConversationHistory conversations={conversations} selectedId={active?.id ?? null}
        busy={loading || historyBusy} nextOffset={historyNext}
        onNew={() => void historyAction(async () => { await newConversation(); })}
        onOpen={id => void historyAction(async () => { select(await api<ConversationDetailResponse>(`/api/conversations/${id}`)); })}
        onDelete={id => void historyAction(() => deleteConversation(id))}
        onMore={() => void historyAction(async () => { await refreshHistory(historyNext ?? 0); })} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4 text-xs text-slate-500">
        <span>{historyBusy ? "Loading saved history…" : "Questions, answers and original evidence are saved to your account."}</span>
        <button type="button" disabled={loading || historyBusy} className="font-semibold text-emerald-800"
          onClick={() => void historyAction(async () => {
            await refreshHistory();
            if (active) select(await api<ConversationDetailResponse>(`/api/conversations/${active.id}`));
          })}>Refresh history</button>
      </div>
      {messageNext !== null && <button type="button" disabled={loading || historyBusy}
        className="mx-6 mt-4 text-xs font-semibold text-emerald-800" onClick={() => void historyAction(async () => {
          if (!active) return;
          const detail = await api<ConversationDetailResponse>(`/api/conversations/${active.id}?offset=${messageNext}`);
          setMessages(current => [...new Map([...detail.messages, ...current].map(item => [item.id, item])).values()]
            .sort((a, b) => a.turnIndex - b.turnIndex || (a.role === "user" ? -1 : 1)));
          setMessageNext(detail.nextOffset);
        })}>Load earlier messages</button>}

      {!providerEnabled && (
        <p
          role="alert"
          className="border-b border-amber-100 bg-amber-50 px-6 py-4 text-sm text-amber-900"
        >
          {configuredMode === "openai"
            ? "OpenAI remains disabled."
            : "The configured LLM_MODE is unsupported."}{" "}
          Set LLM_MODE=mock and restart the server.
        </p>
      )}

      {messages.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-5 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <Icon name="spark" width="30" height="30" />
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">
            Try your first local message.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
            {isLocal
              ? "Ask about your ingested documents. The server retrieves owned passages and asks your local Ollama model to answer from them."
              : "Send a message through the backend and receive a local development confirmation. These replies are generated by code, not an AI model."}
          </p>
          <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
            {(isLocal
              ? ["What does my document say about React hooks?", "Summarize the main topic of my document."]
              : ["Hello, backend!", "What happens when I send a message?"]).map(
              (text) => (
                <button
                  key={text}
                  type="button"
                  disabled={!providerEnabled}
                  onClick={() => setDraft(text)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-left text-xs text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  {text}
                </button>
              ),
            )}
          </div>
        </div>
      ) : (
        <div
          role="log"
          aria-label="Conversation messages"
          aria-live="polite"
          aria-relevant="additions"
          className="min-h-80 space-y-5 px-5 py-6 md:px-6"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[80%] ${message.role === "user" ? "bg-emerald-800 text-white" : "border border-slate-200 bg-slate-50 text-slate-700"}`}
              >
                <p
                  className={`mb-2 text-[11px] font-semibold ${message.role === "user" ? "text-emerald-100" : "text-emerald-800"}`}
                >
                  {message.role === "user"
                    ? "You"
                    : message.mode === "mock"
                      ? "Assistant · local mock"
                      : message.rag?.status === "insufficient_context"
                        ? "Documents · insufficient context · no generation"
                        : "Assistant · local Ollama"}
                </p>
                <p className="text-sm leading-6 whitespace-pre-wrap wrap-anywhere">
                  {message.content}
                </p>
                {message.role === "user" && message.status !== "completed" && <div className="mt-3 text-xs text-emerald-100">
                  <p>{message.status === "failed" ? "Saved question · reply failed." : "Saved question · reply pending. Refresh to check its status."}</p>
                  {(message.status === "failed" || clock - Date.parse(message.startedAt) >= REPLY_LEASE_MS) &&
                    <button type="button" disabled={loading || historyBusy || activePending}
                      onClick={() => void submitTurn(message.content, message.requestId, message.documentId)}
                      className="mt-2 rounded border border-emerald-200 px-3 py-1 font-semibold disabled:opacity-50">Retry reply</button>}
                </div>}
                {message.rag?.status === "generated" && (
                  <p className="mt-2 text-xs text-slate-500">
                    Local model: {message.rag.model} · {message.rag.contextChunkCount} passages used
                  </p>
                )}
                {message.role === "assistant" && message.rag?.status === "generated" && (
                  <ChatSources sources={message.sources ?? []} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        className="px-6 text-xs text-slate-500"
      >
        {pendingText && <p className="my-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 whitespace-pre-wrap">Sending: {pendingText}</p>}
        {activePending && !loading && <p className="pb-4">A saved reply is in progress. Refresh history; interrupted attempts can be retried after five minutes.</p>}
        {loading && <p className="pb-4">{isLocal
          ? "Retrieving your passages and generating locally… CPU/model loading can take a moment."
          : "Creating a local mock response…"}</p>}
      </div>
      <form
        onSubmit={sendMessage}
        className="border-t border-slate-100 bg-slate-50/50 p-5"
      >
        {isLocal && (
          <div className="mb-4">
            <label htmlFor="chat-document" className="mb-1 block text-xs font-medium text-slate-600">Document scope</label>
            <select id="chat-document" value={documentId} disabled={loading || historyBusy || loadingDocuments}
              onChange={(event) => setDocumentId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All my ready documents</option>
              {documentId && !documents.some(document => document.ingestion?.id === documentId && document.ingestion.status === "ready") &&
                <option value={documentId}>{loadingDocuments ? "Loading saved document scope…" : nextOffset !== null
                  ? "Saved scope not loaded — load more document choices"
                  : "Saved document scope unavailable — select another scope"}</option>}
              {documents.filter((document) => document.ingestion?.status === "ready").map((document) => (
                <option key={document.ingestion!.id} value={document.ingestion!.id}>{document.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Only ingested, ready documents are searched. Each question is independent; earlier chat messages are not sent to the model.</p>
            {documentError && <p role="alert" className="mt-1 text-xs text-red-700">{documentError} All-document search remains available.</p>}
            {nextOffset !== null && <button type="button" disabled={loading || loadingDocuments}
              onClick={() => setListOffset(nextOffset)} className="mt-2 text-xs font-semibold text-emerald-800">Load more document choices</button>}
          </div>
        )}
        <label htmlFor="question" className="sr-only">
          Your message
        </label>
        <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <textarea
            id="question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || historyBusy || activePending || !providerEnabled}
            maxLength={messageLimit}
            rows={2}
            placeholder={isLocal ? "Ask about your ingested documents…" : "Send a local test message…"}
            aria-describedby="chat-status chat-hint"
            className="min-w-0 flex-1 resize-none bg-transparent p-1 text-sm placeholder:text-slate-400 disabled:opacity-70"
          />
          <button
            type="submit"
            disabled={loading || historyBusy || activePending || !providerEnabled || !draft.trim()}
            aria-label="Send message"
            className="rounded-lg bg-emerald-800 p-3 text-white transition hover:bg-emerald-900 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Icon name="arrow" />
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <p id="chat-hint" className="mt-3 text-center text-xs text-slate-400">
          Enter to send · Shift+Enter for a new line ·{" "}
          {messageLimit.toLocaleString()} characters max
        </p>
        <p
          id="chat-status"
          className="mt-2 text-center text-xs leading-5 text-slate-500"
        >
          {isLocal ? "Phase 12 · Saved local RAG conversations with original evidence." : "Saved mock development chats. No documents are retrieved."}
          {" "}History is restored on reload. Earlier messages are not sent to the model.
        </p>
      </form>
    </section>
  );
}
