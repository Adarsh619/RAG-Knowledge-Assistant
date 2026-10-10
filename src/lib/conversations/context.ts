import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createRetrievalRepository } from "@/lib/retrieval/repository";
import { createConversationRepository } from "./repository";
import type { ConversationContext } from "./handler";

export async function getConversationContext(): Promise<ConversationContext | null> {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return { repository: createRetrievalRepository(client), conversations: createConversationRepository(client, data.user.id) };
  } catch { return null; }
}
