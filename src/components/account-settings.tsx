"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemePicker } from "./theme-provider";
import { AiBadge, ShellSlot, useShell } from "./shell-context";
import { CHAT_MODE_KEY, parseChatMode } from "@/lib/ui/preferences";
import { loadWorkspaceSummary } from "@/lib/ui/workspace-summary";
import type { ChatMode } from "@/types/chat";

function Privacy() {
  return <section id="privacy" className="preference-section"><h2>Privacy</h2><p>Your documents remain private to your account. PDFs, search vectors and saved conversations are stored in Supabase with ownership protection.</p><p>Text processing and AI generation run on Groundwork’s own server. No OpenAI or hosted AI service is used. Saved citation excerpts remain until their conversation is deleted.</p></section>;
}
export function SettingsWorkspace() {
  const { ai, aiLoading, refreshAi } = useShell();
  const [mode, setMode] = useState<ChatMode>("documents");
  useEffect(() => {
    const sync = () => { try { setMode(parseChatMode(localStorage.getItem(CHAT_MODE_KEY))); } catch {} };
    sync(); window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return <div className="preferences-page">
    <section id="appearance" className="preference-section"><h2>Appearance</h2><p>Choose a look, or follow your device.</p><ThemePicker /></section>
    <section id="local-ai" className="preference-section"><div className="preference-heading"><h2>Local AI</h2><button className="text-button" disabled={aiLoading} onClick={() => void refreshAi()}>{aiLoading ? "Checking…" : "Check status"}</button></div><AiBadge /><p>{aiLoading ? "Checking AI availability…" : ai?.detail ?? "Status could not be checked. Please try again."}</p><label htmlFor="default-mode">Default chat mode</label><select id="default-mode" value={mode} onChange={event => { const next = parseChatMode(event.target.value); setMode(next); try { localStorage.setItem(CHAT_MODE_KEY, next); } catch {} }}><option value="documents">Documents</option><option value="auto">Auto</option><option value="general">General AI</option></select><p className="muted">Applies to new chats in this browser. Existing conversations retain their last completed answer’s mode.</p><details><summary>Local AI guidance</summary><p>{ai?.runtime === "embedded"
      ? "The model runs inside Groundwork’s own server from files prepared at install time (npm run models:prepare)."
      : "Start Ollama with the reviewed Qwen3 4B instruct model, then check status again."} Groundwork never downloads models at runtime or switches to cloud AI automatically.</p></details></section>
    <Privacy /><ShellSlot region="context"><h2>Your preferences</h2><p>Appearance and default chat mode stay in this browser. No profile table or cloud AI account is required.</p><AiBadge /></ShellSlot>
  </div>;
}
export function AccountWorkspace({ email, verified, joined }: { email: string; verified: boolean; joined: string }) {
  const [counts, setCounts] = useState<{ documents: string; conversations: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspaceSummary(controller.signal).then(data => {
      if (!controller.signal.aborted) setCounts({ documents: `${data.documents.records.filter(item => !item.storageMissing).length}${data.documents.more ? "+" : ""}`, conversations: `${data.conversations.records.length}${data.conversations.more ? "+" : ""}` });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  return <div className="preferences-page">
    <section className="preference-section"><h2>Account</h2><dl className="account-fields"><div><dt>Email</dt><dd className="wrap-anywhere">{email}</dd></div><div><dt>Verification</dt><dd>{verified ? "Email verified" : "Email not verified"}</dd></div><div><dt>Joined</dt><dd>{new Date(joined).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</dd></div></dl></section>
    <section className="preference-section"><h2>Security</h2><p>You’re signed in. Your session is verified before protected application requests.</p><p className="muted">Self-service password recovery is not configured in this version.</p></section>
    <section className="preference-section"><h2>Application</h2><dl className="account-fields"><div><dt><Link href="/documents">Documents</Link></dt><dd>{counts?.documents ?? "—"}</dd></div><div><dt><Link href="/chat">Conversations</Link></dt><dd>{counts?.conversations ?? "—"}</dd></div></dl>{!counts && !failed && <p role="status">Loading your account summary…</p>}{failed && <p role="alert">Your counts could not be loaded. Open Documents or Chat to view your records.</p>}<p className="muted">A + indicates a confirmed minimum from the loaded summary.</p></section>
    <Privacy /><ShellSlot region="context"><h2>Your account</h2><p>Your account controls access to your PDFs, search index and saved conversations.</p><Link href="/settings" className="text-button">Manage preferences</Link></ShellSlot>
  </div>;
}
