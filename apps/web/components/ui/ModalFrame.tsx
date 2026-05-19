"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalFrameProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
};

export function ModalFrame({ title, children, onClose, maxWidth = "md:max-w-2xl" }: ModalFrameProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-neutral-950/35 p-0 backdrop-blur-[1px] md:items-center md:justify-center md:p-6">
      <section className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-md border border-line bg-white shadow-xl md:rounded-md ${maxWidth}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <button className="flex h-10 w-10 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </section>
    </div>
  );
}
