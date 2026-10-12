import { readApiResponse } from "../http/client-response.ts";
import type { DocumentListResponse, StoredDocument } from "../../types/document.ts";
import type { ConversationListResponse, Conversation } from "../../types/conversation.ts";

export async function loadWorkspaceSummary(signal?: AbortSignal, transport: typeof fetch = fetch) {
  async function pages<T extends { id: string }>(path: string, read: (body: DocumentListResponse | ConversationListResponse) => T[]) {
    const records: T[] = []; let offset: number | null = 0;
    for (let page = 0; page < 5 && offset !== null; page++) {
      const body: DocumentListResponse | ConversationListResponse = await readApiResponse(await transport(`${path}?offset=${offset}`, { cache: "no-store", signal }));
      records.push(...read(body)); offset = body.nextOffset;
    }
    return { records: [...new Map(records.map(item => [item.id, item])).values()], more: offset !== null };
  }
  const [documents, conversations] = await Promise.all([
    pages<StoredDocument>("/api/documents", body => (body as DocumentListResponse).documents),
    pages<Conversation>("/api/conversations", body => (body as ConversationListResponse).conversations),
  ]);
  return { documents, conversations };
}
