import { getConversationContext } from "@/lib/conversations/context";
import { handleConversationTurn } from "@/lib/conversations/handler";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  return handleConversationTurn(request, await getConversationContext(), (await params).conversationId);
}
