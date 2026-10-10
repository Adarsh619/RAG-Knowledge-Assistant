"use client";

import { useState } from "react";
import type { Conversation } from "@/types/conversation";

export function ConversationHistory({ conversations, selectedId, busy, nextOffset, onNew, onOpen, onDelete, onMore }: {
  conversations: Conversation[]; selectedId: string | null; busy: boolean; nextOffset: number | null;
  onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onMore: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return <section aria-label="Saved conversations" className="border-b border-slate-100 bg-slate-50/60 p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-slate-700">Your conversations</h2>
      <button type="button" disabled={busy} onClick={onNew}
        className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">New Chat</button>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {conversations.map(conversation => <div key={conversation.id} data-conversation-id={conversation.id}
        className={`rounded-xl border p-3 ${selectedId === conversation.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <button type="button" disabled={busy} onClick={() => onOpen(conversation.id)}
          aria-current={selectedId === conversation.id ? "true" : undefined}
          className="block w-full text-left text-sm font-medium text-slate-700 disabled:opacity-50">{conversation.title}</button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{new Date(conversation.updatedAt).toLocaleString()}</span>
          {confirmId === conversation.id ? <span className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => { setConfirmId(null); onDelete(conversation.id); }}
              className="font-semibold text-red-700">Confirm delete conversation</button>
            <button type="button" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</button>
          </span> : <button type="button" disabled={busy} onClick={() => setConfirmId(conversation.id)}
            aria-label={`Delete conversation: ${conversation.title}`} className="text-red-700">Delete</button>}
        </div>
        {confirmId === conversation.id && <p className="mt-2 text-xs text-red-700">Permanently removes this conversation, messages and saved evidence. PDFs are kept.</p>}
      </div>)}
    </div>
    {conversations.length === 0 && <p className="text-xs text-slate-500">Start a new chat to save your questions and answers.</p>}
    {nextOffset !== null && <button type="button" disabled={busy} onClick={onMore}
      className="mt-3 text-xs font-semibold text-emerald-800">Load more conversations</button>}
  </section>;
}
