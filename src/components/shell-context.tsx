"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AiStatus } from "@/types/ai-status";
export const ShellContext = createContext<{
  historyHost: HTMLElement | null; contextHost: HTMLElement | null; newChatHost: HTMLElement | null;
  openContext: () => void; closeNavigation: () => void;
  ai: AiStatus | null; aiLoading: boolean; refreshAi: () => void;
}>({ historyHost: null, contextHost: null, newChatHost: null, openContext: () => {}, closeNavigation: () => {}, ai: null, aiLoading: true, refreshAi: () => {} });
export const useShell = () => useContext(ShellContext);
export function ShellSlot({ region, children }: { region: "history" | "context" | "newChat"; children: ReactNode }) {
  const shell = useShell();
  const host = region === "history" ? shell.historyHost : region === "newChat" ? shell.newChatHost : shell.contextHost;
  return host ? createPortal(children, host) : null;
}
export function AiBadge() {
  const { ai, aiLoading } = useShell();
  return <span className={`ai-badge ${ai?.available ? "is-available" : ""}`}><span className="status-dot" />
    {aiLoading ? "Checking local AI…" : !ai ? "AI status unknown" : ai.mode === "mock" ? "Demo mode" : ai.available ? `Local AI · ${ai.model ?? "reviewed model"}` : "Local AI unavailable"}</span>;
}
// Shared CPUs answer slowly; say so before visitors assume the demo is broken.
export function DemoNotice() {
  const { ai } = useShell();
  return ai?.publicDemo && ai.mode === "local"
    ? <p role="note" className="demo-notice">Free public demo on a shared CPU. Answers can take up to a minute, and one answer is generated at a time.</p>
    : null;
}
