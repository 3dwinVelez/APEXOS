"use client";

import type { TransportPygReport, TransportPygRow } from "@/lib/api";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { AlertTriangle, BadgeDollarSign, Gauge, PieChart, Truck } from "lucide-react";
import type { ReactNode } from "react";

// Presentación compartida de las lecturas del PYG por vehículo. Solo formatea el
// reporte que entrega el lector contable; no consulta ni calcula nada propio.

export const vehicleMoney = { format: (value: number) => formatRegionalMoney(value) };
export const vehiclePercent = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Tono del cumplimiento presupuestal: ingresos cumplen al llegar a 100%,
// gastos al no superarlo. Compartido por la tabla del PYG y la matriz por CC.
export function cumpTone(row: Pick<TransportPygRow, "kind" | "cump">): "success" | "warning" | "error" | "neutral" {
  if (row.cump == null) return "neutral";
  const value = row.cump;
  if (row.kind === "income") return value >= 1 ? "success" : value >= 0.9 ? "warning" : "error";
  if (row.kind === "expense") return value <= 1 ? "success" : value <= 1.1 ? "warning" : "error";
  return "neutral";
}

export const CUMP_TONE_CLASS: Record<"success" | "warning" | "error" | "neutral", string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-surface-muted text-content-muted border-line"
};

export const KIND_CLASS: Record<string, string> = {
  income: "font-semibold text-content-strong",
  expense: "",
  tax: "",
  subtotal_gastos_operativos: "font-bold bg-surface-muted/70",
  subtotal_utilidad_operacional: "font-bold bg-surface-muted/70",
  subtotal_antes_de_impuestos: "font-bold bg-surface-muted/70",
  subtotal_utilidad_neta: "font-extrabold bg-apex/10 text-apex"
};

export function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-content-subtle">—</span>;
  return <span>{vehiclePercent.format(value * 100)}%</span>;
}

export function RowCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-content-subtle">—</span>;
  return <>{vehicleMoney.format(value)}</>;
}

export function Kpi({ icon, label, value, detail, tone = "neutral" }: { icon: ReactNode; label: string; value: string; detail: string; tone?: "neutral" | "success" | "error" }) {
  return <article className="apex-section-card p-4"><span className="mb-3 inline-flex rounded-lg bg-surface-muted p-2 text-apex">{icon}</span><p className="text-xs font-bold uppercase tracking-wide text-content-muted">{label}</p><p className={`mt-1 text-xl font-bold ${tone === "success" ? "text-emerald-400" : tone === "error" ? "text-red-400" : "text-content-strong"}`}>{value}</p><p className="mt-1 text-xs text-content-muted">{detail}</p></article>;
}

export function rowOf(vehicle: TransportPygReport["vehicles"][number], code: string) {
  return vehicle.rows.find((row) => row.code === code);
}

export function rowOfCorporate(report: TransportPygReport, code: string) {
  return report.corporate.rows.find((row) => row.code === code);
}

export function UnmappedNotice({ report }: { report: TransportPygReport }) {
  if (report.data_status.unmapped_total <= 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div><strong>Gastos sin clasificar: {vehicleMoney.format(report.data_status.unmapped_total)}.</strong> Existen cuentas del libro sin rango PUC asociado; se presentan en la fila dinámica “GASTOS SIN CLASIFICAR” y siguen dentro de la utilidad. Configura los Rangos PUC para limpiar la lectura.</div>
    </div>
  );
}

export function VehicleKpis({ vehicle }: { vehicle: TransportPygReport["vehicles"][number] }) {
  const utilidadNeta = rowOf(vehicle, "UTILIDAD_NETA");
  return (
    <section aria-label={`Indicadores de la placa ${vehicle.plate}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<Truck size={18} />} label="Vehículo" value={vehicle.plate} detail={vehicle.vehicle_label || (vehicle.center_name ? `Centro ${vehicle.center_name}` : "Sin descripción adicional")} />
      <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={vehicleMoney.format(vehicle.income_actual)} detail={`Presupuesto ${rowOf(vehicle, "INGRESOS")?.budget == null ? "—" : vehicleMoney.format(rowOf(vehicle, "INGRESOS")?.budget ?? 0)}`} />
      <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(rowOf(vehicle, "UTILIDAD_OPERACIONAL")?.actual ?? 0) >= 0 ? "success" : "error"} value={vehicleMoney.format(rowOf(vehicle, "UTILIDAD_OPERACIONAL")?.actual ?? 0)} detail={`Gastos ${vehicleMoney.format(rowOf(vehicle, "TOTAL_GASTOS_OPERACIONALES")?.actual ?? 0)}`} />
      <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(utilidadNeta?.actual ?? 0) >= 0 ? "success" : "error"} value={vehicleMoney.format(utilidadNeta?.actual ?? 0)} detail={vehicle.unmapped_expense > 0 ? `Sin clasificar ${vehicleMoney.format(vehicle.unmapped_expense)}` : `Impuesto ${vehicleMoney.format(rowOf(vehicle, "IMPUESTO_REGIMEN_SIMPLE")?.actual ?? 0)}`} />
    </section>
  );
}

export function UnassignedKpis({ unassigned }: { unassigned: TransportPygReport["unassigned"] }) {
  if (!unassigned) return null;
  return (
    <section aria-label="Indicadores del bloque sin vehículo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<Truck size={18} />} label="Bloque" value="Sin vehículo" detail="Centros de costo sin placa asignada" />
      <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={vehicleMoney.format(unassigned.income_actual)} detail={`Presupuesto ${rowOf(unassigned, "INGRESOS")?.budget == null ? "—" : vehicleMoney.format(rowOf(unassigned, "INGRESOS")?.budget ?? 0)}`} />
      <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(rowOf(unassigned, "UTILIDAD_OPERACIONAL")?.actual ?? 0) >= 0 ? "success" : "error"} value={vehicleMoney.format(rowOf(unassigned, "UTILIDAD_OPERACIONAL")?.actual ?? 0)} detail={`Gastos ${vehicleMoney.format(rowOf(unassigned, "TOTAL_GASTOS_OPERACIONALES")?.actual ?? 0)}`} />
      <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(rowOf(unassigned, "UTILIDAD_NETA")?.actual ?? 0) >= 0 ? "success" : "error"} value={vehicleMoney.format(rowOf(unassigned, "UTILIDAD_NETA")?.actual ?? 0)} detail="Incluido en el consolidado corporativo" />
    </section>
  );
}

export function SourceNote({ period }: { period: string }) {
  return <p className="text-[11px] text-content-muted">Fuente: libro contable (asientos publicados del periodo {period}) · el presupuesto proviene de Presupuesto PUC (PYG Contable).</p>;
}
