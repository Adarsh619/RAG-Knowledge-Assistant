"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { StoredDocument } from "@/types/document";
import type { SearchResponse } from "@/types/retrieval";
import { SEARCH_DEFAULTS, SEARCH_LIMITS } from "@/lib/retrieval/config";

export function RetrievalInspector({ documents, disabled }: {
  documents: StoredDocument[];
  disabled: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [topK, setTopK] = useState(String(SEARCH_DEFAULTS.topK));
  const [threshold, setThreshold] = useState(String(SEARCH_DEFAULTS.minSimilarity));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => () => { request.current?.abort(); }, []);

  function clearResult() { setResult(null); setError(null); }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || disabled || !question.trim()) return;
    inFlight.current = true;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    clearResult();
    try {
      const response = await fetch("/api/documents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          question: question.trim(),
          documentId: documentId || null,
          topK: Number(topK),
          minSimilarity: Number(threshold),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Document search failed.");
      if (!controller.signal.aborted) setResult(body as SearchResponse);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Document search failed.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      inFlight.current = false;
    }
  }

  const locked = disabled || loading;
  const ready = documents.filter((document) => document.ingestion?.status === "ready");
  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 disabled:opacity-50";
  return (
    <section aria-labelledby="retrieval-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="retrieval-heading" className="text-lg font-semibold text-slate-900">Semantic retrieval inspector</h2>
        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">Local embeddings · retrieval only</span>
      </div>
      <p className="mb-4 text-sm text-slate-500">Search ready documents by meaning. Results are source passages with cosine similarity scores; no AI answer is generated.</p>
      <form onSubmit={search} className="space-y-4">
        <div>
          <label htmlFor="retrieval-question" className="mb-1 block text-sm font-medium text-slate-700">Question</label>
          <textarea id="retrieval-question" required maxLength={SEARCH_LIMITS.maxQuestionCharacters} rows={2} disabled={locked}
            placeholder="What does this document say about React hooks?" className={inputClass} value={question}
            onChange={(event) => { setQuestion(event.target.value); clearResult(); }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="retrieval-scope" className="mb-1 block text-sm font-medium text-slate-700">Search scope</label>
            <select id="retrieval-scope" className={inputClass} value={documentId} disabled={locked}
              onChange={(event) => { setDocumentId(event.target.value); clearResult(); }}>
              <option value="">All my ready documents</option>
              {ready.map((document) => <option key={document.ingestion!.id} value={document.ingestion!.id}>{document.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">Single-document choices come from the loaded list.</p>
          </div>
          <div>
            <label htmlFor="retrieval-top-k" className="mb-1 block text-sm font-medium text-slate-700">Top-k (maximum results)</label>
            <input id="retrieval-top-k" type="number" required min={1} max={SEARCH_LIMITS.maxTopK} step={1} className={inputClass}
              value={topK} disabled={locked} onChange={(event) => { setTopK(event.target.value); clearResult(); }} />
          </div>
          <div>
            <label htmlFor="retrieval-threshold" className="mb-1 block text-sm font-medium text-slate-700">Minimum similarity</label>
            <input id="retrieval-threshold" type="number" required min={-1} max={1} step="any" className={inputClass}
              value={threshold} disabled={locked} onChange={(event) => { setThreshold(event.target.value); clearResult(); }} />
            <p className="mt-1 text-xs text-slate-500">Default 0.30. Use -1 to inspect all scores.</p>
          </div>
        </div>
        <button type="submit" disabled={locked || !question.trim()} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Searching locally…" : "Search documents"}
        </button>
      </form>
      {loading && <p role="status" className="mt-3 text-sm text-slate-500">Embedding the question locally and comparing your stored chunks. First model loading may take longer.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {result && <div className="mt-5 space-y-4" aria-live="polite">
        <p className="text-sm text-slate-700">{result.matches.length} matching chunks · {result.embedding.dimension} dimensions · normalized · {result.embedding.tokenCount} tokens · model {result.embedding.modelReused ? "reused" : "loaded"}</p>
        <p className="break-all text-xs text-slate-500">{result.embedding.model} · revision {result.embedding.revision}</p>
        {!result.matches.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No chunks meet this threshold in the selected scope. Check that documents are ready, or lower the threshold to inspect weaker matches.</p>}
        {result.matches.map((chunk, index) => <article key={chunk.chunkId} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold text-slate-800">
            <h3>Rank {index + 1} · {chunk.originalFilename}</h3>
            <span>Similarity {chunk.similarity.toFixed(4)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Chunk {chunk.chunkIndex} · Pages {chunk.pageNumbers.join(", ")} · {chunk.characterCount} characters · Offsets [{chunk.startOffset}, {chunk.endOffset})</p>
          <p className="mt-1 break-all text-xs text-slate-400">Document {chunk.documentId} · Chunk {chunk.chunkId}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{chunk.content}</p>
        </article>)}
        <p className="text-xs text-slate-500">Higher scores indicate more similar vector directions. Scores are not confidence probabilities. Results and questions are temporary; no search history is saved.</p>
      </div>}
    </section>
  );
}
