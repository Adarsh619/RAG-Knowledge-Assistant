# Security review — Phase 13

## Verified controls

| Area | Control |
| --- | --- |
| Authentication | Verified `getClaims()` middleware, verified server `getUser()`, cookie refresh preserved on redirects/errors; no `getSession()` trust |
| Authorization | Explicit server owner filters plus deployed RLS on documents, chunks, conversations and messages; no editable user metadata used for ownership |
| Storage | Private bucket; user folder and object owner must both match; PDF MIME and 4 MiB limit; no overwrite policy |
| Retrieval | Invoker RPC with owner/ready/model filters; foreign scope reveals no chunks; no privileged key |
| Conversations | Parent ownership protects children; narrow column grants; scoped deletes; cascade messages; atomic completion/idempotent request/attempt tokens |
| RPC grants | All six application RPCs invoker, client execute restricted to authenticated; internal auto-RLS helper client execution revoked |
| Input | Actual body byte caps, allowed fields, IDs, file/header validation, bounded top-k/threshold/vector validation |
| Browser | Same-origin mutation checks, allowlisted return paths, text rendering, private/no-store responses, nosniff/frame-denial/referrer/device-permission headers |
| AI | Explicit mock/local selection; disabled OpenAI even with key; no fallback; loopback canonical IP with redirect rejection; reviewed model identity before context |
| Errors/logs | Sanitized handler failures, no raw private context/key/auth-code logging; controlled local-runtime messages |
| Configuration | Blank credential placeholders; ignored/untracked local environment; HTTPS Supabase origin without embedded credentials or path/query |

The permission-only migration conditionally revokes EXECUTE on `public.rls_auto_enable()` from PUBLIC, anon and authenticated. This is an existing dashboard event-trigger helper, not an application RPC. Its definition/event trigger are preserved. No data/table/policy/Storage/Auth modification is performed.

## Trust and limitations

- The local app is intended for trusted learning documents and a small number of users. PDF byte/page/text caps do not provide a hostile-input CPU/memory sandbox. Parser/native inference resource isolation and distributed abuse controls are not implemented.
- Inference guards bound concurrency per process, not across multiple server processes or hosts. There is no production distributed rate limiter. Auth provider quotas do not replace app-level abuse protection.
- Supabase receives PDFs, embeddings and saved evidence; local inference does not mean all data stays offline. Anyone operating the project database with privileged admin credentials can inspect it. Protect dashboard access separately.
- Auth publishable keys may be public; RLS and policies are the permission boundary. Do not use service-role keys or trust user-editable metadata.
- Users can write their own permitted database rows directly through the Data API; the database enforces ownership/constraints, not provenance of self-authored records. Application-generated citations are attached server-side from retrieved evidence. They must not be treated as cryptographically attested evidence.
- Document deletion preserves historical excerpts in chats by design. To remove those copies, delete the corresponding conversations. There is no account-erasure workflow implemented here.
- Prompt instructions reduce unsupported answers and prompt injection, but cannot prove that a model follows them. Sources show model input, not sentence-level entailment. No model tools/network access are enabled.
- No strict nonce-based Content Security Policy is added; Next.js inline scripts require a deliberate compatible policy. Frame denial and MIME/referrer headers provide narrower protections. Do not claim full production hardening.
- Next.js/npm audit should be rerun before each release; a clean audit is point-in-time evidence, not a permanent guarantee.

The final production audit (`npm audit --omit=dev`) reports zero advisories after the approved Next.js 15.5.27 patch and scoped PostCSS 8.5.29 override. The full audit retains five high-severity dependency entries in the development ESLint/fast-glob/micromatch chain, stemming from [braces stack-exhaustion with deeply nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The registry's latest braces version remains 3.0.3, which is affected. These tools consume trusted repository patterns, not uploaded PDFs. No forced framework downgrade/major upgrade is performed to silence this report. Restrict build inputs to trusted code and revisit the upstream fix before any release that handles untrusted build patterns.

## Supabase advisor status

The permission review removed both public/client execution warnings for the helper. The remaining finding is [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). It has not been enabled: do not upgrade the Free project or enable paid Auth features to clear a warning. Use strong unique passwords and protect the project account; review supported Free security settings deliberately.

Current subscription was verified as `free` / `tier_free`. No project plan, compute, add-on, SMTP service or paid feature was changed.

## Secret handling and release hygiene

Before publishing, run `git check-ignore .env.local` and `git ls-files -- .env.local` (the latter must be empty). Review staged files without printing actual keys. Exclude `.setup-cache/`, PDFs, recordings with private content, session exports, tokens and environment files. Only `.env.example` is intended for Git. Never paste secrets into this project's documentation or a support conversation.

Server-local Ollama must remain bound to loopback. Disable cloud features in its separate process; do not expose port 11434, use a tunnel, add a remote origin or loosen the model guard for convenience.

## Real-user acceptance

The owner boundaries have automated/offline and deployed database checks. The separate two-real-Supabase-user browser check remains pending at the user's request because a second confirmed account is unavailable. Follow [the manual test plan](testing.md) before asserting public multi-user release readiness.
