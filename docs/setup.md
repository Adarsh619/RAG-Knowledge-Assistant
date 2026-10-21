# Local installation and running

[Documentation index](README.md) · [Project overview](../README.md)

## Local setup

Use Node.js **24 or later**, npm, Git, an existing Supabase Free project and Ollama. This project contains native PDF/ONNX dependencies, so run it in a Node environment, not an Edge runtime.

For a fresh checkout, install the locked dependencies deliberately:

```bash
npm ci
```

Copy `.env.example` to `.env.local` and fill the two public Supabase values from your own project dashboard. Never share secrets in an issue, chat or screenshot. Do not replace the publishable key with a secret/service-role key.

Prepare the embedding artifacts once, deliberately:

```bash
npm run embeddings:prepare
```

This command downloads four public files from a pinned Hugging Face model revision into ignored `.setup-cache/transformers/`. It is not a hosted inference request. Runtime embedding generation disables remote models and requires those files to already exist. Do not rerun installation/download steps on an already prepared checkout unless needed.

## Ollama setup

Install Ollama manually from [the official website](https://ollama.com/download). Model installation is an explicit user step, never an application action:

```bash
ollama pull qwen3:4b-instruct
ollama list
```

Skip the pull if the reviewed model is already installed. The [official model tag](https://ollama.com/library/qwen3:4b-instruct) is approximately 2.5 GB. Allow additional memory for inference and the context/KV cache; CPU generation works but can be slow, and GPU offload depends on available VRAM and Ollama's device support. The app uses a bounded 8,192-token context, not the tag's advertised maximum context.

Keep Ollama listening on loopback. Disable Ollama cloud features in **Ollama's own process environment** with `OLLAMA_NO_CLOUD=1` and restart that process; setting it only in Next.js does not configure Ollama. See [Ollama's FAQ](https://docs.ollama.com/faq). Do not expose port 11434 publicly, add a tunnel or configure cloud models.

Start the Ollama desktop app, or use `ollama serve` if no server is already running. Then set `LLM_MODE=local` in `.env.local` and start Next.js:

```bash
npm run release:check -- --runtime
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000`. For a production-mode local run:

```bash
npm run build
npm run start -- --hostname 127.0.0.1
```

Stop the dev server before building/running production in the same checkout. Never bind the app to a public interface as a shortcut to deployment.
