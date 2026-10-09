import { createClient } from "@/lib/supabase/server";
import { handleChatRequest } from "@/lib/ai/chat-handler";
import { createRetrievalRepository } from "@/lib/retrieval/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let context = null;
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (!error && data.user)
      context = { repository: createRetrievalRepository(client) };
  } catch { /* Fail closed without exposing session/configuration details. */ }
  return handleChatRequest(request, context);
}
