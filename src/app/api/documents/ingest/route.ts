import { createClient } from "@/lib/supabase/server";
import { createKnowledgeRepository } from "@/lib/knowledge/repository";
import { handleIngestDocument } from "@/lib/knowledge/document-handler";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let context = null;
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (!error && data.user)
      context = {
        userId: data.user.id,
        storage: client.storage,
        repository: createKnowledgeRepository(client, data.user.id),
      };
  } catch {
    /* Return the same unauthenticated response without exposing configuration. */
  }
  return handleIngestDocument(request, context);
}
