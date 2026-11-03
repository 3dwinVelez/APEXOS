"use client";

import type { ApexControlIncident } from "@/lib/apexControl";
import { AlertTriangle, CheckCheck, RotateCcw } from "lucide-react";

const severityTone: Record<string, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
  error: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300",
  warning: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
};

export function IncidentList({
  incidents,
  busyId,
  onAcknowledge,
  onRefresh
}: {
  incidents: ApexControlIncident[];
  busyId: string;
  onAcknowledge: (incident: ApexControlIncident) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-content-muted">Incidentes</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-content-strong hover:bg-surface-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Recargar
        </button>
      </div>

      {incidents.length ? (
        <div className="apex-section-card overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-muted text-xs uppercase text-content-muted">
              <tr>
                <th className="px-3 py-2 text-left">Incidente</th>
                <th className="px-3 py-2 text-left">Severidad</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => {
                const canAcknowledge = incident.status === "open";
                return (
                  <tr key={incident.id} className="border-t border-line">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-content-strong">{incident.title}</p>
                      <p className="text-xs text-content-muted">{incident.summary}</p>
                      <p className="text-[11px] text-content-muted">
                        Última señal: {incident.last_seen ? new Date(incident.last_seen).toLocaleString("es-CO") : "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${severityTone[incident.severity] || severityTone.warning}`}>
                        {incident.severity}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs uppercase tracking-wide text-content-muted">{incident.status}</td>
                    <td className="px-3 py-3 text-right">
                      {canAcknowledge ? (
                        <button
                          type="button"
                          disabled={busyId === incident.id}
                          onClick={() => onAcknowledge(incident)}
                          className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-content-strong hover:bg-surface-muted disabled:opacity-60"
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> {busyId === incident.id ? "Acusando..." : "Acusar"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-content-muted">
                          <CheckCheck className="h-3.5 w-3.5" /> Acusado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="apex-section-card flex items-center gap-2 p-4 text-sm text-content-muted">
          <AlertTriangle className="h-4 w-4" /> No hay incidentes registrados para el filtro actual.
        </div>
      )}
    </section>
  );
}
