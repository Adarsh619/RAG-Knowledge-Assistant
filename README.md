# Groundwork — RAG Knowledge Assistant

A learning and portfolio project built incrementally with Next.js, TypeScript, and Tailwind CSS. **Current scope: Phase 1 only.**

## Run locally

Requires Node.js 20.9 or newer and npm. This project was set up using Node.js 24. The foundation uses Next.js 15.5.26 (App Router), React 19, and Tailwind CSS 4. Next.js 15 and its matching Windows compiler were available in the local npm cache; using this supported release avoided repeated network failures downloading Next.js 16.

```powershell
npm install
npm run dev
```

Open http://localhost:3000. If that port is already used, use the URL printed by Next.js.

No environment variables, Supabase account, or AI API keys are required for Phase 1.

## What works now

- `/`: dashboard with empty workspace counts and links to chat/documents.
- `/chat`: chat layout, example question categories, and a disabled composer.
- `/documents`: upload layout and empty document library.
- Shared navigation with active-page indication, responsive layout, and a skip-to-content link.

The counts are placeholders, not database queries. Upload, message sending, authentication, AI responses, citations, and persistence are not implemented. Disabled controls identify the phase in which they become available.

## Folder structure

```text
src/
  app/
    layout.tsx                 Root HTML, metadata, and shared shell
    globals.css                Tailwind import, theme, and shared styles
    page.tsx                   Dashboard route
    chat/page.tsx              Chat route
    documents/page.tsx         Documents route
  components/
    app-shell.tsx              Shared navigation and responsive frame
    page-header.tsx            Consistent page headings
    ui/icon.tsx                Reusable SVG icons
  lib/
    supabase/README.md         Future auth/database/storage integration
    ai/README.md               Future server-side LLM/embedding integration
    rag/README.md              Future manual ingestion/retrieval pipeline
  types/README.md              Future shared domain types
```

`package.json` defines scripts and dependency ranges; `package-lock.json` records the installed versions for reproducibility. `tsconfig.json` enables strict TypeScript and maps `@/` imports to `src/`. `next.config.ts` starts with default Next.js behavior. `postcss.config.mjs` connects Tailwind v4 to the CSS build. Tailwind v4 uses the CSS import and `@theme` here, so there is no separate Tailwind configuration file. `eslint.config.mjs` enables Next.js and TypeScript checks.

## Important code and architecture

Next.js App Router maps `app/page.tsx` to `/`, `app/chat/page.tsx` to `/chat`, and `app/documents/page.tsx` to `/documents`. `app/layout.tsx` wraps all three, so navigation stays consistent when switching pages.

Pages are Server Components by default. `AppShell` is a Client Component because it uses `usePathname()` to highlight the current route. Passing the server-rendered pages as `children` preserves that boundary; the pages do not need a `"use client"` directive.

`PageHeader` demonstrates reusable presentation with typed props. `Icon` draws local SVG paths, avoiding an extra icon dependency. Tailwind utilities handle spacing, colors, and responsive breakpoints. At `lg`, navigation becomes a sidebar; on smaller screens it sits above the content.

The `lib` folders currently contain documentation only. We will add integrations when their phases begin, rather than installing unused SDKs or writing speculative functions. Future API handlers can live under `src/app/api/` and call server-side functions from these folders. AI secrets must stay on the server.

## Verify Phase 1

```powershell
npm run lint
npm run typecheck
npm run build
```

After a successful build, `npm start` serves the production app locally. Stop an existing development server first if it uses the same port.

Manual review checklist:

1. Open `/`, `/chat`, and `/documents` using the navigation links. Confirm the active item updates and the browser Back button works.
2. Refresh each URL directly. Each page should load successfully.
3. Review the dashboard and follow its Open chat and View library links.
4. Confirm the chat textarea, send button, and upload button are disabled and show their phase explanations.
5. Resize to approximately 375 px wide and back to desktop. Confirm readable content, navigation, and no horizontal page overflow.
6. Navigate with Tab. Check visible focus indicators and the skip-to-content link.
7. Confirm there are no app errors in the terminal or browser console.

**Review and test Phase 1 before authorizing Phase 2.**

Implementation verification completed: TypeScript checks, ESLint with zero warnings, and the production build passed. Browser checks covered navigation, direct route reloads, disabled chat/upload controls, and layouts at 375 px and 1280 px. No browser warnings or errors were observed during those checks.

## Planned phases

1. Project foundation and UI structure — current phase
2. Basic LLM chatbot without RAG
3. Supabase authentication
4. PDF upload and Supabase Storage
5. PDF text extraction
6. Document chunking and metadata
7. Embedding generation
8. pgvector database setup
9. Semantic/vector similarity search
10. Full manual RAG pipeline
11. Source citations
12. Conversation history and document management
13. Error handling, security, UI improvements, and Vercel deployment

No LangChain, LangGraph, agents, or RAG frameworks are used.
