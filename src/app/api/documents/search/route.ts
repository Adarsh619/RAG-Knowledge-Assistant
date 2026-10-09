import { createClient } from "@/lib/supabase/server";
import { createRetrievalRepository } from "@/lib/retrieval/repository";
import { handleSearchDocuments } from "@/lib/retrieval/search-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let context = null;
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (!error && data.user)
      context = { repository: createRetrievalRepository(client) };
  } catch { /* Do not expose authentication configuration. */ }
  return handleSearchDocuments(request, context);
}
