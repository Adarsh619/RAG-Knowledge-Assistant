# Acceptance and regression testing

## Automated checks

Prepare public MiniLM artifacts once (only with deliberate download approval), then run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run release:check -- --runtime
npm audit --omit=dev
```

Tests cover offline auth/session/redirect fixtures, file type/size/path checks, local extraction, chunk text conservation/page boundaries/overlap, real MiniLM dimension/normalization/semantic similarity, ingestion/re-ingestion/deletion repository contracts, retrieval limits/ownership, grounded context, citation provenance/deduplication, persistence/replay/failure and runtime protocol errors. They block real inference network access; fixture generators are not evidence of a real production response. `--runtime` reads Ollama inventory only; it sends no question or private content.

## Single-user browser acceptance

Run the production build locally on loopback with local Ollama available. Use disposable synthetic documents only; generated fixtures are ignored under `.setup-cache/`.

1. Sign up/confirm or sign in directly in the app. Never give test automation/chat your password. Test an invalid password and a signed-out protected route; reload and confirm the legitimate session persists. Sign out and verify APIs return 401. If using an existing session, record that fresh signup/login/logout were not rerun.
2. Upload a text PDF ≤4 MiB; verify listing/name/size/date and refresh. Reject `.txt`, a false PDF header, an empty file and >4 MiB. Existing scripts can generate these fixtures without real private data.
3. Extract text; verify physical pages and readable preview. Inspect chunks ≤1,200 characters with ≤200 overlap. Empty/image-only PDFs should produce no chunks; malformed/encrypted inputs should fail visibly.
4. Ingest, wait for Ready, refresh and confirm persisted chunk/model/date metadata. Re-ingest; verify the same document record persists without indefinite duplicates.
5. Search a known topic across all ready documents and in one document. Inspect pages/excerpts/scores. Change top-k/threshold within their bounds; unrelated questions should score lower.
6. Ask a standalone question answered by the PDF. Inspect the grounded local answer and Sources; verify the filename, pages and excerpt against the PDF. Ask an unrelated question and expect insufficient-context behavior/no misleading sources.
7. Create another conversation, switch between them, reload the selected conversation URL and verify separation, scope and original evidence. Resend/retry an interrupted turn rather than producing duplicate questions. Deleting a source must not silently broaden a saved scope; historical evidence remains a snapshot.
8. Temporarily stop Ollama yourself (do not remove models). Ask a supported question: show local start instructions, persist a failed/pending question without a completed invented assistant record, and offer retry. Restart Ollama and retry. Offline tests cover model absence, malformed/oversized responses, timeout and unsupported model/endpoint without changing the machine's model inventory.
9. Use keyboard Tab/Shift+Tab; verify visible focus, labelled controls, Enter-to-send, Shift+Enter multiline and expandable source cards. Test 375 px mobile and 200% zoom; long filenames/answers must wrap, controls remain usable, and the document library stacks into labelled rows.
10. Confirm the exact disposable items before permanent app deletion. Verify document/chunk cascade and conversation/message cascade; never use broad SQL deletion or delete another user's real data to test a policy.

## Two REAL Supabase Auth users — pending

**Status:** not executed in Phase 13 because no second confirmed account was available. Do not count a synthetic JWT, `SET ROLE` check or offline transport as a real-user acceptance pass. No test users are created automatically.

Use two normal confirmed accounts A and B, with separately signed-in browser profiles (or sign out completely before switching). Create a new account only with explicit approval and enter its credentials yourself. Free default email delivery may require a project team address. Do not upgrade or disable confirmation as a shortcut.

Use a synthetic A PDF whose evidence contains a unique fact, e.g. “The React training project is named Cedar-47.” Use unrelated B content with a different unique fact. Record fixture storage basenames and document/conversation UUIDs locally for targeted negative checks; do not post tokens, personal emails or private excerpts.

| Action | User A expected | User B expected |
| --- | --- | --- |
| Upload, list, refresh PDF | A's file visible | A's file absent |
| Ingest and inspect metadata | Ready with chunks/model/date | No A document record in B's list |
| All-document semantic search | A's relevant chunks | No A filename/content/pages/IDs |
| Single-document search using A UUID | Owned source matches | No foreign results (or safe unavailable error) |
| Local RAG question about A's unique fact | Grounded answer + A sources | No A fact/evidence; insufficient context if B has no relevant evidence |
| Open A conversation URL | Saved messages + citations | Unavailable without A content/title/sources |
| Append turn to A conversation | Works normally | 404/unavailable; no message saved under A |
| Targeted extraction/ingestion using A basename | Works normally | Cannot download/parse/ingest A PDF |
| Targeted deletion of A fixture from B | A controls own deletion | Rejected/no change to A's file/records/messages |
| Conversation modification/deletion | A controls own data | No A update/delete; verify as A afterward |

For targeted API probes, use browser Developer Tools → Network while signed in as B, copy the shape of your own normal request, and substitute only the recorded A identifier. Keep the B browser's ordinary cookie session; never replace it with admin keys. Probe the existing `/api/documents` actions, `/api/documents/search`, `/api/conversations/<A UUID>` and its `/messages` route. Ask for confirmation before any permanent fixture cleanup. Negative writes must be rejected and A must recheck that data remains.

Test the Data API boundary too: in B's real session, use a local Supabase client with the publishable key and B's authenticated token (entered only locally) to SELECT A documents/chunks/messages and attempt targeted INSERT/UPDATE/DELETE against A records. Expected reads are empty and writes fail/affect zero rows. Store only outcome counts/statuses, not credentials, and recheck A's records afterward. The admin SQL editor bypasses RLS unless a role/JWT is emulated; its normal SELECT is not a User B test.

Record date, app commit/build, browser profiles, expected/actual outcomes, and fixture cleanup separately. Mark this gate passed only when both real sessions have been used. Do not create/debug a new privileged API just to run the test.

## Release gate

Use [the release checklist](release.md) and update [Phase 13 results](phase-13.md) with honest pass/pending status. Previous phase live evidence is regression history, not a fresh Phase 13 sign-up run.
