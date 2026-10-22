"use client";

import {
  api,
  getTransportPygBudgets, getTransportPygConfig, getTransportPygMapping, getTransportPygReport,
  saveTransportPygBudgets, saveTransportPygConfig, saveTransportPygMapping,
  type TransportPygReport, type TransportPygRow, type TransportPygVehicle
} from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { downloadXlsxWorkbook, type XlsxReportSheet } from "@/lib/reportExports";
import { AlertTriangle, BadgeDollarSign, Download, FileSpreadsheet, Fuel, Gauge, PieChart, RefreshCw, Scale, Settings2, Target, Truck, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const money = { format: (value: number) => formatRegionalMoney(value) };
const compact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const axis = { tick: { fill: "#94a3b8", fontSize: 11 }, axisLine: false, tickLine: false };
const tooltip = { contentStyle: { background: "#0f1f2a", border: "1px solid #334155", borderRadius: 10, color: "#f8fafc" } };
const CHART_COLORS = { income: "#14b8a6", expense: "#f59e0b", profit: "#38bdf8", loss: "#f43f5e" };
const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };

type View = "consolidado" | "vehiculos" | "presupuesto" | "configuracion";
const VIEWS: Array<[View, string]> = [["consolidado", "Consolidado"], ["vehiculos", "Por vehículo"], ["presupuesto", "Presupuestos"], ["configuracion", "Configuración"]];

function rowOf(vehicle: TransportPygVehicle, code: string) { return vehicle.rows.find((row) => row.code === code); }
function rowOfCorporate(report: TransportPygReport, code: string) { return report.corporate.rows.find((row) => row.code === code); }

function cumpTone(row: TransportPygRow): "success" | "warning" | "error" | "neutral" {
  if (row.cump == null) return "neutral";
  const value = row.cump;
  if (row.kind === "income") return value >= 1 ? "success" : value >= 0.9 ? "warning" : "error";
  if (row.kind === "expense") return value <= 1 ? "success" : value <= 1.1 ? "warning" : "error";
  return "neutral";
}
const TONE_CLASS = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-surface-muted text-content-muted border-line"
};

const KIND_CLASS: Record<string, string> = {
  income: "font-semibold text-content-strong",
  expense: "",
  tax: "",
  subtotal_gastos_operativos: "font-bold bg-surface-muted/70",
  subtotal_utilidad_operacional: "font-bold bg-surface-muted/70",
  subtotal_antes_de_impuestos: "font-bold bg-surface-muted/70",
  subtotal_utilidad_neta: "font-extrabold bg-apex/10 text-apex"
};

