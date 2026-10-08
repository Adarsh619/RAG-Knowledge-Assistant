# Shared application types

`chat.ts` contains the Phase 2 message, request, response, and provider contracts, plus the shared message length limit. It is safe to import from either the browser or server: it contains no environment reads or secrets.

Document, chunk, citation, and persisted conversation types remain reserved for later phases. Component-only prop types live beside their components.
