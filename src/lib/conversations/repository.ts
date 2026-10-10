import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatResponse } from "../../types/chat.ts";
import type { Conversation, SavedMessage } from "../../types/conversation.ts";
import { CONVERSATION_PAGE_SIZE, MESSAGE_PAGE_SIZE } from "../../types/conversation.ts";

export class ConversationError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}

interface ConversationRow {
  id: string; title: string; document_id: string | null; created_at: string; updated_at: string;
}
interface MessageRow {
  id: string; conversation_id: string; request_id: string; turn_index: number;
  role: "user" | "assistant"; content: string; status: SavedMessage["status"];
  attempt_id: string | null; document_id: string | null; mode: "mock" | "local" | null;
  sources: ChatResponse["sources"]; rag: ChatResponse["rag"] | null;
  started_at: string; created_at: string;
}
interface TurnRow { conversation: ConversationRow; user_message: MessageRow; assistant_message: MessageRow | null }
const conversationColumns = "id,title,document_id,created_at,updated_at";
const messageColumns = "id,conversation_id,request_id,turn_index,role,content,status,document_id,mode,sources,rag,started_at,created_at";

function databaseError(error: { code?: string } | null) {
  if (error?.code === "P0002") return new ConversationError("Conversation or question is unavailable.", 404);
  if (["55000", "23505"].includes(error?.code ?? ""))
    return new ConversationError("A reply is already in progress or this attempt is no longer current. Refresh the conversation.", 409);
  if (error?.code === "22023") return new ConversationError("The request ID or selected document is invalid or unavailable.", 400);
  if (error?.code === "42501") return new ConversationError("This conversation operation is not allowed.", 403);
  return new ConversationError("Conversation history is unavailable. Check the Phase 12 migration and retry.");
}

function conversation(row: ConversationRow): Conversation {
  return { id: row.id, title: row.title, documentId: row.document_id, createdAt: row.created_at, updatedAt: row.updated_at };
}
function message(row: MessageRow): SavedMessage {
  // Save/restore application evidence only. Never expose attempt tokens, prompts or vectors.
  if (!Array.isArray(row.sources) || row.sources.length > 5 || row.sources.some(source =>
    !source || typeof source.originalFilename !== "string" || typeof source.excerpt !== "string" ||
    source.excerpt.length > 360 || !Number.isFinite(source.similarity) ||
    !Array.isArray(source.pageNumbers) || source.pageNumbers.some(page => !Number.isInteger(page) || page < 1)))
    throw new ConversationError("Saved source evidence could not be read safely.");
  return {
    id: row.id, conversationId: row.conversation_id, requestId: row.request_id, turnIndex: row.turn_index,
    role: row.role, content: row.content, status: row.status, documentId: row.document_id,
    mode: row.mode ?? undefined, sources: row.sources, rag: row.rag ?? undefined,
    startedAt: row.started_at, createdAt: row.created_at,
  };
}
function turn(row: TurnRow) {
  if (!row?.conversation || !row.user_message) throw databaseError(null);
  return { conversation: conversation(row.conversation), userMessage: message(row.user_message),
    assistantMessage: row.assistant_message ? message(row.assistant_message) : null };
}

export function createConversationRepository(client: SupabaseClient, userId: string) {
  return {
    async list(offset = 0) {
      const { data, error } = await client.from("conversations").select(conversationColumns)
        .eq("owner_id", userId).order("updated_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + CONVERSATION_PAGE_SIZE);
      if (error || !data) throw databaseError(error);
      return { conversations: (data.slice(0, CONVERSATION_PAGE_SIZE) as ConversationRow[]).map(conversation),
        nextOffset: data.length > CONVERSATION_PAGE_SIZE ? offset + CONVERSATION_PAGE_SIZE : null };
    },
    async create(documentId: string | null) {
      const { data, error } = await client.from("conversations").insert({ owner_id: userId, document_id: documentId })
        .select(conversationColumns).single();
      if (error || !data) throw databaseError(error);
      return conversation(data as ConversationRow);
    },
    async get(id: string, offset = 0) {
      const { data: parent, error: parentError } = await client.from("conversations").select(conversationColumns)
        .eq("id", id).eq("owner_id", userId).maybeSingle();
      if (parentError) throw databaseError(parentError);
      if (!parent) throw new ConversationError("Conversation is unavailable.", 404);
      const { data, error } = await client.from("messages").select(messageColumns).eq("conversation_id", id)
        .order("turn_index", { ascending: false }).order("role", { ascending: true }).range(offset, offset + MESSAGE_PAGE_SIZE);
      if (error || !data) throw databaseError(error);
      return { conversation: conversation(parent as ConversationRow),
        messages: (data.slice(0, MESSAGE_PAGE_SIZE) as MessageRow[]).map(message)
          .sort((a, b) => a.turnIndex - b.turnIndex || (a.role === "user" ? -1 : 1)),
        nextOffset: data.length > MESSAGE_PAGE_SIZE ? offset + MESSAGE_PAGE_SIZE : null };
    },
    async remove(id: string) {
      const { data, error } = await client.from("conversations").delete().eq("id", id).eq("owner_id", userId).select("id");
      if (error) throw databaseError(error);
      if (!data?.length) throw new ConversationError("Conversation is unavailable.", 404);
    },
    async begin(id: string, requestId: string, content: string, documentId: string | null) {
      const { data, error } = await client.rpc("begin_conversation_turn", {
        p_conversation_id: id, p_request_id: requestId, p_content: content, p_document_id: documentId,
      });
      if (error) throw databaseError(error);
      const row = data as TurnRow;
      return { ...turn(row), attemptId: row.user_message.attempt_id! };
    },
    async complete(id: string, requestId: string, attemptId: string, reply: ChatResponse) {
      const { data, error } = await client.rpc("complete_conversation_turn", {
        p_conversation_id: id, p_request_id: requestId, p_attempt_id: attemptId,
        p_content: reply.message.content, p_mode: reply.mode, p_sources: reply.sources, p_rag: reply.rag ?? null,
      });
      if (error) throw databaseError(error);
      const result = turn(data as TurnRow);
      if (!result.assistantMessage) throw databaseError(null);
      return { ...result, assistantMessage: result.assistantMessage };
    },
    async fail(id: string, requestId: string, attemptId: string) {
      // Scoped UPDATE of this pending attempt only; a committed reply cannot be downgraded.
      const { error } = await client.from("messages").update({ status: "failed" })
        .eq("conversation_id", id).eq("request_id", requestId).eq("attempt_id", attemptId)
        .eq("role", "user").eq("status", "pending");
      if (error) throw databaseError(error);
    },
  };
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>;
