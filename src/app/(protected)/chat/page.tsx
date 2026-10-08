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
        description="Start with a local conversation. Document-based answers and sources will arrive in later phases."
      />
      <ChatWorkspace
        configuredMode={mode}
        providerEnabled={mode ? getLlmProvider().enabled : false}
      />
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-xs leading-5 text-slate-500">
        <Icon name="file" className="shrink-0 text-slate-400" />
        <p>
          Source references will appear alongside document-based answers in
          Phase 11. This mock chat does not access your documents.
        </p>
      </div>
    </>
  );
}
