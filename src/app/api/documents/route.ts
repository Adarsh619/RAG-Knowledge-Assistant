import { createClient } from "@/lib/supabase/server";
import {
  handleDeleteDocument,
  handleListDocuments,
  handleUploadDocument,
} from "@/lib/storage/document-handler";
import type { DocumentContext } from "@/lib/storage/document-handler";

export const runtime = "nodejs";

async function getContext(): Promise<DocumentContext | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { userId: data.user.id, storage: supabase.storage };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  return handleListDocuments(request, await getContext());
}

export async function POST(request: Request) {
  return handleUploadDocument(request, await getContext());
}

export async function DELETE(request: Request) {
  return handleDeleteDocument(request, await getContext());
}
