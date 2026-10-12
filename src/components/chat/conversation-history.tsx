"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { ActionMenu } from "@/components/ui/action-menu";
import { ShellSlot } from "@/components/shell-context";
import type { Conversation } from "@/types/conversation";

export function ConversationHistory({ conversations, selectedId, busy, nextOffset, onNew, onOpen, onDelete, onMore }: {
  conversations: Conversation[]; selectedId: string | null; busy: boolean; nextOffset: number | null;
  onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onMore: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const deleting = conversations.find(conversation => conversation.id === confirmId);
  return <section aria-label="Saved conversations" className="history-section">
    <ShellSlot region="newChat"><button type="button" disabled={busy} onClick={onNew} className="new-chat-button" aria-label="New Chat" title="New chat"><Icon name="plus" /><span className="sidebar-label">New Chat</span></button></ShellSlot>
    <h2>Recent conversations</h2>
    {conversations.map(conversation => <div key={conversation.id} data-conversation-id={conversation.id} className={`history-item ${selectedId === conversation.id ? "active" : ""}`}>
      <button type="button" disabled={busy} onClick={() => onOpen(conversation.id)} aria-current={selectedId === conversation.id ? "true" : undefined} className="history-title" title={conversation.title}>{conversation.title}</button>
      <span className="history-date">{new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><ActionMenu label={`Actions for conversation: ${conversation.title}`}><button type="button" disabled={busy} onClick={() => setConfirmId(conversation.id)} className="danger-action"><Icon name="delete" />Delete conversation</button></ActionMenu>
    </div>)}
    {!conversations.length && <p className="px-2 text-xs leading-5 text-slate-500">Start your first conversation.</p>}
    {nextOffset !== null && <button type="button" disabled={busy} onClick={onMore} className="history-refresh">Load more conversations</button>}
    {deleting && <Modal title="Delete conversation?" onClose={() => setConfirmId(null)}><p className="font-semibold wrap-anywhere">{deleting.title}</p><p className="muted mt-3">Permanently remove this conversation, its messages and saved source evidence? Your PDFs will be kept.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} className="secondary-link" onClick={() => setConfirmId(null)}>Cancel</button><button type="button" disabled={busy} className="primary-link" onClick={() => { setConfirmId(null); onDelete(deleting.id); }}>Confirm delete conversation</button></div></Modal>}
  </section>;
}
