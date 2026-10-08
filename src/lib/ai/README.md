# AI integration boundary

Phase 2 provides a server-only provider interface and selection by `LLM_MODE`.

- Unset, blank, or `mock`: `providers/mock.ts` returns a local response. No network calls.
- `openai`: the API rejects the request, and `providers/openai.ts` also throws if called directly. It has no SDK or HTTP implementation.
- Other values: a configuration error; no fallback to an external provider.

All provider modules import `server-only`, which prevents them from being bundled into Client Components. Shared data types live in `src/types/chat.ts` and contain no secrets.

Later, with explicit approval to enable real usage, implement `reply()` in the OpenAI module and deliberately set that provider's `enabled` flag to true. Read `OPENAI_API_KEY` only inside that server module. Select OpenAI only through explicit `LLM_MODE=openai`; never switch based on the key's presence. The frontend and API already use the provider's availability, so their request and response contract stays the same.

No real API key is needed, read, or transmitted in Phase 2. Embeddings remain outside this phase.
