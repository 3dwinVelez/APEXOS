"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ModalFrameProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
};

export function ModalFrame({ title, children, onClose, maxWidth = "md:max-w-2xl" }: ModalFrameProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => { if (mounted) dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus(); }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end bg-neutral-950/55 p-0 md:items-center md:justify-center md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} aria-modal="true" aria-labelledby={titleId} className={`max-h-[calc(100dvh-1rem)] w-full max-w-[100vw] overflow-x-hidden overflow-y-auto rounded-t-overlay border border-line bg-surface text-content-body shadow-overlay md:max-h-[calc(100dvh-3rem)] md:max-w-[calc(100vw-3rem)] md:rounded-overlay ${maxWidth}`} role="dialog">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold text-content-strong">{title}</h2>
          <button className="flex h-10 w-10 items-center justify-center rounded-md border border-line text-content-body hover:bg-surface-muted" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 p-3 sm:p-4">
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
