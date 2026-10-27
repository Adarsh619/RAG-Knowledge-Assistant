"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { AccountMenu } from "@/components/account-menu";
import { QuickThemeSwitcher } from "@/components/theme-provider";
import { ShellContext, AiBadge } from "@/components/shell-context";
import { readApiResponse } from "@/lib/http/client-response";
import type { AiStatus } from "@/types/ai-status";

const navigation = [
  { href: "/", label: "Workspace", icon: "grid" },
  { href: "/chat", label: "Chat", icon: "chat" },
  { href: "/documents", label: "Documents", icon: "file" },
] as const;

export function AppShell({ children, userEmail, emailVerified = false }: { children: ReactNode; userEmail: string; emailVerified?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [newChatHost, setNewChatHost] = useState<HTMLDivElement | null>(null);
  const [historyHost, setHistoryHost] = useState<HTMLDivElement | null>(null);
  const [contextHost, setContextHost] = useState<HTMLDivElement | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const aiRequest = useRef<AbortController | null>(null);
  const sidebar = useRef<HTMLElement>(null);
  const context = useRef<HTMLElement>(null);
  const closeNavigation = useCallback(() => setNavOpen(false), []);
  const openContext = useCallback(() => { setRightOpen(true); setNavOpen(false); try { localStorage.setItem("groundwork.context", "open"); } catch {} }, []);
  const refreshAi = useCallback(async () => {
    aiRequest.current?.abort();
    const controller = new AbortController(); aiRequest.current = controller; setAiLoading(true);
    try {
      const response = await fetch("/api/ai/status", { signal: controller.signal, cache: "no-store" });
      const status = await readApiResponse<AiStatus>(response);
      if (!controller.signal.aborted) setAi(status);
    } catch { if (!controller.signal.aborted) setAi(null); }
    finally { if (!controller.signal.aborted) setAiLoading(false); }
  }, []);
  useEffect(() => {
    void refreshAi();
    const media = matchMedia("(max-width: 1023px)");
    const update = () => { setMobile(media.matches); setNavOpen(false); setRightOpen(false); };
    setMobile(media.matches);
    try { setCollapsed(localStorage.getItem("groundwork.sidebar") === "collapsed"); if (!media.matches) setRightOpen(localStorage.getItem("groundwork.context") === "open"); } catch {}
    media.addEventListener("change", update);
    return () => { media.removeEventListener("change", update); aiRequest.current?.abort(); };
  }, [refreshAi]);
  useEffect(() => { setNavOpen(false); if (mobile) setRightOpen(false); }, [pathname, mobile]);
  useEffect(() => {
    if (!mobile || (!navOpen && !rightOpen)) return;
    const panel = navOpen ? sidebar.current : context.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, select, textarea, summary, [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    function key(event: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); setNavOpen(false); setRightOpen(false); }
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (!document.querySelector("dialog[open]")) previous?.focus(); };
  }, [mobile, navOpen, rightOpen]);

  function toggleSidebar() { setCollapsed(value => { try { localStorage.setItem("groundwork.sidebar", value ? "expanded" : "collapsed"); } catch {} return !value; }); }
  function toggleContext() { setRightOpen(value => { try { localStorage.setItem("groundwork.context", value ? "closed" : "open"); } catch {} return !value; }); setNavOpen(false); }
  const title = navigation.find(item => item.href === pathname)?.label ?? (pathname === "/account" ? "Account" : pathname === "/settings" ? "Settings" : "Workspace");
  return <ShellContext.Provider value={{ historyHost, contextHost, newChatHost, openContext, closeNavigation, ai, aiLoading, refreshAi }}>
    <div className={`workspace-shell ${pathname === "/chat" ? "chat-route" : ""} ${collapsed ? "nav-collapsed" : ""} ${rightOpen ? "context-open" : ""} ${navOpen ? "nav-open" : ""}`}>
      {mobile && (navOpen || rightOpen) && <div className="drawer-backdrop" aria-hidden="true" onClick={() => { setNavOpen(false); setRightOpen(false); }} />}
      <aside ref={sidebar} id="workspace-navigation" className="workspace-sidebar" role={mobile && navOpen ? "dialog" : undefined} aria-modal={mobile && navOpen ? true : undefined} aria-label="Workspace navigation" inert={mobile && !navOpen ? true : undefined}>
        <div className="sidebar-brand"><Link href="/" aria-label="Groundwork workspace" className="brand-mark"><Icon name="book" /></Link><span className="sidebar-label"><strong>Groundwork</strong><small>YOUR KNOWLEDGE, CONNECTED</small></span>
          <button className="icon-button mobile-only" aria-label="Close navigation" onClick={closeNavigation}><Icon name="close" /></button>
        </div>
        <nav aria-label="Main navigation" className="primary-navigation">
          {navigation.map(item => <span key={item.href} className="nav-tooltip" data-tooltip={item.label}><Link href={item.href} title={item.label} aria-label={item.label} aria-current={pathname === item.href ? "page" : undefined} className="nav-link" onClick={closeNavigation}><Icon name={item.icon} /><span className="sidebar-label">{item.label}</span></Link></span>)}
        </nav>
        <div ref={setNewChatHost} className="sidebar-new-chat nav-tooltip" data-tooltip="New chat">{pathname !== "/chat" && <Link href="/chat" className="new-chat-button" aria-label="New chat" title="New chat" onClick={closeNavigation}><Icon name="plus" /><span className="sidebar-label">New Chat</span></Link>}</div>
        <div className="sidebar-scroll sidebar-label"><div ref={setHistoryHost} />{pathname !== "/chat" && <div className="sidebar-note"><Icon name="shield" /><p>A little clarity.<br /><strong>A lot of possibility.</strong></p><small>Your private documents. Answers with evidence.</small></div>}</div>
        <AccountMenu email={userEmail} verified={emailVerified} sidebar />
      </aside>
      <div className="workspace-main" inert={mobile && (navOpen || rightOpen) ? true : undefined}>
        <header className="workspace-topbar"><div className="topbar-start"><button className="icon-button desktop-only" title={collapsed ? "Open sidebar" : "Close sidebar"} onClick={toggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="workspace-navigation"><Icon name={collapsed ? "expand" : "collapse"} /></button><button className="icon-button mobile-only" title="Open navigation" onClick={() => { setNavOpen(true); setRightOpen(false); }} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="workspace-navigation"><Icon name="menu" /></button>
          <nav aria-label="Breadcrumb"><ol className="breadcrumbs"><li><Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Workspace</Link></li>{pathname !== "/" && <><li aria-hidden="true"><Icon name="chevron" width="13" height="13" /></li><li aria-current="page">{title}</li></>}</ol></nav></div>
          <div className="topbar-end"><span className="topbar-ai"><AiBadge /></span><QuickThemeSwitcher /><button className="icon-button" title={rightOpen ? "Close context panel" : "Open context panel"} onClick={toggleContext} aria-label={rightOpen ? "Close context panel" : "Open context panel"} aria-expanded={rightOpen} aria-controls="workspace-context"><Icon name="panel" /></button><AccountMenu email={userEmail} verified={emailVerified} /></div>
        </header><main id="main-content" className="workspace-content">{children}</main>
      </div>
      <aside ref={context} id="workspace-context" className="workspace-context" inert={!rightOpen ? true : undefined} role={mobile && rightOpen ? "dialog" : undefined} aria-modal={mobile && rightOpen ? true : undefined} aria-label="Context panel" onKeyDown={event => { if (event.key === "Escape") setRightOpen(false); }}>
        <div className="context-heading"><span>CONTEXT</span><button className="icon-button" aria-label="Close context drawer" onClick={toggleContext}><Icon name="close" /></button></div><div ref={setContextHost} className="context-content" />
        {pathname === "/" && <div className="context-content"><h2>Your private workspace</h2><p>Upload a PDF, process it for AI, then start a conversation. Every grounded answer includes the passages used.</p><AiBadge /><p>PDFs and saved conversations use your private account. AI processing runs on Groundwork’s own server, not a hosted AI service.</p></div>}
      </aside>
    </div>
  </ShellContext.Provider>;
}
