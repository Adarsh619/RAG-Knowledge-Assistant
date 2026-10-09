# AI integration boundary

The server-only provider interface selects by `LLM_MODE`. Local document generation uses the manually installed Ollama runtime. Phase 11 attaches source metadata in `rag/answer.ts` from the selected context chunks after generation. The model provides answer text only; it does not supply citation identity.

- Unset, blank, or `mock`: `providers/mock.ts` returns a local response. No network calls.
- `local`: authenticated chat runs `rag/answer.ts`, reuses the existing query embedding and owner-only retrieval, assembles a bounded prompt, and calls `providers/local.ts`. Only `http://127.0.0.1:11434` is allowed; redirects and external fallbacks are blocked.
- `openai`: the API rejects the request, and `providers/openai.ts` also throws if called directly. It has no SDK or HTTP implementation.
- Other values: a configuration error; no fallback to an external provider.

All provider modules import `server-only`, which prevents them from being bundled into Client Components. Shared data types live in `src/types/chat.ts` and contain no secrets.

Later, with explicit approval to enable real usage, implement `reply()` in the OpenAI module and deliberately set that provider's `enabled` flag to true. Read `OPENAI_API_KEY` only inside that server module. Select OpenAI only through explicit `LLM_MODE=openai`; never switch based on the key's presence. The frontend and API already use the provider's availability, so their request and response contract stays the same.

`reply(message, { system, signal })` adds grounding instructions and cancellation without changing the browser's provider selection boundary. Local mode requires an assembled grounded prompt. Mock mode ignores these optional settings and does not embed or retrieve documents.

The local provider checks the installed model's exact reviewed manifest digest, format, family and quantization before sending any private context. Only `qwen3:4b-instruct` is accepted. It never calls a model pull endpoint. `OLLAMA_BASE_URL` accepts only HTTP localhost/127.0.0.1 on port 11434, with no credentials, path, query or fragment; requests use the canonical IP even when configuration says localhost. An invalid endpoint fails before I/O. Keep Ollama cloud features disabled in the Ollama server's own environment; Next.js environment settings do not configure that separate process. The read-only `npm run local:check` checks inventory without loading a model or generating text.

Generation uses non-streaming responses, `think: false`, temperature 0, an 8,192-token context window and a 384-token output cap. Incomplete/truncated responses fail visibly rather than being presented as finished answers. One generation at a time protects development memory use; a timeout and caller cancellation bound requests. These limits and the prompt byte budget live in `rag/config.ts`.

No real API key is needed, read, or transmitted. No dependency, runtime or model installation/download was performed by the assistant. See the root README for exact configuration, real-model validation and the limits of ownership testing.
