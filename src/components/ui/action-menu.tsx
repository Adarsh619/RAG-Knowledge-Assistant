"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

/** Native disclosure + ordinary buttons/links: Tab navigation, Escape and outside dismissal. */
export function ActionMenu({ label, children, className = "", trigger }: {
  label: string; children: ReactNode; className?: string; trigger?: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <details ref={ref} className={`action-menu ${className}`} onKeyDown={event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      ref.current?.removeAttribute("open"); ref.current?.querySelector("summary")?.focus();
    }
  }}>
    <summary aria-label={label} title={label} className="icon-button">{trigger ?? <Icon name="more" />}</summary>
    <div className="action-menu-content" onClick={event => {
      if ((event.target as HTMLElement).closest("button:not(:disabled),a[href]")) ref.current?.removeAttribute("open");
    }}>{children}</div>
  </details>;
}
