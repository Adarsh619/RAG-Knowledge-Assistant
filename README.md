# Groundwork — RAG Knowledge Assistant

A learning and portfolio project built incrementally with Next.js, TypeScript, and Tailwind CSS. **Current scope: Phase 2 only — local mock chat without RAG.**

## Run locally

The app requires Node.js 20.9 or newer and npm. The local test script uses Node.js 24's built-in TypeScript support; this project is validated with Node.js 24.13.0. The foundation uses Next.js 15.5.26 (App Router), React 19, and Tailwind CSS 4.

```powershell
npm install
npm run dev
```

Open http://localhost:3000/chat, or the URL printed by Next.js if that port is occupied. Stop a production preview on the same port before starting development.

No API key, billing account, credits, or payment method is needed. If `LLM_MODE` is unset or blank, the server defaults to `mock`. To make configuration explicit, create a `.env.local` file containing only:

```dotenv
LLM_MODE=mock
```

`.env.example` includes this setting and an empty `OPENAI_API_KEY` placeholder. `.gitignore` excludes `.env.local` and all other `.env*` files except the example. Never paste a key into a chat, source file, README, or Git. Restart the server after changing environment settings.

## What works now

- `/`: the Phase 1 dashboard and placeholder counts.
- `/chat`: working local message submission, user and assistant bubbles, a loading state, error messages, and a clearly labeled mock response.
- `/documents`: the Phase 1 empty library and disabled upload UI.
- Shared responsive navigation, active-page indication, and skip-to-content link.

Enter sends a message; Shift+Enter adds a new line. Empty/whitespace-only messages are blocked in both the UI and API. Messages are limited to 4,000 characters. Rapid duplicate sends are blocked while waiting. A failed request restores the draft for retry. Each request sends only the current message; mock responses do not reason over previous messages.

Messages live in React state only. Refreshing or leaving the chat clears them. Nothing is written to a database, browser storage, or file. Document uploads, auth, embeddings, retrieval, RAG, citations, and conversation persistence are outside this phase.

## Files created or modified in Phase 2

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

The folders `src/lib/supabase/` and `src/lib/rag/` remain the Phase 1 placeholders. No integration has been implemented there.

## Final request/response flow

```text
ChatWorkspace (browser)
  → POST /api/chat with { message }
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

`app/chat/page.tsx` remains a Server Component. It reads the selected mode and provider availability on each request (`force-dynamic`) and passes only those non-secret values to `ChatWorkspace`. This also makes the status reflect runtime configuration when using a production build.

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

`test:chat` runs the actual route and providers in-process, using Node.js 24. It blocks fetch, HTTP, HTTPS, TCP, and TLS before testing. It checks default/explicit mock mode, a dummy key, input validation, disabled OpenAI mode, unknown configuration, and safe provider errors. It asserts **zero attempted outbound requests**, not just zero successful requests. No real key is used for these tests.

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
2. Basic chat architecture without RAG, local mock provider — current phase
3. Supabase authentication — not started
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

**Stop after reviewing and testing Phase 2. Phase 3 requires a separate instruction.** No LangChain, LangGraph, agents, or RAG frameworks are used.
