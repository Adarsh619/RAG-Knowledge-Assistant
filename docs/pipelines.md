# Pipeline walkthrough

[Documentation index](README.md) · [Project overview](../README.md)

## How the pipelines work

**Ingestion:** upload a private PDF → click **Process for AI** → authenticated Storage download → extract text by physical page → chunk at natural boundaries (1,200 characters, up to 200 overlap) → batch local embeddings → transactionally persist metadata/chunks/vectors. **Re-process** atomically replaces a document's chunks; failures keep the previously ready version. No OCR is performed.

**Retrieval:** a question is embedded with the same pinned MiniLM revision, mean pooling and normalization. The invoker RPC applies owner/ready/model filters and compares vectors with pgvector cosine distance `<=>`. Similarity is `1 - distance`; larger values indicate closer vector directions, not correctness probabilities. Default top-k is 5 and threshold is 0.30; the learning inspector allows bounded adjustments. Exact search is appropriate for this small project; there is no HNSW/IVFFlat index.

**Document generation:** the current question plus relevant owned passages form a JSON reference context, ordered by similarity, deduplicated by chunk ID and capped at 6,000 context bytes / 7,000 prompt bytes. In **Documents** mode, empty context returns an insufficient-information message without contacting Ollama. The system prompt confines answers to evidence and treats document text as untrusted reference material. Ollama receives only a system/user pair, uses temperature 0, and has a 120-second timeout and 384-token output cap. Truncated/malformed responses fail visibly. Prompt instructions reduce hallucination but do not eliminate it.

**Chat modes:** **General AI** skips retrieval and calls local Ollama without document citations. **Auto** tries document retrieval first, then uses local general knowledge only after a successful insufficient-context result; retrieval/auth/runtime errors do not trigger fallback. General answers are explicitly labelled as not based on uploaded documents. Chat mode is separate from `LLM_MODE`, which selects the server provider. Settings saves the default chat mode locally; reopening a conversation restores its last completed answer's mode and saved document scope. See the [user guide](user-guide.md).

**Citations:** the application attaches sources from the passages actually included in the prompt, never model-invented identities. Each includes document/chunk IDs, filename, chunk index, pages, rank, similarity and a shortened exact excerpt. The UI groups by document without discarding distinct chunk evidence. Similarity is relevance, not certainty; verify the passages yourself.

**Saved chats:** save the pending question before generation → run RAG → atomically save the answer and citation snapshot → mark the question completed. Request IDs prevent duplicate generation; attempt IDs and a five-minute lease permit safe interrupted retries. Completed replay returns the saved result. Failed questions have no fabricated assistant answer. History is for storage/display continuity: prior chat messages are **not** passed to the model, so write standalone follow-up questions.

**Deletion:** marking a document as deleting excludes it from retrieval, then the app removes Storage content and database metadata. Chunk/vector rows cascade-delete. Partial cleanup remains visible for retry. Historic saved citation excerpts survive PDF deletion; delete the conversation to remove its saved messages/evidence. An unavailable saved document scope is rejected, never silently broadened.
