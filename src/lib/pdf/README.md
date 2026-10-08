# Phase 5: server-side PDF text extraction

`extract-text.ts` is a server-only utility built on the pinned `pdf-parse` 2.4.5 package. It accepts PDF bytes, obtains the physical page count, and extracts each page separately. The returned `pages` array preserves 1-based physical page numbers, including empty pages. These are not necessarily the page labels printed inside the document. `characterCount` counts JavaScript string length, not words or LLM tokens.

The parser uses an installed local worker through `getData()`; it does not download a worker or send PDFs to a processing service. Next.js keeps `pdf-parse` and its native dependency external to the server bundle. The native canvas dependency belongs to the library; the application calls no rendering, image extraction, or OCR method. JavaScript evaluation and worker network fetch are disabled. Parser resources are destroyed in `finally`.

Input remains capped at 4 MiB. For this development phase, extraction rejects PDFs over 100 pages or 200,000 decoded characters rather than silently returning an incomplete document. Those limits bound accepted results; they are not a hard CPU/memory sandbox for arbitrary PDFs. No extracted content or credentials are logged.

`extraction-handler.ts` receives an already verified user context. It accepts only one validated document ID in a small JSON request and reconstructs `user-id/document-id` itself. It calls the normal authenticated Supabase Storage client's `download()` with caching disabled. The existing private bucket's SELECT policy remains the authoritative owner check. No service-role key, signed URL, public URL, or caller-provided owner/path is used.

The handler checks downloaded size and the PDF header before calling the parser. Missing/inaccessible files share a generic response. Corrupted/unsupported and password-protected PDFs return understandable 422 errors. Storage failures return a safe retry message. A valid PDF with no text returns 200 with `status: "no_text"`: it is a successful extraction attempt, not a parser failure. Blank and image-only pages need no OCR request.

`POST /api/documents/extract` verifies the session with `auth.getUser()` and returns `{ document, extraction, chunking }` with `Cache-Control: private, no-store`. Phase 6 adds local chunking after parsing, in the same authenticated handler; it does not accept client text, owner paths, or chunk settings. The middleware covers nested document APIs. The browser renders plain text through React, not HTML, and displays at most three nonempty pages with 1,500 characters per page, plus a chunk inspector. The response preserves the complete accepted page text; only the page preview is shortened. Closing, refreshing, or leaving the page clears both in-memory previews. Deleting the matching document clears them.

No application table or extracted-text persistence is needed. The local chunker consumes `pages` and preserves physical page metadata. See `../rag/README.md` for its algorithm and configuration. No embedding, retrieval, or RAG is performed.

Run `npm run test:pdf` for the real parser and official SDK against generated PDFs and an offline Storage fixture. The test blocks fetch/HTTP/HTTPS/TCP/TLS before external I/O and asserts zero outbound attempts. The different-user fixture checks API folder scoping; deployed Storage RLS is checked separately with read-only SQL, not by claiming the fixture implements Supabase's policies.

References: [pdf-parse](https://github.com/mehmet-kozan/pdf-parse), [worker/Next.js configuration](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/troubleshooting.md), [Storage download](https://supabase.com/docs/reference/javascript/storage-from-download).
