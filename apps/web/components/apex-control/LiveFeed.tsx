"use client";

import type { ApexControlEvent } from "@/lib/apexControl";
import { Radio, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";

const severityTone: Record<string, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
  error: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
  warning: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  info: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
  debug: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-500/10 dark:text-slate-300"
};

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "critical", label: "Críticos" },
  { id: "error", label: "Errores" },
  { id: "warning", label: "Alertas" },
  { id: "info", label: "Info" }
] as const;

export function LiveFeed({ events, connected }: { events: ApexControlEvent[]; connected: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const visible = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "critical") return events.filter((event) => event.severity === "critical" || event.severity === "error");
    return events.filter((event) => event.severity === filter);
  }, [events, filter]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-content-muted">Flujo en vivo</h2>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${connected ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-500/10 dark:text-slate-300"}`}>
            {connected ? <Radio className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "WebSocket conectado" : "Reconectando"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-control border px-2.5 py-1 text-xs font-semibold ${filter === item.id ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-muted hover:bg-surface-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="apex-section-card max-h-[560px] overflow-auto">
        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((event) => (
              <li key={event.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${severityTone[event.severity] || severityTone.debug}`}>
                  {event.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-content-strong">{event.kind}</p>
                  <p className="text-xs text-content-muted">
                    {event.component_key || event.source}
                    {event.entity_id ? ` · ${event.entity_id}` : ""}
                    {event.payload && Object.keys(event.payload).length ? ` · ${JSON.stringify(event.payload).slice(0, 160)}` : ""}
                  </p>
                </div>
                <time className="text-[11px] text-content-muted">
                  {event.occurred_at ? new Date(event.occurred_at).toLocaleTimeString("es-CO") : "—"}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-content-muted">Sin eventos para este filtro. Los fallos y cambios de estado aparecerán aquí.</p>
        )}
      </div>
    </section>
  );
}
