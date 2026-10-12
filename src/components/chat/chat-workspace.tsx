"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import Link from "next/link";
import { ShellSlot, AiBadge, useShell } from "@/components/shell-context";
import { parseDocumentScope, parseChatMode, CHAT_MODE_KEY } from "@/lib/ui/preferences";
import type { ChatMode } from "@/types/chat";
import { ChatSources } from "./chat-sources";
import { readApiResponse } from "@/lib/http/client-response";
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
  const { openContext, closeNavigation } = useShell();
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
  const isLocal = configuredMode === "local";
  const messageLimit = isLocal ? RAG_LIMITS.maxQuestionCharacters : MAX_MESSAGE_LENGTH;
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("documents");
  const modeDescriptions = { documents: "Answers only from your uploaded documents.", general: "Answers using your local AI model.", auto: "Uses your documents when relevant, otherwise local AI." };
  const [listOffset, setListOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const chatRequest = useRef<AbortController | null>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const focusAfterNew = useRef(false);
  const messageLog = useRef<HTMLDivElement>(null);
  const newestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    const log = messageLog.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [newestMessageId, loading]);
  useEffect(() => {
    if (focusAfterNew.current && !historyBusy && !loading) {
      focusAfterNew.current = false; composerInput.current?.focus();
    }
  }, [active?.id, historyBusy, loading]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...options });
    return readApiResponse<T>(response);
  }
  function select(data: ConversationDetailResponse) {
    setActive(data.conversation); setMessages(data.messages); setMessageNext(data.nextOffset);
    setDocumentId(data.conversation.documentId ?? ""); setDraft("");
    const lastAnswer = [...data.messages].reverse().find(message => message.role === "assistant");
    if (lastAnswer) setChatMode(parseChatMode(lastAnswer.rag?.chatMode));
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
  async function newConversation(scope: string | null = null) {
    const data = await api<{ conversation: Conversation }>("/api/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: scope }),
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
        let preference: ChatMode = "documents";
        try { preference = parseChatMode(localStorage.getItem(CHAT_MODE_KEY)); } catch {}
        const parameters = new URL(window.location.href).searchParams;
        const scopedDocument = parseDocumentScope(parameters.get("document"));
        setChatMode(scopedDocument ? "documents" : preference);
        const list = await api<ConversationListResponse>("/api/conversations", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setConversations(list.conversations); setHistoryNext(list.nextOffset);
        const id = new URL(window.location.href).searchParams.get("conversation");
        if (!id) setDocumentId(parseDocumentScope(new URL(window.location.href).searchParams.get("document")));
        if (id) {
          const detail = await api<ConversationDetailResponse>(`/api/conversations/${encodeURIComponent(id)}`, { signal: controller.signal });
          if (!controller.signal.aborted) {
            setActive(detail.conversation); setMessages(detail.messages); setMessageNext(detail.nextOffset);
            setDocumentId(detail.conversation.documentId ?? "");
            const lastAnswer = [...detail.messages].reverse().find(message => message.role === "assistant");
            if (lastAnswer) setChatMode(parseChatMode(lastAnswer.rag?.chatMode));
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
        const body = await readApiResponse<DocumentListResponse>(response);
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

  async function submitTurn(message: string, requestId: string, scope: string | null, requestedMode: ChatMode = chatMode) {
    if (sending.current || historyOperation.current) return;
    sending.current = true; setLoading(true); setError(null);
    setPendingText(message); setDraft("");
    // Remember the original mode for an interrupted turn in this browser. Cross-browser
    // retries without that preference safely default to Documents rather than silently falling back.
    try { localStorage.setItem(`groundwork.turn-mode.${requestId}`, requestedMode); } catch {}
    let conversationId = active?.id;

    try {
      if (!conversationId) conversationId = (await newConversation(scope)).id;
      const controller = new AbortController();
      chatRequest.current = controller;
      const data = await api<ConversationTurnResponse>(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message, documentId: scope, requestId, chatMode: isLocal ? requestedMode : "documents",
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

  function changeMode(value: string) {
    const mode = parseChatMode(value); setChatMode(mode);
    try { localStorage.setItem(CHAT_MODE_KEY, mode); } catch {}
  }
  function retryMode(requestId: string): ChatMode {
    try { return parseChatMode(localStorage.getItem(`groundwork.turn-mode.${requestId}`)); } catch { return "documents"; }
  }

  return (
    <section aria-label="Chat workspace" className="panel chat-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold wrap-anywhere">
          <Icon name="chat" className="shrink-0 text-emerald-700" /> {active?.title ?? "Your knowledge chat"}
        </span>
        <AiBadge />
      </div>

      <ShellSlot region="history"><ConversationHistory conversations={conversations} selectedId={active?.id ?? null}
        busy={loading || historyBusy} nextOffset={historyNext}
        onNew={() => { closeNavigation(); focusAfterNew.current = true; void historyAction(async () => { await newConversation(); }); }}
        onOpen={id => { closeNavigation(); void historyAction(async () => { select(await api<ConversationDetailResponse>(`/api/conversations/${id}`)); }); }}
        onDelete={id => void historyAction(() => deleteConversation(id))}
        onMore={() => void historyAction(async () => { await refreshHistory(historyNext ?? 0); })} />
        {historyBusy && <p role="status" className="mt-3 text-xs text-slate-500">Loading saved history…</p>}
        <button type="button" disabled={loading || historyBusy} className="history-refresh"
          onClick={() => void historyAction(async () => {
            await refreshHistory();
            if (active) select(await api<ConversationDetailResponse>(`/api/conversations/${active.id}`));
          })}>Refresh history</button>
      </ShellSlot>
      <ShellSlot region="context"><h2>Conversation details</h2><AiBadge /><h3>Chat mode</h3><p>{modeDescriptions[chatMode]}</p><h3>Document scope</h3><p>{chatMode === "general" ? "Document retrieval is off. Your selected scope is kept for later." : documentId ? documents.find(document => document.ingestion?.id === documentId)?.name ?? "Selected document (not in loaded choices)" : "All my ready documents"}</p><p>Change mode and scope in the composer. Document searches use only your account’s files.</p><dl className="detail-list"><div><dt>Conversation</dt><dd>{active?.title ?? "New conversation"}</dd></div><div><dt>Saved messages loaded</dt><dd>{messages.length}{messageNext !== null ? "+" : ""}</dd></div>{active && <div><dt>Last activity</dt><dd>{new Date(active.updatedAt).toLocaleDateString()}</dd></div>}</dl><h3>Evidence, beside the answer</h3><p>Document answers include Sources beneath the answer. General AI answers use the local model’s knowledge and have no document citations.</p><p>Previous messages are saved for you, but are not sent to the model. Include the subject in each question.</p></ShellSlot>
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
        <div className="chat-empty flex flex-col items-center justify-center px-6 py-8 text-center">
          <span className="mb-5 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <Icon name="spark" width="30" height="30" />
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">
            {isLocal ? chatMode === "documents" ? "Ask your documents." : chatMode === "general" ? "Ask your local AI." : "A question, a little clarity." : "Try a demo message."}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
            {isLocal
              ? modeDescriptions[chatMode]
              : "Send a message through the backend and receive a local development confirmation. These replies are generated by code, not an AI model."}
          </p>
          <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
            {(isLocal
              ? chatMode === "general" ? ["Explain photosynthesis simply.", "Help me plan a productive study session."] : ["What are the key points in this document?", "Which important dates or deadlines are mentioned?"]
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
          ref={messageLog}
          role="log"
          aria-label="Conversation messages"
          aria-live="polite"
          aria-relevant="additions"
          className="chat-message-log space-y-5 px-5 py-6 md:px-6"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                  className={`message-body ${message.role === "user" ? "user-message" : "assistant-message"}`}
              >
                <p
                  className={`mb-2 text-[11px] font-semibold ${message.role === "user" ? "text-emerald-100" : "text-emerald-800"}`}
                >
                  {message.role === "user"
                    ? "You"
                    : message.mode === "mock"
                      ? "Assistant · local mock"
                      : message.rag?.status === "insufficient_context"
                        ? "Not enough document evidence"
                        : message.rag?.status === "general" ? "General AI answer" : "Based on your documents"}
                </p>
                {message.role === "assistant" && message.rag?.status === "general" && <p className="answer-origin">Not based on your uploaded documents.</p>}
                <p className="text-sm leading-6 whitespace-pre-wrap wrap-anywhere">
                  {message.rag?.status === "insufficient_context" ? "Your selected documents do not contain enough information to answer this question." : message.content}
                </p>
                {message.role === "assistant" && message.rag?.status === "insufficient_context" && <div className="answer-actions"><button type="button" className="secondary-link" disabled={loading || historyBusy || activePending} onClick={() => { changeMode("general"); composerInput.current?.focus(); }}>Try General AI</button><button type="button" className="text-button" disabled={loading || historyBusy || activePending} onClick={() => { changeMode("documents"); requestAnimationFrame(() => document.getElementById("chat-document")?.focus()); }}>Change document scope</button></div>}
                {message.role === "user" && message.status !== "completed" && <div className="mt-3 text-xs text-emerald-100">
                  <p>{message.status === "failed" ? "Saved question · reply failed." : "Saved question · reply pending. Refresh to check its status."}</p>
                  {(message.status === "failed" || clock - Date.parse(message.startedAt) >= REPLY_LEASE_MS) &&
                    <button type="button" disabled={loading || historyBusy || activePending}
                      onClick={() => void submitTurn(message.content, message.requestId, message.documentId, retryMode(message.requestId))}
                      className="mt-2 rounded border border-emerald-200 px-3 py-1 font-semibold disabled:opacity-50">Retry reply</button>}
                </div>}
                {message.rag?.status === "generated" && (
                  <p className="mt-2 text-xs text-slate-500">{message.rag.contextChunkCount} source {message.rag.contextChunkCount === 1 ? "passage" : "passages"} used</p>
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
        {pendingText && <p className="my-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 whitespace-pre-wrap wrap-anywhere">Sending: {pendingText}</p>}
        {activePending && !loading && <p className="pb-4">A saved reply is in progress. Refresh history; interrupted attempts can be retried after five minutes.</p>}
        {loading && <p className="pb-4">{isLocal
          ? chatMode === "general" ? "Your local AI is preparing an answer…" : "Checking your documents and preparing an answer locally…"
          : "Creating a local mock response…"}</p>}
      </div>
      <form
        onSubmit={sendMessage}
        className="chat-composer"
      >
        {isLocal && chatMode === "documents" && !loadingDocuments && !documentError && !documents.length && <div className="no-ready-documents"><p>No ready documents available.</p><Link href="/documents#pdf-upload" className="text-button">Upload document</Link><button type="button" className="text-button" onClick={() => changeMode("general")}>Switch to General AI</button></div>}
        {isLocal && (
          <div className="chat-mode-controls"><div><label htmlFor="chat-mode" className="mb-2 block text-xs font-medium text-slate-600">Mode</label><select id="chat-mode" value={chatMode} disabled={loading || historyBusy || activePending} onChange={event => changeMode(event.target.value)} aria-describedby="chat-mode-description" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="auto">Auto</option><option value="documents">Documents</option><option value="general">General AI</option></select><p id="chat-mode-description" className="chat-mode-description">{modeDescriptions[chatMode]}</p></div><div>
            <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="chat-document" className="text-xs font-medium text-slate-600">Document scope</label><button type="button" className="text-button" onClick={openContext}>View context</button></div>
            <select id="chat-document" value={documentId} disabled={chatMode === "general" || loading || historyBusy || loadingDocuments || activePending}
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
            {documentError && <p role="alert" className="mt-1 text-xs text-red-700">{documentError} All-document search remains available.</p>}
            {nextOffset !== null && <button type="button" disabled={loading || loadingDocuments}
              onClick={() => setListOffset(nextOffset)} className="mt-2 text-xs font-semibold text-emerald-800">Load more document choices</button>}
          </div></div>
        )}
        <label htmlFor="question" className="sr-only">
          Your message
        </label>
        <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <textarea
            ref={composerInput}
            id="question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || historyBusy || activePending || !providerEnabled}
            maxLength={messageLimit}
            rows={2}
            placeholder={isLocal ? "What would you like to understand?" : "Send a local test message…"}
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
          <p role="alert" className="mt-3 text-sm text-red-700 wrap-anywhere">
            {error}
          </p>
        )}
        <p id="chat-hint" className="mt-3 text-center text-xs text-slate-400">
          Enter to send · Shift+Enter for a new line ·{" "}
          {messageLimit.toLocaleString()} characters max
        </p>
        <details className="composer-privacy"><summary>Private, local AI · About chat history</summary><p
          id="chat-status"
          className="mt-2 text-center text-xs leading-5 text-slate-500"
        >
          {isLocal ? chatMode === "general" ? "General AI replies are not based on your documents." : chatMode === "auto" ? "Auto labels each answer as document-based or General AI." : "Answers use your selected documents. Check Sources to verify the evidence." : "Saved mock demo chats. No documents are retrieved."}
          {" "}History is restored on reload. Earlier messages are not sent to the model.
        </p></details>
      </form>
    </section>
  );
}
