# Groundwork — RAG Knowledge Assistant

A learning and portfolio project built incrementally with Next.js, TypeScript, and Tailwind CSS. **Current scope: Phase 11 — local document RAG with trustworthy source metadata and expandable evidence.** Earlier phase sections are historical; the Phase 11 section below describes the current source contract. The manually installed Ollama qwen3:4b-instruct model remains unchanged.

## Run locally

Use Node.js 24 and npm for the app and local tests. Current Supabase libraries require Node.js 22 or newer, and the test scripts use Node.js 24's built-in TypeScript support. This project is validated with Node.js 24.13.0. The foundation uses Next.js 15.5.26 (App Router), React 19, and Tailwind CSS 4.

```powershell
npm install
npm run embeddings:prepare
npm run dev
```

Open http://localhost:3000/login, or the URL printed by Next.js if that port is occupied. Stop a production preview on the same port before starting development.

No LLM API key, credits, or payment method is needed. Supabase authentication and Storage use the existing Free-plan project URL and public publishable key in `.env.local`. The exact names are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; do not use a private secret/service-role key. If `LLM_MODE` is unset or blank, chat defaults to `mock`. The safe default below can be explicitly changed to local using the Phase 10 configuration; preserve existing local Supabase values:

```dotenv
LLM_MODE=mock
```

`.env.example` includes this setting and an empty `OPENAI_API_KEY` placeholder. `.gitignore` excludes `.env.local` and all other `.env*` files except the example. Never paste a key into a chat, source file, README, or Git. Restart the server after changing environment settings.

## What works now

- `/`: dashboard with links to the private library and knowledge-base capabilities; conversation count remains a placeholder.
- `/chat`: working mock chat by default; explicitly configured local mode connects authenticated retrieval, grounded context and a loopback-only Ollama provider, with all-document/single-document scope.
- `/documents`: private PDF upload/listing, local extraction, chunk and embedding inspection, persistent ingestion/re-ingestion, coordinated owner deletion and a semantic retrieval inspector.
- Shared responsive navigation, active-page indication, and skip-to-content link.
- `/login` and `/signup`: email/password authentication; application pages, chat API, and document API require a verified session.

Enter sends a message; Shift+Enter adds a new line. Empty/whitespace-only messages are blocked in both the UI and API. Messages are limited to 4,000 characters in mock mode or 1,000 in local RAG mode. Rapid duplicate sends are blocked while waiting. A failed request restores the draft for retry. Each request sends only the current question; earlier conversation messages are not model context.

Chat messages live in React state only. Refreshing or leaving chat clears them. Supabase Auth owns user/session records and the SSR SDK maintains session cookies. PDFs persist in private Storage. **Ingest** persists document metadata, chunk text/pages/offsets and local 384-dimensional embeddings in PostgreSQL. Extraction/embedding previews, retrieval questions/results and generated answers exist only in request/React memory. Public embedding model files are cached in ignored `.setup-cache`. OCR, polished citations and conversation persistence remain outside this phase.

## Files created or modified in Phase 2 (historical locations)

Created:

```text
.env.example                          Safe configuration placeholders
src/types/chat.ts                     Shared chat/provider contracts
src/lib/ai/provider.ts                Server-side provider selection
src/lib/ai/providers/mock.ts          Active local response implementation
src/lib/ai/providers/openai.ts        Disabled future integration point
src/app/api/chat/route.ts             POST /api/chat
src/components/chat/chat-workspace.tsx Interactive chat UI
scripts/check-chat.mjs                Local contract and no-network checks
```

Modified:

```text
src/app/chat/page.tsx                 Server configuration + chat component
src/components/app-shell.tsx          Phase 2 labels
src/app/page.tsx                      Dashboard note about mock chat
src/lib/ai/README.md                  Provider integration notes
src/types/README.md                   Shared types explanation
package.json                         server-only, test script, ESM module type
package-lock.json                    Dependency lockfile
tsconfig.json                        Explicit .ts import support for local tests
README.md                            Setup, architecture, verification
```

The existing `.gitignore` already ignores `.env.local`; it needed no changes. `server-only` is a tiny build-time boundary marker, not an AI SDK. No OpenAI SDK or RAG framework was added.

The Supabase folder contains Phase 3 authentication utilities. `src/lib/rag/` now contains the Phase 6 manual chunking utility.

## Chat request/response flow

```text
ChatWorkspace (browser)
  → POST /api/chat with { message }
  → Middleware and route verify the authenticated user
  → API validates JSON, trims text, checks length
  → getLlmProvider() selects from server-side LLM_MODE
  → mockProvider.reply(message) generates a local string
  → API returns { mode, message: { role, content } }
  → ChatWorkspace appends the assistant bubble
```

The browser's only application request for a reply is a relative `fetch("/api/chat")`, so it goes to the same Next.js server. The browser does not choose a provider or receive a key.

Example request:

```json
{ "message": "Hello, backend!" }
```

Example success response (content shortened):

```json
{
  "mode": "mock",
  "message": {
    "role": "assistant",
    "content": "Local mock response — no AI model was called. ..."
  }
}
```

Validation failures return HTTP 400 with `{ "error": "..." }`. Disabled/unsupported providers return 503. Unexpected provider failures return a generic 500 response, without stack traces or provider internals. The browser displays errors and clears the loading state, and a 15-second timeout prevents indefinite waiting.

## Important code

`app/(protected)/chat/page.tsx` remains a Server Component. It reads the selected mode and provider availability on each request (`force-dynamic`) and passes only those non-secret values to `ChatWorkspace`. This also makes the status reflect runtime configuration when using a production build.

`ChatWorkspace` is a Client Component because it manages draft text, messages, loading, and errors with React state. `sending.current` blocks double submission before React has updated the button. React renders message text as text; it does not execute HTML from a message.

`LlmProvider` defines `mode`, `enabled`, and `reply(message): Promise<string>`. The API uses this contract rather than depending on an external service. Shared types live in `src/types/chat.ts`, which is safe to import in both client and server code.

All provider modules import `server-only`. Next.js rejects importing these modules into a Client Component, helping keep future provider secrets on the server. Explicit `.ts` import paths allow Node.js 24 to execute the source in the local validation script; `allowImportingTsExtensions` enables them in this no-emit TypeScript project.

The mock's 600 ms delay is a local timer that makes loading visible. Its response echoes the submitted message and explicitly identifies itself as a development confirmation. It does not claim to answer a question using AI.

## Why this cannot create OpenAI usage

- Missing/blank `LLM_MODE` defaults to `mock`.
- A key's presence never selects a provider. Application code does not read `OPENAI_API_KEY` yet.
- `mock.ts` contains no HTTP call or SDK call.
- `openai.ts` has `enabled: false` and a `reply()` that throws without network access.
- The API checks availability before calling `reply()`. `LLM_MODE=openai` returns 503 even if a key exists.
- Unsupported modes return an error instead of falling back to another provider.
- There is no OpenAI SDK, external LLM endpoint, or working external LLM request path in Phase 2.

Actual OpenAI model usage would require an authenticated request to a model endpoint, such as an SDK generation call. Setting an environment variable, defining an interface, reading documentation, or returning a local mock string does not generate model usage.

