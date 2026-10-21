# Known limitations and future work

[Documentation index](README.md) · [Project overview](../README.md)

## Known limitations

- Local, small-scale application; not an internet-facing multi-tenant production service.
- English-oriented MiniLM, character-based chunking, 512-token input capacity and approximate semantic relevance. Oversized token sequences are rejected rather than silently truncated.
- PDFs capped at 4 MiB, 100 pages and 200,000 extracted characters; up to 500 persisted chunks. No OCR, images or encrypted-PDF support.
- Parsing has size/result limits but no hard hostile-PDF CPU/memory sandbox. Use trusted learning documents locally.
- Process-local inference concurrency guards; no distributed rate limiter, queue or background ingestion jobs.
- Short non-streaming generation, no reranking/hybrid retrieval, no conversation memory sent to the model.
- Citations prove input provenance, not claim-by-claim entailment. Prompt injection/hallucination cannot be completely prevented by wording alone.
- Two-real-user acceptance remains pending; current automated/offline and database identity tests are documented separately.
- Supabase default confirmation email restrictions and disabled leaked-password protection remain constraints; no paid Auth upgrade is enabled.
- The Phase 13 production audit was clean; its full audit retained a development-only `braces` advisory chain. This is historical evidence, not a current vulnerability assessment. Rerun the audit before release; see the security guide.

## Future improvements

Only after deliberate review: token-aware chunking, OCR with an explicit privacy/cost plan, streaming, bounded conversational context, retrieval evaluation, stronger parsing isolation, distributed abuse controls and scalable indexing when measurement justifies it. Hosted inference/deployment would require a separate infrastructure and zero-cost decision.
