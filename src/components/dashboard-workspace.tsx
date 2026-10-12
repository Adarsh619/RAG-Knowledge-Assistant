"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/ui/icon";
import { AiBadge } from "@/components/shell-context";
import { documentChatHref } from "@/lib/ui/preferences";
import { loadWorkspaceSummary } from "@/lib/ui/workspace-summary";
import type { StoredDocument } from "@/types/document";
import type { Conversation } from "@/types/conversation";

export function DashboardWorkspace() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hasMoreDocuments, setHasMoreDocuments] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    async function load() {
      try {
        const { documents: files, conversations: chats } = await loadWorkspaceSummary(controller.signal);
        if (controller.signal.aborted) return;
        setDocuments(files.records); setHasMoreDocuments(files.more); setConversations(chats.records); setHasMoreConversations(chats.more);
      } catch { if (!controller.signal.aborted) setError("Your workspace summary could not be loaded. Your library and saved chats are still available from navigation."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [refresh]);
  const ready = documents.filter(document => document.ingestion?.status === "ready");
  const count = (value: number, more: boolean) => loading || error ? "—" : `${value}${more ? "+" : ""}`;
  return <>
    <PageHeader eyebrow="GROUNDWORK" title="Your private AI knowledge workspace." description="Upload documents, turn them into searchable knowledge, and chat with either your documents or your local AI." action={<div className="flex flex-wrap gap-3"><Link href="/chat" className="secondary-link"><Icon name="chat" />Start chat</Link><Link href="/documents#pdf-upload" className="primary-link"><Icon name="upload" />Upload document</Link></div>} />
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="underline" onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
    <section className="dashboard-stats" aria-label="Workspace summary" aria-busy={loading}>
      <div className="stat-card"><h2>Documents uploaded</h2><div className="stat-number">{count(documents.filter(document => !document.storageMissing).length, hasMoreDocuments)}</div><p>Your private PDF library</p></div>
      <div className="stat-card"><h2>Ready for AI</h2><div className="stat-number">{count(ready.length, hasMoreDocuments)}</div><p>Processed and ready for questions</p></div>
      <div className="stat-card"><h2>Conversations</h2><div className="stat-number">{count(conversations.length, hasMoreConversations)}</div><p>Answers and evidence, saved</p></div>
      <div className="stat-card"><h2>AI status</h2><AiBadge /><p className="mt-3">No hosted AI services</p></div>
    </section>
    {(hasMoreDocuments || hasMoreConversations) && <p className="mt-3 text-xs text-slate-500">Counts marked + are confirmed minimums from the loaded summary. Open the library or chat history to browse further.</p>}
    {loading && <p role="status" className="mt-3 text-xs text-slate-500">Loading your workspace…</p>}
    <div className="dashboard-grid">
      <section className="panel dashboard-list"><header><h2>Continue a conversation</h2><Link href="/chat" className="text-button">Start chat →</Link></header>
        {!loading && !error && !conversations.length && <div className="empty-state"><Icon name="chat" /><h3>Your next question starts here.</h3><p>Saved conversations will appear here.</p><Link href="/chat" className="text-button mt-4 inline-block">Start a conversation →</Link></div>}
        {!error && conversations.slice(0, 5).map(conversation => <Link className="dashboard-row" key={conversation.id} href={`/chat?conversation=${conversation.id}`}><Icon name="chat" /><span>{conversation.title}</span><Icon name="arrow" width="14" height="14" /></Link>)}
      </section>
      <section className="panel dashboard-list"><header><h2>Your document library</h2><Link href="/documents" className="text-button">View all →</Link></header>
        {!loading && !error && !documents.length && <div className="empty-state"><Icon name="file" /><h3>Make room for understanding.</h3><p>Upload a PDF, then choose Process for AI.</p><Link href="/documents#pdf-upload" className="text-button mt-4 inline-block">Add your first PDF →</Link></div>}
        {!error && documents.slice(0, 5).map(document => <Link className="dashboard-row" key={document.id} href={document.ingestion?.status === "ready" ? documentChatHref(document.ingestion.id) : "/documents"}><Icon name="file" /><span>{document.name}</span><small>{document.ingestion?.status === "ready" ? "Ready" : document.ingestion?.status === "deleting" ? "Deleting" : "Uploaded"}</small></Link>)}
      </section>
    </div>
    <div className="workspace-guide" aria-label="Getting started"><span><b>1</b>Upload a private PDF</span><span><b>2</b>Process for AI</span><span><b>3</b>Ask, then check the sources</span></div>
  </>;
}
