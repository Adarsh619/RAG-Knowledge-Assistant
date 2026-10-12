"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { ActionMenu } from "@/components/ui/action-menu";
import { ShellSlot, useShell } from "@/components/shell-context";
import { documentChatHref } from "@/lib/ui/preferences";
import { ExtractionPreview } from "./extraction-preview";
import { ChunkPreview } from "./chunk-preview";
import { RetrievalInspector } from "./retrieval-inspector";
import { readApiResponse } from "@/lib/http/client-response";
import type { ExtractionResponse } from "@/types/extraction";
import type { EmbeddingResponse } from "@/types/embedding";
import {
  formatFileSize,
  MAX_PDF_SIZE_LABEL,
  validatePdfSelection,
} from "@/lib/storage/documents";
import type {
  DocumentListResponse,
  DocumentMutationResponse,
  StoredDocument,
} from "@/types/document";

export function DocumentsWorkspace() {
  const { openContext } = useShell();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [previewKind, setPreviewKind] = useState<"text" | "chunks">("text");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const extractionRequest = useRef<AbortController | null>(null);
  const [embedding, setEmbedding] = useState<EmbeddingResponse | null>(null);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [failedIngestionId, setFailedIngestionId] = useState<string | null>(
    null,
  );
  const ingestionRequest = useRef<AbortController | null>(null);
  const embeddingRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const listRequest = useRef<AbortController | null>(null);
  const mutating = useRef(false);
  const busy =
    uploading ||
    deletingId !== null ||
    extractingId !== null ||
    embeddingId !== null ||
    ingestingId !== null;

  useEffect(() => {
    if (!extraction) return;
    const heading = preview.current?.querySelector<HTMLElement>(previewKind === "chunks" ? "#chunk-heading" : "#extraction-heading");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
  }, [extraction, previewKind]);

  const loadDocuments = useCallback(async (offset = 0) => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoadingList(true);
    setListError(null);
    try {
      const response = await fetch(`/api/documents?offset=${offset}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await readApiResponse<DocumentListResponse>(response);
      if (controller.signal.aborted) return;
      setDocuments((current) =>
        offset === 0
          ? body.documents
          : [
              ...new Map(
                [...current, ...body.documents].map((document) => [
                  document.id,
                  document,
                ]),
              ).values(),
            ],
      );
      setNextOffset(body.nextOffset);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setListError(
          cause instanceof Error
            ? cause.message
            : "The document list could not be loaded.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
    return () => {
      listRequest.current?.abort();
      extractionRequest.current?.abort();
      embeddingRequest.current?.abort();
      ingestionRequest.current?.abort();
    };
  }, [loadDocuments]);

  function chooseFile(file: File | null) {
    const validationError = file ? validatePdfSelection(file) : null;
    setSelectedFile(validationError ? null : file);
    setError(validationError);
    setSuccess(null);
    if (fileInput.current) fileInput.current.value = "";
  }
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || mutating.current) return;
    mutating.current = true;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.set("file", selectedFile);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      const body = await readApiResponse<DocumentMutationResponse>(response);
      setSuccess(body.message);
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await loadDocuments();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The PDF could not be uploaded. Try again.",
      );
    } finally {
      setUploading(false);
      mutating.current = false;
    }
  }

  async function deleteDocument(id: string) {
    if (mutating.current) return;
    mutating.current = true;
    setDeletingId(id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await readApiResponse<DocumentMutationResponse>(response);
      setSuccess(body.message);
      setConfirmDeleteId(null);
      setExtraction((current) =>
        current?.document.id === id ? null : current,
      );
      setEmbedding((current) => (current?.document.id === id ? null : current));
      await loadDocuments();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The document could not be deleted. Try again.",
      );
      await loadDocuments();
    } finally {
      setDeletingId(null);
      mutating.current = false;
    }
  }

  async function extractDocument(id: string) {
    if (mutating.current) return;
    mutating.current = true;
    const controller = new AbortController();
    extractionRequest.current = controller;
    setExtractingId(id);
    setExtraction(null);
    setEmbedding(null);
    setError(null);
    setSuccess(null);
    setConfirmDeleteId(null);
    try {
      const response = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await readApiResponse<ExtractionResponse>(response);
      if (!controller.signal.aborted) setExtraction(body);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Text extraction could not be completed. Try again.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setExtractingId(null);
      mutating.current = false;
    }
  }

  async function generateEmbeddings() {
    if (!extraction || mutating.current) return;
    mutating.current = true;
    const controller = new AbortController();
    embeddingRequest.current = controller;
    setEmbeddingId(extraction.document.id);
    setEmbedding(null);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/documents/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: extraction.document.id }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await readApiResponse<EmbeddingResponse>(response);
      if (!controller.signal.aborted) setEmbedding(body);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Local embedding generation failed. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setEmbeddingId(null);
      mutating.current = false;
    }
  }

  async function ingestDocument(document: StoredDocument) {
    if (mutating.current) return;
    mutating.current = true;
    const controller = new AbortController();
    ingestionRequest.current = controller;
    setIngestingId(document.id);
    setFailedIngestionId(null);
    setError(null);
    setSuccess(null);
    setConfirmDeleteId(null);
    try {
      const response = await fetch("/api/documents/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.id,
          reingest: document.ingestion?.status === "ready",
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      await readApiResponse<DocumentMutationResponse>(response);
      if (!controller.signal.aborted) setSuccess(`${document.name} is ready for AI.`);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setFailedIngestionId(document.id);
        setError(
          cause instanceof Error
            ? cause.message
            : "Ingestion failed. Try again.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        await loadDocuments();
        setIngestingId(null);
      }
      mutating.current = false;
    }
  }

  const selectedDocument = documents.find(document => document.id === selectedDocumentId);
  const deletingDocument = documents.find(document => document.id === confirmDeleteId);
  function showDetails(document: StoredDocument) { setSelectedDocumentId(document.id); openContext(); }
  function status(document: StoredDocument) {
    if (ingestingId === document.id) return "Processing…";
    if (document.ingestion?.status === "deleting") return "Deletion pending";
    if (document.ingestion?.status === "ready") return "Ready for AI";
    return failedIngestionId === document.id ? "Failed — try again" : "Uploaded";
  }
  const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not available";
  const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

  return <>
    <section id="pdf-upload" aria-labelledby="upload-heading" className="upload-panel">
      <p className="workflow-label">01 UPLOAD PDF &nbsp; → &nbsp; 02 PROCESS FOR AI &nbsp; → &nbsp; 03 ASK QUESTIONS</p>
      <div className="flex items-start gap-4"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-800"><Icon name="upload" width="24" height="24" /></span><div><h2 id="upload-heading" className="text-lg font-semibold">Give your knowledge a home.</h2><p className="mt-1 text-sm leading-6 text-slate-500">Add a PDF, then process it to make it ready for questions.</p></div></div>
      <form onSubmit={uploadDocument} className="mt-5">
        <label htmlFor="pdf-file" className="sr-only">Select a PDF</label>
        <input ref={fileInput} id="pdf-file" name="file" type="file" accept=".pdf,application/pdf" onChange={selectFile} disabled={busy} aria-describedby="upload-hint" className="sr-only" tabIndex={-1} />
        <div className={`pdf-dropzone ${dragging ? "drag-active" : ""}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => {
          event.preventDefault(); setDragging(false); if (busy) return;
          if (event.dataTransfer.files.length !== 1) { setSelectedFile(null); setError("Choose one PDF at a time."); return; }
          chooseFile(event.dataTransfer.files[0]);
        }}><Icon name="upload" /><p>{dragging ? "Drop your PDF here" : selectedFile ? selectedFile.name : "Drag a PDF here, or choose a file"}</p><button type="button" className="secondary-link choose-pdf" disabled={busy} onClick={() => fileInput.current?.click()}>Choose PDF</button></div>
        <div className="upload-submit"><p id="upload-hint">PDF only · Up to {MAX_PDF_SIZE_LABEL} · Private to your account</p><button type="submit" disabled={!selectedFile || busy || loadingList} className="primary-link"><Icon name="upload" />{uploading ? "Uploading…" : "Upload PDF"}</button></div>
        {selectedFile && <p className="mt-2 text-xs text-slate-500 wrap-anywhere">Selected: {selectedFile.name} · {formatFileSize(selectedFile.size)}</p>}
      </form>
    </section>
    {(uploading || extractingId || ingestingId) && <p role="status" className="mt-4 text-sm text-emerald-800">{uploading ? "Uploading your private PDF…" : extractingId ? "Preparing your text and chunk previews…" : "Processing for AI. Reading, organizing and indexing your PDF locally. This can take a moment."}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700">{error}</p>}
    {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">{success}</p>}
    <section aria-labelledby="documents-heading" aria-busy={loadingList}>
      <div className="library-toolbar"><h2 id="documents-heading">Your library <span>{documents.length}{nextOffset !== null ? "+" : ""} documents</span></h2><button disabled={busy || loadingList} onClick={() => void loadDocuments()} className="text-button">Refresh</button></div>
      {listError && <div className="mb-4"><p role="alert" className="text-sm text-red-700">{listError}</p><button disabled={loadingList || busy} onClick={() => void loadDocuments()} className="text-button mt-2">Retry loading</button></div>}
      {loadingList && <p role="status" className="mb-4 text-sm text-slate-500">Loading your library…</p>}
      {!loadingList && !listError && !documents.length && <div className="empty-state"><Icon name="file" width="32" height="32" /><h3>No documents yet.</h3><p>Upload a PDF to create your private knowledge base.</p><button className="text-button mt-4" onClick={() => fileInput.current?.click()}>Upload document</button></div>}
      <div className="document-grid">{documents.map(document => <article key={document.id} data-document-id={document.id} className={`document-card ${selectedDocumentId === document.id ? "selected" : ""}`} aria-busy={ingestingId === document.id}>
        <div className="document-card-top"><span className="file-symbol"><Icon name="file" /></span><ActionMenu label={`Actions for ${document.name}`}>
          <button onClick={() => showDetails(document)}>View details</button>
          <button onClick={() => showDetails(document)}>View indexing information</button>
          <button disabled={busy || loadingList || document.ingestion?.status === "deleting"} onClick={() => { setPreviewKind("text"); void extractDocument(document.id); }}>Preview extracted text</button>
          <button disabled={busy || loadingList || document.ingestion?.status === "deleting"} onClick={() => { setPreviewKind("chunks"); void extractDocument(document.id); }}>Inspect chunks</button>
          {document.ingestion?.status === "ready" && <button disabled={busy || loadingList} onClick={() => void ingestDocument(document)}>Re-process document</button>}
          <button disabled={busy || loadingList} onClick={() => setConfirmDeleteId(document.id)} className="text-red-700">{document.ingestion?.status === "deleting" ? "Retry deletion" : "Delete document"}</button>
        </ActionMenu></div>
        <h3><button onClick={() => showDetails(document)}>{document.name}</button></h3>
        <span className={`status-chip ${document.ingestion?.status === "ready" && ingestingId !== document.id ? "ready" : ""}`}>{document.ingestion?.status === "ready" && <Icon name="check" width="12" height="12" />}{status(document)}</span>
        <p className="document-meta">{document.ingestion?.pageCount != null && `${countLabel(document.ingestion.pageCount, "page")} · `}{document.ingestion?.status === "ready" && `${countLabel(document.ingestion.chunkCount, "chunk")} · `}{formatFileSize(document.size)}</p>
        <p className="document-date">{document.ingestion?.processedAt ? `Processed ${date(document.ingestion.processedAt)}` : `Uploaded ${date(document.uploadedAt)}`}</p>
        {failedIngestionId === document.id && document.ingestion?.status === "ready" && <p className="mt-3 text-xs text-red-700">Re-processing failed. Your previous index is still available.</p>}
        {document.storageMissing && <p className="mt-3 text-xs text-red-700">PDF removed. Retry deletion to finish cleanup.</p>}
        {document.ingestion?.status === "ready" ? <Link className="document-primary" href={documentChatHref(document.ingestion.id)}>Ask about this document <Icon name="arrow" width="16" height="16" /></Link> : <button className="document-primary w-full" disabled={busy || loadingList || document.ingestion?.status === "deleting"} onClick={() => void ingestDocument(document)}>{ingestingId === document.id ? "Processing…" : "Process for AI"}<Icon name="spark" width="16" height="16" /></button>}
      </article>)}</div>
      {nextOffset !== null && <button disabled={busy || loadingList} onClick={() => void loadDocuments(nextOffset)} className="text-button mt-5">Load more documents</button>}
    </section>
    <details className="panel mt-6 p-5"><summary className="text-sm font-semibold text-emerald-800">Advanced · Explore search evidence</summary><p className="mt-2 text-xs leading-5 text-slate-500">Inspect matching passages before answer generation. Document previews and re-processing are in each card’s actions menu.</p><RetrievalInspector key={documents.map(document => `${document.id}:${document.ingestion?.status}:${document.ingestion?.processedAt}`).join("|")} documents={documents} disabled={busy || loadingList} /></details>
    {extraction && <div ref={preview} id="document-preview"><ExtractionPreview result={extraction} onClose={() => { embeddingRequest.current?.abort(); setExtraction(null); setEmbedding(null); setEmbeddingId(null); }} /><ChunkPreview result={extraction} embedding={embedding} onEmbed={() => void generateEmbeddings()} embeddingBusy={embeddingId !== null} disabled={busy || loadingList} /></div>}
    <ShellSlot region="context">{selectedDocument ? <><h2>{selectedDocument.name}</h2><span className={`status-chip ${selectedDocument.ingestion?.status === "ready" ? "ready" : ""}`}>{status(selectedDocument)}</span><dl className="detail-list">
      {([["File size", formatFileSize(selectedDocument.size)], ["Uploaded", date(selectedDocument.uploadedAt)], ["Pages", selectedDocument.ingestion?.pageCount ?? "Available after processing"], ["Chunks", selectedDocument.ingestion?.chunkCount ?? "Not processed"], ["Processed", date(selectedDocument.ingestion?.processedAt)]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl><details><summary>Processing details</summary><ul className="processing-checklist"><li><Icon name="check" />PDF uploaded</li>{selectedDocument.ingestion?.status === "ready" && <><li><Icon name="check" />Text extracted</li><li><Icon name="check" />{selectedDocument.ingestion.pageCount} pages detected</li><li><Icon name="check" />{selectedDocument.ingestion.chunkCount} chunks created</li><li><Icon name="check" />Local embeddings generated</li><li><Icon name="check" />Added to semantic index</li></>}</ul><p>Model: {selectedDocument.ingestion?.embeddingModel ?? "Available after processing"}<br />Dimensions: {selectedDocument.ingestion?.embeddingDimension ?? "—"}</p></details><div className="context-actions">
      {selectedDocument.ingestion?.status === "ready" && <Link className="primary-link" href={documentChatHref(selectedDocument.ingestion.id)}>Ask about this document</Link>}
      <button className="secondary-link" disabled={busy || loadingList || selectedDocument.ingestion?.status === "deleting"} onClick={() => void ingestDocument(selectedDocument)}>{selectedDocument.ingestion?.status === "ready" ? "Re-process document" : "Process for AI"}</button>
    </div><p>Only your account can access this file and its indexed content.</p></> : <><h2>Document details</h2><p>Select a document’s filename or choose View details to inspect its processing status and metadata.</p><p>Process for AI makes an uploaded PDF ready for questions. You can still explore text, chunks and embeddings in advanced actions.</p></>}</ShellSlot>
    {deletingDocument && <Modal title="Delete document?" onClose={() => { if (!busy) setConfirmDeleteId(null); }}><p className="font-semibold wrap-anywhere">{deletingDocument.name}</p><p className="muted mt-3">This permanently deletes the PDF and its search index. Saved chat excerpts remain until their conversations are deleted.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button disabled={busy} className="secondary-link" onClick={() => setConfirmDeleteId(null)}>Cancel</button><button disabled={busy || loadingList} className="primary-link" onClick={() => void deleteDocument(deletingDocument.id)}>{deletingId ? "Deleting…" : "Confirm delete"}</button></div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}</Modal>}
  </>;
}
