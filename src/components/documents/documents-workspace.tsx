"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { ExtractionPreview } from "./extraction-preview";
import { ChunkPreview } from "./chunk-preview";
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

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "The document request failed.");
  return body as T;
}

export function DocumentsWorkspace() {
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
  const embeddingRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const listRequest = useRef<AbortController | null>(null);
  const mutating = useRef(false);
  const busy =
    uploading ||
    deletingId !== null ||
    extractingId !== null ||
    embeddingId !== null;

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
      const body = await readResponse<DocumentListResponse>(response);
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
    };
  }, [loadDocuments]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const validationError = file ? validatePdfSelection(file) : null;
    setSelectedFile(validationError ? null : file);
    setError(validationError);
    setSuccess(null);
    if (validationError) event.target.value = "";
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
      const body = await readResponse<DocumentMutationResponse>(response);
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
      const body = await readResponse<DocumentMutationResponse>(response);
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
      const body = await readResponse<ExtractionResponse>(response);
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
      const body = await readResponse<EmbeddingResponse>(response);
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

  return (
    <>
      <section
        id="pdf-upload"
        aria-labelledby="upload-heading"
        className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 sm:p-8"
      >
        <div className="flex items-start gap-4">
          <span className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
            <Icon name="upload" width="26" height="26" />
          </span>
          <div>
            <h2 id="upload-heading" className="text-lg font-semibold">
              Add a PDF to your library
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Private storage for your documents. PDF files only, up to{" "}
              {MAX_PDF_SIZE_LABEL} each.
            </p>
          </div>
        </div>
        <form onSubmit={uploadDocument} className="mt-6">
          <label htmlFor="pdf-file" className="mb-2 block text-sm font-medium">
            Select a PDF
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={fileInput}
              id="pdf-file"
              name="file"
              type="file"
              accept=".pdf,application/pdf"
              onChange={selectFile}
              disabled={busy}
              aria-describedby="upload-hint"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 p-2 text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-medium file:text-slate-700 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!selectedFile || busy || loadingList}
              className="primary-link shrink-0 disabled:opacity-60"
            >
              <Icon name="upload" />
              {uploading ? "Uploading…" : "Upload PDF"}
            </button>
          </div>
          <p id="upload-hint" className="mt-3 text-xs leading-5 text-slate-400">
            Only you can access files in your library. Safe filenames are
            generated when uploading.
          </p>
          {selectedFile && (
            <p className="mt-3 break-words text-xs text-slate-500">
              Selected: {selectedFile.name} ·{" "}
              {formatFileSize(selectedFile.size)}
            </p>
          )}
        </form>
      </section>
      {uploading && (
        <p role="status" className="mt-4 text-sm text-emerald-800">
          Uploading your PDF to private storage…
        </p>
      )}
      {extractingId && (
        <p role="status" className="mt-4 text-sm text-emerald-800">
          Reading your private PDF, extracting text, and creating chunks
          locally…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"
        >
          {success}
        </p>
      )}
      <section
        className="panel mt-7 overflow-hidden"
        aria-labelledby="documents-heading"
        aria-busy={loadingList}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <h2 id="documents-heading" className="font-semibold">
            Your documents{" "}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-normal text-slate-500">
              {documents.length}
              {nextOffset !== null ? "+" : ""}
            </span>
          </h2>
          <button
            type="button"
            disabled={busy || loadingList}
            onClick={() => void loadDocuments()}
            className="text-xs font-semibold text-emerald-800 disabled:opacity-50"
          >
            Refresh list
          </button>
        </div>
        {listError && (
          <div className="border-b border-slate-100 px-6 py-4">
            <p role="alert" className="text-sm leading-6 text-red-700">
              {listError}
            </p>
            <button
              type="button"
              onClick={() => void loadDocuments()}
              disabled={loadingList || busy}
              className="mt-2 text-sm font-semibold text-emerald-800"
            >
              Retry loading
            </button>
          </div>
        )}
        {loadingList && (
          <p role="status" className="px-6 py-6 text-sm text-slate-500">
            Loading your private documents…
          </p>
        )}
        {!loadingList && !listError && documents.length === 0 && (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <Icon
              name="file"
              width="34"
              height="34"
              className="mb-4 text-slate-300"
            />
            <h3 className="text-sm font-semibold">No documents yet</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Upload your first PDF using the form above.
            </p>
          </div>
        )}
        {documents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">File name</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td className="max-w-72 px-6 py-5">
                      <div className="flex items-center gap-3">
                        <Icon
                          name="file"
                          className="shrink-0 text-emerald-700"
                        />
                        <span className="break-words font-medium">
                          {document.name}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-slate-500">
                      {formatFileSize(document.size)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-xs text-slate-500">
                      {document.uploadedAt
                        ? new Date(document.uploadedAt).toLocaleString()
                        : "Date unavailable"}
                    </td>
                    <td className="px-6 py-5">
                      {confirmDeleteId === document.id ? (
                        <div className="flex min-w-36 flex-wrap gap-3">
                          <p className="w-full text-xs text-slate-500">
                            Delete this file permanently?
                          </p>
                          <button
                            type="button"
                            disabled={busy || loadingList}
                            onClick={() => void deleteDocument(document.id)}
                            className="text-xs font-semibold text-red-700 disabled:opacity-50"
                          >
                            {deletingId === document.id
                              ? "Deleting…"
                              : "Confirm delete"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex min-w-40 flex-wrap gap-4">
                          <button
                            type="button"
                            disabled={busy || loadingList}
                            onClick={() => void extractDocument(document.id)}
                            aria-label={`Extract text from ${document.name}`}
                            className="text-xs font-semibold text-emerald-800 disabled:opacity-50"
                          >
                            {extractingId === document.id
                              ? "Extracting…"
                              : "Extract text"}
                          </button>
                          <button
                            type="button"
                            disabled={busy || loadingList}
                            onClick={() => setConfirmDeleteId(document.id)}
                            aria-label={`Delete ${document.name}`}
                            className="text-xs font-semibold text-red-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextOffset !== null && (
          <div className="border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              disabled={busy || loadingList}
              onClick={() => void loadDocuments(nextOffset)}
              className="text-sm font-semibold text-emerald-800 disabled:opacity-50"
            >
              Load more documents
            </button>
          </div>
        )}
      </section>
      {extraction && (
        <>
          <ExtractionPreview
            result={extraction}
            onClose={() => {
              embeddingRequest.current?.abort();
              setExtraction(null);
              setEmbedding(null);
              setEmbeddingId(null);
            }}
          />
          <ChunkPreview
            result={extraction}
            embedding={embedding}
            onEmbed={() => void generateEmbeddings()}
            embeddingBusy={embeddingId !== null}
            disabled={busy || loadingList}
          />
        </>
      )}
      <p className="mt-6 text-xs leading-5 text-slate-400">
        PDFs are stored privately. Extract text to inspect local parsing and
        chunks. Document search and answers with sources will arrive in later
        phases.
      </p>
    </>
  );
}
