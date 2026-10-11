# Phase 13 — hardening and release record

Review date: 2026-10-11. Scope: finish the existing local RAG architecture; no new phase, deployment, hosted inference or infrastructure.

## Changes

- Approved patches: Next.js and matching ESLint config 15.5.26 → 15.5.27, without a major upgrade. Targeted approved Next.js/PostCSS override to 8.5.29; no general audit-fix/major upgrades.
- Conditional permission-only migration restricting the existing optional `rls_auto_enable()` helper. No DROP/DELETE/TRUNCATE/UPDATE, policy change or user-data modification.
- Local response parsing/type guards, response-byte cap reuse, sanitized malformed/oversized response errors, connection/start/retry guidance, explicit completed-response validation. Missing/changed/cloud models still fail closed.
- Response security headers and disabled framework identification header; stricter public Supabase URL validation.
- Shared API response reader for document/chat/search UI: expired-session, invalid JSON/HTML and unexpected response handling.
- Current dashboard/auth/chat copy, clear private/local modes, long-text wrapping, bounded history panel, mobile labelled document cards, reduced-motion support and intentional deletion explanations.
- Optional retrieval tools collapsed by default. Existing mock provider and temporary extraction/chunk/embedding inspectors retained intentionally for learning, rather than deleted as dead code.
- Secret-safe configuration/release checker and nine meaningful hardening regressions.
- Portfolio README plus architecture, security, testing, screenshot and release documentation. Module README claims updated for the completed architecture; no personal absolute paths in public docs.

## File inventory

Created:

- `supabase/migrations/20261011053350_restrict_internal_helper_execution.sql`
- `supabase/checks/check-release-security.sql` (read-only catalog verification)
- `src/lib/http/client-response.ts`
- `scripts/check-release.mjs`, `scripts/check-hardening.mjs`
- `docs/architecture.md`, `docs/security.md`, `docs/testing.md`, `docs/release.md`, `docs/phase-13.md`, `docs/screenshots/README.md`
- `docs/screenshots/dashboard.png`, `chat.png`, `mobile-chat.png` (reviewed synthetic content)

Modified:

- `package.json`, `package-lock.json`, `next.config.ts`, `.env.example`, `README.md`
- `src/app/layout.tsx`, `src/app/globals.css`
- `src/app/(protected)/page.tsx`, `chat/page.tsx`, `documents/page.tsx`
- `src/components/app-shell.tsx`, `src/components/auth/auth-form.tsx`
- `src/components/chat/chat-workspace.tsx`, `conversation-history.tsx`
- `src/components/documents/documents-workspace.tsx`, `retrieval-inspector.tsx`
- `src/lib/ai/providers/local.ts`, `openai.ts`, `src/lib/supabase/config.ts`
- `src/types/README.md`, `src/lib/supabase/README.md`, `storage/README.md`, `rag/README.md`, `embeddings/README.md`

`.env.local`, RAG model settings, ingestion/retrieval schemas/policies, and original document/conversation data are preserved. Generated PDFs/proof outputs are ignored under `.setup-cache/phase-13/`.

## Validation record

Final release checks passed after the override and the mobile navigation correction: TypeScript, lint, all **200 tests** (191 existing + nine hardening cases; zero failures/skips), and the production build on Next.js 15.5.27. No real network inference request occurs in automated tests; real cached MiniLM runs locally. A sandboxed rebuild initially returned EPERM while creating `.next` output; the same build passed with filesystem permissions. The loopback inventory diagnostic similarly passed with network permissions. No dependency upgrade was needed for either restriction.

The scoped override is `{ "next": { "postcss": "8.5.29" } }`. npm initially retained a stale nested 8.4.31 package/lock entry; that entry was backed up and selectively refreshed. `npm ls` now verifies Next.js uses the existing root 8.5.29 package. Comparison against the pre-override lock shows only removal of `node_modules/next/node_modules/postcss` at 8.4.31; no unrelated package version changed. Next.js/ESLint config remain 15.5.27. Production audit is zero; full audit retains five development-only entries in one unpatched braces chain, documented in the security guide.

Online `npm ci --dry-run --ignore-scripts` passed without installing anything. Its offline variant could not resolve optional-peer metadata that is unchanged from the repository baseline; this is recorded separately from the successful normal lock consistency check.

