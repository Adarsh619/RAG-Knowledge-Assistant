# Shared application types

`chat.ts` contains message, request, response and provider contracts. It supports mock, local and disabled OpenAI modes, optional document scope and grounding/cancellation options. `rag.ts` contains a small generation summary (status, model, retrieved/used counts and context bytes); it does not expose chunk contents or embedding vectors.

`document.ts`, `extraction.ts`, `chunk.ts`, `embedding.ts`, `ingestion.ts` and `retrieval.ts` describe the earlier document pipeline. These shared files contain no environment reads or secrets and can be imported in browser or server code. Component-only prop types live beside their components. Polished citations and persisted conversations remain future phases.
