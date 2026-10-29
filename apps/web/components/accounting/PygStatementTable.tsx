"use client";

import type { TransportPygRow } from "@/lib/api";
import { KIND_LABELS } from "@/lib/transport-pyg-account-config";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { AccountDrillRow } from "./PygAccountDrill";
import { CUMP_TONE_CLASS, KIND_CLASS, PctCell, RowCell, cumpTone, vehicleMoney as money, vehiclePercent as percent } from "./PygVehicleReadings";

function CumpBadge({ row }: { row: TransportPygRow }) {
  if (row.cump == null) return <span className="text-content-subtle">—</span>;
  return <span className={`inline-block min-w-[64px] rounded-full border px-2 py-0.5 text-right text-xs font-bold ${CUMP_TONE_CLASS[cumpTone(row)]}`}>{percent.format(row.cump * 100)}%</span>;
}

export function StatementTable({ caption, rows, title, tall = false }: { title: string; caption: string; rows: TransportPygRow[]; tall?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const hasDrill = rows.some((row) => (row.children?.length || 0) > 0);
  return (
    <section className="apex-section-card overflow-hidden">
      <div className="p-4"><h2 className="font-semibold text-content-strong">{title}</h2><p className="text-xs text-content-muted">{caption}</p></div>
      <div className={tall ? "overflow-auto" : "max-h-[560px] overflow-auto"}>
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-content-muted">
            <tr>{["Concepto", "Presupuesto", "Ejecutado", "%", "Cumplimiento"].map((head) => <th className={`px-3 py-2 ${head === "Concepto" ? "text-left" : "text-right"}`} key={head}>{head}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const kindClass = KIND_CLASS[row.kind] || "";
              const kindLabel = KIND_LABELS[row.kind];
              const negative = row.actual < 0;
              const drill = row.children?.length ? true : false;
              const open = drill && expanded.has(row.code);
              return (
                <Fragment key={row.code}>
                  <tr className={`border-t border-line ${kindClass.includes("bg-") ? kindClass : "hover:bg-surface-muted"} ${row.dynamic ? "bg-amber-500/5" : ""}`}>
                    <td className={`px-3 py-2 ${kindClass}`}>
                      {drill ? (
                        <button aria-expanded={Boolean(open)} aria-label={`Desglosar ${row.name}`} className="inline-flex max-w-full items-center gap-1 text-left" onClick={() => toggle(row.code)} type="button">
                          {open ? <ChevronDown className="shrink-0 text-content-muted" size={14} /> : <ChevronRight className="shrink-0 text-content-muted" size={14} />}
                          <span className="truncate">{row.name}</span>
                        </button>
                      ) : row.name}
                      {row.dynamic ? <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">SIN MAPEAR</span> : null}
                      {kindLabel ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-content-subtle">{kindLabel}</span> : null}
                      {row.pending ? <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400" title={row.pending_message || "Sin cuenta asociada"}>PENDIENTE</span> : null}
                      {row.informational ? <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-content-muted" title="Fila informativa: no se resta de la utilidad neta">INFORMATIVA</span> : null}
                      {row.budget_coverage === "partial" ? <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-400" title="Solo algunas cuentas del concepto tienen presupuesto">PRESUPUESTO PARCIAL</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums"><RowCell value={row.budget} /></td>
                    <td className={`px-3 py-2 text-right tabular-nums ${negative ? "text-red-400" : ""} ${row.kind.startsWith("subtotal") ? "font-bold" : ""}`}>{money.format(row.actual)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-content-muted"><PctCell value={row.pct} /></td>
                    <td className="px-3 py-2 text-right"><CumpBadge row={row} /></td>
                  </tr>
                  {open ? (row.children || []).map((account) => <AccountDrillRow account={account} key={`${row.code}-${account.account_code}`} />) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasDrill ? <p className="border-t border-line p-2 text-[11px] text-content-muted">Haz clic en un concepto para desglosar por cuenta y centro de costo (solo nombres; los códigos se ven en Configuración → Rangos PUC).</p> : null}
    </section>
  );
}
