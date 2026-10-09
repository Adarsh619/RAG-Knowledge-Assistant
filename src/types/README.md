# Shared application types

`chat.ts` contains message, request, response and provider contracts. It supports mock, local and disabled OpenAI modes, optional document scope and grounding/cancellation options. `rag.ts` contains a generation summary and `RagSource`: context rank, document/chunk IDs, original filename, chunk index, physical pages, cosine similarity, a bounded exact excerpt and a truncation flag. Sources describe passages actually sent to the generator, not model-invented identity or verified support for every claim. Vectors and full chunk contents stay outside the chat response.

`document.ts`, `extraction.ts`, `chunk.ts`, `embedding.ts`, `ingestion.ts` and `retrieval.ts` describe the earlier document pipeline. These shared files contain no environment reads or secrets and can be imported in browser or server code. Component-only prop types live beside their components. Persisted conversations remain a future phase.
