"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (previous?.isConnected && previous.getClientRects().length && !previous.closest("[inert]")) previous.focus();
        else Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-topbar button, .account-trigger')).find(button => button.getClientRects().length > 0)?.focus();
      });
    };
  }, []);
  return <dialog ref={ref} className="app-modal" aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className="modal-heading"><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" /></button></div>
    <div className="modal-body">{children}</div>
  </dialog>;
}
