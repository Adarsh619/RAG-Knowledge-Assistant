# Groundwork — RAG Knowledge Assistant

A learning and portfolio project built incrementally with Next.js, TypeScript, and Tailwind CSS. **Current scope: Phase 4 — private PDF uploads and Supabase Storage, with authentication and local mock chat.**

## Run locally

Use Node.js 24 and npm for the app and local tests. Current Supabase libraries require Node.js 22 or newer, and the test scripts use Node.js 24's built-in TypeScript support. This project is validated with Node.js 24.13.0. The foundation uses Next.js 15.5.26 (App Router), React 19, and Tailwind CSS 4.

```powershell
npm install
npm run dev
```

Open http://localhost:3000/login, or the URL printed by Next.js if that port is occupied. Stop a production preview on the same port before starting development.

No LLM API key, credits, or payment method is needed. Supabase authentication and Storage use the existing Free-plan project URL and public publishable key in `.env.local`. The exact names are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; do not use a private secret/service-role key. If `LLM_MODE` is unset or blank, chat defaults to `mock`. Preserve existing local values and keep:

```dotenv
LLM_MODE=mock
```

`.env.example` includes this setting and an empty `OPENAI_API_KEY` placeholder. `.gitignore` excludes `.env.local` and all other `.env*` files except the example. Never paste a key into a chat, source file, README, or Git. Restart the server after changing environment settings.

## What works now

- `/`: dashboard with links to the private library; conversation/index counts remain placeholders.
- `/chat`: working local message submission, user and assistant bubbles, a loading state, error messages, and a clearly labeled mock response.
- `/documents`: private PDF upload, persistent file listing, name/size/date metadata, and owner deletion.
- Shared responsive navigation, active-page indication, and skip-to-content link.
- `/login` and `/signup`: email/password authentication; application pages, chat API, and document API require a verified session.

Enter sends a message; Shift+Enter adds a new line. Empty/whitespace-only messages are blocked in both the UI and API. Messages are limited to 4,000 characters. Rapid duplicate sends are blocked while waiting. A failed request restores the draft for retry. Each request sends only the current message; mock responses do not reason over previous messages.

Chat messages live in React state only. Refreshing or leaving the chat clears them. Chat content is not written to a database, browser storage, or file. Supabase Auth owns user/session records and the SSR SDK maintains session cookies. PDFs persist in private Storage. PDF text extraction, embeddings, retrieval, RAG, citations, and conversation persistence remain outside this phase.

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

The Supabase folder now contains Phase 3 authentication utilities. `src/lib/rag/` remains a placeholder.

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
4. PDF upload and Supabase Storage — current phase
5. PDF text extraction
6. Document chunking and metadata
7. Embedding generation
8. pgvector database setup
9. Semantic/vector similarity search
10. Full manual RAG pipeline
11. Source citations
12. Conversation history and document management
13. Error handling, security, UI improvements, and Vercel deployment

**Stop after reviewing and testing Phase 4. Phase 5 requires a separate instruction.** No LangChain, LangGraph, agents, or RAG frameworks are used.

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

| Operation | Required conditions |
| --- | --- |
| INSERT/upload | `authenticated` role; `documents` bucket; first folder equals `auth.uid()`; `owner_id` equals `auth.uid()`; exactly one folder; safe generated PDF filename |
| SELECT/list/read | `authenticated` role; same bucket; both first folder and `owner_id` equal `auth.uid()` |
| DELETE | Same owner conditions as SELECT |
| UPDATE/overwrite/move | No policy granted; uploads use `upsert: false` |

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
