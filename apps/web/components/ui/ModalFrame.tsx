"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end bg-neutral-950/55 p-0 md:items-center md:justify-center md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-modal="true" aria-labelledby="apex-modal-title" className={`max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-md border border-line bg-surface text-content-body shadow-lg md:max-h-[calc(100dvh-3rem)] md:rounded-md ${maxWidth}`} role="dialog">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <h2 id="apex-modal-title" className="min-w-0 truncate text-lg font-semibold text-content-strong">{title}</h2>
          <button className="flex h-10 w-10 items-center justify-center rounded-md border border-line text-content-body hover:bg-surface-muted" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
