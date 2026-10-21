# Project structure

[Documentation index](README.md) · [Project overview](../README.md)

## Project structure

```text
src/app/                  App Router pages, protected layouts and API routes
src/components/           Auth, dashboard shell, documents, chat and sources
src/lib/supabase/         Public/browser and authenticated SSR client utilities
src/lib/storage/          Private upload/download validation
src/lib/pdf/              Server-side extraction
src/lib/rag/              Chunking, context assembly, sources and answer pipeline
src/lib/embeddings/       Pinned offline model, batching and query adapter
src/lib/retrieval/        Validated invoker-RPC search
src/lib/knowledge/        Persistent ingestion and coordinated deletion
src/lib/conversations/    Atomic turns, history and owner-filtered repository
src/lib/ai/               Explicit mock/local/disabled OpenAI provider layer
scripts/                  Tests, public synthetic fixtures and release checks
supabase/                 Reviewed migrations, Storage setup and SQL checks
docs/                     Architecture, security, acceptance and release guides
```
