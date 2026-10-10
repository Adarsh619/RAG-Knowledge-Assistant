import { getConversationContext } from "@/lib/conversations/context";
import { handleConversations } from "@/lib/conversations/handler";

export const runtime = "nodejs";
export async function GET(request: Request) { return handleConversations(request, await getConversationContext()); }
export async function POST(request: Request) { return handleConversations(request, await getConversationContext()); }
