"use client";

import { errorMessage, platformAlertEventName, type PlatformAlertPayload } from "@/lib/platformAlerts";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

type AlertItem = PlatformAlertPayload & { id: string };

const styles = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900"
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
      setAlerts((current) => [...current.slice(-4), { id, level: detail.level || "error", ...detail }]);
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
    <div className="pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(92vw,28rem)] flex-col gap-2">
      {alerts.map((alert) => {
        const Icon = icons[alert.level || "error"];
        return (
          <div className={`pointer-events-auto rounded-md border p-3 shadow-sm ${styles[alert.level || "error"]}`} key={alert.id} role="alert">
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 shrink-0" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{alert.title}</p>
                <p className="mt-1 text-sm">{alert.message}</p>
                {alert.technical ? <p className="mt-2 break-words rounded bg-white/70 px-2 py-1 text-xs">{alert.technical}</p> : null}
                {(alert.requestId || alert.source) ? <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide opacity-80">{[alert.source, alert.requestId ? `ID ${alert.requestId}` : ""].filter(Boolean).join(" · ")}</p> : null}
              </div>
              <button className="rounded p-1 hover:bg-black/5" onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))} type="button">
                <X size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
