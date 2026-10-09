import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/ui/icon";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="YOUR KNOWLEDGE, CONNECTED"
        title="A little clarity starts here."
        description="One workspace for your documents, questions, and the answers in between."
        action={
          <Link href="/chat" className="primary-link">
            Open chat <Icon name="arrow" />
          </Link>
        }
      />
      <section className="relative overflow-hidden rounded-2xl bg-[#173e35] p-7 text-white md:p-10">
        <div className="pointer-events-none absolute -top-20 -right-16 size-80 rounded-full border-[45px] border-white/5" />
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-[11px] text-emerald-100">
          <Icon name="spark" width="13" height="13" /> A foundation for grounded
          answers
        </span>
        <h2 className="relative mt-6 max-w-lg text-3xl leading-tight font-medium tracking-tight md:text-4xl">
          Turn your documents
          <br />
          into understanding.
        </h2>
        <p className="relative mt-4 max-w-md text-sm leading-6 text-emerald-100/70">
          We’re building a place to ask better questions and trace every answer
          back to its source.
        </p>
        <Link
          href="/documents"
          className="relative mt-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-100"
        >
          Explore your library <Icon name="arrow" />
        </Link>
      </section>
      <section
        aria-label="Workspace statistics"
        className="mt-6 grid gap-4 sm:grid-cols-3"
      >
        {(
          [
            {
              label: "Documents",
              icon: "file",
              note: "Upload and manage your private PDFs",
            },
            {
              label: "Conversations",
              icon: "chat",
              note: "History arrives in Phase 12",
            },
            {
              label: "Knowledge base",
              icon: "grid",
              note: "Search your persisted chunks by meaning from Documents",
            },
          ] as const
        ).map((item) => (
          <div key={item.label} className="panel p-5">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{item.label}</span>
              <Icon name={item.icon} className="text-slate-400" />
            </div>
            <p className="mt-4 text-3xl font-semibold">
              {item.label === "Documents"
                ? "PDFs"
                : item.label === "Knowledge base"
                  ? "pgvector"
                  : "0"}
            </p>
            <p className="mt-2 text-xs text-slate-400">{item.note}</p>
          </div>
        ))}
      </section>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your document library</h2>
            <Link
              href="/documents"
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              View library →
            </Link>
          </div>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-4 rounded-2xl bg-slate-50 p-4 text-slate-400">
              <Icon name="file" width="28" height="28" />
            </span>
            <h3 className="text-sm font-semibold">Your private PDF library</h3>
            <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">
              Upload PDFs, inspect text, chunks and local embeddings, and manage
              your library on the Documents page.
            </p>
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-semibold">The path to your first answer</h2>
          <p className="mt-2 text-xs text-slate-500">
            We’ll connect each piece as we learn.
          </p>
          <ol className="mt-6 space-y-5">
            {[
              "Upload a PDF document",
              "Extract and index its content",
              "Ask a question",
              "Read an answer with sources",
            ].map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-3 text-sm text-slate-600"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="mt-6 text-xs leading-5 text-slate-400">
        Manage stored PDFs and inspect their text, chunks and local embeddings
        on the Documents page. Ingest saves chunks and local vectors to
        PostgreSQL. Semantic retrieval is available there. Local document RAG is
        available in Chat; conversation history arrives later. Chat defaults
        to mock mode until local generation is explicitly enabled.
      </p>
    </>
  );
}
