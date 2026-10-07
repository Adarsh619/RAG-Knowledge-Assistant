"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

const navigation = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/chat", label: "Chat", icon: "chat" },
  { href: "/documents", label: "Documents", icon: "file" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col border-b border-slate-200 bg-white px-5 py-6 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
            <Icon name="book" />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">
              Groundwork
            </span>
            <span className="text-xs text-slate-500">
              Your knowledge assistant
            </span>
          </span>
        </Link>
        <p className="mt-10 hidden px-3 text-[10px] font-bold tracking-[0.18em] text-slate-400 lg:block">
          WORKSPACE
        </p>
        <nav
          aria-label="Main navigation"
          className="mt-5 flex gap-2 lg:flex-col"
        >
          {navigation.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition lg:flex-none ${active ? "bg-emerald-50 text-emerald-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <Icon name={icon} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden pt-10 lg:block">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <span className="text-xs font-semibold text-emerald-900">
              Built to learn, step by step.
            </span>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Phase 01 · Foundation
              <br />
              AI and document processing come next.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-3 px-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
              LW
            </span>
            <div>
              <p className="text-xs font-semibold">Local workspace</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Authentication in Phase 3
              </p>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-6 lg:px-10">
          <span className="text-xs text-slate-500">
            Workspace <span className="mx-2 text-slate-300">/</span>{" "}
            <span className="text-slate-800">
              {navigation.find((item) => item.href === pathname)?.label ??
                "Page"}
            </span>
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
            Phase 1 preview
          </span>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
