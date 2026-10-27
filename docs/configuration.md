# Configuration reference

[Documentation index](README.md) · [Project overview](../README.md)

## Environment variables

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS project origin, without credentials/path/query |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe `sb_publishable_…` key; access still requires Auth + RLS |
| `LLM_MODE` | `mock` by default; explicitly choose `local` for document answers |
| `LOCAL_RUNTIME` | `ollama` (default, separate local process) or `embedded` (generation inside Next.js via Transformers.js) |
| `LOCAL_MODEL_ID` | Embedded model: `qwen3-0.6b` (default) or `qwen3-1.7b`. Only these pinned revisions are accepted |
| `GENERATION_TIMEOUT_MS` | Optional generation bound, 30000–300000 ms; other values fall back to 120000 |
| `PUBLIC_DEMO` | Optional. Exactly `true` shows a shared-CPU notice in chat; it changes guidance only |
| `OLLAMA_BASE_URL` | Only `http://127.0.0.1:11434` or `http://localhost:11434` |
| `OLLAMA_MODEL` | Only reviewed `qwen3:4b-instruct` |
| `OPENAI_API_KEY` | Empty reserved placeholder; OpenAI provider is disabled |

Embedded weights are prepared once with `npm run models:prepare`, which downloads MiniLM and the selected Qwen3 ONNX files from fixed public Hugging Face revisions without a token. At runtime remote model loading is disabled; missing files produce a preparation instruction rather than a download. Only the embedded engine streams answers word by word; Ollama answers arrive whole.

`.env.local` is ignored and must remain untracked. Only the two `NEXT_PUBLIC_` Supabase settings are intended for the browser. Ollama configuration/model checks run server-side. Requests use the canonical loopback IP with redirects blocked. The installed manifest digest must match the reviewed model before private context is sent. A key never selects a provider; even explicit `LLM_MODE=openai` is rejected without a network request.
