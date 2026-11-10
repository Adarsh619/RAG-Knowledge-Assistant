import { createClient } from "@/lib/supabase/server";
import { createKnowledgeRepository } from "@/lib/knowledge/repository";
import { handleIngestDocument } from "@/lib/knowledge/document-handler";
export const runtime = "nodejs";
// Embedding a large PDF on a serverless CPU can exceed the default function time.
export const maxDuration = 300;

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
