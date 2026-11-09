# CLAUDE.md — Groundwork (RAG Knowledge Assistant)

Private PDF Q&A: upload PDFs, ask questions, get answers grounded in retrieved passages with citations, and resume saved chats. The RAG pipeline is hand-written TypeScript (no LangChain/LlamaIndex). Owner: Adarsh619 — first RAG project, **zero-cost by design** (no paid AI APIs).

## Tech stack

| Area | Implementation |
| --- | --- |
| App | Next.js 15 App Router, React 19, TypeScript (strict), Tailwind CSS 4, Node ≥ 24 |
| Backend | Supabase Free: Auth (cookie sessions), private Storage, Postgres + pgvector, RLS on every table |
| PDF | `pdf-parse`, server-side, page-aware |
| Embeddings | `@huggingface/transformers`, `Xenova/all-MiniLM-L6-v2` (384-d, CPU/q8), pinned revision, offline |
| Generation | `LOCAL_RUNTIME=ollama` → local Ollama `qwen3:4b-instruct` (loopback only); `LOCAL_RUNTIME=embedded` → Qwen3 0.6B/1.7B ONNX in-process via Transformers.js |
| Tests | Node built-in test runner over `scripts/check-*.mjs` (offline fakes; no real network/inference) |

## Commands

```bash
npm run dev               # dev server on :3000
npm run typecheck         # tsc --noEmit
npm run lint              # eslint .
npm test                  # all offline suites (234 tests at last run)
npm run test:<suite>      # e.g. test:rag, test:conversations, test:embedded
npm run build             # production build — STOP the dev server first (shares .next/)
npm run start             # production server
npm run models:prepare    # download MiniLM + selected embedded LLM into .setup-cache/ (pinned, no token)
npm run embeddings:prepare # MiniLM only
npm run local:check       # read-only Ollama/model inventory check
npm run release:check -- --runtime
npm run deploy:space -- space <branch> [--dry-run]  # push binary-free snapshot to a HF Space remote
```

Test scripts run with `node --conditions=react-server` so `server-only` imports resolve. Node 24 strips TypeScript types natively; `src/lib` imports use explicit `.ts` extensions.

## Environment (`.env.local`, never committed; template `.env.example`)

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable `sb_publishable_…` only — never service-role/secret keys |
| `LLM_MODE` | `mock` (default) / `local`. `openai` is deliberately disabled |
| `LOCAL_RUNTIME` | `ollama` (default) / `embedded` |
| `LOCAL_MODEL_ID` | `qwen3-0.6b` (default) / `qwen3-1.7b` — allowlist in `src/lib/ai/local-config.ts` |
| `GENERATION_TIMEOUT_MS` | 30000–300000, else 120000 |
| `PUBLIC_DEMO` | exactly `true` shows the shared-CPU notice in chat |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | loopback `:11434` and `qwen3:4b-instruct` only (digest-pinned) |

## Code map

```text
src/app/                 Pages: (auth) login/signup, (protected) dashboard/chat/documents/account/settings; API routes
src/app/api/             documents (upload/ingest/extract/embed/search), chat, conversations, ai/status
src/lib/ai/              provider.ts (mode/runtime select), local-config.ts (allowlists, timeouts),
                         providers/{local(Ollama),embedded,mock,openai}.ts, embedded-model.ts, status.ts, chat-handler.ts
src/lib/rag/             chunking (1200 chars, 200 overlap), prompt assembly (top 5 ≥ 0.30, byte budgets), sources, answer.ts
src/lib/embeddings/      pinned MiniLM config/loader, batch + query embedding
src/lib/retrieval/       validated invoker-RPC vector search
src/lib/knowledge/       transactional ingestion / coordinated deletion
src/lib/conversations/   begin/complete/fail turn protocol, NDJSON streaming (handler.ts), repository
src/lib/storage|pdf|supabase|auth|http|ui/  upload validation, extraction, clients, redirects, client response readers
src/components/          shell, chat (streaming bubble), documents, auth, settings
supabase/                storage/documents.sql (run first), migrations/ (4, in filename order), checks/
scripts/                 check-*.mjs tests, fixture generators, prepare-models, deploy-space
docs/                    architecture, pipelines, security, testing, release, deployment-huggingface, …
```

## Key design rules (keep these)

- **Ownership**: every query relies on Supabase RLS plus explicit owner filters; the browser never supplies owner IDs, embeddings or citations.
- **Grounding**: Documents mode abstains (no generation) when retrieval finds no usable passage; citations come from retrieved chunks, never model text. Auto falls back to General only on a successful-but-insufficient retrieval.
- **Models**: pinned by revision/digest; nothing downloads at runtime (`allowRemoteModels = false`). New models go through the allowlist.
- **Saving**: a turn's answer + evidence is persisted once, after generation. Streaming (`Accept: application/x-ndjson`) sends `delta` events then one `done` event; errors before generation stay plain JSON.
- **Security headers** in `next.config.ts` (`X-Frame-Options: DENY`, nosniff, etc.); same-origin checks on mutations.
- Match surrounding style: compact code, few comments explaining *why*, curly apostrophes (’) in JSX text (lint rejects `'`).

## Deployment

- `Dockerfile` (+ `.dockerignore`) builds one container: locked `npm ci`, `models:prepare`, `next build`, `next start -p 7860` as UID 1000, embedded runtime defaults. Verified locally with Docker.
- Target: Hugging Face Docker Space on **CPU Basic** (Docker Spaces need HF PRO since 2026; CPU Basic itself has no hourly cost — never select paid hardware). Supabase values go in as Space **Variables** (they are build args). Guide: `docs/deployment-huggingface.md`.
- HF rejects plain-git binaries, so use `npm run deploy:space` (omits `docs/screenshots`, sends no history).
- Lockfile must satisfy newer npm (11.19+) used in the image; regenerate with `npx npm@<image npm> install --package-lock-only` if `npm ci` complains.

## Working agreements

- **Ask before every commit and every push** (separately). Explain each change: what, why, how to undo.
- Don't run `npm run build` while the dev server is running in this checkout.
- Never read/print secrets from `.env.local`; never handle the user's tokens or passwords.
- Keep it zero-cost: no paid APIs; HF PRO ($9/mo) is the only accepted paid item.

## Current status (2026-11-09)

- Branch `feat/embedded-llm` (pushed, 4 commits ahead of `main`, no PR): embedded runtime, model-aware UI, streaming answers, Docker/HF deployment files. `main` is unchanged.
- Uncommitted: setup-order fix in `docs/deployment-huggingface.md`.
- Next.js patched 15.5.27 → 15.5.29 (critical GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r); production audit clean. Remaining audit items are dev-only (`minimatch` via typescript-eslint, moderate).
- Open items: HF PRO/Space creation pending; live-site check of proxy origin/redirect handling; two-real-user acceptance test; license choice; refreshed screenshots; PR to `main` after deployment works.
