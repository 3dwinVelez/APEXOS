"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { useI18n } from "@/lib/i18n";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineFirstStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [open, setOpen] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  const inspect = () => {
    setOnline(navigator.onLine);
    setCheckedAt(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
    setOpen(true);
  };

  const Icon = online ? Cloud : CloudOff;

  return <>
    <button aria-haspopup="dialog" aria-label={`Conexión: ${online ? t("online") : t("offline")}`} className={`apex-interactive inline-flex h-10 items-center gap-2 rounded-control border px-3 text-xs font-semibold ${online ? "border-line bg-surface text-content-muted hover:text-content-strong" : "border-warning/40 bg-warning/10 text-content-strong"}`} onClick={inspect} title={online ? "Sincronización disponible" : "Las operaciones compatibles se conservarán en la cola local"} type="button">
      <Icon size={15} />
      <span aria-live="polite">{online ? t("online") : t("offline")}</span>
    </button>
    {open ? <ModalFrame tone="brand" title="Conexión" description="Estado de la sincronización de esta sesión." icon={<Icon size={18} />} maxWidth="md:!max-w-md" onClose={() => setOpen(false)}>
      <section className={`rounded-card border p-4 ${online ? "border-line bg-surface-muted/60" : "border-warning/40 bg-warning/10"}`}>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={`grid h-11 w-11 place-items-center rounded-full ${online ? "bg-apex/15 text-apex" : "bg-warning/15 text-content-strong"}`}><Icon size={20} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-strong">{online ? "Sincronización disponible" : "Trabajo local protegido"}</p>
            <p className="mt-1 text-xs text-content-muted">{online ? "Los cambios llegan al servidor mientras haya red." : "Las operaciones compatibles se conservan en la cola local hasta recuperar la conexión."}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-xs text-content-muted">{checkedAt ? `Última verificación: ${checkedAt}` : "Verificación de la sesión actual."}</p>
          <button className="inline-flex h-9 items-center gap-2 rounded-control border border-line px-3 text-xs font-semibold text-content-strong hover:bg-surface-muted" onClick={() => { setOnline(navigator.onLine); setCheckedAt(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })); }} type="button"><RefreshCw size={14} />Verificar ahora</button>
        </div>
      </section>
      <p className="mt-3 text-xs text-content-muted">Este indicador refleja el estado real del navegador; no reemplaza la confirmación del servidor en cada operación.</p>
    </ModalFrame> : null}
  </>;
}
