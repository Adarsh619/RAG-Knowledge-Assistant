# Architecture

The browser renders the UI and handles email/password entry directly with Supabase Auth. Cookie sessions are refreshed by Next.js middleware. Protected layouts and server API handlers verify authentication; authenticated Supabase clients preserve database/Storage RLS.

## Boundaries

| Location | Responsibilities | Data |
| --- | --- | --- |
| Browser | Auth forms, document actions, chat/history and source display | Own returned documents/messages only |
| Local Next.js Node server | Validation, Storage download, PDF parser, chunker, local embeddings, RPC calls, prompt assembly, provider call | Temporary private PDFs/chunks/prompt |
| Local Ollama process | Reviewed Qwen generation through loopback only | Current question + bounded retrieved context |
| Supabase Free backend | Auth, private PDFs, metadata, chunks/vectors, conversations/messages and evidence | Persistent owner-isolated records |

The browser never selects an AI endpoint, supplies an owner ID, posts embeddings or invents assistant citations through the application API. No service-role credential is needed. Public publishable keys are identifiers for client access, not authorization bypasses.

## Ingestion and deletion

`POST /api/documents` validates the multipart body, PDF extension/MIME/header and 4 MiB size, then uploads into `<user UUID>/<random UUID>--<safe basename>.pdf`. Random naming prevents collisions and overwriting; Storage ownership/folder policies provide an independent boundary.

`POST /api/documents/ingest` downloads the owner's private PDF, extracts each physical page, creates deterministic 1,200-character chunks with up to 200-character overlap, and embeds in batches of four. Tokenization refuses inputs above 512 tokens. The pinned CPU/q8 MiniLM produces mean-pooled unit vectors of dimension 384. Its lazy singleton persists across module reloads within a process; it does not cache private document text. Runtime never fetches models remotely.

`persist_document_ingestion` locks/replaces the document's chunks in one transaction. Successful re-ingestion keeps the document ID and replaces chunk IDs. A failed transaction leaves the old ready version intact.

Deletion marks the document unavailable for retrieval, removes the Storage PDF, and deletes metadata with chunk cascade. A partial failure remains as deletion-pending for explicit retry. PostgreSQL and Storage cannot share one transaction; this deliberate state machine is the consistency mechanism. Old chat evidence is an immutable snapshot and survives document deletion.

## Retrieval and generation

The question uses the same MiniLM weights/revision and normalization as stored chunks. The invoker search RPC filters owner, ready state and embedding model/revision/dimension. It calculates `similarity = 1 - (embedding <=> query_embedding)`, orders nearest first and returns bounded top-k results. No approximate vector index is used.

The RAG assembler takes up to five chunks above 0.30, removes duplicate chunk IDs, orders by score and includes only whole passages within 6,000 context bytes / 7,000 total prompt bytes. It preserves source identity internally. Zero usable passages returns an insufficient-context answer with no sources and no generation request.

Ollama inventory is checked before private context is sent. Only the pinned local `qwen3:4b-instruct` manifest, GGUF family/quantization and loopback origin are accepted. Redirects, cloud aliases and model pulls are blocked. Generation uses a 120-second timeout, 8,192-token context and 384-token output limit. A malformed/incomplete response becomes a visible failed turn, not an invented successful answer.

Source identity comes from context chunks, not model text. Excerpts are exact prefixes of stored content, shortened for display. Grouping one document's chunks reduces visual repetition while preserving each passage's page/rank/score information. These are input sources, not automatic claim verification.

## Conversation persistence

`conversations` owns many `messages`; message RLS checks the parent owner. A request UUID identifies a turn, and an attempt UUID identifies its current generation attempt. Begin/complete RPCs are invoker functions. Short row locks protect turn ordering; no database lock is held during model inference.

The user message is saved pending first. Generation success atomically inserts the assistant answer plus JSON evidence and completes the user turn. Failure marks only the matching pending attempt failed. Completed retries return the saved pair; five-minute leases allow interrupted retries and stale attempts cannot overwrite a newer result.

Citation JSON is simpler than a join table and preserves original evidence even when source chunks are replaced or deleted. It is size bounded and excludes full internal prompts. Titles come from the first question, never an LLM. History pages contain at most 20 conversations/50 messages. Prior messages are not sent to generation; follow-up questions must stand alone.

## Release boundary

Full RAG needs Next.js and Ollama on the same computer with MiniLM artifacts present. Supabase remains hosted. Cloud deployment cannot reach a user's loopback runtime. See [release strategy](release.md) for supported presentation options.
