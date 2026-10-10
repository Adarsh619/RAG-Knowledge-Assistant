import type { ChatMessage } from "./chat.ts";

export const CONVERSATION_PAGE_SIZE = 20;
export const MESSAGE_PAGE_SIZE = 50;
export const REPLY_LEASE_MS = 5 * 60 * 1000;

export interface Conversation {
  id: string;
  title: string;
  documentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedMessage extends ChatMessage {
  conversationId: string;
  requestId: string;
  turnIndex: number;
  status: "pending" | "completed" | "failed";
  documentId: string | null;
  startedAt: string;
  createdAt: string;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  nextOffset: number | null;
}

export interface ConversationDetailResponse {
  conversation: Conversation;
  messages: SavedMessage[];
  nextOffset: number | null;
}

export interface ConversationTurnResponse {
  conversation: Conversation;
  userMessage: SavedMessage;
  assistantMessage: SavedMessage;
}