Deployed review verified four RLS-enabled application tables, private bucket with PDF MIME/4 MiB constraints, owner chains, and authenticated-only invoker application RPCs. Permission migration succeeded; read-only verification confirms helper client execute is false and application RPC grants unchanged. Performance advisors report no findings. Supabase organization reports Free. Remaining Auth advisory: [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no paid feature is enabled to remove it.

Configured-key scan found zero tracked working files containing the configured keys and no `.env.local`/`.env` tracked history. A final scan of 149 tracked/untracked non-ignored files also found zero configured keys. Configuration check passed without printing values; pinned local artifacts and read-only Ollama inventory/digest check passed with zero downloads/generation/hosted-inference requests.

### Live production acceptance

- Existing real authenticated session survived application reload and production-server restart. Sign-out returned to login; visiting Documents while signed out redirected to the allowlisted login return path. A nonexistent synthetic login produced a sanitized credential error. On 2026-10-11, the account owner signed back in directly; the protected Documents page opened at the intended return path and its authenticated session survived another refresh. Fresh valid sign-in and post-login session persistence passed without credentials being shared in chat.
- Session-free HTTP checks: dashboard/chat/documents returned 307 login redirects; document/conversation APIs returned 401; login/signup returned 200. Responses carried nosniff/frame-denial headers with no framework identification header.
- Uploaded `phase-13-release.pdf` through the normal private Storage flow. Its three physical pages included one blank page. Extraction returned 1,818 readable characters; chunking produced 1,090- and 924-character chunks, source pages `[1]` and `[1,3]`, with the blank page excluded.
- Ingestion persisted one document and two 384-dimensional embeddings. Refresh preserved Ready state. Re-ingestion kept the same document and exactly two chunks.
- Known all-document question retrieved both owned chunks at similarity approximately 0.6602 and 0.6516. Local `qwen3:4b-instruct` correctly identified Cedar-47 and explained that the state setter schedules a render with the updated value. Generation metadata recorded two context passages and 2,365 context bytes; persisted sources matched the retrieved chunk IDs/pages/excerpts.
- A single-document useEffect question returned a grounded local answer with two source passages. An unrelated Florence cathedral question returned insufficient context, zero retrieved/context chunks, `model: null` and an empty source list.
- Six user/assistant messages and original citations restored after browser reload. A second empty conversation showed separate state. Deleting the source preserved historical citations and marked its saved scope unavailable.
- With explicit user approval, the generated PDF and both test conversations were permanently deleted through the app. Read-only verification returned zero document/chunk rows and zero conversation/message rows for the fixture identifiers. No other data was deleted.
- At 375px, a measured 2px navigation overflow was corrected; the rebuilt page measured equal root/scroll widths. Document rows stacked into labelled mobile cards, answers/sources wrapped, Tab focus was visible, and Enter-to-send worked. Reviewed screenshots contain synthetic text and exclude account identifiers.
- Ollama connection refusal, missing model, invalid/oversized response, timeout/cancellation, incomplete generation, saved-question retry and no-fallback behavior passed automated coverage. The user's running Ollama process was not stopped or reconfigured; a manual stop/restart acceptance step remains in the test plan.
- No OpenAI, hosted inference or paid API was called. Existing local models were reused; no Ollama installation/model download, paid Supabase feature, public exposure or deployment occurred.

## Explicit pending gates

- Two real Auth users: pending by user decision; no second confirmed account exists for this acceptance run. Manual plan is in `docs/testing.md`. Existing synthetic/SQL identity/offline tests remain separate evidence.
- Fresh signup/email confirmation was not repeated; no new permanent Auth account was created. Existing-account valid sign-in, sign-out, invalid-login handling and post-login session persistence passed.
- Manual Ollama stop/restart acceptance and full browser zoom/assistive-technology audit were not performed; offline failure regressions and measured mobile checks are separate evidence.
- License decision remains with the project author. No license is silently assigned.
- Internet-facing deployment/abuse isolation remains outside the supported local release. No deployment is performed.

The safe release strategy is a trusted local portfolio walkthrough plus redacted screenshots/source documentation; see `docs/release.md`. Final local readiness is distinct from full public multi-user production certification.
