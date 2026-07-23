"use client";

import { errorMessage, platformAlertEventName, type PlatformAlertPayload } from "@/lib/platformAlerts";
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

export function PlatformAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    function push(detail: PlatformAlertPayload) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts((current) => {
        const duplicate = current.some((item) =>
          item.title === detail.title &&
          item.message === detail.message &&
          item.technical === detail.technical
        );
        return duplicate ? current : [...current.slice(-4), { id, level: detail.level || "error", ...detail }];
      });
      if (!detail.sticky) window.setTimeout(() => setAlerts((current) => current.filter((item) => item.id !== id)), 7000);
    }

    function onAlert(event: Event) {
      const detail = (event as CustomEvent<PlatformAlertPayload>).detail;
      if (detail?.title && detail?.message) push(detail);
    }

    function onError(event: ErrorEvent) {
      push({
        level: "error",
        title: "Error de interfaz",
        message: "La pantalla detecto un fallo y evito bloquear la operacion actual.",
        technical: event.message || "Error no identificado",
        source: "frontend",
        sticky: true
      });
    }

    function onRejection(event: PromiseRejectionEvent) {
      push({
        level: "error",
        title: "Operacion interrumpida",
        message: "Se detecto una promesa fallida. Revisa el detalle tecnico para diagnostico.",
        technical: errorMessage(event.reason, "Promesa rechazada sin detalle."),
        source: "frontend",
        sticky: true
      });
    }

    window.addEventListener(platformAlertEventName(), onAlert as EventListener);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener(platformAlertEventName(), onAlert as EventListener);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
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
              <button aria-label="Cerrar notificacion" className="platform-alert-close rounded border p-1" onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))} title="Cerrar notificacion" type="button">
                <X size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
