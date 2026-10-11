# Release strategy

## Full local RAG — supported target

Run Next.js, prepared offline MiniLM and Ollama on the same computer. Keep Next.js and Ollama bound to loopback. Supabase Free hosts Auth, private Storage and PostgreSQL/pgvector. This enables the full document/chat workflow without a hosted inference API.

Prerequisites and first-install commands are in [README](../README.md). On an already prepared checkout, use:

```bash
npm run release:check -- --runtime
npm run typecheck
npm run lint
npm test
npm run build
npm run start -- --hostname 127.0.0.1
```

Open `http://localhost:3000`, authenticate, upload → Ingest → wait for Ready → Chat. Stop the dev server before building or starting the production server in the same checkout. No setup script automatically pulls the generative model or starts a cloud provider.

## Public portfolio presentation — recommended

Publish source code with a reviewed license decision, documentation, redacted synthetic screenshots and a walkthrough recording. A static showcase can explain the architecture and demonstrate the UI without connecting strangers to a private Supabase project or local runtime.

An optional mock deployment could run the auth/chat interface with `LLM_MODE=mock`, but it would need a separate deliberate deployment review, quota controls and a configured Supabase project. Document ingestion/retrieval still require native inference resources and local artifact provisioning; mock mode disables chat inference, not every document endpoint. Do not describe a mock deployment as full RAG. A read-only static showcase is simpler and safer than modifying this app into a public demo immediately.

No deployment is performed in Phase 13. Deployment requires explicit approval.

## Why not deploy the full app to Vercel today?

`127.0.0.1` on a Vercel/function server refers to that server's own network namespace. It does not address a model on the user's PC. MiniLM also needs native runtime support, an available model cache and suitable request/resource limits. Copying local environment settings into a cloud dashboard does not solve those requirements.

Full remote generation would require a generative runtime alongside a persistent application server, secure networking/access controls and sufficient CPU/GPU resources. Hosted inference providers or GPU services can incur costs; a self-hosted machine also requires operational infrastructure. None is provisioned or implied to be zero-cost here. A tunnel/public port would expose your machine and is not an acceptable automatic workaround.

## Checklist before publishing

- [x] TypeScript, lint, all 200 tests and production build pass on the Phase 13 checkout.
- [x] Production audit has zero advisories; the remaining development-only braces chain is documented.
- [x] Supabase reviewed migrations applied once, RLS/grants/Storage verified.
- [x] `.env.local` ignored/untracked; repository scan found no configured keys.
- [x] Local embedding artifacts prepared; reviewed Ollama model present and runtime available.
- [x] Live supported/unrelated/scoped questions, saved evidence/reload and approved cleanup checked.
- [x] Fresh existing-account sign-in, sign-out, invalid-login handling and session persistence verified. Fresh signup/confirmation remains a separate manual check.
- [ ] Two REAL Auth users verified as described in [testing](testing.md) (**pending**).
- [x] Offline Ollama failure regressions and measured mobile/keyboard checks pass.
- [ ] Manual runtime stop/restart, full zoom and assistive-technology acceptance remain separate optional checks.
- [x] Reviewed screenshots use synthetic content and exclude personal account data.
- [x] Known limitations/password advisory reviewed; Free plan/quotas preserved.
- [ ] License chosen before authorizing general reuse.

For a trusted local portfolio walkthrough, passing technical/local checks is useful readiness evidence. Do not call the project fully validated for public multi-user production until the remaining gates and infrastructure/abuse controls are addressed.
