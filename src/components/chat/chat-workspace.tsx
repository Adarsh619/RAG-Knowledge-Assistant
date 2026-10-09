"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { MAX_MESSAGE_LENGTH } from "@/types/chat";
import { RAG_LIMITS } from "@/lib/rag/config";
import type { StoredDocument, DocumentListResponse } from "@/types/document";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatErrorResponse,
  LlmMode,
} from "@/types/chat";

export function ChatWorkspace({
  configuredMode,
  providerEnabled,
}: {
  configuredMode: LlmMode | null;
  providerEnabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
    if (!message || sending.current) return;
    if (message.length > messageLimit) {
      setError(`Keep messages to ${messageLimit} characters or fewer.`);
      return;
    }

    // The ref also blocks rapid duplicate submits before React updates the button.
    sending.current = true;
    setLoading(true);
    setError(null);
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);

    try {
      const controller = new AbortController();
      chatRequest.current = controller;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message, ...(isLocal ? { documentId: documentId || null } : {}),
        } satisfies ChatRequest),
        signal: AbortSignal.any([
          controller.signal, AbortSignal.timeout(isLocal ? 150000 : 15000),
        ]),
      });
      const data: ChatResponse | ChatErrorResponse = await response.json();
      if (!response.ok) {
        throw new Error(
          "error" in data
            ? data.error
            : "The request failed. Please try again.",
        );
      }
      if (
        !("message" in data) ||
        (data.mode !== "mock" && data.mode !== "local") ||
        typeof data.message?.content !== "string"
      ) {
        throw new Error("The server returned an unexpected response.");
      }
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), ...data.message, mode: data.mode, rag: data.rag },
      ]);
    } catch (caught) {
      setDraft(message);
      setError(
        caught instanceof Error &&
          !(caught instanceof SyntaxError) &&
          caught.name !== "TypeError" &&
          caught.name !== "TimeoutError"
          ? caught.message
          : "Could not reach the local chat API. Check the server and try again.",
      );
    } finally {
      sending.current = false;
      setLoading(false);
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
          <Icon name="chat" className="text-emerald-700" /> Local conversation
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
                {message.rag?.status === "generated" && (
                  <p className="mt-2 text-xs text-slate-500">
                    Local model: {message.rag.model} · {message.rag.contextChunkCount} passages used
                  </p>
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
            <select id="chat-document" value={documentId} disabled={loading || loadingDocuments}
              onChange={(event) => setDocumentId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All my ready documents</option>
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
            disabled={loading || !providerEnabled}
            maxLength={messageLimit}
            rows={2}
            placeholder={isLocal ? "Ask about your ingested documents…" : "Send a local test message…"}
            aria-describedby="chat-status chat-hint"
            className="min-w-0 flex-1 resize-none bg-transparent p-1 text-sm placeholder:text-slate-400 disabled:opacity-70"
          />
          <button
            type="submit"
            disabled={loading || !providerEnabled || !draft.trim()}
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
          {isLocal ? "Phase 10 · Local document RAG." : "Mock development only. No documents are retrieved."}
          {" "}Messages stay in this page’s memory and clear on refresh.
        </p>
      </form>
    </section>
  );
}
