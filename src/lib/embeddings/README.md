# Local document embeddings — Phase 7

An embedding is a numerical representation of a passage. The numbers form a vector in a learned space; related passages often point in similar directions. Its 384 dimensions are learned features, not 384 named concepts. Cosine similarity compares directions: a higher score suggests closer meaning for this model. Embeddings encode text for later comparison; they do not generate chatbot answers.

## Model and preprocessing

- Official `@huggingface/transformers` package, pinned to **4.3.1**.
- Model: **`Xenova/all-MiniLM-L6-v2`**, revision **`751bff37182d3f1213fa05d7196b954e230abad9`**.
- Local ONNX execution on CPU, quantized `q8` weights, two inference threads.
- Mean pooling followed by L2 normalization: each output has **384 finite numeric values** and length approximately 1.
- Batches of **four chunks**; all chunks retain text, document ID, index, physical pages, offsets, overlap, character count, and tokenizer count.

The model identifier is an ONNX-compatible conversion of the sentence-transformers MiniLM model. See its [model card](https://huggingface.co/Xenova/all-MiniLM-L6-v2) and the [official package release](https://github.com/huggingface/transformers.js/releases/tag/4.3.1). Actual execution with this installed version is covered by the offline model tests. Future stored chunks and query vectors must use the same model revision, pooling, and normalization; matching dimensions alone does not make two embedding spaces compatible.

This is a small English-oriented development model. Similarity is approximate, and the three-sentence learning test is an example rather than a general quality benchmark. Quantized inference can produce small numerical differences when batch padding changes. Repeat tests compare the same inputs in the same batch configuration.

## Download once, run offline

```powershell
npm run embeddings:prepare
npm run dev
```

Preparation downloads four public model artifacts from the pinned Hugging Face revision: configuration, tokenizer configuration, tokenizer, and quantized ONNX weights. It sends no document text, credential, or inference request. Files are saved under the ignored `.setup-cache/transformers/<model>/<revision>/` directory. Existing nonempty files are reused. Network access is needed for the initial public download; a missing artifact must be prepared before inference can start.

`local-model.ts` loads only that explicit local directory, with remote models disabled and `local_files_only: true`. It uses the official `AutoTokenizer`, `AutoModel`, and `FeatureExtractionPipeline` constructors. In installed version 4.3.1, the convenience `pipeline()` helper performs registry discovery without forwarding all offline/revision options. The explicit constructors and local directory avoid that discovery; tests block fetch, HTTP, HTTPS, TCP, and TLS during actual model initialization and inference.

The lazy shared promise in `embed-chunks.ts` initializes the model on the first nonempty request and reuses it within the server process, including development module reloads. A process restart reloads the cached files into memory. This singleton retains model resources and counters, not users' PDFs, chunks, or embeddings. Empty documents do not initialize it. A failed load permits a later retry; errors do not expose internal paths or private content.

One embedding job runs at a time per process. A concurrent request receives a safe HTTP 409 retry message instead of accumulating a queue of private text. Four-item batches limit inference memory. Multiple processes each have their own model instance. This phase is validated on the local Node.js server; hosting native inference and model cache provisioning are deployment work for a later phase.

## Character counts are not token counts

The existing chunker still uses a 1,200-character maximum and up to 200-character overlap. Before inference, every chunk is tokenized without truncation. The verified tokenizer capacity is 512 tokens, including special tokens. If any chunk exceeds it, the whole request returns HTTP 422 before embedding any batch. It reports the chunk index and explains that smaller token-aware chunks are needed; no prefix-only vector is returned. Token-aware splitting is not introduced here. English development fixtures fit, but some scripts and unusual text can tokenize much more densely.

## Authenticated request flow

```text
Documents: Extract text → inspect chunks → Generate local embeddings
  → POST /api/documents/embed with { id } only
  → Middleware and route verify the normal authenticated session
  → Existing extraction handler validates origin/body/id
  → Reconstruct the verified user's private Storage object path
  → Owner-only Storage download → local PDF extraction → manual chunking
  → Token-limit preflight → lazy cached local model → batches of four
  → Validate dimensions, finite values, and unit normalization
  → Return document metadata and all embedded chunks, private/no-store
  → Temporary React state; selected chunk shows its first eight values
```

The browser cannot supply another owner's path, source text, or chunks. The handler reuses the existing secure extraction pipeline and never uses a service-role key. Storage policies provide the independent ownership boundary. An inaccessible PDF returns the existing generic error before any model call. No application table, schema change, vector column, persistent embedding cache, search, or RAG prompt is needed.

The **embedding inspector is visible only under `npm run dev`**. It reports model, dimension, count, batches, initialization/reuse, and the selected chunk's token count and first eight values. Full vectors exist temporarily in the response and React state; refresh, navigation, closing the preview, re-extraction, or deletion of the matching document clears them. `npm start` hides this inspection UI, while the authenticated endpoint retains the same server-side protections. Model files remain cached on disk; document-derived results do not.

## Verification

```powershell
npm run test:embeddings
npm run test:embeddings:model
npm run test:embeddings:fixtures
```

The contract tests use controlled outputs only for validation/error coverage and an offline official Storage SDK fixture for owner-path checks. They test lazy loading, empty input, batching, metadata, reuse, concurrency, retries, safe errors, token limits, dimensions, finite numbers, normalization, signed-out requests, forged fields, inaccessible documents, image-only and corrupted PDFs. They are not a substitute for deployed Storage RLS checks.

The real-model tests run the actual tokenizer and cached ONNX model with all network access blocked. They embed real parser/chunker output from a generated multipage PDF, check all vectors and metadata, confirm initialization count stays at one, and reject token overflow. The semantic learning test compares:

- “React is a JavaScript UI library”
- “React is used to build user interfaces”
- An unrelated sentence about whales.

The related pair scored **0.742234**, while the unrelated pair scored **0.000506** in the verified run. This test computes cosine similarity locally and adds no retrieval API.

For a live check, upload the generated `phase-7-embedding-test.pdf` from `.setup-cache/embedding-tests/` using your normal session. Extract it, inspect every chunk, then generate embeddings twice. Verify 384 dimensions, all chunks embedded, page 2 omitted from text metadata, and model reuse on the second request. Refresh should preserve the stored PDF and clear all previews. Delete only a disposable fixture through the app with the appropriate approval.

`LLM_MODE=mock` stays unchanged. Neither the embedding code nor these tests call OpenAI or a hosted inference API. No paid provider, Supabase upgrade, or paid processing service is used.
