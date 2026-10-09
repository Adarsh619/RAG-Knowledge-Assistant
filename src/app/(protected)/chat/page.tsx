import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { Icon } from "@/components/ui/icon";
import { getLlmMode, getLlmProvider } from "@/lib/ai/provider";

export const metadata: Metadata = { title: "Chat" };
// Read server configuration at request time, including when running a built app.
export const dynamic = "force-dynamic";

export default function ChatPage() {
  const mode = getLlmMode();
  return (
    <>
      <PageHeader
        eyebrow="ASK. EXPLORE. UNDERSTAND."
        title="Chat with your knowledge."
        description={mode === "local"
          ? "Ask questions grounded in your ingested documents using a model running on your machine."
          : "Mock chat remains active. The local document RAG pipeline is prepared for manual Ollama setup."}
      />
      <ChatWorkspace
        configuredMode={mode}
        providerEnabled={mode ? getLlmProvider().enabled : false}
      />
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-xs leading-5 text-slate-500">
        <Icon name="file" className="shrink-0 text-slate-400" />
        <p>
          Source references will appear alongside document-based answers in
          Phase 11. {mode === "local"
            ? "Local mode uses your owned passages and sends no context to hosted AI services."
            : "Mock mode does not access documents or run a model. Install Ollama and the documented model manually before enabling LLM_MODE=local."}
        </p>
      </div>
    </>
  );
}
