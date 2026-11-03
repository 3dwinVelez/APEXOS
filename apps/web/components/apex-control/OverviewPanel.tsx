"use client";

import type { ApexControlComponent, ApexControlStatus, ComponentStatus } from "@/lib/apexControl";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/apexControl";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ServerCrash } from "lucide-react";

const overallTone: Record<ComponentStatus, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  degraded: "text-amber-600 dark:text-amber-400",
  down: "text-rose-600 dark:text-rose-400",
  unknown: "text-content-muted"
};

function ComponentCard({ component }: { component: ApexControlComponent }) {
  return (
    <div className="apex-section-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-content-strong">{component.name}</p>
          <p className="text-xs text-content-muted">{component.kind}{component.criticality === "critical" ? " · crítico" : ""}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[component.status]}`}>
          {STATUS_LABEL[component.status]}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-content-muted">
        <span>{component.latency_ms == null ? "—" : `${component.latency_ms} ms`}</span>
        <span>{component.sampled_at ? new Date(component.sampled_at).toLocaleTimeString("es-CO") : "sin muestra"}</span>
      </div>
    </div>
  );
}

export function OverviewPanel({
  status,
  loading,
  error,
  onRefresh
}: {
  status: ApexControlStatus | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const overall = status?.status || "unknown";
  const counts = status?.counts || { ok: 0, degraded: 0, down: 0, unknown: 0 };
  const incidents = status?.incidents || [];
  const OverallIcon = overall === "ok" ? CheckCircle2 : overall === "down" ? ServerCrash : AlertTriangle;

  return (
    <div className="space-y-4">
      <section className="apex-section-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <OverallIcon className={`h-12 w-12 ${overallTone[overall]}`} />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-content-muted">Estado global</p>
              <p className={`text-2xl font-extrabold ${overallTone[overall]}`}>{STATUS_LABEL[overall]}</p>
              <p className="text-xs text-content-muted">
                Score {status?.score ?? 0}/100 · pulso cada {Math.round((status?.interval_ms || 15000) / 1000)} s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right text-xs text-content-muted">
              <p>{counts.ok} operativos · {counts.degraded} degradados</p>
              <p>{counts.down} caídos · {counts.unknown} sin datos</p>
              <p className="flex items-center justify-end gap-1">
                <Clock3 className="h-3 w-3" />
                {status?.generated_at ? new Date(status.generated_at).toLocaleTimeString("es-CO") : "sin lectura"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold text-content-strong hover:bg-surface-muted disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 rounded-control border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-content-muted">Componentes</h2>
            <span className="text-xs text-content-muted">{status?.components.length || 0} sondas</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(status?.components || []).map((component) => <ComponentCard key={component.key} component={component} />)}
            {!status?.components?.length ? <p className="text-sm text-content-muted">Aún no hay muestras. El primer pulso corre al iniciar el API.</p> : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-content-muted">Incidentes activos</h2>
          <div className="apex-section-card p-4">
            {incidents.length ? (
              <ul className="space-y-3">
                {incidents.map((incident) => (
                  <li key={incident.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-content-strong">{incident.title}</p>
                    <p className="text-xs text-content-muted">{incident.summary}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-content-muted">
                      {incident.severity} · {incident.status} · {incident.last_seen ? new Date(incident.last_seen).toLocaleString("es-CO") : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-content-muted">
                <Activity className="h-4 w-4" /> Sin incidentes activos.
              </p>
            )}
          </div>

          <h2 className="text-sm font-bold uppercase tracking-wide text-content-muted">Último reporte</h2>
          <div className="apex-section-card p-4 text-sm">
            {status?.last_report ? (
              <>
                <p className="font-semibold text-content-strong">{status.last_report.period_key}</p>
                <p className="text-xs text-content-muted">Estado: {status.last_report.status}</p>
                <p className="text-xs text-content-muted">
                  Enviado: {status.last_report.sent_at ? new Date(status.last_report.sent_at).toLocaleString("es-CO") : "pendiente de envío"}
                </p>
              </>
            ) : (
              <p className="text-content-muted">Aún no se ha generado el briefing diario.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
