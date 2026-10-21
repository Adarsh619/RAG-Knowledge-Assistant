# Using Groundwork

## Start and sign in

Follow [local setup](setup.md) first. On a prepared checkout, start Ollama and run Next.js on loopback. Open `http://localhost:3000`, then sign in with your confirmed Supabase account. Enter credentials only in the app. Account, Settings and workspace pages require authentication.

`LLM_MODE=mock` is the safe server default and returns development responses. Set `LLM_MODE=local` deliberately and restart Next.js for real local AI. Choosing a chat mode in the UI does not change the server provider or enable OpenAI.

## Add knowledge

1. Open **Documents**, drag one PDF into the upload area or choose **Choose PDF**.
2. Upload the file. PDFs must be nonempty and no larger than **4 MiB**; important checks also run on the server.
3. Choose **Process for AI**. Existing extraction, chunking, local embeddings and database ingestion run together.
4. Wait for **Ready for AI** before asking document questions. A scanned/image-only PDF needs OCR, which this app does not provide.

The overflow menu exposes details, text/chunk previews, indexing information, re-processing and deletion. The context panel shows available metadata; page/chunk information appears after processing. Failed re-processing preserves the previous ready index. Do not upload hostile or sensitive production documents to this learning application.

## Choose an answer mode

| Mode | Behavior | Sources |
| --- | --- | --- |
| Documents | Answers only from relevant ready documents; abstains if evidence is insufficient | Retrieved passages actually used |
| General AI | Uses the local model without document retrieval; works without PDFs | None |
| Auto | Uses relevant documents when available, otherwise local general knowledge | Only for document-grounded answers |

Document scope is separate: search all ready documents or one selected document. General AI disables the scope control without using it for retrieval. **Ask about this document** opens Chat in Documents mode with that document selected. An unavailable saved scope is not silently broadened.

General answers are labelled **General AI answer — not based on your uploaded documents**. They can be inaccurate. Auto does not hide retrieval errors by answering generally. Documents mode offers **Try General AI** and **Change document scope** when evidence is missing; these actions change the controls rather than automatically sending another question.

## Chat and evidence

Use **New Chat**, type a standalone question and press Enter to send. Shift+Enter inserts a newline. Questions are limited to 1,000 characters. Prior messages are saved for display but are not sent as model memory; repeat the subject in follow-up questions instead of relying on “it” or “that.”

Expand **Sources** to inspect filenames, physical PDF pages and exact excerpts. Similarity measures relevance, not certainty. Citations identify model input, not proof that every generated claim is correct.

Recent conversations reopen saved questions, answers and original source snapshots after refresh. The conversation overflow menu offers deletion with confirmation. If generation fails, use the available retry flow; no completed assistant answer is fabricated.

## Appearance and account

Use the header theme button or **Settings → Appearance** for Light, Dark or System. These controls share the same locally saved preference. Settings also exposes the default chat mode and local AI availability. The sidebar and context panel are independent and become overlays on smaller screens; Escape closes overlays/menus.

The avatar menu opens Account and Settings, shows email verification, and separates Sign Out. Account displays existing authentication details and genuine application counts without a profile table. Self-service password recovery is not configured.

## Privacy and deletion

PDFs, vectors and saved conversations live in your Supabase project under owner-only policies. Generation and embeddings run locally; “local AI” does not mean all storage is offline. Deleting a PDF removes its index but **does not erase saved excerpts in old chats**. Delete the corresponding conversations to remove those copies. There is no account-erasure workflow.

If local AI is unavailable, start Ollama and verify the already-installed reviewed `qwen3:4b-instruct` model in Settings. Never expose Ollama publicly. The app does not download models or fall back to a hosted provider. See [Ollama setup](setup.md#ollama-setup) for configuration and [testing](testing.md) for acceptance checks.