export default function AccountingVehiclePygPage() {
  const [period, setPeriod] = useState(currentMonth());
  const [report, setReport] = useState<TransportPygReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("consolidado");
  const [selectedPlate, setSelectedPlate] = useState("");
  const canWrite = hasStoredRolePermission("accounting", "write");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setReport(await getTransportPygReport(period)); }
    catch (value) { setError(value instanceof Error ? value.message : "No fue posible leer el PYG de transporte."); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const selectedVehicle = useMemo(() => {
    if (!report?.vehicles.length) return null;
    return report.vehicles.find((vehicle) => vehicle.plate === selectedPlate) || report.vehicles[0];
  }, [report, selectedPlate]);

  return (
    <div className="apex-workspace-shell space-y-4 text-content-body">
      <ContabilidadNav />
      <header className="apex-section-card overflow-hidden">
        <div className="border-b border-line bg-surface-muted p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="rounded-xl bg-apex p-3 text-white"><Scale /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-apex">M-07 · Contabilidad · Rentabilidad de flota</p>
                <h1 className="text-2xl font-semibold text-content-strong">PYG por Vehículo</h1>
                <p className="text-sm text-content-muted">Estado de resultados por placa (centro de costo): ingresos liquidados, gastos operativos y utilidad contra presupuesto.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-content-muted">Periodo<input className="mt-1 block h-9 rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => setPeriod(event.target.value)} type="month" value={period} /></label>
              <button aria-label="Actualizar" className="h-9 rounded-md border border-line bg-surface px-3" onClick={() => void load()} type="button"><RefreshCw size={16} /></button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!report} onClick={() => report && exportWorkbook(report)} type="button"><Download size={16} /> Excel</button>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2">{VIEWS.map(([key, label]) => <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${view === key ? "bg-apex text-white" : "text-content-muted hover:bg-surface-muted hover:text-content-strong"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}</nav>
      </header>

      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-400">{error}</div> : null}
      {loading || !report ? <div className="apex-section-card p-12 text-center text-content-muted">Construyendo el estado de resultados…</div> : (
        <>
          {report.data_status.unmapped_total > 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <div><strong>Gastos sin clasificar: {money.format(report.data_status.unmapped_total)}.</strong> Existen líneas de caja menor con centro de costo (placa) cuyo concepto no está mapeado a una línea del PYG. Se incluyen en la fila dinámica “{rowOfCorporate(report, "GASTOS_SIN_CLASIFICAR")?.name || "GASTOS SIN CLASIFICAR"}”; ajusta el mapeo en Configuración para limpiar la lectura.</div>
            </div>
          ) : null}
          {report.data_status.vehicle_count === 0 ? (
            <div className="apex-section-card p-12 text-center text-content-muted">
              <Truck className="mx-auto mb-3 text-content-subtle" size={32} />
              <p className="font-semibold text-content-strong">No hay vehículos activos en la flota.</p>
              <p className="text-sm">Crea los vehículos en Transporte → Vehículos y documentos para habilitar el PYG por placa.</p>
            </div>
          ) : view === "consolidado" ? <ConsolidatedView canWrite={canWrite} onConfig={() => setView("configuracion")} report={report} /> :
            view === "vehiculos" ? <VehiclesView onSelectPlate={setSelectedPlate} report={report} selectedPlate={selectedVehicle?.plate || ""} /> :
            view === "presupuesto" ? <BudgetsView canWrite={canWrite} onSaved={() => void load()} period={period} report={report} /> :
            <ConfigView canWrite={canWrite} onSaved={() => void load()} report={report} />}
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, detail, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: "neutral" | "success" | "error" }) {
  return <article className="apex-section-card p-4"><span className="mb-3 inline-flex rounded-lg bg-surface-muted p-2 text-apex">{icon}</span><p className="text-xs font-bold uppercase tracking-wide text-content-muted">{label}</p><p className={`mt-1 text-xl font-bold ${tone === "success" ? "text-emerald-400" : tone === "error" ? "text-red-400" : "text-content-strong"}`}>{value}</p><p className="mt-1 text-xs text-content-muted">{detail}</p></article>;
}

function CumpBadge({ row }: { row: TransportPygRow }) {
  if (row.cump == null) return <span className="text-content-subtle">—</span>;
  const tone = cumpTone(row);
  return <span className={`inline-block min-w-[64px] rounded-full border px-2 py-0.5 text-right text-xs font-bold ${TONE_CLASS[tone]}`}>{percent.format(row.cump * 100)}%</span>;
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-content-subtle">—</span>;
  return <span>{percent.format(value * 100)}%</span>;
}

