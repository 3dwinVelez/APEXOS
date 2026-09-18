"use client";

import { AlertTriangle, CheckCircle2, Info, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";
export type ToastRequest = { title: string; description?: string; tone?: ToastTone; retry?: () => void; duration?: number };

const TOAST_EVENT = "apex:toast";
export const NOTIFICATION_EVENT = "apex:notification";
export const NOTIFICATION_STORAGE_KEY = "apex_notification_history";
export type StoredNotification = ToastRequest & { id: string; createdAt: string; read: boolean };

export function showToast(request: ToastRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastRequest>(TOAST_EVENT, { detail: request }));
}

export function ToastCenter() {
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<ToastRequest>).detail;
      if (timer.current) window.clearTimeout(timer.current);
      setToast(request);
      try {
        const current = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]") as StoredNotification[];
        const stored: StoredNotification = { ...request, retry: undefined, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false };
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify([stored, ...current].slice(0, 50)));
        window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: stored }));
      } catch { /* El toast sigue funcionando si el historial local no está disponible. */ }
      timer.current = window.setTimeout(() => setToast(null), request.duration ?? 4800);
    };
    window.addEventListener(TOAST_EVENT, receive);
    return () => {
      window.removeEventListener(TOAST_EVENT, receive);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;
  const tone = toast.tone || "info";
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info;
  const style = tone === "success"
    ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
    : tone === "error"
      ? "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100"
      : "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100";

  return (
    <aside aria-atomic="true" aria-live={tone === "error" ? "assertive" : "polite"} className={`fixed bottom-5 right-5 z-[120] w-[calc(100vw-2.5rem)] max-w-sm rounded-lg border p-4 shadow-2xl ${style}`} role={tone === "error" ? "alert" : "status"}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0" size={20} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-sm opacity-80">{toast.description}</p> : null}
          {toast.retry ? <button className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4" onClick={() => { const retry = toast.retry; setToast(null); retry?.(); }} type="button"><RefreshCw size={14} /> Reintentar</button> : null}
        </div>
        <button aria-label="Cerrar notificación" className="rounded p-1 opacity-60 hover:bg-black/5 hover:opacity-100" onClick={() => setToast(null)} type="button"><X size={16} /></button>
      </div>
    </aside>
  );
}
