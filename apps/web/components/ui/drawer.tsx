"use client";

import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === "Escape" && onClose(); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[110] bg-neutral-950/45" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside aria-labelledby={titleId} aria-modal="true" className="ml-auto flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-overlay" role="dialog"><header className="flex items-center justify-between border-b border-line p-4"><h2 className="text-lg font-semibold" id={titleId}>{title}</h2><button aria-label="Cerrar" className="rounded-control border border-line p-2" onClick={onClose} type="button"><X size={18}/></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div></aside></div>, document.body);
}
