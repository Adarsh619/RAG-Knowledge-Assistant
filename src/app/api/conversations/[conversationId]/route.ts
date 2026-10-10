import { getConversationContext } from "@/lib/conversations/context";
import { handleConversation } from "@/lib/conversations/handler";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ conversationId: string }> };
export async function GET(request: Request, { params }: RouteContext) {
  return handleConversation(request, await getConversationContext(), (await params).conversationId);
}
export async function DELETE(request: Request, { params }: RouteContext) {
  return handleConversation(request, await getConversationContext(), (await params).conversationId);
}
