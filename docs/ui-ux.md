# Workspace UI enhancement

The subsequent [final UI refinement](final-ui-ux.md) adds dedicated protected Account and Settings pages, shared action menus, a more compact chat layout and native PDF drop handling. Account/Settings now use pages rather than the earlier dialogs described below.

The application shell now has an icon/label navigation sidebar, main workspace and independently collapsible context panel. Below 1024px both sidebars become modal slide-overs. Mobile drawers support Escape, focus containment and focus restoration. Account and destructive-action dialogs use the native HTML dialog element.

## Navigation and preferences

- Workspace breadcrumbs link to the dashboard.
- Chat history lives in the navigation sidebar while Chat is open.
- The account trigger opens My Account, Settings, Theme and Sign Out.
- Settings includes Light, Dark and System, model availability and a privacy explanation.
- `groundwork.theme`, `groundwork.sidebar` and `groundwork.context` store only appearance preferences in browser local storage. No credentials or document data are stored there by this UI.
- The root applies the theme before paint. System follows the operating system; preferences synchronize across tabs. Restricted local storage does not prevent using the interface.

## Documents

Upload PDF → **Process for AI** → **Ready for AI**. The primary action uses the existing authenticated ingestion endpoint without changing extraction, chunking, embeddings or persistence. Ready cards open Chat with the persisted document UUID selected. UUID syntax is validated for the UI; existing server authorization/RLS remains authoritative.

Each card has an actions disclosure for details, extracted text, chunks, re-processing and deletion. The right drawer shows available file/page/chunk/processing metadata. Page counts become available after processing. A failed re-processing attempt retains the previous ready index. Deletion warnings explain that saved conversation excerpts remain until those conversations are deleted.

## Chat and dashboard

Chat retains the existing pending/completed/failed protocol, request IDs, retries, scope controls, saved citations and message pagination. The context panel summarizes scope and conversation details; source excerpts remain beneath their original answers.

### Explicit answer modes

- **Documents** (default): the existing local embedding and owned-chunk retrieval pipeline. Insufficient evidence produces an explanation without generation or citations.
- **General AI**: authenticated local Ollama generation without document retrieval. Answers are labelled as general model knowledge and have no document citations.
- **Auto**: retrieves first, then uses grounded generation when evidence is available or general local generation when retrieval successfully finds insufficient evidence. Retrieval errors never trigger a general fallback.

Mode and document scope are separate. General AI disables the scope control while retaining its selection for later document questions. “Ask about this document” opens Documents mode with that document selected. New chats use the browser's `groundwork.chat-mode` preference. Each completed assistant response records requested mode and answer provenance in the existing `rag` JSON metadata; reopening a conversation restores its last completed answer's mode. Legacy answers default to Documents. No migration is required, and source snapshots remain unchanged.

The header theme button cycles Light → Dark → System → Light through the same provider used by Settings. Explicit body colours and colour schemes cover every route. Preference synchronization ignores unrelated storage events. Both drawers use brief transitions, with motion disabled when the operating system requests reduced motion.

Dashboard summaries use the existing authenticated document and conversation APIs. Each summary reads at most five pages; counts display `+` and a minimum-count explanation if more records remain. Failed/loading summaries display a dash rather than fabricated zeroes. Recent conversations link to their saved history.

## Local AI status

`GET /api/ai/status` requires a verified signed-in user and returns private, non-cacheable display metadata. In local mode it reuses the existing localhost-only, reviewed-model inventory check. It never generates an answer, downloads a model or calls hosted inference. Mock and disabled modes do not contact Ollama. Settings provides a manual refresh instead of background polling.

## Scope preserved

No migrations, database objects, RLS policies, model changes, dependency installs or upgrades. The document retrieval and RAG algorithms are preserved; explicit mode dispatch adds local general generation. OpenAI remains disabled and there is no hosted fallback. `package.json` changes only add test commands and include them in the existing suite; the dependency lockfile is unchanged.

## Validation

Completed checks:

- TypeScript, ESLint and the production build pass.
- Automated coverage includes theme fallback/resolution, document-scope URL validation, safe model status reporting, all three mode paths, failure isolation, and persisted answer provenance.
- The new status endpoint returns 401 and private/no-store caching for signed-out requests.
- The production sign-in page renders with the system dark theme.
- The dependency lockfile, database migrations, document retrieval, embeddings, RAG prompt construction, Supabase session utilities and localhost-only provider safeguards are unchanged.

Live authenticated checks confirm Light/Dark/System, header/Settings synchronization, Light persistence after refresh, account settings, clickable Settings → Workspace navigation, desktop panel controls, no desktop horizontal overflow, and mobile navigation/context slide-overs with Escape and close controls. A generated two-page PDF uploaded and processed through local extraction, chunking, embeddings and persistence. Scoped Documents and all-document Auto questions returned the correct React answer with original filename/pages/excerpt. Documents abstained for an unrelated Japan question; Auto answered Tokyo as clearly labelled General AI without citations. A standalone General AI question returned a correct photosynthesis explanation without citations. Saved messages, answer provenance, Auto mode and scope restored after refresh. All 216 automated tests pass, along with TypeScript and lint; the production build passes.

The reported theme-switch failure was not reproducible in the inspected build: Settings already changed the root attribute and computed colours. The refinement retains that architecture, makes body colours and explicit light colour scheme unambiguous, filters unrelated preference events, and adds the synchronized header control. No unsupported claim about the original failure's cause is made.

Real second-user ownership validation remains pending because no second confirmed account is available; the existing automated isolation regressions pass. A fresh logout/re-login and every authentication-page theme combination were not repeated in this refinement. No OpenAI or hosted inference request was used.

After explicit approval, the generated refinement PDF and both test conversations were deleted through the app. Document deletion confirmed PDF/index cleanup, and the dashboard returned to zero uploaded documents, ready documents and conversations. No other data was removed.

## Files in the refinement

- Theme and shell: `src/components/theme-provider.tsx`, `src/components/app-shell.tsx`, `src/components/ui/icon.tsx`, `src/app/globals.css`, `src/lib/ui/preferences.ts`.
- Chat modes: `src/types/chat.ts`, `src/types/rag.ts`, `src/lib/ai/general.ts`, `src/lib/ai/chat-handler.ts`, `src/lib/conversations/handler.ts`, `src/components/chat/chat-workspace.tsx`, `src/app/(protected)/chat/page.tsx`.
- Workflow copy/actions: `src/components/dashboard-workspace.tsx`, `src/components/documents/documents-workspace.tsx`.
- Tests and documentation: `scripts/check-chat-modes.mjs`, `scripts/check-conversations.mjs`, test scripts in `package.json`, `README.md`, this guide.

The preceding shell pass also introduced `src/components/shell-context.tsx`, `src/components/ui/modal.tsx`, `src/components/chat/conversation-history.tsx`, `src/app/api/ai/status/route.ts`, `src/lib/ai/status.ts`, `src/types/ai-status.ts` and `scripts/check-ui.mjs`, and updated protected page wrappers, the root layout and protected status route handling in middleware. These existing changes were preserved rather than recreated.
