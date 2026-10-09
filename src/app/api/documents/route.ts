import { createClient } from "@/lib/supabase/server";
import { handleUploadDocument } from "@/lib/storage/document-handler";
import { createKnowledgeRepository } from "@/lib/knowledge/repository";
import {
  handlePersistentDeletion,
  handlePersistentList,
} from "@/lib/knowledge/document-handler";
import type { KnowledgeContext } from "@/lib/knowledge/document-handler";

export const runtime = "nodejs";

async function getContext(): Promise<KnowledgeContext | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      storage: supabase.storage,
      repository: createKnowledgeRepository(supabase, data.user.id),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  return handlePersistentList(request, await getContext());
}

export async function POST(request: Request) {
  return handleUploadDocument(request, await getContext());
}

export async function DELETE(request: Request) {
  return handlePersistentDeletion(request, await getContext());
}
