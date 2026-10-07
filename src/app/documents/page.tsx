import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="YOUR SOURCE OF TRUTH"
        title="Document library"
        description="A home for the PDFs that will power your knowledge assistant."
        action={
          <button
            type="button"
            disabled
            aria-describedby="upload-status"
            className="flex items-center gap-2 rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500"
          >
            <Icon name="upload" /> Upload PDF
          </button>
        }
      />
      <section
        aria-label="Upload preview"
        className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-10 text-center"
      >
        <span className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-800">
          <Icon name="upload" width="26" height="26" />
        </span>
        <h2 className="text-lg font-semibold">Start with a document</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          Your upload area will live here. Add PDFs, then make their content
          searchable as we build the ingestion pipeline.
        </p>
        <p
          id="upload-status"
          className="mt-5 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-500"
        >
          PDF upload and storage · Coming in Phase 4
        </p>
      </section>
      <section className="panel mt-7 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h2 className="font-semibold">
            All documents{" "}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-normal text-slate-500">
              0
            </span>
          </h2>
          <span className="text-xs text-slate-400">Local UI preview</span>
        </div>
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <Icon
            name="file"
            width="34"
            height="34"
            className="mb-5 text-slate-300"
          />
          <h3 className="text-sm font-semibold">No documents yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Once uploads are available, this list will show each document’s name
            and processing status.
          </p>
        </div>
      </section>
      <section
        className="mt-7 grid gap-5 sm:grid-cols-3"
        aria-label="Future document pipeline"
      >
        {[
          {
            number: "01",
            title: "Upload",
            detail: "Keep each user’s PDFs in Supabase Storage.",
          },
          {
            number: "02",
            title: "Process",
            detail:
              "Extract text, split it into chunks, and generate embeddings.",
          },
          {
            number: "03",
            title: "Retrieve",
            detail: "Find relevant passages to help answer a question.",
          },
        ].map((item) => (
          <div key={item.number} className="p-2">
            <p className="text-xs font-semibold tracking-wider text-emerald-700">
              {item.number}
            </p>
            <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {item.detail}
            </p>
          </div>
        ))}
      </section>
    </>
  );
}