function StatementTable({ caption, rows, title }: { title: string; caption: string; rows: TransportPygRow[] }) {
  return (
    <section className="apex-section-card overflow-hidden">
      <div className="p-4"><h2 className="font-semibold text-content-strong">{title}</h2><p className="text-xs text-content-muted">{caption}</p></div>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-content-muted">
            <tr>{["Concepto", "Presupuesto", "Ejecutado", "%", "Cumplimiento"].map((head) => <th className={`px-3 py-2 ${head === "Concepto" ? "text-left" : "text-right"}`} key={head}>{head}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const kindClass = KIND_CLASS[row.kind] || "";
              const negative = row.actual < 0;
              return (
                <tr className={`border-t border-line ${kindClass.includes("bg-") ? kindClass : "hover:bg-surface-muted"} ${row.dynamic ? "bg-amber-500/5" : ""}`} key={row.code}>
                  <td className={`px-3 py-2 ${kindClass}`}>{row.name}{row.dynamic ? <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">SIN MAPEAR</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money.format(row.budget)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${negative ? "text-red-400" : ""} ${row.kind.startsWith("subtotal") ? "font-bold" : ""}`}>{money.format(row.actual)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-content-muted"><PctCell value={row.pct} /></td>
                  <td className="px-3 py-2 text-right"><CumpBadge row={row} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConsolidatedView({ report, canWrite, onConfig }: { report: TransportPygReport; canWrite: boolean; onConfig: () => void }) {
  const gastos = rowOfCorporate(report, "TOTAL_GASTOS_OPERACIONALES");
  const utilidadOp = rowOfCorporate(report, "UTILIDAD_OPERACIONAL");
  const utilidadNeta = rowOfCorporate(report, "UTILIDAD_NETA");
  const impuesto = rowOfCorporate(report, "IMPUESTO_REGIMEN_SIMPLE");
  const chartData = useMemo(() => report.vehicles
    .filter((vehicle) => vehicle.income_actual > 0)
    .map((vehicle) => ({
      plate: vehicle.plate,
      Ingresos: vehicle.income_actual,
      Gastos: rowOf(vehicle, "TOTAL_GASTOS_OPERACIONALES")?.actual ?? 0,
      "Utilidad neta": rowOf(vehicle, "UTILIDAD_NETA")?.actual ?? 0
    }))
    .sort((a, b) => b.Ingresos - a.Ingresos), [report]);
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={money.format(report.corporate.income_actual)} detail={`${report.data_status.vehicles_with_income}/${report.data_status.vehicle_count} vehículos con producción`} />
        <Kpi icon={<Fuel size={18} />} label="Gastos operacionales" value={money.format(gastos?.actual ?? 0)} detail={`Presupuesto ${money.format(gastos?.budget ?? 0)}`} />
        <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(utilidadOp?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadOp?.actual ?? 0)} detail={`Margen ${report.corporate.income_actual ? percent.format(((utilidadOp?.actual ?? 0) / report.corporate.income_actual) * 100) : "—"}%`} />
        <Kpi icon={<Wallet size={18} />} label="Impuesto régimen simple" value={money.format(impuesto?.actual ?? 0)} detail={`Tarifa ${percent.format(report.tax_percent)}% sobre ingresos`} />
        <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(utilidadNeta?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadNeta?.actual ?? 0)} detail={`Cumplimiento presupuesto ${utilidadNeta?.cump != null ? percent.format(utilidadNeta.cump * 100) : "—"}%`} />
      </section>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <StatementTable caption={`Periodo ${report.period_start} a ${report.period_end} · consolidado de las ${report.data_status.vehicle_count} placas activas.`} rows={report.corporate.rows} title={`PYG corporativo · ${report.period}`} />
        <section className="apex-section-card p-4">
          <h2 className="font-semibold text-content-strong">Producción vs. costo por placa</h2>
          <p className="mb-4 text-xs text-content-muted">Ingresos liquidados, gastos operativos y utilidad neta de cada centro de costo.</p>
          {chartData.length ? (
            <div className="h-[520px]"><ResponsiveContainer><ComposedChart data={chartData}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="plate" {...axis} /><YAxis tickFormatter={(value) => compact.format(value)} {...axis} /><Tooltip {...tooltip} /><Legend /><Bar dataKey="Ingresos" fill={CHART_COLORS.income} /><Bar dataKey="Gastos" fill={CHART_COLORS.expense} /><Line dataKey="Utilidad neta" stroke={CHART_COLORS.profit} strokeWidth={3} dot={(props: unknown) => { const { cx, cy, payload } = props as { cx: number; cy: number; payload: { "Utilidad neta": number } }; return <circle cx={cx} cy={cy} fill={payload["Utilidad neta"] < 0 ? CHART_COLORS.loss : CHART_COLORS.profit} r={4} />; }} /></ComposedChart></ResponsiveContainer></div>
          ) : <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-content-muted">Sin ingresos liquidados en el periodo. Aprueba paquetes de liquidación para poblar el PYG.</p>}
          {canWrite ? <button className="mt-3 text-xs font-bold text-apex" onClick={onConfig} type="button">Ajustar tarifa de impuesto y mapeo de conceptos →</button> : null}
        </section>
      </div>
    </div>
  );
}

function VehiclesView({ report, selectedPlate, onSelectPlate }: { report: TransportPygReport; selectedPlate: string; onSelectPlate: (plate: string) => void }) {
  const vehicle = report.vehicles.find((item) => item.plate === selectedPlate) || report.vehicles[0];
  const utilidadNeta = vehicle ? rowOf(vehicle, "UTILIDAD_NETA") : undefined;
  const gridConcepts = report.corporate.rows;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {report.vehicles.map((item) => (
          <button className={`shrink-0 rounded-xl border px-3 py-2 text-left ${item.plate === vehicle?.plate ? "border-apex bg-apex/10" : "border-line hover:bg-surface-muted"}`} key={item.plate} onClick={() => onSelectPlate(item.plate)} type="button">
            <span className="block text-sm font-bold text-content-strong">{item.plate}</span>
            <span className={`block text-xs font-semibold ${(rowOf(item, "UTILIDAD_NETA")?.actual ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>{money.format(rowOf(item, "UTILIDAD_NETA")?.actual ?? 0)}</span>
          </button>
        ))}
      </div>
      {vehicle ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Truck size={18} />} label="Vehículo" value={vehicle.plate} detail={vehicle.vehicle_label || "Sin descripción adicional"} />
            <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={money.format(vehicle.income_actual)} detail={`Presupuesto ${money.format(rowOf(vehicle, "INGRESOS")?.budget ?? 0)}`} />
            <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(rowOf(vehicle, "UTILIDAD_OPERACIONAL")?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(rowOf(vehicle, "UTILIDAD_OPERACIONAL")?.actual ?? 0)} detail={`Gastos ${money.format(rowOf(vehicle, "TOTAL_GASTOS_OPERACIONALES")?.actual ?? 0)}`} />
            <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(utilidadNeta?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadNeta?.actual ?? 0)} detail={vehicle.unmapped_expense > 0 ? `Sin clasificar ${money.format(vehicle.unmapped_expense)}` : `Impuesto ${money.format(rowOf(vehicle, "IMPUESTO_REGIMEN_SIMPLE")?.actual ?? 0)}`} />
          </section>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <StatementTable caption={`Estado de resultados de la placa ${vehicle.plate} en ${report.period}.`} rows={vehicle.rows} title={`PYG ${vehicle.plate} · ${report.period}`} />
            <MatrixTable concepts={gridConcepts} report={report} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function MatrixTable({ report, concepts }: { report: TransportPygReport; concepts: TransportPygRow[] }) {
  return (
    <section className="apex-section-card overflow-hidden">
      <div className="p-4"><h2 className="font-semibold text-content-strong">Matriz de ejecutados por placa</h2><p className="text-xs text-content-muted">Todos los centros de costo del periodo en una sola rejilla (comparación directa).</p></div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-surface-muted uppercase text-content-muted">
            <tr><th className="px-3 py-2 text-left">Concepto</th>{report.vehicles.map((vehicle) => <th className="px-2 py-2 text-right" key={vehicle.plate}>{vehicle.plate}</th>)}</tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr className={`border-t border-line ${KIND_CLASS[concept.kind]?.includes("subtotal") ? "bg-surface-muted/60 font-bold" : ""}`} key={concept.code}>
                <td className="whitespace-nowrap px-3 py-1.5">{concept.name}</td>
                {report.vehicles.map((vehicle) => {
                  const value = rowOf(vehicle, concept.code)?.actual ?? 0;
                  return <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${value < 0 ? "text-red-400" : ""}`} key={vehicle.plate}>{value ? compact.format(value) : "-"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BudgetsView({ report, period, canWrite, onSaved }: { report: TransportPygReport; period: string; canWrite: boolean; onSaved: () => void }) {
  const editableConcepts = useMemo(() => report.concepts.filter((concept) => concept.kind === "income" || concept.kind === "expense"), [report]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getTransportPygBudgets(period).then((budgets) => {
      const next: Record<string, string> = {};
      for (const row of budgets.rows) next[`${row.vehicle_id}:${row.concept_code}`] = String(row.amount);
      setValues(next);
    }).catch(() => {
      const fromReport: Record<string, string> = {};
      for (const vehicle of report.vehicles) for (const row of vehicle.rows) if ((row.kind === "income" || row.kind === "expense") && row.budget > 0) fromReport[`${vehicle.vehicle_id}:${row.code}`] = String(row.budget);
      setValues(fromReport);
    });
  }, [period, report]);

  const setCell = (vehicleId: number, conceptCode: string, raw: string) => setValues((current) => ({ ...current, [`${vehicleId}:${conceptCode}`]: raw }));

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const rows = report.vehicles.flatMap((vehicle) => editableConcepts
        .map((concept) => ({ vehicle_id: vehicle.vehicle_id, concept_code: concept.code, amount: Number(values[`${vehicle.vehicle_id}:${concept.code}`] ?? "") }))
        .filter((row) => Number.isFinite(row.amount) && row.amount > 0));
      await saveTransportPygBudgets(period, rows);
      setNotice(`Presupuesto ${period} guardado: ${rows.length} celdas.`);
      onSaved();
    } catch (value) { setError(value instanceof Error ? value.message : "No fue posible guardar el presupuesto."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <section className="apex-section-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><h2 className="font-semibold text-content-strong">Presupuesto por vehículo y concepto · {period}</h2><p className="text-xs text-content-muted">Las líneas de subtotal, utilidad e impuesto se derivan aritméticamente del presupuesto de ingresos y de gastos. Deja una celda en blanco para presupuestarla en otro momento.</p></div>
          {canWrite ? <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()} type="button"><Target size={16} /> {saving ? "Guardando…" : "Guardar presupuesto"}</button> : <span className="rounded-md bg-paper px-3 py-2 text-xs font-semibold text-neutral-600">Consulta de solo lectura</span>}
        </div>
        {error ? <p className="px-4 text-xs text-red-600">{error}</p> : null}
        {notice ? <p className="px-4 text-xs text-emerald-600">{notice}</p> : null}
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-content-muted">
              <tr><th className="px-3 py-2 text-left">Concepto</th>{report.vehicles.map((vehicle) => <th className="px-2 py-2 text-right" key={vehicle.vehicle_id}>{vehicle.plate}</th>)}</tr>
            </thead>
            <tbody>
              {editableConcepts.map((concept) => (
                <tr className="border-t border-line" key={concept.code}>
                  <td className={`whitespace-nowrap px-3 py-1.5 ${concept.kind === "income" ? "font-semibold text-content-strong" : ""}`}>{concept.name}</td>
                  {report.vehicles.map((vehicle) => (
                    <td className="px-1 py-1" key={vehicle.vehicle_id}>
                      {canWrite ? (
                        <input className="h-8 w-28 rounded-md border border-line bg-surface px-2 text-right text-xs tabular-nums text-content-strong" inputMode="decimal" min={0} onChange={(event) => setCell(vehicle.vehicle_id, concept.code, event.target.value)} placeholder="0" type="number" value={values[`${vehicle.vehicle_id}:${concept.code}`] ?? ""} />
                      ) : (
                        <span className="block px-2 py-1 text-right text-xs tabular-nums">{values[`${vehicle.vehicle_id}:${concept.code}`] ? money.format(Number(values[`${vehicle.vehicle_id}:${concept.code}`])) : "—"}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type PettyConcept = { id: number; code: string; name: string; active: boolean };
type MappingRow = { source_type: string; source_code: string; concept_name: string | null; pyg_concept_code: string };

function ConfigView({ report, canWrite, onSaved }: { report: TransportPygReport; canWrite: boolean; onSaved: () => void }) {
  const [tax, setTax] = useState(String(report.tax_percent));
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const conceptOptions = useMemo(() => report.concepts.filter((concept) => concept.kind === "income" || concept.kind === "expense"), [report]);

  useEffect(() => {
    getTransportPygConfig().then((config) => setTax(String(config.tax_percent))).catch(() => undefined);
    // Lista completa de conceptos de caja menor fusionada con el mapping guardado: todo
    // concepto activo es clasificable desde la UI, aunque nunca haya tenido mapping.
    Promise.all([getTransportPygMapping(), api<PettyConcept[]>("/api/v1/transport-pyg/source-concepts")]).then(([mapping, concepts]) => {
      const bySource = new Map(mapping.rows.map((row) => [row.source_code, row]));
      const seen = new Set<string>();
      const merged: MappingRow[] = [];
      for (const concept of concepts) {
        if (!concept.active || seen.has(concept.code)) continue;
        seen.add(concept.code);
        const existing = bySource.get(concept.code);
        merged.push({ source_type: "petty_cash_concept", source_code: concept.code, concept_name: concept.name, pyg_concept_code: existing && existing.active !== false ? existing.pyg_concept_code : "" });
      }
      for (const row of mapping.rows) {
        if (seen.has(row.source_code)) continue;
        seen.add(row.source_code);
        merged.push({ source_type: row.source_type, source_code: row.source_code, concept_name: null, pyg_concept_code: row.active === false ? "" : row.pyg_concept_code });
      }
      setRows(merged);
    }).catch(() => undefined);
  }, []);

  async function saveTax() {
    setSaving(true); setError(""); setNotice("");
    try { await saveTransportPygConfig(Number(tax)); setNotice("Configuración guardada."); onSaved(); }
    catch (value) { setError(value instanceof Error ? value.message : "No fue posible guardar la configuración."); }
    finally { setSaving(false); }
  }
  async function saveMap() {
    setSaving(true); setError(""); setNotice("");
    try {
      await saveTransportPygMapping(rows.map((row) => ({ source_type: row.source_type, source_code: row.source_code, pyg_concept_code: row.pyg_concept_code, active: true })));
      setNotice("Mapeo de conceptos guardado."); onSaved();
    }
    catch (value) { setError(value instanceof Error ? value.message : "No fue posible guardar el mapeo."); }
    finally { setSaving(false); }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
      <section className="apex-section-card space-y-3 p-4">
        <div><h2 className="font-semibold text-content-strong">Impuesto de régimen simple</h2><p className="text-xs text-content-muted">Porcentaje aplicado sobre los ingresos ejecutados de cada placa para calcular la línea de impuesto y la utilidad neta.</p></div>
        <label className="block text-sm text-content-muted">Tarifa %<input className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-content-strong" disabled={!canWrite} min={0} max={100} onChange={(event) => setTax(event.target.value)} step="0.01" type="number" value={tax} /></label>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-600">{notice}</p> : null}
        {canWrite ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void saveTax()} type="button"><Settings2 size={16} />Guardar configuración</button> : null}
      </section>
      <section className="apex-section-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><h2 className="font-semibold text-content-strong">Mapeo de conceptos de caja menor</h2><p className="text-xs text-content-muted">Cada concepto de gasto de caja menor se imputa a una línea del PYG según la placa registrada en su centro de costo. Los conceptos sin mapeo alimentan la fila dinámica “GASTOS SIN CLASIFICAR”.</p></div>
          {canWrite ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-paper disabled:opacity-50" disabled={saving} onClick={() => void saveMap()} type="button"><FileSpreadsheet size={16} /> Guardar mapeo</button> : null}
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-content-muted">
              <tr><th className="px-3 py-2 text-left">Origen</th><th className="px-3 py-2 text-left">Concepto de caja menor</th><th className="px-3 py-2 text-left">Línea del PYG</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr className="border-t border-line" key={`${row.source_type}-${row.source_code}`}>
                  <td className="px-3 py-2 text-xs text-content-muted">{row.source_type === "petty_cash_concept" ? "Caja menor" : row.source_type}</td>
                  <td className="px-3 py-2 font-medium text-content-strong">
                    {row.concept_name || row.source_code}
                    {row.concept_name ? <span className="ml-2 text-xs font-normal text-content-muted">{row.source_code}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite ? (
                      <select className="h-8 w-full max-w-xs rounded-md border border-line bg-surface px-2 text-xs text-content-strong" onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, pyg_concept_code: event.target.value } : item))} value={row.pyg_concept_code}>
                        <option value="">— Sin clasificar —</option>
                        {conceptOptions.map((concept) => <option key={concept.code} value={concept.code}>{concept.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs">{row.pyg_concept_code ? conceptOptions.find((concept) => concept.code === row.pyg_concept_code)?.name || row.pyg_concept_code : "Sin clasificar"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td className="px-3 py-6 text-center text-xs text-content-muted" colSpan={3}>Aún no hay conceptos de caja menor activos. Créalos en Gastos Menores para habilitar la clasificación.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function exportWorkbook(report: TransportPygReport) {
  const statementColumns: XlsxReportSheet["columns"] = [
    { key: "concepto", label: "CONCEPTO", width: 340 },
    { key: "presupuesto", label: "PRESUPUESTO", width: 150, numberFormat: "#,##0.00" },
    { key: "ejecutado", label: "EJECUTADO", width: 150, numberFormat: "#,##0.00" },
    { key: "porcentaje", label: "%", width: 80, numberFormat: "0.00" },
    { key: "cumplimiento", label: "CUMPLIMIENTO %", width: 110, numberFormat: "0.00" }
  ];
  const statementRows = (rows: TransportPygRow[]) => rows.map((row) => ({
    concepto: row.name,
    presupuesto: row.budget,
    ejecutado: row.actual,
    porcentaje: row.pct == null ? "" : Math.round(row.pct * 10000) / 100,
    cumplimiento: row.cump == null ? "" : Math.round(row.cump * 10000) / 100
  }));
  const sheets: XlsxReportSheet[] = [
    {
      name: "Consolidado",
      title: `PYG CORPORATIVO TRANSPORTE · ${report.period}`,
      subtitle: `Periodo ${report.period_start} a ${report.period_end} · Impuesto régimen simple ${report.tax_percent}% · ${report.data_status.vehicle_count} placas · Generado desde APEXOS`,
      columns: statementColumns,
      rows: statementRows(report.corporate.rows)
    },
    ...report.vehicles.map((vehicle) => ({
      name: `PYG ${vehicle.plate}`.slice(0, 31),
      title: `PYG VEHÍCULO ${vehicle.plate}${vehicle.vehicle_label ? ` · ${vehicle.vehicle_label}` : ""}`,
      subtitle: `Periodo ${report.period} · Ingresos ${money.format(vehicle.income_actual)}${vehicle.unmapped_expense > 0 ? ` · Sin clasificar ${money.format(vehicle.unmapped_expense)}` : ""}`,
      columns: statementColumns,
      rows: statementRows(vehicle.rows)
    })),
    {
      name: "Matriz placas",
      title: `MATRIZ DE EJECUTADOS POR PLACA · ${report.period}`,
      subtitle: "Ejecutado por concepto y vehículo (centro de costo = placa)",
      columns: [{ key: "concepto", label: "CONCEPTO", width: 340 }, ...report.vehicles.map((vehicle) => ({ key: vehicle.plate, label: vehicle.plate, width: 130, numberFormat: "#,##0.00" }))],
      rows: report.corporate.rows.map((concept) => {
        const record: Record<string, string | number> = { concepto: concept.name };
        for (const vehicle of report.vehicles) record[vehicle.plate] = rowOf(vehicle, concept.code)?.actual ?? 0;
        return record;
      })
    }
  ];
  void downloadXlsxWorkbook(`pyg-transporte-${report.period}`, sheets);
}
