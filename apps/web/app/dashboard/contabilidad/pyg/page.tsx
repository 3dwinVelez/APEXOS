"use client";

import {
  api,
  getTransportPygBudgets, getTransportPygConfig, getTransportPygMapping, getTransportPygReport,
  saveTransportPygBudgets, saveTransportPygConfig, saveTransportPygMapping,
  type TransportPygAccountChild, type TransportPygReport, type TransportPygRow, type TransportPygVehicle
} from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { downloadXlsxWorkbook, type XlsxReportSheet } from "@/lib/reportExports";
import AccountingPyg from "@/components/accounting/AccountingPyg";
import TransportPygAccountConfig from "@/components/transport-pyg/TransportPygAccountConfig";
import { KIND_LABELS } from "@/lib/transport-pyg-account-config";
import { AlertTriangle, BadgeDollarSign, ChevronDown, ChevronRight, Download, FileSpreadsheet, Fuel, Gauge, PieChart, RefreshCw, Scale, Settings2, Target, Truck, Wallet } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

const money = { format: (value: number) => formatRegionalMoney(value) };
const compact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  const [mainView, setMainView] = useState<"contable" | "vehiculo">("contable");
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
  useEffect(() => { if (mainView === "vehiculo") void load(); }, [load, mainView]);

  const selectedVehicle = useMemo(() => {
    if (!report?.vehicles.length) return null;
    return report.vehicles.find((vehicle) => vehicle.plate === selectedPlate) || report.vehicles[0];
  }, [report, selectedPlate]);

  const isAccounting = report?.source === "accounting";
  // La vista contable no usa el presupuesto operativo por placa: el presupuesto
  // viene del PYG Contable (Presupuesto PUC). La pestana se oculta en esa fuente.
  const tabs = useMemo(() => (isAccounting ? VIEWS.filter(([key]) => key !== "presupuesto") : VIEWS), [isAccounting]);
  const activeView: View = view === "presupuesto" && isAccounting ? "consolidado" : view;

  return (
    <div className="apex-workspace-shell space-y-4 text-content-body">
      <ContabilidadNav />
      <header className="apex-section-card overflow-hidden">
        <div className="border-b border-line bg-surface-muted p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="rounded-xl bg-apex p-3 text-white"><Scale /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-apex">M-07 · Contabilidad · Rentabilidad</p>
                <h1 className="text-2xl font-semibold text-content-strong">{mainView === "contable" ? "PYG Contable · PUC" : "PYG por Vehículo"}</h1>
                <p className="text-sm text-content-muted">{mainView === "contable" ? "Matriz interactiva del estado de resultados por cuenta PUC, sucursal y centro de costo: actual, año anterior y presupuesto, con desglose hasta el centro de costo." : isAccounting ? "Estado de resultados por vehículo leído del libro contable con rangos PUC configurables: ingresos, gastos, subtotales y presupuesto del PYG Contable." : "Estado de resultados por placa (centro de costo): ingresos liquidados, gastos operativos y utilidad contra presupuesto."}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <nav aria-label="Vista del PYG" className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                <button className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mainView === "contable" ? "bg-apex text-white" : "text-content-muted hover:text-content-strong"}`} onClick={() => setMainView("contable")} type="button">Contable · PUC</button>
                <button className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mainView === "vehiculo" ? "bg-apex text-white" : "text-content-muted hover:text-content-strong"}`} onClick={() => setMainView("vehiculo")} type="button">Por vehículo</button>
              </nav>
              {mainView === "vehiculo" ? (
                <>
                  <label className="text-xs text-content-muted">Periodo<input className="mt-1 block h-9 rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => setPeriod(event.target.value)} type="month" value={period} /></label>
                  <button aria-label="Actualizar" className="h-9 rounded-md border border-line bg-surface px-3" onClick={() => void load()} type="button"><RefreshCw size={16} /></button>
                  <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!report} onClick={() => report && exportWorkbook(report)} type="button"><Download size={16} /> Excel</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {mainView === "vehiculo" ? <nav className="flex gap-1 overflow-x-auto p-2">{tabs.map(([key, label]) => <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${activeView === key ? "bg-apex text-white" : "text-content-muted hover:bg-surface-muted hover:text-content-strong"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}</nav> : null}
      </header>

      {mainView === "contable" ? <AccountingPyg /> : (
        <>
          {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-400">{error}</div> : null}
          {!report ? <div className="apex-section-card p-12 text-center text-content-muted">Construyendo el estado de resultados…</div> : (
            <>
              {loading ? <div aria-busy="true" role="status" className="rounded-xl border border-line bg-surface-muted/60 p-3 text-center text-xs text-content-muted">Actualizando…</div> : null}
              {report.source === "accounting" && (report.warnings?.length || 0) > 0 ? (
                <details className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={16} /> {report.warnings?.length} aviso(s) del PYG por vehículo (fuente contable)</summary>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                    {report.warnings?.map((warning) => <li key={`${warning.code}-${warning.message}`}><strong>{warning.code}:</strong> {warning.message}</li>)}
                  </ul>
                </details>
              ) : null}
              {report.data_status.unmapped_total > 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                  <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                  <div><strong>Gastos sin clasificar: {money.format(report.data_status.unmapped_total)}.</strong> {report.source === "accounting" ? "Existen cuentas del libro sin rango PUC asociado; se presentan en la fila dinámica “GASTOS SIN CLASIFICAR” y siguen dentro de la utilidad. Configura los Rangos PUC para limpiar la lectura." : "Existen líneas de caja menor con centro de costo (placa) cuyo concepto no está mapeado a una línea del PYG. Se incluyen en la fila dinámica “GASTOS SIN CLASIFICAR”; ajusta el mapeo en Configuración para limpiar la lectura."}</div>
                </div>
              ) : null}
              {activeView === "configuracion" ? <ConfigView canWrite={canWrite} onSaved={() => void load()} report={report} /> : (
                <>
                  {report.data_status.vehicle_count === 0 ? <NoVehiclesNotice onConfig={() => setView("configuracion")} /> : null}
                  {activeView === "consolidado" ? <ConsolidatedView canWrite={canWrite} onConfig={() => setView("configuracion")} report={report} /> :
                    activeView === "vehiculos" ? <VehiclesView onSelectPlate={setSelectedPlate} report={report} selectedPlate={selectedVehicle?.plate || ""} /> :
                    <BudgetsView canWrite={canWrite} onSaved={() => void load()} period={period} report={report} />}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function NoVehiclesNotice({ onConfig }: { onConfig: () => void }) {
  return (
    <div className="apex-section-card p-4 text-sm text-content-muted">
      <div className="flex items-start gap-3">
        <Truck className="mt-0.5 shrink-0 text-content-subtle" size={20} />
        <div>
          <p className="font-semibold text-content-strong">No hay vehículos activos en la flota.</p>
          <p>Crea los vehículos en Transporte → Vehículos y documentos para habilitar el PYG por placa. Los centros de costo del libro sin vehículo siguen visibles en el consolidado, y los rangos PUC se pueden configurar en cualquier momento.</p>
          <button className="mt-2 inline-flex items-center gap-2 rounded-md border border-apex px-3 py-2 text-sm font-semibold text-apex" onClick={onConfig} type="button"><Settings2 size={16} /> Configurar Rangos PUC</button>
        </div>
      </div>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const hasDrill = rows.some((row) => (row.children?.length || 0) > 0);
  const moneyCell = (value: number | null) => value == null ? <span className="text-content-subtle">—</span> : money.format(value);
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
                    <td className="px-3 py-2 text-right tabular-nums">{moneyCell(row.budget)}</td>
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

function AccountDrillRow({ account }: { account: TransportPygAccountChild }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className="border-t border-line bg-surface-muted/40">
        <td className="py-1.5 pl-10 pr-3 text-xs text-content-muted">
          {account.centers.length ? (
            <button aria-expanded={open} aria-label={`Desglosar ${account.account_name}`} className="inline-flex items-center gap-1 text-left" onClick={() => setOpen((value) => !value)} title={`Cuenta ${account.account_code}`} type="button">
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="truncate font-medium text-content-strong">{account.account_name}</span>
            </button>
          ) : <span className="font-medium text-content-strong" title={`Cuenta ${account.account_code}`}>{account.account_name}</span>}
          {account.budget_coverage === "partial" ? <span className="ml-2 text-[10px] font-bold text-amber-400">P</span> : null}
        </td>
        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-content-muted">{account.budget == null ? "—" : money.format(account.budget)}</td>
        <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${account.actual < 0 ? "text-red-400" : ""}`}>{money.format(account.actual)}</td>
        <td className="px-3 py-1.5" colSpan={2} />
      </tr>
      {open ? account.centers.map((center) => (
        <tr className="border-t border-line/60 bg-surface-muted/20" key={`${account.account_code}-${center.center_code}-${center.branch_code}`}>
          <td className="py-1.5 pl-16 pr-3 text-xs text-content-muted" title={`Centro ${center.center_code} · Sucursal ${center.branch_code}`}>
            <span className="text-content-strong">{center.center_name}</span>
            {center.branch_name ? <span className="ml-1 text-[10px] text-content-subtle">· {center.branch_name}</span> : null}
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-content-muted">{center.budget == null ? "—" : money.format(center.budget)}</td>
          <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${center.actual < 0 ? "text-red-400" : ""}`}>{money.format(center.actual)}</td>
          <td className="px-3 py-1.5" colSpan={2} />
        </tr>
      )) : null}
    </Fragment>
  );
}

function ConsolidatedView({ report, canWrite, onConfig }: { report: TransportPygReport; canWrite: boolean; onConfig: () => void }) {
  const gastos = rowOfCorporate(report, "TOTAL_GASTOS_OPERACIONALES");
  const utilidadOp = rowOfCorporate(report, "UTILIDAD_OPERACIONAL");
  const utilidadNeta = rowOfCorporate(report, "UTILIDAD_NETA");
  const impuesto = rowOfCorporate(report, "IMPUESTO_REGIMEN_SIMPLE");
  const isAccounting = report.source === "accounting";
  const incomeDetail = `${report.data_status.vehicles_with_income}/${report.data_status.vehicle_count} vehículos con producción` + (isAccounting && report.data_status.unassigned_centers ? ` · ${report.data_status.unassigned_centers} bloque sin vehículo` : "");
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={money.format(report.corporate.income_actual)} detail={incomeDetail} />
        <Kpi icon={<Fuel size={18} />} label="Gastos operacionales" value={money.format(gastos?.actual ?? 0)} detail={gastos?.budget == null ? "Sin presupuesto definido" : `Presupuesto ${money.format(gastos.budget)}`} />
        <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(utilidadOp?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadOp?.actual ?? 0)} detail={`Margen ${report.corporate.income_actual ? percent.format(((utilidadOp?.actual ?? 0) / report.corporate.income_actual) * 100) : "—"}%`} />
        <Kpi icon={<Wallet size={18} />} label="Impuesto régimen simple" value={money.format(impuesto?.actual ?? 0)} detail={isAccounting ? "Según cuentas 54* contabilizadas" : `Tarifa ${percent.format(report.tax_percent)}% sobre ingresos`} />
        <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(utilidadNeta?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadNeta?.actual ?? 0)} detail={`Cumplimiento presupuesto ${utilidadNeta?.cump != null ? percent.format(utilidadNeta.cump * 100) : "—"}%`} />
      </section>
      <StatementTable caption={`Periodo ${report.period_start} a ${report.period_end} · consolidado de las ${report.data_status.vehicle_count} placas activas${isAccounting ? " y de los centros sin vehículo" : ""} · ${isAccounting ? "leído del libro contable con rangos PUC" : "liquidaciones, caja menor y nómina"}.`} rows={report.corporate.rows} title={`PYG corporativo · ${report.period}`} />
      {report.unassigned ? (
        <StatementTable caption={`Centros de costo del libro sin vehículo asignado; se incluyen en el consolidado y no se asignan dos veces.`} rows={report.unassigned.rows} title="Sin vehículo / sin asignar" />
      ) : null}
      {report.reconciliation ? (
        <section className="apex-section-card p-4 text-xs text-content-muted">
          <h2 className="font-semibold text-content-strong">Reconciliación con el libro</h2>
          <p className="mt-1">Neta del reporte {money.format(report.reconciliation.neta_actual)} · suma firmada del libro {money.format(report.reconciliation.ledger_net)} · diferencia {money.format(report.reconciliation.difference)}{report.reconciliation.informational_actual ? ` (depreciación informativa presentada sin restar: ${money.format(report.reconciliation.informational_actual)})` : ""}.</p>
          <p>{report.reconciliation.note}</p>
        </section>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 rounded-md border border-apex px-3 py-2 text-sm font-semibold text-apex" onClick={onConfig} type="button"><Settings2 size={16} /> {report.source === "accounting" ? "Configurar Rangos PUC" : "Ajustar tarifa de impuesto y mapeo de conceptos"}</button>
        </div>
      ) : null}
    </div>
  );
}

function VehiclesView({ report, selectedPlate, onSelectPlate }: { report: TransportPygReport; selectedPlate: string; onSelectPlate: (plate: string) => void }) {
  const [localSelection, setLocalSelection] = useState<string>("");
  const effectivePlate = localSelection || selectedPlate;
  const unassignedSelected = report.unassigned ? effectivePlate === report.unassigned.plate : false;
  const vehicle = unassignedSelected ? null : report.vehicles.find((item) => item.plate === effectivePlate) || report.vehicles[0];
  const utilidadNeta = vehicle ? rowOf(vehicle, "UTILIDAD_NETA") : undefined;
  const gridConcepts = report.corporate.rows;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {report.vehicles.map((item) => (
          <button className={`shrink-0 rounded-xl border px-3 py-2 text-left ${item.plate === vehicle?.plate && !unassignedSelected ? "border-apex bg-apex/10" : "border-line hover:bg-surface-muted"}`} key={item.plate} onClick={() => { setLocalSelection(item.plate); onSelectPlate(item.plate); }} type="button">
            <span className="block text-sm font-bold text-content-strong">{item.plate}</span>
            <span className={`block text-xs font-semibold ${(rowOf(item, "UTILIDAD_NETA")?.actual ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>{money.format(rowOf(item, "UTILIDAD_NETA")?.actual ?? 0)}</span>
          </button>
        ))}
        {report.unassigned ? (
          <button className={`shrink-0 rounded-xl border px-3 py-2 text-left ${unassignedSelected ? "border-amber-400 bg-amber-400/10" : "border-dashed border-amber-500/40 hover:bg-surface-muted"}`} onClick={() => setLocalSelection(report.unassigned?.plate || "")} type="button">
            <span className="block text-sm font-bold text-amber-400">Sin vehículo / sin asignar</span>
            <span className="block text-xs font-semibold text-content-muted">{money.format(rowOf(report.unassigned, "TOTAL_INGRESOS")?.actual ?? 0)} de ingresos</span>
          </button>
        ) : null}
      </div>
      {unassignedSelected && report.unassigned ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Truck size={18} />} label="Bloque" value="Sin vehículo" detail="Centros de costo sin placa asignada" />
            <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={money.format(report.unassigned.income_actual)} detail={`Presupuesto ${rowOf(report.unassigned, "INGRESOS")?.budget == null ? "—" : money.format(rowOf(report.unassigned, "INGRESOS")?.budget ?? 0)}`} />
            <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(rowOf(report.unassigned, "UTILIDAD_OPERACIONAL")?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(rowOf(report.unassigned, "UTILIDAD_OPERACIONAL")?.actual ?? 0)} detail={`Gastos ${money.format(rowOf(report.unassigned, "TOTAL_GASTOS_OPERACIONALES")?.actual ?? 0)}`} />
            <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(rowOf(report.unassigned, "UTILIDAD_NETA")?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(rowOf(report.unassigned, "UTILIDAD_NETA")?.actual ?? 0)} detail="Incluido en el consolidado corporativo" />
          </section>
          <StatementTable caption="Centros de costo del libro sin vehículo asignado; nunca se asignan dos veces ni desaparecen del consolidado." rows={report.unassigned.rows} title={`Sin vehículo / sin asignar · ${report.period}`} />
        </>
      ) : vehicle ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Truck size={18} />} label="Vehículo" value={vehicle.plate} detail={vehicle.vehicle_label || (vehicle.center_name ? `Centro ${vehicle.center_name}` : "Sin descripción adicional")} />
            <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={money.format(vehicle.income_actual)} detail={`Presupuesto ${rowOf(vehicle, "INGRESOS")?.budget == null ? "—" : money.format(rowOf(vehicle, "INGRESOS")?.budget ?? 0)}`} />
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
      for (const vehicle of report.vehicles) for (const row of vehicle.rows) {
        if (row.kind !== "income" && row.kind !== "expense") continue;
        const budget = row.budget;
        if (budget != null && budget > 0) fromReport[`${vehicle.vehicle_id}:${row.code}`] = String(budget);
      }
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
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <section className="apex-section-card space-y-3 p-4">
          <div><h2 className="font-semibold text-content-strong">Impuesto de régimen simple</h2><p className="text-xs text-content-muted">{report.source === "accounting" ? "Tarifa de referencia mostrada en el reporte contable; el impuesto ejecutado se lee de las cuentas 54* contabilizadas (nunca se estima si la cuenta no tiene movimiento)." : "Porcentaje aplicado sobre los ingresos ejecutados de cada placa para calcular la línea de impuesto y la utilidad neta."}</p></div>
          <label className="block text-sm text-content-muted">Tarifa %<input className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-content-strong" disabled={!canWrite} min={0} max={100} onChange={(event) => setTax(event.target.value)} step="0.01" type="number" value={tax} /></label>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {notice ? <p className="text-xs text-emerald-600">{notice}</p> : null}
          {canWrite ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void saveTax()} type="button"><Settings2 size={16} />Guardar configuración</button> : null}
        </section>
        {report.source === "operational" ? (
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
        ) : (
          <section className="apex-section-card p-4">
            <div><h2 className="font-semibold text-content-strong">Presupuesto por vehículo (fuente contable)</h2><p className="text-xs text-content-muted">El presupuesto de cada fila proviene del almacén de Presupuesto PUC del PYG Contable (cuenta, sucursal y centro de costo). No se usa el presupuesto operativo por placa ni las líneas de esta sección; tampoco se estima impuesto si la cuenta mapeada sigue en cero.</p></div>
            <p className="mt-2 rounded-lg border border-line bg-surface-muted/60 p-3 text-xs text-content-muted">Define o ajusta el presupuesto en Contabilidad → PYG → Presupuesto PUC. La cobertura se marca como completa, parcial o sin presupuesto según las cuentas de cada concepto.</p>
          </section>
        )}
      </div>
      <TransportPygAccountConfig canWrite={canWrite} onSaved={onSaved} />
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
    presupuesto: row.budget == null ? "" : row.budget,
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
