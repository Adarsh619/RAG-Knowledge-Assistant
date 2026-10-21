# Supabase project and database setup

[Documentation index](README.md) · [Project overview](../README.md)

## Supabase setup

1. Use a **Free** project with email/password Auth and email confirmation enabled.
2. Set Auth Site URL to `http://localhost:3000`; allow `http://localhost:3000/auth/callback` as a redirect URL. Open confirmation links in the same browser that started signup (PKCE verifier cookie). Default email delivery can restrict recipients to project team members and impose rate limits; do not disable confirmation or upgrade merely to run a test.
3. On a **fresh project only**, review and run `supabase/storage/documents.sql` to create the private `documents` bucket and owner policies. It limits uploads to PDFs of at most 4 MiB.
4. Apply these reviewed migrations **once, in order**, using the SQL Editor or your migration workflow:

| File | Purpose |
| --- | --- |
| `20261009094113_knowledge_base_persistence.sql` | vector extension, documents/chunks, ingestion/deletion RPCs, coordinated Storage delete policy |
| `20261009111153_semantic_retrieval.sql` | invoker cosine-search RPC |
| `20261009212314_conversation_persistence.sql` | conversations/messages, RLS, atomic turn RPCs |
| `20261011053350_restrict_internal_helper_execution.sql` | restrict the optional dashboard RLS helper's client execution |

All are in `supabase/migrations/`. Existing projects must check migration history first; do not rerun bucket creation or old migrations blindly. The ingestion migration replaces one Storage delete policy and its RPCs perform scoped data replacement/deletion during explicit app actions. Read the full SQL before applying it. No migration requires a service-role key in the application. Explicit authenticated grants are included because RLS and Data API exposure are separate controls.

The embedding column is `extensions.vector(384)`. A different embedding model/revision requires a deliberate schema/data migration, not just an environment switch.
