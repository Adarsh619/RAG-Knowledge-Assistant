import type { Metadata } from "next";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getLlmMode, getLlmProvider } from "@/lib/ai/provider";

export const metadata: Metadata = { title: "Chat" };
// Read server configuration at request time, including when running a built app.
export const dynamic = "force-dynamic";

export default function ChatPage() {
  const mode = getLlmMode();
  return (
    <>
      <div className="chat-intro"><h1>Chat</h1><p>{mode === "local" ? "Your documents. Your local AI. A clearer answer." : "Explore the interface with safe demo replies."}</p></div>
      <ChatWorkspace
        configuredMode={mode}
        providerEnabled={mode ? getLlmProvider().enabled : false}
      />
    </>
  );
}
