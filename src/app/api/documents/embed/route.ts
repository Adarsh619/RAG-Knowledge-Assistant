import { createClient } from "@/lib/supabase/server";
import { handleEmbedDocument } from "@/lib/embeddings/document-handler";
import type { DocumentContext } from "@/lib/storage/document-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let context: DocumentContext | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user)
      context = { userId: data.user.id, storage: supabase.storage };
  } catch {
    /* Fail closed when the session cannot be verified. */
  }
  return handleEmbedDocument(request, context);
}
