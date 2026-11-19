"use client";

import {
  platformDiagnosticEventName,
  technicalDiagnosticsEnabled,
  type PlatformAlertPayload
} from "@/lib/platformAlerts";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

type AlertItem = PlatformAlertPayload & { id: string };

const styles = {
  info: "platform-alert-info",
  success: "platform-alert-success",
  warning: "platform-alert-warning",
  error: "platform-alert-error"
};

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle
};

// El modo diagnostico lo enciende soporte sobre el navegador de un usuario concreto. Sin esa
// llave este componente no escucha nada: un problema tecnico nunca es una ventana para el cliente.
const DIAGNOSTIC_BUDGET_MS = 60_000;
const DIAGNOSTIC_BUDGET_CARDS = 5;

export function PlatformAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    if (!technicalDiagnosticsEnabled()) return;

    let windowStartedAt = 0;
    let shownInWindow = 0;

    function onDiagnostic(event: Event) {
      const detail = (event as CustomEvent<PlatformAlertPayload>).detail;
      if (!detail?.title) return;
      const now = Date.now();
      if (now - windowStartedAt > DIAGNOSTIC_BUDGET_MS) {
        windowStartedAt = now;
        shownInWindow = 0;
      }
      // Un fallo que se repite cada pocos segundos no puede volver a saturar la pantalla,
      // ni siquiera a soporte: el detalle completo ya esta en platform-logs.
      if (shownInWindow >= DIAGNOSTIC_BUDGET_CARDS) return;
      shownInWindow += 1;
      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts((current) => [...current.slice(-4), { id, level: detail.level || "error", ...detail }]);
      window.setTimeout(() => setAlerts((current) => current.filter((item) => item.id !== id)), 9000);
    }

    window.addEventListener(platformDiagnosticEventName(), onDiagnostic as EventListener);
    return () => window.removeEventListener(platformDiagnosticEventName(), onDiagnostic as EventListener);
  }, []);

  if (!alerts.length) return null;

  return (
    <div aria-live="assertive" className="pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(92vw,24rem)] flex-col gap-2">
      {alerts.map((alert) => {
        const Icon = icons[alert.level || "error"];
        return (
          <div className={`platform-alert pointer-events-auto rounded-md border p-2.5 shadow-lg ${styles[alert.level || "error"]}`} key={alert.id} role="alert">
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 shrink-0" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{alert.title}</p>
                <p className="mt-1 text-sm">{alert.message}</p>
                {alert.technical ? <p className="platform-alert-detail mt-2 break-words rounded border px-2 py-1.5 text-xs">{alert.technical}</p> : null}
                {(alert.requestId || alert.source) ? <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide opacity-80">{[alert.source, alert.requestId ? `ID ${alert.requestId}` : ""].filter(Boolean).join(" / ")}</p> : null}
              </div>
              <button aria-label="Cerrar notificación" className="platform-alert-close rounded border p-1" onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))} title="Cerrar notificación" type="button">
                <X size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
