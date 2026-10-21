# AI integration boundary

The server-only provider interface selects by `LLM_MODE`. Local document generation uses the manually installed Ollama runtime. Phase 11 attaches source metadata in `rag/answer.ts` from the selected context chunks after generation. The model provides answer text only; it does not supply citation identity.

- Unset, blank, or `mock`: `providers/mock.ts` returns a local response. No network calls.
- `local`: Documents mode runs `rag/answer.ts` with owner-only retrieval and a bounded grounded prompt. General AI runs `general.ts` without retrieval or citations. Auto uses the document path first and general generation only after a successful insufficient-context result. All paths call the same reviewed `providers/local.ts`; redirects and external fallbacks are blocked.
- `openai`: the API rejects the request, and `providers/openai.ts` also throws if called directly. It has no SDK or HTTP implementation.
- Other values: a configuration error; no fallback to an external provider.

All provider modules import `server-only`, which prevents them from being bundled into Client Components. Shared data types live in `src/types/chat.ts` and contain no secrets.

OpenAI is a disabled reserved boundary, not an available configuration option. Implementing a hosted provider would be a separate explicitly authorized architecture/cost decision. A key's presence never enables it.

`reply(message, { system, signal })` supplies the appropriate grounded or general system instructions and cancellation without changing the browser's provider boundary. Mock chat does not embed or retrieve documents; separate document processing endpoints still use their existing local pipeline.

The local provider checks the installed model's exact reviewed manifest digest, format, family and quantization before sending any private context. Only `qwen3:4b-instruct` is accepted. It never calls a model pull endpoint. `OLLAMA_BASE_URL` accepts only HTTP localhost/127.0.0.1 on port 11434, with no credentials, path, query or fragment; requests use the canonical IP even when configuration says localhost. An invalid endpoint fails before I/O. Keep Ollama cloud features disabled in the Ollama server's own environment; Next.js environment settings do not configure that separate process. The read-only `npm run local:check` checks inventory without loading a model or generating text.

Generation uses non-streaming responses, `think: false`, temperature 0, an 8,192-token context window and a 384-token output cap. Incomplete/truncated responses fail visibly rather than being presented as finished answers. One generation at a time protects development memory use; a timeout and caller cancellation bound requests. These limits and the prompt byte budget live in `rag/config.ts`.

No paid AI API key is needed, read or transmitted. Normal Supabase requests still use the public publishable key and authenticated session. See [configuration](../../../docs/configuration.md), [pipeline details](../../../docs/pipelines.md) and [testing](../../../docs/testing.md).
