# Groundwork — RAG Knowledge Assistant

A learning and portfolio project built incrementally with Next.js, TypeScript, and Tailwind CSS. **Current scope: Phase 3 — Supabase authentication with the existing local mock chat.**

## Run locally

Use Node.js 24 and npm for the app and local tests. Current Supabase libraries require Node.js 22 or newer, and the test scripts use Node.js 24's built-in TypeScript support. This project is validated with Node.js 24.13.0. The foundation uses Next.js 15.5.26 (App Router), React 19, and Tailwind CSS 4.

```powershell
npm install
npm run dev
```

Open http://localhost:3000/login, or the URL printed by Next.js if that port is occupied. Stop a production preview on the same port before starting development.

No LLM API key, credits, or payment method is needed. Supabase authentication uses the existing Free-plan project URL and public publishable key in `.env.local`. The exact names are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; do not use a private secret/service-role key. If `LLM_MODE` is unset or blank, chat defaults to `mock`. Preserve existing local values and keep:

```dotenv
LLM_MODE=mock
```

`.env.example` includes this setting and an empty `OPENAI_API_KEY` placeholder. `.gitignore` excludes `.env.local` and all other `.env*` files except the example. Never paste a key into a chat, source file, README, or Git. Restart the server after changing environment settings.

## What works now

- `/`: the Phase 1 dashboard and placeholder counts.
- `/chat`: working local message submission, user and assistant bubbles, a loading state, error messages, and a clearly labeled mock response.
- `/documents`: the Phase 1 empty library and disabled upload UI.
- Shared responsive navigation, active-page indication, and skip-to-content link.
- `/login` and `/signup`: email/password authentication; application pages and the chat API now require a verified session.

Enter sends a message; Shift+Enter adds a new line. Empty/whitespace-only messages are blocked in both the UI and API. Messages are limited to 4,000 characters. Rapid duplicate sends are blocked while waiting. A failed request restores the draft for retry. Each request sends only the current message; mock responses do not reason over previous messages.

Chat messages live in React state only. Refreshing or leaving the chat clears them. Chat content is not written to a database, browser storage, or file. Supabase Auth owns user/session records and the SSR SDK maintains session cookies. Document uploads, embeddings, retrieval, RAG, citations, and conversation persistence remain outside this phase.

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
4. PDF upload and Supabase Storage
5. PDF text extraction
6. Document chunking and metadata
7. Embedding generation
8. pgvector database setup
9. Semantic/vector similarity search
10. Full manual RAG pipeline
11. Source citations
12. Conversation history and document management
13. Error handling, security, UI improvements, and Vercel deployment

**Stop after reviewing and testing Phase 3. Phase 4 requires a separate instruction.** No LangChain, LangGraph, agents, or RAG frameworks are used.

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

The chat provider still makes no external LLM request. Its network-blocking tests observed zero attempts, and OpenAI remains disabled. Only basic Supabase Auth was used in live authentication checks; no paid add-on or paid API was used or enabled by this implementation.

References: [SSR clients and session verification](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [password authentication](https://supabase.com/docs/guides/auth/passwords), [publishable keys](https://supabase.com/docs/guides/getting-started/api-keys).
