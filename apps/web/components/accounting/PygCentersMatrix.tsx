"use client";

import type { TransportPygCenter, TransportPygReport } from "@/lib/api";
import { centerBranchLabel } from "@/lib/pyg-center-labels.mjs";
import { Fragment } from "react";
import { CUMP_TONE_CLASS, KIND_CLASS, RowCell, PctCell, cumpTone, vehicleMoney as money, vehiclePercent as percent } from "./PygVehicleReadings";

const keyOf = (center: TransportPygCenter) => `${center.center_code}|${center.branch_code}`;

function centerTitle(center: TransportPygCenter) {
  return center.center_name || center.center_code || "Sin centro de costo";
}

function centerBranch(center: TransportPygCenter) {
  return centerBranchLabel(center);
}

function centerDetail(center: TransportPygCenter) {
  const budget = center.rows.find((row) => row.code === "INGRESOS")?.budget;
  const label = center.plate ? `${center.plate}${center.vehicle_label ? ` · ${center.vehicle_label}` : ""}` : "";
  return `${label ? `${label} · ` : ""}Presupuesto ${budget == null ? "—" : money.format(budget)}`;
}

function CumpCell({ center, code }: { center: TransportPygCenter; code: string }) {
  const row = center.rows.find((item) => item.code === code);
  if (!row || row.cump == null) return <span className="text-content-subtle">—</span>;
  return <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${CUMP_TONE_CLASS[cumpTone(row)]}`}>{percent.format(row.cump * 100)}%</span>;
}

// Matriz del Excel "TODOSCC": los centros de costo en las columnas y la misma
// estructura del PYG en las filas (presupuesto, ejecutado, % del ingreso y
// cumplimiento por centro). Solo presenta el reporte contable; no recalcula.
export function PygCentersMatrix({ report }: { report: TransportPygReport }) {
  const centers = report.centers || [];
  if (!centers.length) {
    return (
      <section className="apex-section-card p-8 text-center text-sm text-content-muted">
        El libro contable no tiene centros de costo con cuentas de resultado en {report.period}. La matriz se construye desde los asientos publicados del periodo.
      </section>
    );
  }
  const concepts = report.corporate.rows;
  return (
    <section className="apex-section-card overflow-hidden">
      <div className="p-4">
        <h2 className="font-semibold text-content-strong">PYG por centro de costo · {report.period}</h2>
        <p className="text-xs text-content-muted">Misma estructura del PYG por vehículo con los centros de costo en las columnas: presupuesto, ejecutado, % del ingreso y cumplimiento de cada centro. Leído del libro contable (asientos publicados del periodo).</p>
      </div>
      <div className="overflow-x-auto">
        {/* data-table-layout="detail" excluye la matriz del configurador global de
            columnas: aquel oculta por indice de la primera fila de encabezados y
            esta matriz agrupa cada centro en cuatro columnas con colSpan. */}
        <table className="min-w-full border-separate border-spacing-0 text-xs" data-table-layout="detail">
          <caption className="sr-only">PYG por centro de costo del periodo {report.period}</caption>
          <thead className="text-[10px] uppercase text-content-muted">
            <tr>
              <th className="sticky left-0 z-20 min-w-[240px] border-b border-r border-line bg-surface-muted px-3 py-2 text-left align-bottom" rowSpan={2} scope="col">Concepto</th>
              {centers.map((center) => (
                <th className="border-b border-line px-2 py-1 text-center" colSpan={4} key={keyOf(center)} scope="colgroup">
                  <span className="block text-[11px] font-bold normal-case text-content-strong">{centerTitle(center)}</span>
                  <span className="block text-[10px] font-semibold normal-case text-apex">{centerBranch(center)}</span>
                  <span className="block text-[10px] font-normal normal-case text-content-muted">{centerDetail(center)}</span>
                </th>
              ))}
            </tr>
            <tr>
              {centers.map((center) => (
                <Fragment key={keyOf(center)}>
                  <th className="border-b border-l border-line px-2 py-1 text-right font-semibold" scope="col">Presupuesto</th>
                  <th className="border-b border-line px-2 py-1 text-right font-semibold" scope="col">Ejecutado</th>
                  <th className="border-b border-line px-2 py-1 text-right font-semibold" scope="col">%</th>
                  <th className="border-b border-line px-2 py-1 text-right font-semibold" scope="col">Cump</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr className={`border-t border-line ${KIND_CLASS[concept.kind] || ""}`} key={concept.code}>
                <th className={`sticky left-0 z-10 border-b border-r border-line px-3 py-1.5 text-left font-medium ${concept.kind.startsWith("subtotal") ? "bg-surface-muted" : "bg-surface"}`} scope="row">
                  <span className="text-content-strong">{concept.name}</span>
                  {concept.dynamic ? <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">SIN MAPEAR</span> : null}
                </th>
                {centers.map((center) => {
                  const row = center.rows.find((item) => item.code === concept.code);
                  const negative = (row?.actual ?? 0) < 0;
                  return (
                    <Fragment key={keyOf(center)}>
                      <td className="border-b border-l border-line px-2 py-1.5 text-right tabular-nums"><RowCell value={row ? row.budget : null} /></td>
                      <td className={`border-b border-line px-2 py-1.5 text-right tabular-nums ${negative ? "text-red-400" : ""} ${concept.kind.startsWith("subtotal") ? "font-bold" : ""}`}>{money.format(row?.actual ?? 0)}</td>
                      <td className="border-b border-line px-2 py-1.5 text-right tabular-nums text-content-muted"><PctCell value={row?.pct ?? null} /></td>
                      <td className="border-b border-line px-2 py-1.5 text-right"><CumpCell center={center} code={concept.code} /></td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line p-3 text-[11px] text-content-muted">Cada centro incluye solo sus propias hojas del libro; los centros sin movimiento del periodo aparecen en cero para no perder la columna. El % y el cumplimiento se calculan contra el ingreso y el presupuesto de cada centro; los importes negativos se muestran en rojo.</p>
    </section>
  );
}
