import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <>
      <PageHeader
        eyebrow="ASK. EXPLORE. UNDERSTAND."
        title="Chat with your knowledge."
        description="A space for questions, grounded answers, and the sources that support them."
      />
      <section aria-label="Chat workspace" className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="chat" className="text-emerald-700" /> New conversation
          </span>
          <span className="text-xs text-slate-400">No documents connected</span>
        </div>
        <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-5 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <Icon name="spark" width="30" height="30" />
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">
            What would you like to discover?
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
            Soon, you’ll be able to ask questions about your documents and
            explore the ideas inside them.
          </p>
          <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
            {[
              "Summarize the key ideas",
              "Find a specific detail",
              "Explain a difficult concept",
              "Compare topics across documents",
            ].map((text) => (
              <div
                key={text}
                className="rounded-xl border border-slate-200 px-4 py-3 text-left text-xs text-slate-500"
              >
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/50 p-5">
          <label htmlFor="question" className="sr-only">
            Your question (available in Phase 2)
          </label>
          <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <textarea
              id="question"
              disabled
              rows={2}
              placeholder="Ask a question…"
              aria-describedby="chat-status"
              className="min-w-0 flex-1 resize-none bg-transparent p-1 text-sm placeholder:text-slate-400 disabled:opacity-70"
            />
            <button
              type="button"
              disabled
              aria-label="Send question (available in Phase 2)"
              className="rounded-lg bg-slate-100 p-3 text-slate-400"
            >
              <Icon name="arrow" />
            </button>
          </div>
          <p
            id="chat-status"
            className="mt-3 text-center text-xs leading-5 text-slate-500"
          >
            Phase 1 preview · Sending messages will be enabled in Phase 2.
            Document-based answers arrive in Phase 10.
          </p>
        </div>
      </section>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-xs leading-5 text-slate-500">
        <Icon name="file" className="shrink-0 text-slate-400" />
        <p>
          Source references will appear alongside answers in Phase 11, so you
          can follow a response back to its document and page.
        </p>
      </div>
    </>
  );
}
