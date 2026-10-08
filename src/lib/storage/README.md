# Private document storage — Phase 4

`documents.ts` shares the 4 MiB limit, PDF MIME type, selection validation, safe object naming, and display helpers. Only the first five bytes are checked for `%PDF-` on upload; this is a file-format check, not PDF parsing or text extraction.

`document-handler.ts` handles list/upload/delete. The Next.js route obtains a verified user with `getUser()` and passes their user ID and session-aware Storage client. Tests can supply an offline client without importing Next.js cookies or contacting a real project.

The server bounds the actual request stream, not just `Content-Length`. It validates one multipart PDF, checks size/type/extension/header, generates a UUID and sanitized name, and uploads with `upsert: false`. Object paths always start with the server-verified user ID. Deletion accepts only a generated document ID and reconstructs the owner's path; arbitrary paths and caller-supplied owner IDs are rejected. Mutations check request origin, and all responses use `private, no-store`.

Storage maintains size/date metadata. The display filename is the sanitized suffix of the stored object name. Listing uses pages of 50 files with a Load more control. No custom metadata table or application database table is needed.

The private bucket and policies are defined in `supabase/storage/documents.sql`. INSERT checks bucket, owner ID, one-level user folder, and safe PDF object name. SELECT/DELETE check both folder and owner. No UPDATE policy is created. Supabase enforces the bucket's PDF MIME type and file-size cap, while the app additionally checks the signature. MIME declarations and five-byte headers do not prove the entire PDF is well formed; full parsing belongs to later phases.