API keys belong on the server because browser JavaScript and requests are inspectable. See [OpenAI's official API guidance](https://developers.openai.com/api/reference/overview). Future keys must use server environment variables, never a `NEXT_PUBLIC_` variable.

## How OpenAI can be enabled later

Only after an explicit decision to allow real API usage: implement the OpenAI module's `reply()` with a server-side SDK call and error handling, deliberately set that provider's `enabled` flag to true, and configure `LLM_MODE=openai`. Read `OPENAI_API_KEY` only inside the server module. The UI and API contract already support both provider names and availability; their structure does not need to change.

**Changing `LLM_MODE` alone does not enable OpenAI in this phase.** Do not run an OpenAI connectivity test. Keep `LLM_MODE=mock` for zero-charge development.

## Verify Phase 2

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:chat
npm run build
```

`test:chat` runs the pure chat handler and providers in-process, using Node.js 24. It blocks fetch, HTTP, HTTPS, TCP, and TLS before testing. It checks default/explicit mock mode, a dummy key, input validation, disabled OpenAI mode, unknown configuration, and safe provider errors. It asserts **zero attempted outbound requests**, not just zero successful requests. No real key is used for these tests.

After building, use `npm start` to serve the production app. Do not run a build and a development server against the same `.next` directory at the same time.

Manual checks:

1. Open `/chat`. Confirm **Mock mode · no external LLM calls** appears.
2. Submit `Hello, backend!`. Confirm a user bubble, local loading status, and an assistant reply beginning **Local mock response — no AI model was called**.
3. Submit a second message with Enter. Confirm another reply. Use Shift+Enter to test a multiline draft.
4. Try spaces only. The send button remains disabled.
5. Refresh. The visible conversation should clear.
6. In browser DevTools → Network, inspect the POST to `/api/chat`. Its response includes `"mode": "mock"`. This shows the server's selected provider. There should be no LLM-domain request from the browser.
7. Review the server-only provider files and run `npm run test:chat` to check the server boundary; browser network logs alone do not show server-side requests.
8. To exercise the network error UI, stop the local server after loading the page and send a message. Confirm an error appears, loading ends, and the draft is restored. Restart with mock mode before retrying.
9. Optionally set only `LLM_MODE=openai` and restart. The page must show that the provider is disabled, and a local POST must return 503. No key is needed; this tests the block, not OpenAI connectivity. Return to `LLM_MODE=mock` and restart.

## Development phases

Phase 2 verification completed: TypeScript, lint with zero warnings, production build, and all eight local tests passed. Browser checks verified button/Enter submission, multiple mock replies, loading, whitespace prevention, refresh clearing, network error/draft recovery, and mobile/desktop layouts. The built app returned `mode: mock` in a real localhost request and returned 503 with a disabled composer when configured as `openai`. The validation guards observed zero outbound network attempts, and the provider source contains no working external LLM call. No OpenAI API usage was generated by this project or these checks. The final preview was restored to mock mode.

1. Project foundation and UI structure — completed
2. Basic chat architecture without RAG, local mock provider — completed
3. Supabase authentication — completed
4. PDF upload and Supabase Storage — completed
5. PDF text extraction — completed (current scope)
6. Document chunking and metadata
7. Embedding generation
8. pgvector database setup
9. Semantic/vector similarity search
10. Full manual RAG pipeline
11. Source citations
12. Conversation history and document management
13. Error handling, security, UI improvements, and Vercel deployment

**Stop after reviewing and testing Phase 5. Phase 6 requires a separate instruction.** No LangChain, LangGraph, agents, or RAG frameworks are used.

## Phase 3 authentication

The public routes are `/login`, `/signup`, and `/auth/callback`. The dashboard, `/chat`, and `/documents` now live in `src/app/(protected)/` and require a signed-in user. Route-group names in parentheses do not appear in URLs. Root layout supplies HTML/global styling, the auth layout supplies a focused form, and the protected layout supplies the existing dashboard shell.

Authentication flow:

```text
Browser signup/signin form
  → Supabase Auth using the project URL + publishable key
  → Session cookies managed by @supabase/ssr
  → Next.js middleware verifies/refreshes the session
  → Protected layout confirms the user with getUser()
  → Dashboard/chat/documents
  → Browser signOut({ scope: "local" })
  → Session removed from this browser → login
```

With email confirmation enabled, sign-up shows a check-email success state instead of pretending the user is signed in. The confirmation link returns to `/auth/callback`; its one-time PKCE code is exchanged for session cookies. The same browser must hold the verifier cookie from sign-up. The default Supabase email template works with this flow; template customization is not required.

The project URL selects the Supabase instance. The publishable key is designed for public applications; it does not grant service-role privileges or substitute for a user session. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used. No secret, service-role, or legacy anon key is used. No private key or password is stored in source or documentation.

The browser runs email/password form submission and sign-out, and displays pending, success, and error states. The SDK manages cookie storage. Server middleware runs `getClaims()` to verify identity and refresh expiring tokens. Both the request and response receive refreshed cookies. `getUser()` runs in the protected layout and chat API to get a server-confirmed user. No authorization decision trusts `getSession()` or user-editable metadata. Auth responses are marked private/no-store, and redirects preserve cookie/cache headers.

The chat API now rejects unauthenticated requests before entering `src/lib/ai/chat-handler.ts`. This is the former Phase 2 handler, separated so its cost protection can still be tested with all network calls blocked. Authentication may contact the Supabase Auth service; the LLM provider remains local. No OpenAI implementation was enabled.

### Supabase Free setup

1. Keep the existing project on Free; no upgrade or paid add-on is required or enabled.
2. Keep the two real public configuration values only in the ignored `.env.local` file. The `.env.example` values stay empty. Preserve `LLM_MODE=mock` and the empty `OPENAI_API_KEY`.
3. Use Supabase Auth → URL Configuration to set the development Site URL to `http://localhost:3000` and allow `http://localhost:3000/**`. If you use `127.0.0.1` instead, allow `http://127.0.0.1:3000/**` as well. Use a consistent hostname throughout a sign-up/confirmation flow.
4. Keep email/password authentication and email confirmation enabled. Use your organization member email for the live check: the default sender only sends to project team addresses and has a small rate limit. No custom SMTP provider is required for this learning phase. See [Supabase email guidance](https://supabase.com/docs/guides/auth/auth-smtp).
5. Do not customize templates or turn on paid auth features. New Free projects using the default sender cannot customize templates, and this implementation does not need them. See [the template policy](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

The existing local configuration was found as `.env.local.txt` and renamed to `.env.local`. Its content hash was verified unchanged. No values were printed. Git confirmed `.env.local` is ignored and untracked.

### Phase 3 file inventory

Created:

```text
src/lib/supabase/config.ts                  Public configuration validation
src/lib/supabase/client.ts                  Browser cookie client
src/lib/supabase/server.ts                  Server cookie client/current user
src/lib/supabase/middleware.ts              Refresh and route decisions
src/lib/auth/redirect.ts                    Safe local return destinations
src/middleware.ts                          Next.js 15 middleware entry point
src/components/auth/auth-form.tsx           Sign-up/sign-in states and requests
src/components/auth/resend-confirmation-form.tsx  Fresh confirmation link recovery
src/components/auth/sign-out-button.tsx     Sign-out states and request
src/app/(auth)/layout.tsx                   Public form layout
src/app/(auth)/login/page.tsx               Sign-in page
src/app/(auth)/signup/page.tsx              Sign-up page
src/app/(protected)/layout.tsx              Verified-user guard + app shell
src/app/auth/callback/route.ts              Confirmation code exchange
src/lib/ai/chat-handler.ts                  Existing pure mock chat handler
scripts/check-auth.mjs                      Offline SDK/middleware checks
```

Moved without changing page URLs or page UI:

```text
src/app/page.tsx            → src/app/(protected)/page.tsx
src/app/chat/page.tsx       → src/app/(protected)/chat/page.tsx
src/app/documents/page.tsx  → src/app/(protected)/documents/page.tsx
```

Modified: `src/app/layout.tsx`, `src/components/app-shell.tsx`, `src/app/api/chat/route.ts`, `scripts/check-chat.mjs`, `package.json`, `package-lock.json`, `.env.example`, `src/lib/supabase/README.md`, and `README.md`. The local-only environment file was renamed, not edited. `.gitignore`, AI providers, and RAG placeholders required no changes.

The official packages are pinned to `@supabase/supabase-js` 2.117.3 and `@supabase/ssr` 0.12.7 in the lockfile. No application/profile tables, migrations, buckets, Storage calls, PDF features, embeddings, vectors, or RAG were added.

### Verify Phase 3

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:chat
npm run test:auth
npm run build
```

The auth tests use the actual SDK and middleware with an offline fake Auth service. They verify confirmation-required sign-up, PKCE confirmation resend and rate-limit errors, invalid credentials, cookie persistence, signed-in/out route behavior, safe redirects, token verification, refresh, and sign-out. Every fixture request is intercepted before network I/O; no real user or real project is used. The chat checks continue to assert zero outbound attempts from the LLM handler.

Live checklist (enter account credentials directly in the app, never in chat):

1. Signed out: visit `/`, `/chat`, and `/documents`; each must redirect to login. `/api/chat` must return JSON 401.
2. Sign up using the project team email. Confirm email if required; open the link in the same browser. Verify the success/pending state.
3. Sign in. You should return to the intended page, such as `/chat`.
4. Enter invalid credentials once. Confirm an error, ended loading, and enabled form.
5. Refresh while signed in. Access should remain authenticated.
6. Navigate to all three protected pages. They should render and show a Sign out control.
7. Send a chat message. Verify the mock badge and `mode: mock` in the local response. No LLM-domain request should occur.
8. Sign out, then retry the protected URLs and browser Back. Protected content should not remain accessible.

Successful live sign-up/sign-in and account-session tests require the user to enter their password and complete any email verification. Offline fixture results must not be described as a completed live account check. Read-only public route checks and invalid-login checks can be performed independently.

### Recover an expired confirmation link

Try signing in first: a previously consumed link may have already confirmed the email. If sign-in says the email is unconfirmed, expand **Resend confirmation email** on `/login`, enter the account email directly in the app, and request a fresh link once. Use only the newest email and open its link in the same browser/profile and on the same hostname used for the resend. The SDK supplies a new PKCE challenge/verifier, and `/auth/callback` exchanges the resulting code. Do not share the confirmation URL or its tokens.

The resend form has a 60-second retry cooldown; Supabase independently enforces its sender limits, including an hourly limit. No email is sent automatically. Check Auth → URL Configuration for the local callback allowlist if the link redirects to the wrong page. Repeatedly requesting emails can invalidate older links and reach the sender limit.

Email security scanners can consume one-time links before you click them, producing an invalid/expired error. If this repeats, check the account's confirmation status in Supabase Auth → Users and try signing in. See [Supabase's email prefetch guidance](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching). Email confirmation stays enabled; this phase requires no paid sender or template customization.

### Phase 3 verification results

TypeScript, lint with zero warnings, the production build, all 17 offline auth tests, and all eight chat tests passed. The user created the live account and received the confirmation email. Although the confirmation link reported invalid/expired, signing in with the existing account succeeded; the account was confirmed. The exact cause of the link error was not established.

Browser checks verified authenticated access to `/`, `/documents`, and `/chat`; session persistence after dashboard/chat refresh; a signed-in `/login?next=/chat` redirect; and an authenticated request producing the explicit local mock reply. Sign-out returned to login, browser Back did not reveal protected content, and `/documents` again redirected to login. Signed-out page/API/callback behavior and live invalid-credentials handling were also verified. Confirmation resend is validated offline without consuming another live email quota.

The chat provider still makes no external LLM request. Its network-blocking tests observed zero attempts, and OpenAI remains disabled. Only basic Supabase Auth was used in Phase 3 live authentication checks; no paid add-on or paid API was used or enabled by that implementation.

## Phase 4 — private PDF storage

The Documents page now supports PDF selection, upload, persistent listing, and owner deletion. File names, sizes, and upload dates come from Storage metadata. The list loads 50 files at a time and has a **Load more documents** control. The dashboard links to this library and does not pretend it has a live document count.

### Why Storage and a private bucket

Supabase Storage holds the original PDF bytes. PostgreSQL stores structured rows, and Supabase's existing Storage tables already record object paths, owners, sizes, and timestamps. Phase 4 therefore creates **no application/profile/document table**. Later extraction/indexing phases can read these private files and associate chunks with their object paths; no PDF content is processed now.

The `documents` bucket is private with `file_size_limit = 4194304` (4 MiB) and `allowed_mime_types = ['application/pdf']`. This is below the Free plan's per-file ceiling and keeps this simple server-upload design small. No paid compute, add-on, sender, branch, or API is required. The connected organization's Free plan was verified before setup.

Objects use `user-id/random-uuid--sanitized-name.pdf`. The server obtains the user ID from `auth.getUser()`, generates the UUID, removes directory components, converts unsafe filename characters to hyphens, limits the basename to 100 characters, and appends `.pdf`. This prevents path traversal and collisions. The list displays the sanitized filename rather than the UUID. The original spelling is not stored in a separate table.

### Policies and ownership

`supabase/storage/documents.sql` contains the exact setup applied to the existing development project. It creates the bucket and three policies on Supabase's existing `storage.objects` table:

| Operation             | Required conditions                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INSERT/upload         | `authenticated` role; `documents` bucket; first folder equals `auth.uid()`; `owner_id` equals `auth.uid()`; exactly one folder; safe generated PDF filename |
| SELECT/list/read      | `authenticated` role; same bucket; both first folder and `owner_id` equal `auth.uid()`                                                                      |
| DELETE                | Same owner conditions as SELECT                                                                                                                             |
| UPDATE/overwrite/move | No policy granted; uploads use `upsert: false`                                                                                                              |

The app uses the publishable key and the normal user's session. Running a Storage request on the server does **not** bypass RLS. Bucket/policy provisioning uses the connected developer tool, not a service-role key in the application. Public file URLs and signed sharing URLs are not created. Do not add a broad permissive Storage policy later: permissive policies combine with OR and can undo owner isolation.

Both the API and RLS reconstruct/check the user's folder. DELETE accepts only a generated document ID, never an arbitrary storage path or supplied owner ID. Actual file deletion uses `storage.remove()` so the object and metadata are handled by Storage; the application never deletes `storage.objects` rows directly.

### Upload and request flow

```text
Authenticated user selects a PDF on /documents
  → Browser checks extension, MIME type, nonempty size, and 4 MiB limit
  → POST /api/documents with one multipart file
  → Middleware refreshes/verifies the session
  → Route verifies the user with getUser()
  → Server bounds the request stream and independently validates the file
  → Server checks the first five bytes for %PDF- (no PDF parsing)
  → Generate user-id/uuid--safe-name.pdf
  → Upload to the private documents bucket with the user's session
  → Bucket restrictions and owner INSERT policy are enforced
  → Return success and GET /api/documents refreshes the list
```

The server bounds actual request bytes even if Content-Length is missing or misleading. Multipart overhead is limited to a small allowance above the file cap. Upload accepts exactly one file and rejects extra owner/path fields. Unsupported files, empty files, oversized files, and disguised files without a PDF header are rejected before Storage is called. Browser validation is only an early usability check.

The extension/MIME/header checks identify the expected format; they do not prove an entire PDF is well formed. Bucket MIME restrictions also depend on the declared content type. Full parsing and text extraction belong to later phases. Uploaded files remain private even when a caller bypasses the app and contacts Storage directly.

GET `/api/documents?offset=0` returns names/sizes/dates and the next offset. DELETE `/api/documents` accepts JSON `{ "id": "generated-object-filename.pdf" }`, checks origin and authentication, and removes only the reconstructed owner path. All document API responses are `private, no-store`. The UI shows loading, success, errors, retry, and a delete confirmation. Its upload indicator is an honest pending state rather than a made-up percentage.

### Phase 4 file inventory

Created:

```text
src/types/document.ts                         List/mutation contracts
src/lib/storage/documents.ts                   Limits, validation, safe names
src/lib/storage/document-handler.ts            List/upload/delete handlers
src/lib/storage/README.md                      Storage architecture notes
src/app/api/documents/route.ts                 Authenticated GET/POST/DELETE
src/components/documents/documents-workspace.tsx  Upload and library UI
supabase/storage/documents.sql                Bucket and owner-policy setup
supabase/storage/check-ownership.sql          READ ONLY live isolation check
scripts/check-storage.mjs                     Offline SDK/API security checks
scripts/storage-fixtures.mjs                  Generated public PDF fixture
scripts/create-storage-test-files.mjs          Ignored local validation files
```

Modified: `src/app/(protected)/documents/page.tsx`, `src/app/(protected)/page.tsx`, `src/components/app-shell.tsx`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/README.md`, `scripts/check-auth.mjs`, `package.json`, and `README.md`.

No application dependency was added. Existing pinned Supabase SDKs provide Storage. The lockfile, environment files, AI providers, auth forms, and RAG placeholders are unchanged. Prettier was run as a pinned temporary formatting tool rather than an application dependency.

### Verify Phase 4

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:chat
npm run test:auth
npm run test:storage
npm run build
npm run test:storage:fixtures
```

The Storage tests use the real SDK with an offline fake service. They check authentication failure, PDF constraints, bounded streams, safe names, forged owner/path rejection, cross-origin rejection, metadata listing, pagination, owner deletion, and safe errors. The user-A/user-B fixture validates API path scoping; it is not a substitute for testing the deployed RLS policies. No real project or LLM is contacted by these tests.

Generated disposable files are placed in the ignored `.setup-cache/storage-tests/` directory. Live checks:

1. Sign in with the existing account directly in the app. Never paste credentials or session tokens into chat.
2. Upload `phase-4-storage-test.pdf`. Verify the success state and a row with filename, byte size, and upload date.
3. Refresh the page. The row should remain, since the source of truth is Storage rather than React state.
4. Select `unsupported.txt` and `oversized.pdf`: the browser should reject them. The automated handler tests independently verify server rejection.
5. Upload `disguised.pdf`: the server must reject its missing PDF header and leave the list unchanged.
6. Run the READ ONLY isolation check with an existing disposable test PDF. It reduces the SQL role to authenticated/anon and tests the real SELECT policy with owner, different-user, and signed-out identities. It creates no account and changes no Storage row or file byte. Owner deletion is tested through the app, not by SQL metadata manipulation.
7. Delete the disposable PDF through its row's confirmation control. Verify it disappears, including after a refresh.
8. Signed out, document API requests must return 401 and `/documents` must redirect to login.
9. Send a chat message and check the mock badge/local reply. Keep `LLM_MODE=mock` and the empty OpenAI key; the chat tests still block all attempted outbound LLM requests.

Setup already applied to this development project: do not rerun the one-time bucket/policy script here. A clone targeting a different project can review and apply it in that project's SQL editor or trusted developer tooling. Inspect existing policies before applying it to a project that already has Storage configured.

Supabase advisors also reported pre-existing grants on the project's `rls_auto_enable` helper and disabled leaked-password protection; these were present before the bucket setup. No paid Auth feature was enabled. The Storage setup created only the three owner policies described above. See [helper-grant guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) for later review.

References: [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [RLS access control](https://supabase.com/docs/guides/storage/security/access-control), [object ownership](https://supabase.com/docs/guides/storage/security/ownership), and [file limits](https://supabase.com/docs/guides/storage/uploads/file-limits).

### Phase 4 verification results

Phase 4 is complete. TypeScript, lint with zero warnings, the production build, 18 offline Storage tests, 17 auth tests, and eight chat tests passed.

Live browser checks with the existing account verified uploading the generated 603-byte `phase-4-storage-test.pdf`, its filename/size/upload-date listing, and persistence after refresh. Unsupported and oversized selections were rejected. A disguised `.pdf` reached the API and was rejected for its missing PDF header. Deleting the disposable PDF through the app succeeded, and it remained absent after refresh. The existing chat returned its explicit local mock response.

The read-only SQL check passed against the deployed Storage policies: the authenticated owner could read the uploaded test object, while a different user ID and the anonymous role could not. This used temporary SQL roles/identity claims, not a second real account, and changed no Storage rows or bytes. Offline API checks also verify that another user's deletion path cannot target the owner's object. Cookie-free requests to the running app returned 401 for document GET/POST/DELETE and redirected `/documents` to login.

The user's one-time authorization covered this Phase 4 read-only ownership check and app deletion of the generated disposable test PDF. The earlier SQL metadata-write test was replaced by `supabase/storage/check-ownership.sql`; only its read-only version was executed for the completed ownership check.

`LLM_MODE=mock` remains active, the OpenAI key remains empty, and the network-blocking chat tests observed zero outbound attempts. No OpenAI request or usage was generated by Phase 4 implementation or validation. Only basic Storage/Auth operations on the verified Supabase Free plan were used; no paid external API, upgrade, or paid add-on was enabled. `.env.local` and the generated fixtures remain ignored by Git. No application table, PDF extraction, or RAG feature was added. Phase 5 requires a separate user instruction.

References: [SSR clients and session verification](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [password authentication](https://supabase.com/docs/guides/auth/passwords), [publishable keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Phase 5 — PDF text extraction

The Documents page has an **Extract text** action for each stored PDF. It shows page and character counts, the number of pages without text, and a compact preview. The server parses locally with pinned `pdf-parse` 2.4.5. No model, OCR, paid processing service, or database is involved.

A PDF stores page drawing instructions, glyph positions, fonts, and compressed streams, rather than a ready-to-use plain-text document. A text-based PDF contains text the parser can decode. An image-only/scanned PDF contains pictures of text; recognizing those letters requires OCR, a separate step outside Phase 5. A successful parse with no text returns a helpful `no_text` result. Malformed or password-protected files return a clear error.

### Extraction flow and important code

```text
Select Extract text on an existing document
  → POST /api/documents/extract with { id }
  → Middleware verifies/refreshes the session
  → Route verifies the user with getUser()
  → Validate ID, origin, and the bounded JSON body
  → Reconstruct verified-user-id/document-id
  → Download from private Storage using the normal user session
  → Existing owner SELECT policy enforces access
  → Check the downloaded size and PDF header
  → Local parser obtains page count and extracts each page
  → Return document identity, page text/numbers, and statistics
  → Render the small text preview in React state
```

`extract-text.ts` is server-only. `getData()` supplies the installed worker locally, avoiding a CDN request and Windows worker-path issues. Next.js uses `serverExternalPackages` for the library and its native dependency. The application calls only information/text methods, not image extraction or rendering. Evaluation and worker fetch are disabled. `finally` destroys parser resources after success or failure.

`extraction-handler.ts` accepts only a generated ID, never a supplied owner or arbitrary path. Downloads use `cache: no-store`, and responses use `Cache-Control: private, no-store`. The handler reuses existing bounded-body/origin helpers. It never logs document content or credentials. Missing and inaccessible objects share a generic error. The route revalidates the user independently of middleware; no privileged Supabase key is used.

Page numbers are 1-based physical PDF page indexes, not necessarily printed page labels. Empty pages remain in the result. Character statistics count JavaScript string length, not LLM tokens. Extraction accepts up to 100 pages and 200,000 decoded characters while keeping the existing 4 MiB input limit. Exceeding an extraction limit returns an error rather than silently dropping later pages. These limits bound accepted results, not arbitrary parser CPU/memory use.

The UI shows up to three nonempty pages and 1,500 characters per page; the response retains all accepted page text. It displays text through React rather than executing HTML. Results clear on refresh/navigation or Close preview, and deleting the matching file clears its preview. There is no persistence. Reading order, columns, and spacing can differ from the source PDF; extraction does not reproduce the original layout.

The returned `pages: [{ pageNumber, text }]` prepares later chunking to retain source-page metadata. No chunks, embeddings, vectors, retrieval, or RAG are generated in this phase.

### Phase 5 file inventory

Created:

```text
src/types/extraction.ts                        Page/result contracts
src/lib/pdf/extract-text.ts                    Server-only local parser
src/lib/pdf/extraction-handler.ts              Owner download/validation
src/lib/pdf/README.md                          Architecture and limitations
src/app/api/documents/extract/route.ts          Authenticated POST endpoint
src/components/documents/extraction-preview.tsx  Small text/statistics preview
scripts/check-pdf.mjs                          Real-parser/offline SDK checks
scripts/pdf-fixtures.mjs                       Synthetic text/image/corrupt PDFs
scripts/create-extraction-test-files.mjs       Ignored live-test files
supabase/storage/check-extraction-ownership.sql  READ ONLY deployed-policy check
```

Modified: `src/components/documents/documents-workspace.tsx`, `src/components/app-shell.tsx`, `src/app/(protected)/page.tsx`, `src/lib/storage/documents.ts` (header check accepts downloaded Blobs as well as Files), `src/lib/storage/document-handler.ts` (export existing request helpers), `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `scripts/check-auth.mjs`, `next.config.ts`, `package.json`, `package-lock.json`, and `README.md`.

The environment files, bucket/policies, AI providers, auth forms, and RAG placeholders are unchanged. No SQL setup or new application table is required. The additional SQL file performs only a read-only ownership check with temporary roles and identity claims.

### Verify Phase 5

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:pdf
npm run test:storage
npm run test:auth
npm run test:chat
npm run build
npm run test:pdf:fixtures
```

The 19 PDF checks run the actual parser against generated normal, sparse, blank, image-only, corrupted, excessive-page, and excessive-text PDFs. The official Storage SDK is intercepted by an offline fixture for authentication, owner-path isolation, invalid IDs, origin/body limits, download failures, and private responses. Network guards block fetch/HTTP/HTTPS/TCP/TLS and assert zero outbound attempts. The simulated different-user API test does not replace deployed RLS verification or claim that a second real account was used.

Live checks:

1. Sign in directly in the app. Upload `phase-5-text-test.pdf` from the ignored `.setup-cache/extraction-tests/` directory.
2. Click Extract text. Verify two readable pages, their page numbers, and accurate statistics. No new file or database row should be created.
3. Refresh. The stored file remains, while its text preview clears. Extract again to repeat the server pipeline.
4. Upload/extract `phase-5-image-only.pdf`: expect the no-text message. `phase-5-little-text.pdf` should return `OK` rather than report empty text.
5. Upload/extract `phase-5-corrupted.pdf`: upload can accept its PDF header, but full parsing must return the corrupted/unsupported error and end loading.
6. Verify another identity cannot read the first user's object under the existing Storage policy, and that the API never accepts another owner's path.
7. Test normal listing, refresh, and deletion of disposable files through the app. Enter no credentials in chat.
8. Signed-out extraction should return JSON 401. Existing login/session and mock chat should still work.

References: [pdf-parse](https://github.com/mehmet-kozan/pdf-parse), [Next.js/worker setup](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/troubleshooting.md), [parse parameters](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/options.md), [private Storage download](https://supabase.com/docs/reference/javascript/storage-from-download).

### Phase 5 verification results

TypeScript, lint with zero warnings, and the production build passed. All 62 automated tests passed: 19 PDF/pipeline checks, 18 Storage checks, 17 auth checks, and eight mock-chat checks. The parser's network guards and the chat guards recorded zero outbound attempts. The build includes the protected `/api/documents/extract` route.

Live checks used the retained existing-account session and generated fixtures only. The owner's stored normal PDF extracted two readable pages and 70 characters, including physical page numbers. An image-only PDF returned zero characters and the no-text explanation; a sparse PDF returned `OK` and two characters; a deliberately corrupted PDF returned the safe parsing error and ended loading. The library remained persistent across navigation/refresh, while extraction previews cleared on refresh. Extraction of the normal PDF also succeeded again after navigation.

The read-only deployed-policy check passed for owner access and denial to a different user ID and the anonymous role. It used temporary SQL identities, not a second real account, and changed no Storage row, file, account, or policy. Combined with the offline owner-path and forged-ID checks, this verifies that the extraction route cannot request another owner's PDF using the normal authenticated Storage client. Cookie-free live requests returned 401 for extraction and redirected the Documents page to login.

The user approved deletion of the four named generated Phase 5 fixtures through the app. Each was deleted using its confirmation control. Deleting the last file also cleared its active text preview, and the library stayed empty after refresh. No other file was deleted. The live chat returned its explicit local mock response.

One listing request failed and one upload returned a session error during live testing. Refresh and retry restored authenticated access and the requests succeeded; their underlying cause was not established. The error states remained usable and did not expose private service details.

`LLM_MODE=mock` is still active, `OPENAI_API_KEY` remains empty, `.env.local` remains ignored, and existing environment values were neither changed nor printed. No OpenAI request or API usage was generated by this work. No paid external API, OCR service, Supabase upgrade, or paid add-on was used or enabled. No application table, extracted-text persistence, chunking, embeddings, vector feature, or RAG was added. Stop after Phase 5; Phase 6 requires a separate instruction.

## Phase 6 — Document chunking and metadata

RAG needs small, relevant passages: one vector for a whole PDF can blur unrelated topics and exceed an embedding model's input limit. Too-small chunks lose context, while too-large chunks reduce retrieval precision. Overlap repeats a small tail to preserve context across boundaries. Paragraph/sentence boundaries keep the passages readable. Page metadata will help future answers cite their sources.

This phase adds a manual, server-only chunker with **1,200 maximum characters and up to 200 overlapping characters**. These are readable development defaults, not model token limits. They are exported configuration, and the utility accepts server-side overrides. No embedding model has been selected or called.

### Extraction-to-chunking flow

```text
Authenticated user clicks Extract text on an existing PDF
  → POST /api/documents/extract with only { id }
  → Middleware and route verify the session
  → Existing handler reconstructs the verified owner's private Storage path
  → Normal authenticated Storage download, protected by owner SELECT policy
  → Existing local PDF parser extracts physical pages
  → Normalize page text, join nonempty pages, and record source-page spans
  → Choose readable boundaries under the configured maximum
  → Carry up to the configured overlap into each next chunk
  → Return { document, extraction, chunking } with private, no-store caching
  → Original text preview plus chunk inspector in temporary React state
```

The chunker prefers a paragraph boundary in the latter 40% of a window, then a sentence punctuation/whitespace boundary, then whitespace. If none exists there, an earlier boundary avoids cutting a fitting word. An unbroken token longer than the maximum needs a hard cut, recorded with `forcedWordSplit`. Cuts preserve Unicode surrogate pairs and never exceed the configured maximum. The sentence rule is a simple heuristic rather than linguistic parsing.

Overlap is a target ceiling, not a promise to repeat exactly 200 characters. The next start moves to a whitespace boundary; it can reduce or drop overlap to avoid cutting a fitting word or repeating a window without new text. Chunk ends always advance, and all normalized text remains covered. Each exact slice retains its whitespace; it is not trimmed independently.

Each chunk contains `chunkIndex` (zero-based), `documentId`, `text`, `characterCount`, `pageNumbers` (physical 1-based pages), `startOffset`, `endOffset` (excluded), `overlapWithPrevious`, and `forcedWordSplit`. A chunk spanning text on physical pages 1 and 3 lists `[1, 3]`, excluding a blank page 2. The document ID is the safe stored filename, without another owner's folder. Filename/display metadata remains in the response's `document` object.

Normalization converts line endings, trims each page's outer whitespace, skips empty pages, and joins nonempty pages with two newlines. `sourceCharacterCount` includes those separators; the extraction's `characterCount` is the sum of page text lengths. Counts use JavaScript UTF-16 string length, not tokens. Exact source reconstruction removes each chunk's recorded overlap before concatenation. Very small diagnostic settings such as a size of 2 can yield a separator-only slice with no attributed page; the UI labels it honestly. These settings are test cases, not retrieval defaults.

The inspector shows extracted character count, chunk count, maximum/overlap settings, and a selector for every chunk. Selecting a chunk shows source pages, characters, actual overlap, offsets, and its full plain text. Empty/image-only PDFs return zero chunks with a useful explanation. Close preview, navigation, page refresh, and deletion of the matching PDF clear both previews. The existing upload limit stays 4 MiB. Source PDFs remain private and persistent in Storage, but extracted text and chunks are not persisted.

### Phase 6 file inventory

Created:

```text
src/types/chunk.ts                         Chunk/options/result contracts
src/lib/rag/chunk-document.ts               Manual server-only splitting
src/components/documents/chunk-preview.tsx  Development chunk inspector
scripts/check-chunking.mjs                  Chunking invariant/regression tests
scripts/chunking-fixtures.mjs               Public synthetic multipage content
scripts/create-chunking-test-files.mjs      Ignored disposable live PDFs
supabase/storage/check-chunking-ownership.sql  READ ONLY deployed-policy check
```

Modified: `src/types/extraction.ts`, `src/lib/pdf/extraction-handler.ts`, `src/components/documents/documents-workspace.tsx`, `src/components/app-shell.tsx`, `src/app/(protected)/page.tsx`, `scripts/check-pdf.mjs`, `src/lib/rag/README.md`, `src/lib/pdf/README.md`, `package.json`, and `README.md`.

No dependency, lockfile, environment, Storage policy, auth route, upload/delete handler, or chat provider change is required. The existing API performs chunking immediately after extraction; no additional endpoint or caller-supplied text is needed. No application table, schema migration, persistent chunk storage, OCR, embedding, vector, retrieval, RAG prompt, framework, paid API, or conversation persistence is introduced.

### Verify Phase 6

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:chunking
npm run test:pdf
npm run test:storage
npm run test:auth
npm run test:chat
npm run build
npm run test:chunking:fixtures
```

The chunking tests cover exact coverage/reconstruction, natural boundaries, strict sizes, configurable overlap, true page spans, empty pages, deterministic results, invalid options, long tokens, fitting-token and Unicode regressions, and 160 varied boundary/configuration combinations. The real-parser tests also check owner PDFs through the authenticated extraction-to-chunking handler, multipage/blank-page metadata, image-only zero chunks, forged paths, another user's denial, and existing input limits/errors. Network guards assert zero outbound attempts. The offline SDK fixture tests API path scoping, not a claim that it implements deployed RLS.

For a manual check, sign in directly in the app, generate the fixtures, and upload them from `.setup-cache/chunking-tests/`. `phase-6-small.pdf` should produce one readable chunk. `phase-6-multi-page.pdf` should produce several bounded chunks with overlap, and no chunk should credit blank page 2. Select every chunk to inspect its physical page list and text. `phase-6-image-only.pdf` should show the existing no-text message and zero chunks. Refresh preserves stored files while clearing previews. Test removal only on disposable fixtures using the app's confirmation control. Existing mock chat and authenticated navigation should still work.

Keep `LLM_MODE=mock`; the chat badge and explicit local response confirm the running provider. No extraction/chunking code calls an LLM or embedding API. Phase 7 requires a separate instruction after Phase 6 review.

### Phase 6 verification results

TypeScript, lint with zero warnings, and the production build passed. All 83 automated checks passed: 20 chunking checks, 20 real-parser/pipeline checks, 18 Storage checks, 17 auth checks, and eight mock-chat checks. Chunking, PDF, and chat network guards recorded zero outbound attempts. No dependency or lockfile was added or changed.

Live checks used the retained existing-account session and generated PDFs only. The small PDF yielded one readable 54-character chunk. The three-page PDF yielded four chunks of 1,190, 923, 1,164, and 1,162 characters, all below 1,200. Actual overlaps were 0, 200, 194, and 193 characters and matched the preceding chunk's suffix. Removing duplicate overlap reconstructed all 3,852 normalized characters from 3,850 extracted characters plus the two-newline page join. The cross-page chunk correctly listed pages `[1, 3]`, excluding blank physical page 2. The image-only PDF returned zero extracted characters and zero chunks with the existing no-text explanation.

The source files remained listed after page refresh; text and chunk previews cleared. Authenticated navigation and the existing mock chat worked, returning the explicit local response. Cookie-free live requests redirected `/documents` to login and returned 401 for document listing, extraction/chunking, and chat APIs.

The reviewed read-only `check-chunking-ownership.sql` passed against the deployed Storage policy. The owner could read the stored fixture, while a different user ID and the anonymous role could not. This uses temporary SQL role/identity claims, not a second real account, and changes no file, Storage row, account, bucket, or policy. The offline handler tests separately verify that forged owner/path fields and another user's context cannot obtain text or chunks.

The user approved permanent deletion of the three named generated Phase 6 fixtures through the app. All three were deleted using the Documents confirmation control; no other file was deleted. Removing the PDF with the active preview cleared both the text and chunk inspectors. The library remained empty after refresh. The local ignored fixture generator remains available for future manual checks.

`LLM_MODE=mock` remains active. The OpenAI provider remains a disabled stub with no SDK, key access, or HTTP request. No OpenAI usage, embedding call, or paid external API was generated by this implementation or validation. Only the existing Supabase Free-plan Auth/Storage and read-only policy checks were used; no plan upgrade or paid feature was enabled. Existing local environment values were neither changed nor printed. `.env.local` and generated PDF fixtures remain ignored by Git.

Phase 6 is complete. Stop here for review; Phase 7 has not been implemented.

## Phase 7 — Local embedding generation

An embedding represents a passage as a vector of learned numerical features. Related passages often point in similar directions; cosine similarity compares those directions. A vector encodes meaning for future comparison and does not generate an answer. The same model revision and preprocessing must be used for future stored passages and queries.

This phase uses the official **@huggingface/transformers 4.3.1** package and **Xenova/all-MiniLM-L6-v2**, pinned to revision **751bff37182d3f1213fa05d7196b954e230abad9**. The verified output is **384 dimensions**, with mean pooling and unit-length normalization, using quantized q8 weights on the local CPU. Model compatibility was verified with the installed package before application implementation. See [the implementation notes](src/lib/embeddings/README.md) for the library compatibility detail, token limits, caching, and important code.

### Chunk-to-embedding flow

```text
Authenticated Documents page → Extract text → inspect chunks
  → Generate local embeddings → POST /api/documents/embed { id }
  → Verified session → existing private owner-only PDF extraction/chunking
  → Token-limit preflight → lazy local model → four-chunk batches
  → Check dimension, finite values, and unit normalization
  → Return metadata + chunk text/pages + temporary vectors, private/no-store
  → Development inspector shows the selected chunk's first eight values
```

The browser sends only the stored document ID. The server re-downloads and re-extracts the owner's PDF, so caller-provided text or another owner's path cannot enter this pipeline. Existing Storage policies and normal session credentials remain the access boundary. There is no service-role key, new table, or SQL setup.

`npm run embeddings:prepare` downloads only four public model artifacts into an ignored local revision directory. It sends no private document or inference request. Runtime loading is strictly local with remote models disabled. A lazy shared promise retains the model within each server process; subsequent documents reuse it. Empty documents produce zero vectors without loading a model. One job runs per process, and batches contain at most four chunks.

The development UI reports model, dimension, embedded chunk count, batch count, model reuse, and first-eight-value previews. It is visible under `npm run dev` and hidden in production. The full vectors remain temporary in request/React memory. Refresh, navigation, closing/replacing a preview, or deleting its document clears them. Cached public weights persist locally; document text and vectors do not.

The 1,200-character/200-character-overlap chunking defaults and 4 MiB upload limit are unchanged. Character counts are not token counts. Every chunk is checked against the verified 512-token tokenizer limit, including special tokens, before inference. Oversized input returns an understandable HTTP 422 rather than silently truncating text; token-aware splitting is deferred. This small model is suitable for English-oriented learning, and semantic quality is approximate.

### Phase 7 file inventory

Created:

```text
src/types/embedding.ts                         Embedded-chunk/result contracts
src/lib/embeddings/config.ts                   Pinned model and batching settings
src/lib/embeddings/local-model.ts              Strictly local tokenizer/ONNX loading
src/lib/embeddings/embed-chunks.ts             Lazy reuse, batches, vector checks
src/lib/embeddings/document-handler.ts         Reuse authenticated extraction flow
src/lib/embeddings/README.md                   Architecture and learning notes
src/app/api/documents/embed/route.ts            Authenticated Node.js endpoint
scripts/prepare-embedding-model.mjs             Public artifact download only
scripts/check-embeddings.mjs                   Offline validation/security tests
scripts/check-embedding-model.mjs              Actual offline model/semantic tests
scripts/create-embedding-test-files.mjs         Ignored disposable live PDF
supabase/storage/check-embedding-ownership.sql  Read-only deployed ownership check
```

Modified: `src/components/documents/chunk-preview.tsx`, `src/components/documents/documents-workspace.tsx`, `src/components/app-shell.tsx`, `src/app/(protected)/page.tsx`, `scripts/check-auth.mjs`, `next.config.ts`, `package.json`, `package-lock.json`, and `README.md`.

The Next.js configuration keeps Transformers.js and native ONNX/sharp packages on the server. No environment file, Storage policy, parser, chunking algorithm, chat provider, authentication form, or schema was changed. Model files and generated PDFs use the already ignored `.setup-cache` directory.

### Verify Phase 7

```powershell
npm run embeddings:prepare
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:chat
npm run test:auth
npm run test:storage
npm run test:pdf
npm run test:chunking
npm run test:embeddings
npm run test:embeddings:model
npm run build
npm run test:embeddings:fixtures
npm run dev
```

Stop a running server before building; a build and development server should not share the same `.next` directory simultaneously. Only preparation needs network access to download public artifacts. The actual embedding tests block all fetch/HTTP/HTTPS/TCP/TLS access while initializing and using the real cached model. They validate every output, model reuse, parser/chunker metadata, token overflow, and semantic similarity. The separate controlled-output suite covers failures and the authenticated owner flow without contacting Supabase.

Sign in directly in the app and upload `.setup-cache/embedding-tests/phase-7-embedding-test.pdf`. Extract it, select each chunk, and generate local embeddings. Verify dimension 384 and a vector for every chunk. Generate again to observe model reuse. The fixture has a blank physical page 2, which should not appear in chunk page metadata. Refresh should preserve the file and clear previews. Existing mock chat should still identify its local response.

The local learning comparison scored the related React sentence at **0.742234** and the unrelated whale sentence at **0.000506**. This illustrates cosine similarity without adding document retrieval. It is not a general model-quality benchmark.

Installation reported seven pre-existing Next.js/ESLint dependency advisories. The new embedding dependencies were not the source of those reports; no forced dependency upgrade was made in this phase. Those existing dependencies should be reviewed before public deployment.

Keep `LLM_MODE=mock`. No OpenAI, embedding service, Hugging Face hosted inference, paid processing API, or Supabase upgrade is used. Phase 8 has not been started.

### Phase 7 verification results

TypeScript, lint with zero warnings, and the production build passed. All **109 automated tests** passed: the existing 83 checks, 18 embedding contract/security checks, and eight actual-model checks. The real tokenizer and ONNX model initialized and processed chunks with all outbound fetch/HTTP/HTTPS/TCP/TLS access blocked. Every output had 384 finite values and unit length within tolerance. Repeat requests kept initialization count at one; batching, concurrency, retries, empty PDFs, malformed PDFs, token overflow, owner scoping, and safe errors passed.

Live testing used the existing authenticated session and the generated `phase-7-embedding-test.pdf` only. Upload and persistent listing worked. Local extraction returned three physical pages, one blank, and 3,582 extracted characters. Chunking returned four chunks of 1,160, 821, 1,144, and 1,055 characters, with token counts 209, 147, 210, and 193. Every chunk received a normalized 384-value vector in one four-item batch. Page metadata was `[1]`, `[1]`, `[1, 3]`, and `[3]`, correctly excluding blank page 2. The second embedding request displayed model-instance reuse, and each chunk's first eight values were inspected.

Refreshing preserved the stored PDF and authenticated session while clearing text, chunks, and vectors. Authenticated navigation and the existing mock chat worked, returning the explicit local response. Cookie-free live requests redirected `/documents` to login and returned 401 for document listing, extraction, embedding, and chat APIs, with private/no-store responses.

The reviewed `check-embedding-ownership.sql` passed against the deployed Storage policy: owner read succeeded, while a different user ID and the anonymous role were denied. This uses temporary transaction roles and identity claims, not a second real account. It changes no object, row, account, bucket, or policy. Offline embedding-handler tests separately verify that an inaccessible document or forged owner/path/text fields cannot reach the model.

The user approved permanent deletion of the single named Phase 7 fixture through the app. Its deletion cleared the active text, chunk, and embedding previews; the library remained empty after refresh. No other file was deleted. The ignored local fixture generator and public model cache remain available for review.

`LLM_MODE=mock` was verified without printing configuration values. The OpenAI provider remains a disabled stub with no SDK, key access, or HTTP request. No OpenAI request or usage was generated by this work, and no paid inference or processing API was called. Preparation downloaded public artifacts only; document inference ran locally. Existing Supabase Free Auth/Storage remained in use, with no upgrade or paid feature enabled. `.env.local` remains ignored and untracked, and its values were neither changed nor printed. No application table, persistence, pgvector, retrieval, RAG, framework, OCR, or conversation storage was added.

Phase 7 is complete. The development server and Documents tab are available for review; Phase 8 requires a separate instruction.

## Phase 8 — PostgreSQL and pgvector persistence

The private PDF stays in Storage. PostgreSQL now keeps its document metadata and the text/metadata/vector for each chunk after the ingestion request and page refresh. Storage holds file bytes; PostgreSQL holds structured, related records. No query embedding, similarity search, retrieval API or RAG was added.

```text
Authenticated Documents page → POST /api/documents/ingest { id, reingest? }
  → getUser() verifies the cookie session
  → check previous owned document status
  → download owner-folder PDF through private Storage
  → existing local PDF extraction and deterministic chunking
  → existing cached MiniLM CPU embeddings, in batches of four
  → authenticated persist_document_ingestion RPC
  → atomic document upsert and chunk replacement under RLS
  → return metadata; refresh list shows Ready
```

### Schema and access

The reviewed migration is `supabase/migrations/20261009094113_knowledge_base_persistence.sql`. It enables pgvector 0.8.2 in `extensions`, creates `public.documents` and `public.document_chunks`, enables RLS and creates three invoker functions. The hosted migration history records the applied name `knowledge_base_persistence` with version `20261009103130`; the MCP application timestamp differs from the original CLI-generated file timestamp. The migration has already been applied to this project; do not reapply it.

`documents` contains its UUID, owner, immutable Storage filename/path, original filename, MIME/size, timestamps, status, page/character/chunk counts and model identity/revision/dimension. The unique `(owner_id, storage_name)` key identifies a stored PDF. `document_chunks` belongs to its document through a cascading foreign key and preserves index, content, UTF-16 character count, physical page numbers, half-open source offsets, overlap, forced-split flag, tokenizer count and normalized `extensions.vector(384)`. Unique `(document_id, chunk_index)` prevents duplicate chunk positions. These unique keys also provide indexes for owner lookups and the chunk foreign key. No vector index is created.

The stored dimension, model and pinned revision must match local `Xenova/all-MiniLM-L6-v2`; a model change requires an explicit schema/ingestion migration later. Vector dimensions describe the number of numerical coordinates, not the chunk's character count. The column enforces 384 coordinates and unit norm; pgvector rejects nonfinite coordinates. Database checks preserve the unchanged 4 MiB PDF cap, 100-page/200,000-extracted-character limits, 1,200-character chunks, up-to-200 overlap, 512-token model capacity and an additional 500-chunk development cap. UTF-16 lengths differ from PostgreSQL Unicode character lengths; the table permits one or two UTF-16 units per Unicode code point and preserves the exact supplied offsets/count.

Ownership lives on the parent document. Document policies require `owner_id = auth.uid()`; insertion also requires the owned private Storage object. Child policies resolve ownership through the parent. Authenticated users receive SELECT/INSERT/DELETE on both new tables and UPDATE only on document processing/filename fields. They cannot update document ownership/path/ID or update chunk rows. Anonymous/PUBLIC access to the tables and three RPCs is revoked. Grants allow an operation; RLS then decides which rows it may affect. The app uses the normal SSR session client, and each function uses SECURITY INVOKER with an empty search path, so neither bypasses RLS. No service-role/secret key is involved.

### Re-ingestion and deletion

An ordinary repeated ingestion returns 409 before parsing/inference. **Re-ingest** explicitly replaces the existing chunks. The SQL upsert locks the owned document, requires a ready state, checks the Storage object's owner/size, deletes only that document's old chunks and inserts all replacements in one transaction. A parsing/model error causes no database write; a SQL failure rolls back the entire replacement, retaining the last successful result. The document UUID stays the same, while replacement chunk UUIDs and processed date change.

Storage and PostgreSQL are separate services, so their deletion cannot share one transaction. The app uses `begin_document_deletion` to lock/mark an owned document as `deleting`, removes its PDF through the Storage API, then calls `finish_document_deletion`. The final function refuses cleanup while the Storage object exists. Once absent, deleting the parent cascades to its chunks and embeddings. An unprocessed PDF receives a temporary deletion record so concurrent ingestion cannot recreate records during deletion. Interrupted operations retain **Deletion pending**, including when the file is already absent; retry deletion completes cleanup. Listing merges those pending records with Storage files, retaining a retry action. No background job or structural modification to Supabase-managed Storage tables is used.

The existing `storage.objects.documents_delete_own` policy retains bucket/folder/owner checks and additionally blocks raw authenticated deletion of a ready processed PDF until it is marked pending. Application ingestion and deletion serialize through the same document row. The consistency flow applies to the app; privileged/manual changes in the Supabase dashboard can bypass it. Deleting an Auth user cascades application rows, but does not remove Storage bytes; account deletion is outside this phase.

Not processed means no application document row yet. Processing and Failed are temporary UI states. Ready and Deletion pending come from PostgreSQL. A failed re-ingestion shows that the previous ready result was retained. Extraction/chunk/embedding previews still clear on refresh and do not save anything by themselves; **Ingest** is the action that regenerates and persists the pipeline's results.

### Phase 8 files

Created:

- `supabase/migrations/20261009094113_knowledge_base_persistence.sql` — exact reviewed schema/policy/RPC migration.
- `supabase/checks/check-phase-8-schema.sql` — read-only catalog, grants, policies and function checks.
- `supabase/checks/check-phase-8-fixture.sql` — read-only generated-fixture chunk/vector metadata inspection.
- `supabase/checks/check-phase-8-ownership.sql` — read-only owner/different-JWT-identity assertions, rolled back.
- `src/types/ingestion.ts` — persisted metadata and response types.
- `src/lib/knowledge/repository.ts` — authenticated table reads, snake-case mapping and transaction RPC serialization.
- `src/lib/knowledge/document-handler.ts` — bounded input, authenticated ingestion, persistence-aware listing and coordinated deletion.
- `src/app/api/documents/ingest/route.ts` — Node.js ingestion endpoint with verified session.
- `scripts/check-ingestion.mjs` — offline persistence/ownership/input/error/retry contracts with official SDK and real parser.
- `scripts/create-ingestion-test-files.mjs` — public synthetic three-page PDF generator.

Modified:

- `src/app/api/documents/route.ts` — listing/deletion use persistence-aware handlers; upload preserved.
- `src/lib/storage/document-handler.ts` — new uploads preserve original filename in Storage user metadata; never used for authorization.
- `src/lib/pdf/extraction-handler.ts`, `src/types/extraction.ts` — include actual downloaded PDF byte size for trusted persistence.
- `src/types/document.ts` — optional persisted ingestion metadata and missing-file cleanup state.
- `src/components/documents/documents-workspace.tsx` — Ingest/Re-ingest, persistent status/model/count/date, processing/failure and retry deletion.
- `src/components/documents/extraction-preview.tsx`, `src/components/documents/chunk-preview.tsx` — distinguish temporary preview actions from persistent ingestion.
- `src/components/app-shell.tsx`, `src/app/(protected)/page.tsx` — Phase 8 labels and knowledge-base capability, without a fake stored-chunk count.
- `scripts/check-auth.mjs` — authenticated/signed-out ingestion API coverage.
- `package.json` — ingestion tests/fixture generator and a full `npm test` command; no new dependency.
- `.gitignore` — ignore Supabase CLI temporary files alongside existing local secrets/model/fixture caches.
- `README.md` — current scope, architecture, schema, operation and validation notes.

The reviewed migration, lockfile, environment values, model/config/cache loader, chunker, Auth implementation and mock/OpenAI provider code are unchanged by the continuation. `.env.local` remains ignored and untracked.

### Verify Phase 8

```powershell
npm run test:ingestion:fixtures
npm run typecheck
npm run lint
npm run build
npm test
npm run dev
```

With the existing account, upload the generated `.setup-cache/ingestion-tests/phase-8-ingestion-test.pdf` in Documents. Click Ingest, wait for Ready, then refresh: model/dimension/chunk count/date remain. Re-ingest replaces rather than duplicates the document's chunks. Extract text still opens the temporary page/chunk preview; the development embedding inspector still uses the local model. Delete only an intended disposable PDF, confirm the app prompt, and verify the file and application records are gone. If deletion is interrupted, refresh and Retry deletion.

The read-only SQL check files inspect schema or the specifically named generated fixture. The fixture/ownership checks need that PDF ingested; they return no records or raise a missing-fixture error after cleanup. Do not remove real documents just to test the flow.

Chat remains `LLM_MODE=mock`. The badge and explicit local response show the active provider. The OpenAI provider remains a disabled stub without SDK, key access or HTTP. Embedding inference uses the cached local model; public model preparation downloads artifacts only. The Supabase organization remains `free`/`tier_free`, and no plan upgrade, paid add-on, hosted inference or paid API was enabled or used.

The security advisor reports existing `public.rls_auto_enable()` SECURITY DEFINER execution privileges and disabled leaked-password protection. These are outside the reviewed migration and were left unchanged. See the [anonymous execution finding](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated execution finding](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No performance findings were reported for Phase 8.

### Phase 8 verification results

The exact reviewed migration applied successfully without modification. Read-only catalog checks confirmed pgvector 0.8.2 in `extensions`, both new tables, `vector(384)`, enabled RLS, seven application policies, restricted table/column/type/function grants, the three SECURITY INVOKER transaction functions, and the updated owner-only Storage delete policy. No existing file, account, bucket or unrelated table was dropped or altered by the migration; the Storage delete policy's access conditions were tightened as reviewed.

All **128 automated tests** passed, including 19 Phase 8 tests (parent tests included), existing authentication/Storage/parser/chunking contracts, and real cached MiniLM inference. Offline tests block fetch/HTTP/HTTPS/TCP/TLS and assert zero outbound attempts for chunking, model inference and chat. Phase 8 checks include actual PDF extraction-to-persistence mapping, official-SDK RPC serialization, invalid/forged requests, owner-path denial, explicit re-ingestion, preservation of prior ready state on failure, missing/corrupt/image-only PDFs, and pending deletion retries before/after Storage removal. These are offline contract fixtures, not a substitute for the live checks below. TypeScript, lint and production build passed. An initial restricted build encountered a generated-directory `EPERM`; the same build succeeded with local filesystem permission.

Live browser validation used the existing authenticated account and a generated public-text `phase-8-ingestion-test.pdf` only. Upload returned 201 and owner listing showed the 5,297-byte file. Ingest returned 200 and persisted one document and four chunks: three physical pages, blank page 2, 3,674 extracted characters and 3,676 normalized source characters. Chunk character counts were 1,187/842/1,170/1,073; pages were `[1]`, `[1]`, `[1,3]`, `[3]`; overlap was 0/200/198/198; tokenizer counts were 215/153/218/200. All stored vectors had dimension 384 and unit norm. The metadata remained Ready after a full page refresh. Explicit Re-ingest retained the document UUID, replaced chunk UUIDs, advanced the processed date, preserved metadata and retained four rows without duplication. Existing extraction/chunk previews still worked; the local embedding inspector again generated all four vectors and reported model-instance reuse.

The read-only ownership transaction asserted that the owner could see its PDF, document and chunks, and that a different authenticated JWT identity could see none. The document-owner and chunk-parent write predicates were false for that identity. Chunk UPDATE and owner reassignment were not granted; anonymous table SELECT was not granted. This project has only one account, so the second identity was synthetic, not a second real account/browser login. No live INSERT/UPDATE/DELETE attack was executed against another account; the deployed policy/grant checks and offline forged-input/owner-path tests verify those restrictions without changing data.

The user approved deletion of this single named fixture at action time. The app's DELETE returned 200, removed the Storage PDF, deleted the document record and cascaded all four chunks. Read-only checks found zero remaining fixture objects/documents/chunks and confirmed the FK cascade. Active text/chunk/embedding previews cleared. No other PDF, account or record was deleted. The ignored local fixture remains available for regeneration/review.

Authenticated Documents/chat navigation and refresh continued to work. Cookie-free requests returned 401 for documents/extraction/embedding/ingestion/chat APIs and 307 to login for Documents. The authenticated chat returned its explicit local mock confirmation. `LLM_MODE=mock` was checked without printing configuration values. No OpenAI request or usage was generated by this work; no paid inference/processing API, paid Supabase feature or upgrade was used. The Free-plan status was rechecked. Environment files and provider/model settings were preserved, and `.env.local` stayed ignored and untracked.

Phase 8 is complete. Stop for review; Phase 9 has not been started.

## Phase 9 — Semantic retrieval only

The Documents page now has a retrieval inspector. It embeds a question locally, searches owned ready chunks and displays matching passages with scores and source metadata. It does not generate an answer, send context to chat, or persist questions/results.

### How it works

```text
Question + scope/top-k/threshold in Documents
  → POST /api/documents/search
  → middleware and server route verify the session
  → validate bounded JSON, question and search controls
  → existing offline MiniLM singleton embeds the question
  → authenticated Supabase RPC search_document_chunks
  → exact pgvector cosine comparison over owned ready chunks
  → threshold filter, rank, top-k limit
  → source passages + pages/offsets + similarity → inspector
```

Semantic retrieval compares meaning represented by vectors rather than exact word matches. Questions use the same `Xenova/all-MiniLM-L6-v2` revision `751bff37182d3f1213fa05d7196b954e230abad9`, CPU/q8 execution, mean pooling and normalization as ingested chunks. Mixing models/revisions can make vector directions incomparable even if their dimensions match. The query adapter passes one temporary text item into the existing embedding contract; it neither chunks the question nor associates it with a stored document. The full 384-coordinate query vector exists only on the server for the request and is not returned to the browser. The existing lazy singleton/model-busy guard is shared between queries and ingestion. No model files are downloaded during inference.

The question cap is 1,000 characters, with a separate real-tokenizer 512-token limit that rejects overflow rather than truncating. The server bounds the actual JSON body to 8 KiB, checks same-origin requests and rejects unsupported fields, owner/path/vector injection, malformed document UUIDs and invalid controls. Responses use `private, no-store`; errors exclude private provider/database details.

pgvector `<=>` returns cosine distance: smaller means nearer directions. Similarity is `1 - distance`; for normalized vectors it also equals the dot product. The RPC clamps floating-point rounding at the mathematical range `[-1, 1]`, sorts by distance ascending and breaks ties by document UUID and chunk index. Scores are comparative signals, not confidence probabilities. See the [pgvector 0.8.2 documentation](https://github.com/pgvector/pgvector/tree/v0.8.2#distances).

**Top-k** is the maximum number of returned chunks, default **5**, allowed **1–20**. The default **minimum similarity is 0.30**, adjustable from **-1 to 1**. Lower thresholds admit weak matches; higher thresholds may exclude useful passages. Use -1 for learning about all scores, not as a claim of relevance. There is no universal threshold: tune it using your documents and representative questions. Good retrieval is necessary for later grounded answers, but retrieval alone makes no answer-quality guarantee.

All-document scope searches every owned ready document, independent of Storage list pagination. Single-document scope takes the persisted document UUID (not the Storage filename); dropdown choices come from ready documents in the currently loaded list. Load more documents to expose additional choices. The query and results clear on changed inputs, navigation/refresh or loaded-library changes such as ingestion, re-ingestion and deletion, avoiding stale source previews. Search results display rank, similarity, original filename, document/chunk UUIDs, chunk index, physical pages, UTF-16 character count, source offsets and plain text.

### Database change and ownership

`supabase/migrations/20261009111153_semantic_retrieval.sql` adds only `public.search_document_chunks(extensions.vector, integer, uuid, double precision)`. It was shown in full before application. The hosted history records name `semantic_retrieval`, version `20261009111559`; the MCP application timestamp differs from the CLI-generated filename. It is already applied to this project; do not reapply it.

The migration uses CREATE FUNCTION, REVOKE on that new function and GRANT EXECUTE to authenticated, wrapped in BEGIN/COMMIT. It contains no DROP, DELETE, TRUNCATE or data-changing UPDATE, and changes no existing table, row, Storage bucket/object, Auth record or policy. No HNSW/IVFFlat index was added; exact search is sufficient at this learning-project scale.

The STABLE SECURITY INVOKER RPC has an empty search path and schema-qualified tables, functions and cosine operator. It requires `auth.uid()`, checks vector dimension and unit norm, independently bounds top-k/threshold (including NaN), restricts ready documents to the pinned model/revision/dimension, and explicitly filters by caller ownership. Existing parent/child RLS continues to apply; existing SELECT grants supply the reads. Anonymous/PUBLIC execution is revoked. The API uses the normal authenticated SSR client without a service-role key. A foreign or nonexistent document filter yields no matches without exposing whether that document exists. See [Supabase retrieval with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions).

### Phase 9 files

Created:

- `supabase/migrations/20261009111153_semantic_retrieval.sql` — exact cosine retrieval RPC and narrow execution grant.
- `supabase/checks/check-phase-9-schema.sql` — read-only function/RLS/index inspection.
- `supabase/checks/check-phase-9-fixtures.sql` — read-only generated-PDF vector and chunk metadata inspection.
- `supabase/checks/check-phase-9-ownership.sql` — read-only owner/different-JWT identity retrieval and RPC argument assertions; rolled back.
- `src/types/retrieval.ts` — query, result and source metadata contracts.
- `src/lib/retrieval/config.ts`, `input.ts` — development defaults, limits and validated controls.
- `src/lib/embeddings/embed-query.ts` — question adapter sharing the pinned offline ingestion model.
- `src/lib/retrieval/repository.ts` — authenticated RPC serialization and result mapping.
- `src/lib/retrieval/search-handler.ts` — bounded authenticated request-to-retrieval flow and errors.
- `src/app/api/documents/search/route.ts` — protected Node.js POST route.
- `src/components/documents/retrieval-inspector.tsx` — temporary question controls and ranked passage inspection.
- `scripts/check-retrieval.mjs` — offline input, query, API, SDK serialization, metadata and failure tests.
- `scripts/create-retrieval-test-files.mjs` — generated React and ocean PDF fixtures.

Modified:

- `src/components/documents/documents-workspace.tsx` — inspector integration and invalidation after library changes.
- `src/components/app-shell.tsx`, `src/app/(protected)/page.tsx` — Phase 9 labels/capability notes.
- `scripts/check-auth.mjs` — signed-in/out retrieval API middleware coverage.
- `scripts/check-embedding-model.mjs` — real offline query normalization/dimension/reuse/semantic comparison/token-limit checks.
- `package.json` — retrieval test/fixture commands and inclusion in `npm test`; no new dependencies.
- `README.md` — current scope, learning explanation, SQL/access design and validation instructions.

The existing ingestion migration/functions, Storage policies, local model configuration/revision/cache loader, chunker, Auth implementation, mock/OpenAI provider and environment files remain unchanged. `.env.local` stays ignored and untracked.

### Try retrieval

```powershell
npm run test:retrieval:fixtures
npm run typecheck
npm run lint
npm run build
npm test
npm run dev
```

Use Documents to upload `.setup-cache/retrieval-tests/phase-9-react.pdf` and `phase-9-ocean.pdf`, then Ingest both and refresh. Ask “What are React hooks used for in function components?” with default controls; inspect React passages and physical page metadata. Set minimum similarity to -1 and top-k to 20 to compare both subjects, then top-k to 1 to inspect the closest match. Select one document to restrict scope. Raise the threshold to 1 to inspect an empty result, or try an unrelated question with -1 to see weaker scores. Empty results do not prove a document cannot answer a question. Re-ingest replaces the stored vectors as before; intended deletion removes sources from future searches and clears previews.

The read-only fixture/ownership check files require the named PDFs to be ingested and are intended for a database-admin SQL session. They emulate a different existing account ID when available, otherwise a synthetic authenticated JWT identity; they never create an account or change any row. This is a deployed RLS test, not a second browser account session. Schema checks work after fixture cleanup.

`LLM_MODE=mock` is preserved. Chat still shows its mock badge/local response. Query and chunk inference execute from cached files locally; only the ordinary Free-plan Supabase Auth, Storage and PostgreSQL APIs are used. No OpenAI, hosted inference, paid API or upgrade is used. Phase 10 is not implemented.

### Phase 9 validation results

TypeScript, lint and production build passed. All **143 automated tests** passed, including 14 retrieval contract tests (parent included) and an additional real cached-model query test. Real CPU query embeddings were finite, normalized and 384-dimensional, matched the ingestion revision and reused its initialized singleton. A related React query scored above an unrelated ocean sentence; actual token overflow was rejected without truncation. Network guards around fetch/HTTP/HTTPS/TCP/TLS recorded zero outbound attempts during local model and mock-chat tests. The official SDK was exercised against an offline RPC fixture for serialization/metadata/error contracts.

Live browser checks used the existing authenticated account and two generated public-text fixtures only: `phase-9-react.pdf` (3,886 bytes) and `phase-9-ocean.pdf` (3,576 bytes). Each ingested into one ready document with three chunks. Read-only database inspection verified all six stored vectors had dimension 384 and unit norm. Metadata preserved physical pages `[1]`, `[1,3]`, `[3]`, including blank page 2. React chunk character counts/offsets were 1,165 `[0,1165)`, 1,148 `[965,2113)`, 617 `[1918,2535)`; ocean counts/offsets were 1,143 `[0,1143)`, 1,158 `[943,2101)`, 321 `[1904,2225)`.

The React-hooks question returned three React passages at default 0.30: similarities **0.7287, 0.7271, 0.7237**. With top-k 20 and threshold -1, all six chunks appeared; ocean passage scores were **0.0822, 0.0758, 0.0730**. Top-k 1 returned one React chunk. Threshold 1 produced zero matches with a clear empty state. Ocean-only scope returned only its three chunks. An unrelated medieval-cathedral question produced scores from **-0.1132 to 0.0073**. Results displayed the correct document/chunk/page/character/offset metadata and pinned query model with 12 tokens and model reuse.

Both documents remained Ready after a full refresh, while temporary search state cleared. Explicit React re-ingestion retained its document UUID, replaced all three chunk UUIDs, advanced the processed date and kept the count at three. Retrieval continued to return 0.7287 for its first chunk. Existing extraction/chunk previews remained readable and the local embedding preview embedded all three chunks using the reused model.

Read-only deployed-RLS checks returned six all-document results and three scoped results for the owner. A different authenticated JWT identity received zero of the owner's matches in both scopes and could not see its document/chunks/Storage object. There is only one real account, so the second identity was synthetic; no second real account/browser sign-in was tested. The RPC independently rejected excessive top-k, NaN threshold, null vector, zero/nonunit vector and 383-dimensional input. Anonymous execution remained denied, RLS enabled and vector-index count zero. No live cross-account write or policy change was needed.

The user approved permanent cleanup of exactly the two generated fixtures at action time. The app removed both private PDFs and document rows, cascading all six chunks/embeddings. Read-only checks found zero remaining fixture objects/documents/chunks and zero orphan chunks, with the bucket still private and the existing Auth account intact. Retrieval previews cleared; a fresh React query returned zero matches. The local ignored fixture files and proof screenshots remain for review/regeneration.

Cookie-free requests returned 401 for retrieval/documents/extraction/embedding/ingestion/chat APIs and 307 to login for Documents. Authenticated navigation and refresh retained the session. The existing chat produced its explicit local mock response. `LLM_MODE=mock` was checked without displaying environment values; `.env.local` stayed ignored/untracked and the disabled OpenAI stub was unchanged. No OpenAI request or usage was generated by this work. No paid inference/API or Supabase upgrade/add-on was used; the organization still reports `free` / `tier_free`.

The advisor reports no performance findings. Existing `public.rls_auto_enable()` SECURITY DEFINER execution privileges and disabled leaked-password protection remain as documented in Phase 8; the new invoker RPC adds no such finding. No unrelated project setting was changed.

Phase 9 is complete. Stop for review and testing; Phase 10 has not been started.

## Phase 10 — Full local RAG

Phase 10 connects authenticated document retrieval to a real local generative model. Ollama was installed manually by the user. The assistant installed no runtime/package and downloaded no model weights. The earlier preparation notes are retained locally in ignored `.setup-cache/phase-10/previous-phase-10-notes.md`. Stop at Phase 10; polished citations and conversation persistence remain future phases.

### Exact current configuration

The server reads these settings:

```dotenv
LLM_MODE=local
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b-instruct
```

`.env.example` defaults to safe `LLM_MODE=mock` and contains no real credentials. The existing local-only `.env.local` was preserved: the user had already configured local mode, the installed model and a localhost URL. It remains ignored and untracked. Preserve the existing Supabase public URL/publishable-key names and empty OpenAI placeholder.

Before this continuation, the provider read `LLM_MODE` and `OLLAMA_MODEL` but used a hard-coded endpoint and pinned `qwen3:1.7b`. It now validates `OLLAMA_BASE_URL` and pins the user's installed [qwen3:4b-instruct](https://ollama.com/library/qwen3:4b-instruct), GGUF/Q4_K_M. The full reviewed manifest digest is `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`. The installed digest matched the official registry manifest text; no model weights were downloaded to verify it.

Only `http://localhost:11434` or `http://127.0.0.1:11434` is accepted, optionally with a trailing slash. Credentials, other hosts/ports, HTTPS, paths, queries and fragments are rejected before model I/O. Requests use the canonical IP `http://127.0.0.1:11434`, avoiding DNS lookup. Redirects are rejected. No browser-supplied endpoint/model is accepted. Inventory must match the exact model digest, GGUF format, qwen3 family and Q4_K_M quantization, with no remote model/host fields. Changed aliases or cloud models fail closed.

Unset/blank mode still defaults to mock. OpenAI is disabled even if explicitly selected or a key exists; no API-key-based provider switching exists. No OpenAI SDK, hosted inference, paid API or paid Supabase feature is used. Keep Ollama cloud features disabled in the Ollama process's own environment; Next.js environment variables do not configure that separate process. The application never calls a pull/install endpoint.

### Complete request flow

```text
Chat question + optional persisted document UUID
  → POST /api/chat
  → verified authenticated SSR client + bounded input validation
  → explicit LLM_MODE=local
  → existing cached MiniLM query embedding: normalized vector(384)
  → existing search_document_chunks RPC, SECURITY INVOKER + owner-only RLS
  → select relevant owned passages and construct bounded grounded context
  → no usable context: return abstention and skip Ollama entirely
  → system prompt + JSON question/reference passages
  → loopback-only Ollama model identity preflight
  → local qwen3:4b-instruct generation
  → validated answer + small generation summary
  → chat bubble; request/page memory only
```

Next.js handles authentication, local query embeddings, Supabase retrieval and prompt assembly. Ollama separately runs the generative model on the same computer. MiniLM remains `Xenova/all-MiniLM-L6-v2`, pinned revision `751bff37182d3f1213fa05d7196b954e230abad9`, mean pooling, normalization, CPU/q8 and 384 dimensions. Changing the generative model does not change the embedding space or database dimension.

Retrieval selects text; generation writes an answer from it. The augmented context is the retrieved reference text supplied with the question. Embeddings are numerical meaning representations, not generated answers. Query and stored chunk embeddings must share the same model/revision and normalization to make vector comparison meaningful.

The browser sends only `{ message, documentId? }`; it cannot choose an owner, vector, provider, system prompt, history, top-k or threshold. The route builds its repository from the same server-verified user's normal SSR session. Existing invoker RPC/RLS protects both all-document and single-document retrieval; foreign IDs yield no matches. No service-role key, schema migration, index, grant, policy or Auth setting change was introduced.

### Grounding and bounded context

`src/lib/rag/config.ts` centralizes defaults: up to **5** chunks, minimum cosine similarity **0.30**, **6,000 UTF-8 bytes** of serialized reference passages, **7,000 bytes** of system/user prompt, **8,192 context tokens**, **384 output tokens** and a **120-second** generation timeout. Questions are capped at 1,000 characters and the existing MiniLM tokenizer limit. The byte budget is conservative for this model's byte-level tokenizer/template; it is not an exact token count.

Passages are ordered by descending similarity, deduplicated by chunk UUID, filtered for nonempty text/relevance and included whole within the budget. Oversized passages are skipped, not cut mid-word. Document UUID, filename, chunk index, physical pages and similarity remain alongside each passage. No vector coordinates are sent to the generator. The threshold is adjustable in server configuration and is not a confidence probability or universal relevance boundary.

`prompt.ts` separately defines the system grounding instructions. The question and PDF text are JSON data: the model is told to ignore embedded instructions, avoid unsupported/outside facts and acknowledge missing context. No usable passages means no generation call. Related passages can still omit an answer; the model must abstain rather than invent it. These instructions reduce risk but cannot guarantee that every future answer is accurate or immune to prompt injection.

The provider uses two messages, non-streaming output, `think: false`, temperature 0 and one active generation per server process. Missing runtime/model, changed model identity, malformed/incomplete/truncated answers and timeouts produce visible errors with no fallback. The UI uses a 150-second request timeout, restores failed drafts and aborts when leaving the page. Chat messages are temporary and each question is independent; earlier messages are not sent as context.

### Files created or modified

Created in Phase 10:

- `src/types/rag.ts` — generated/insufficient-context summary.
- `src/lib/rag/config.ts` — context, retrieval and generation limits.
- `src/lib/rag/prompt.ts` — grounding prompt and whole-passage context assembly.
- `src/lib/rag/answer.ts` — embedding → owned retrieval → local generation orchestration.
- `src/lib/ai/local-config.ts` — reviewed model pin, validated localhost endpoint and safe errors.
- `src/lib/ai/providers/local.ts` — bounded Ollama generation and inventory diagnostic.
- `scripts/check-local-runtime.mjs` — read-only runtime/model check.
- `scripts/check-rag.mjs` — RAG, provider, API and localhost safety tests.
- `scripts/create-rag-test-files.mjs` — generated React/ocean PDFs with known test facts.
- `supabase/checks/check-phase-10-ownership.sql` — read-only deployed-RLS/argument checks; no migration.

Modified:

- `src/types/chat.ts` — local mode, optional scope, grounding/cancellation and summary contracts.
- `src/lib/ai/provider.ts`, `providers/mock.ts`, `chat-handler.ts` — explicit mode dispatch and authenticated bounded chat.
- `src/app/api/chat/route.ts` — verified session reused for the retrieval repository.
- `src/components/chat/chat-workspace.tsx` — document scope, local indicators, answers and errors/loading.
- `src/app/(protected)/chat/page.tsx`, `page.tsx`, `src/components/app-shell.tsx` — current capabilities/status.
- `scripts/check-chat.mjs` — preserve safe mock/disabled OpenAI tests under the authenticated handler contract.
- `package.json` — local diagnostic, RAG tests and fixture command; no dependency changes.
- `.env.example` — safe mock default, localhost/model settings and empty credential placeholders.
- `src/lib/ai/README.md`, `src/types/README.md`, `README.md` — learning, configuration and validation notes.

The lockfile, installed dependencies, local environment values, Supabase schema/policies and MiniLM revision are unchanged. Ignored local proof artifacts include generated PDFs, screenshots, an owner-RLS retrieval snapshot, a supplemental local prompt check and its JSON report. These contain synthetic fixture text only and are not application persistence.

### Checks and real-model results

```powershell
npm run local:check
npm run test:rag:fixtures
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
npm test
```

The runtime diagnostic reports all three flags true: available, installed, model matches. It reads inventory only. All **161 automated tests** passed, including 18 RAG tests (parent included). Tests exercise real cached MiniLM inference, PDF extraction/chunking, normalization/dimensions, auth/Storage/persistence/retrieval contracts, prompt bounds/metadata, owner/scope denial, insufficient-context skipping, cloud/changed-model rejection, localhost-only configuration, concurrency/cancellation and response validation. Simulated transports are used for automated database/generation contracts; network guards record zero real outbound attempts. Real local generation is tested separately below.

Two generated PDFs were uploaded through the existing authenticated Documents app: `phase-10-react.pdf` (3,828 bytes) and `phase-10-ocean.pdf` (3,638 bytes). Each ingested to one ready document with three chunks. Read-only database checks verified all six vectors are normalized and 384-dimensional. React chunks have 1,126/1,199/548 characters and physical pages [1]/[1,3]/[3]; ocean chunks have 1,176/1,184/324 characters and the same page sets. Blank physical page 2 is preserved correctly as blank.

The question **“What is the React training project named, and what does useState do?”** retrieved three React chunks with similarities **0.6645, 0.5743 and 0.5113**. The real authenticated chat returned: **“The React training project named in the document is Cedar. The useState hook stores component state, such as a counter or form input, and calling the state setter schedules a render with the updated state value.”** All facts appear in the retrieved PDF text. The same question in React-only scope returned the same supported answer using three passages.

A supplemental local check used the real owner-RLS RPC snapshot and real MiniLM query adapter, asserting that the exact persisted passage text, question and page metadata were transmitted to the actual loopback Ollama API. It generated a real answer, not a fixture response: **942 prompt tokens, 42 output tokens, done_reason=stop, approximately 4.81 seconds**, with three passages and 3,381 context bytes. Its recorded prompt hash was `3a4641ac1b32fb04376f2c8d23fab7134ee48646d3131c0c4ce81e8004f29e05`. This supplements, rather than substitutes for, the normal authenticated browser API test. Ollama reported 2,289,618,124 VRAM bytes and the explicit 8,192-token context window.

An unrelated medieval-cathedral question returned the clear insufficient-context response without generation. The Ollama model keep-alive expiry remained unchanged across that request. Ocean-only scope likewise refused the React question rather than using out-of-scope passages. An ocean-only question correctly returned **Blue Lantern** and **krill**, both present in that PDF. A related but unsupported question about Cedar's annual budget retrieved one passage and the real model answered that the supplied context was insufficient to determine the budget; no amount was invented.

The deployed read-only ownership transaction returned six all-document and three scoped results for the owner, and zero of the owner's results for a different authenticated JWT identity. That identity could not see the owner's document/chunks/private Storage object. Anonymous RPC execution and invalid vector/control arguments remained rejected. There is only one real account, so the second identity is synthetic; a second real browser account was not created or tested. The transaction changes only session-local role/claims and rolls back, modifying no data.

Cookie-free requests returned 307 to login for protected Chat/Documents and 401 for chat/document/retrieval/extraction/embedding/ingestion APIs. The existing authenticated session remained usable across navigation. No OpenAI, hosted inference, paid API or Supabase upgrade was used; the organization still reports Free. No installation or model download occurred during this continuation.

TypeScript, lint with zero warnings and production build passed. After the build, the production server again generated the supported Cedar/useState answer from the re-ingested React PDF using three passages. The proof screenshot is `.setup-cache/phase-10/production-rag-answer.jpg`; earlier all-document proof is `real-rag-answer.jpg`.

Full Documents refresh retained both ready metadata records and authentication while clearing temporary previews. Existing extraction returned three physical pages, 2,475 extracted characters and one blank page. The chunk inspector showed three chunks with the existing 1,200-character maximum/200-character overlap. Its embedding inspector embedded all three chunks in one batch and reported normalized 384-coordinate vectors, q8/CPU execution and model-instance reuse. Explicit React re-ingestion retained its document UUID, replaced all three chunk UUIDs, advanced its processed date and kept three rows without duplication; production RAG remained functional afterward.

The user approved permanent deletion of exactly the two generated Phase 10 PDFs. The production Documents app removed both private Storage objects and both metadata rows, cascading all six chunks/embeddings. Read-only checks confirmed zero remaining fixture objects/documents/chunks, zero orphan chunks, the still-private bucket and the unchanged single Auth account. A fresh production chat question afterward returned insufficient context without generation, confirming deleted sources were no longer available; proof is `deleted-sources-proof.jpg`. No other PDF, record or account was deleted. Local ignored generated fixtures/proof artifacts remain available for review.

Phase 10 is complete within the requested local RAG scope. Ownership was validated through deployed read-only authenticated identity emulation and automated contracts; there was no second real browser-account test. Phase 11 has not been started. No new database objects or policies, retrieval optimizations, persistent conversations, polished citations or installation/download operations were added.

## Phase 11 — Source citations and evidence

Phase 11 exposes the document passages actually supplied to local generation. Citations make answers inspectable; they do not automatically prove every generated claim. Generation creates answer text, while attribution identifies its input evidence. The application derives identity from authenticated retrieval, never from model-generated filenames, pages or inline markers. Physical page metadata preserved through extraction/chunking provides the PDF location.

### Source contract and important code

The existing `/api/chat` contract keeps `message.content` as the answer and adds `sources`:

```typescript
{
  mode: "local",
  message: { role: "assistant", content: "The training project is Cedar..." },
  rag: { /* existing generation summary */ },
  sources: [{
    rank: 1, // one-based order in the context sent to Ollama
    documentId: "...", chunkId: "...", originalFilename: "handbook.pdf",
    chunkIndex: 0, // existing zero-based index
    pageNumbers: [1, 3], similarity: 0.664,
    excerpt: "Page one: learning handbook...", excerptTruncated: true
  }]
}
```

The illustrative IDs are placeholders. Actual excerpts contain copied source text, not the ellipsis shown above. `sources.ts` maps only `assembleRagPrompt(...).chunks`, after filtering, ranking, deduplication and context budgeting. A retrieved but skipped chunk cannot become a source. Each excerpt is an exact prefix of stored content, at most **360 UTF-16 characters**, preferably ending at whitespace and never cutting an emoji surrogate pair. `SOURCE_EXCERPT_CHARACTERS` is the adjustable display cap. Full passages still go to the local prompt; full chunks and vectors are not added to chat responses.

`source-presentation.ts` groups by document UUID in first-context order, not filename. Two distinct documents with the same filename remain separate. Duplicate chunk UUIDs are removed, but different overlapping chunks remain as individual evidence records. One collapsed document card shows the union of its actual pages; expanding reveals each chunk's original pages, rank, index, score and excerpt. Only consecutive pages become a range: `[1,3]` displays **Pages 1, 3**, not **Pages 1–3**. Group labels `[1]`, `[2]` number the source list; they do not pretend to be model-produced claim-level citations.

The source display says **Context supplied to the model**. Similarity is cosine relevance to the question, not a confidence percentage or entailment check. If retrieval supplies no usable context, `sources: []` accompanies the existing insufficient-context answer and Ollama is skipped. Mock mode also returns `sources: []`. When relevant passages exist but the local model says they lack a requested fact, its input evidence remains available under that honest context label; the application does not guess the model's intent using brittle answer-text matching. Inspect the passages to assess support.

### Flow and security

```text
Authenticated question + optional document UUID
  → existing local MiniLM query embedding
  → owner-only pgvector RPC / RLS
  → bounded selection of whole passages
  → localhost Ollama qwen3:4b-instruct answer
  → application maps those selected passages to structured sources
  → answer and grouped, expandable evidence in Chat
```

The verified user's SSR client remains the retrieval boundary. The browser cannot submit source records, owner IDs or prompt context. No service-role key, signed/public PDF URL, new table, migration, policy, grant or function is introduced. React renders filenames/excerpts as plain text, not HTML. Sources stay in page memory with their answer; refreshing clears the conversation. An existing answer retains its historical source snapshot if a document is later deleted; a new question searches only current ready documents.

### Files created or modified

Created:

- `src/lib/rag/sources.ts` — bounded exact excerpts and source attribution from selected context.
- `src/lib/rag/source-presentation.ts` — document grouping and gap-safe page labels.
- `src/components/chat/chat-sources.tsx` — collapsed source groups with per-chunk evidence.
- `scripts/check-citations.mjs` — citation provenance, exclusion, grouping, Unicode and access contracts.
- `scripts/create-citation-test-files.mjs` — generated known-content React/ocean PDFs.
- `supabase/checks/check-phase-11-ownership.sql` — read-only deployed identity/RLS checks, not a migration.

Modified:

- `src/types/rag.ts`, `src/types/chat.ts` — structured source records on responses/messages.
- `src/lib/rag/answer.ts`, `prompt.ts` — attach context-derived sources and discourage invented inline citations.
- `src/lib/ai/chat-handler.ts` — return sources with the existing answer; empty sources in mock mode.
- `src/components/chat/chat-workspace.tsx` — retain source records beside in-memory messages and render evidence.
- `src/app/(protected)/chat/page.tsx`, `page.tsx`, `src/components/app-shell.tsx`, `src/components/documents/documents-workspace.tsx` — current Phase 11 capability text.
- `scripts/check-rag.mjs`, `package.json` — updated response assertions and citation tests in the full suite.
- `README.md`, `src/lib/ai/README.md`, `src/types/README.md` — learning and contract documentation.

### How to test

```powershell
node scripts/create-citation-test-files.mjs
npm run test:citations
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

Use the existing installed runtime/model with `LLM_MODE=local`; no installation is necessary. Upload the generated `.setup-cache/phase-11/phase-11-react.pdf` and `phase-11-ocean.pdf` through Documents and ingest them. In Chat, ask **What is the React training project named, and what does useState do?** Expand Sources and check Cedar/useState, the original filename, three passage records and physical pages 1 and 3. Repeat in React-only scope. Try the ocean sanctuary/whales question in ocean-only scope, and an unrelated medieval-cathedral question in all-document scope: the latter should return insufficient context with no source section. A question about Cedar's annual budget tests a related passage that does not contain the requested fact.

The read-only ownership check runs only while the generated fixtures are ingested. It emulates the owner and a different authenticated JWT identity in a read-only transaction and rolls back; it performs no `DROP`, `DELETE`, `TRUNCATE`, data-changing `UPDATE` or DDL. There is only one real account, so this does not claim a second real browser-account test.

### Completed validation

TypeScript checks, lint with zero warnings, the production build and all **169 automated tests** passed, including eight citation-specific tests. Existing tests cover authentication, private Storage/upload/delete, parsing, lossless page-aware chunking, real cached MiniLM inference, ingestion/re-ingestion, retrieval and mock chat. Citation tests cover source identity, exact/Unicode-safe bounded excerpts, context budget exclusions, duplicate IDs, overlapping evidence, page gaps, model-invented identity, empty-context behavior and forged-source rejection.

The authenticated app uploaded and ingested the two generated PDFs, each to three chunks. Read-only database checks verified six finite stored vectors with dimension 384 and unit normalization. The normal session survived production-server restart and page refresh; persisted document choices remained available and temporary chat messages cleared. Cookie-free protected page requests redirected to login, while chat, documents, search, extraction, embedding and ingestion APIs returned 401.

The known React question returned the supported Cedar/useState answer in all-document and React-only scope using three passages. Its source scores were **0.6645, 0.5743, 0.5113**, with actual physical page sets `[1]`, `[1,3]`, `[3]`. The grouped label correctly displayed **Pages 1, 3**. A DOM evidence snapshot was compared against read-only database chunk text: all three displayed excerpts were exact stored-text prefixes, with the expected filename and chunk indices.

A supplemental check used a deployed owner-RLS RPC snapshot and the actual local MiniLM query adapter. It asserted that the exact three persisted passages and metadata were sent to localhost Ollama and that the returned structured sources matched them. Real generation used **943 prompt tokens**, **41 output tokens**, **3,381 context bytes** and approximately **3.84 seconds**, returning the supported Cedar/useState answer. This supplements the normal authenticated browser/API test, rather than replacing it. The production build independently returned that answer with expandable sources; proof is `.setup-cache/phase-11/production-citations.jpg`.

Ocean-only scope returned **Blue Lantern** and **krill**, supported by the ocean PDF and its own source group. The all-document question **How does useState store component state, and what do baleen whales filter from seawater?** used five passages and showed two distinct source groups (three ocean passages, two React passages), returning supported facts from both. A differently worded combined question retrieved only ocean evidence at the unchanged 0.30 threshold; no React citations were fabricated. This illustrates that attribution accurately exposes retrieval inputs but cannot repair missing retrieval or guarantee generation quality.

The unrelated medieval-cathedral question returned insufficient context with no generation or source section. The related annual-budget question retrieved one React passage; Ollama said the supplied context did not determine a budget. That relevant passage remained explicitly labeled as context supplied, without inventing a budget or its source. Existing no-context and error contracts remain intact.

Deployed read-only role/JWT emulation returned six all-scope and three React-only results for the owner, and zero of the owner's results for another authenticated identity. That identity could not read document/chunk/Storage metadata; anonymous RPC execution and invalid vector/control arguments remained blocked. The second identity was synthetic because only one real account exists. Automated chat/citation contracts likewise returned no foreign filename, document ID, excerpt or pages when retrieval yielded no owned matches. No policies or grants were changed.

The user approved permanent deletion of exactly `phase-11-react.pdf` and `phase-11-ocean.pdf`. The production Documents app removed both PDFs and metadata records, cascading all six chunks/embeddings. Read-only checks found zero remaining fixture files/rows/chunks and zero orphan chunks; the bucket remains private and the single Auth account is intact. A fresh production React question afterward returned insufficient context with no generation and zero source sections, confirming deleted documents cannot supply new citations; proof is `deleted-sources-proof.jpg`. Local ignored fixtures, synthetic text snapshots and proof artifacts remain for review/regeneration. No other file, record or account was deleted.

`LLM_MODE=local`, the reviewed `qwen3:4b-instruct` model and the loopback-only origin were verified without printing credentials. `.env.local` is still ignored/untracked. Supabase reports `free` / `tier_free`. No installation, model download, OpenAI request/usage, hosted inference or paid API/feature occurred. No schema migration, conversation persistence or Phase 12 work was introduced. Phase 11 is complete within the requested evidence-presentation scope; sources expose input provenance, not automatic claim-level verification.
