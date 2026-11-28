"use client";

import { AlertTriangle } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";

type ConfirmWindowProps = {
  title: string;
  description: string;
  detail?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
};

// Reemplaza la ventanilla nativa del sistema: la victima es un borrado o una
// inversion de saldos, y el operario tiene que leer que pierde antes de confirmar.
export function ConfirmWindow({ title, description, detail, confirmLabel, onConfirm, onClose, busy }: ConfirmWindowProps) {
  return (
    <ModalFrame
      footer={(
        <div className="flex w-full items-center gap-2">
          <button className="h-10 flex-1 rounded-md border border-line text-sm font-semibold hover:bg-surface-muted" disabled={busy} onClick={onClose} type="button">Cancelar</button>
          <button className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-error text-sm font-semibold text-white disabled:bg-neutral-300" disabled={busy} onClick={onConfirm} type="button">
            {busy ? "Procesando..." : confirmLabel}
          </button>
        </div>
      )}
      maxWidth="md:max-w-lg"
      onClose={onClose}
      title={confirmLabel}
    >
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-content-body">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-error" size={16} />
          {description}
        </p>
        {detail ? <p className="rounded-md bg-surface-muted p-3 text-xs text-content-muted">{detail}</p> : null}
      </div>
    </ModalFrame>
  );
}
