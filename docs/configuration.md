# Configuration reference

[Documentation index](README.md) · [Project overview](../README.md)

## Environment variables

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS project origin, without credentials/path/query |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe `sb_publishable_…` key; access still requires Auth + RLS |
| `LLM_MODE` | `mock` by default; explicitly choose `local` for document answers |
| `OLLAMA_BASE_URL` | Only `http://127.0.0.1:11434` or `http://localhost:11434` |
| `OLLAMA_MODEL` | Only reviewed `qwen3:4b-instruct` |
| `OPENAI_API_KEY` | Empty reserved placeholder; OpenAI provider is disabled |

`.env.local` is ignored and must remain untracked. Only the two `NEXT_PUBLIC_` Supabase settings are intended for the browser. Ollama configuration/model checks run server-side. Requests use the canonical loopback IP with redirects blocked. The installed manifest digest must match the reviewed model before private context is sent. A key never selects a provider; even explicit `LLM_MODE=openai` is rejected without a network request.
