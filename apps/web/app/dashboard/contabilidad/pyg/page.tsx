"use client";

import { getTransportPygReport, type TransportPygReport, type TransportPygRow } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { downloadXlsxWorkbook, type XlsxReportSheet } from "@/lib/reportExports";
import AccountingPyg from "@/components/accounting/AccountingPyg";
import TransportPygAccountConfig from "@/components/transport-pyg/TransportPygAccountConfig";
import {
  Kpi, SourceNote, UnassignedKpis, UnmappedNotice, VehicleKpis, rowOf, rowOfCorporate, vehicleMoney as money, vehiclePercent as percent
} from "@/components/accounting/PygVehicleReadings";
import { StatementTable } from "@/components/accounting/PygStatementTable";
import { PygCentersMatrix } from "@/components/accounting/PygCentersMatrix";
import { centerExcelLabel } from "@/lib/pyg-center-labels.mjs";
import { pygExpandedHref } from "@/lib/pyg-expanded";
import { AlertTriangle, BadgeDollarSign, Download, ExternalLink, Fuel, Gauge, PieChart, RefreshCw, Scale, Settings2, Truck, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };

type View = "consolidado" | "vehiculos" | "centros" | "configuracion";
const VIEWS: Array<[View, string]> = [["consolidado", "Consolidado"], ["vehiculos", "Por vehículo"], ["centros", "Por CC"], ["configuracion", "Configuración"]];

// Enlace nativo a la ventana ampliada. No se deduce si abrió ni se bloquea por temporizadores:
// el navegador decide y, si la pestaña nueva no aparece, el usuario puede abrir el enlace
// directamente (clic derecho → abrir en nueva pestaña) mientras esta página sigue intacta.
function ExpandedWindowLink({ href }: { href: string }) {
  return (
    <a
      aria-label="Abrir el PYG del vehículo en una pestaña o ventana nueva"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-apex/5"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <ExternalLink size={16} /> Abrir en otra ventana
    </a>
  );
}

export default function AccountingVehiclePygPage() {
  const [mainView, setMainView] = useState<"contable" | "vehiculo">("contable");
  const [period, setPeriod] = useState(currentMonth());
  const [report, setReport] = useState<TransportPygReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [view, setView] = useState<View>("consolidado");
  const [selectedPlate, setSelectedPlate] = useState("");
  const canWrite = hasStoredRolePermission("accounting", "write");
  const loadSeq = useRef(0);

  const load = useCallback(async (targetPeriod: string) => {
    const seq = ++loadSeq.current;
    setLoading(true); setError("");
    try {
      const data = await getTransportPygReport(targetPeriod);
      if (seq !== loadSeq.current) return;
      if (data.source !== "accounting" || data.report_source !== "ledger") {
        throw new Error("La consulta no devolvió el libro contable. Actualiza la página antes de continuar.");
      }
      if (data.period !== targetPeriod) {
        throw new Error("El período recibido no coincide con el solicitado. Actualiza la consulta.");
      }
      setReport(data);
      setLoadedPeriod(targetPeriod);
    }
    catch (value) {
      if (seq !== loadSeq.current) return;
      setError(value instanceof Error ? value.message : "No fue posible leer el PYG contable por vehículo.");
    }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }, []);
  useEffect(() => { if (mainView === "vehiculo") void load(period); }, [load, mainView, period]);

  const selectedVehicle = useMemo(() => {
    if (!report?.vehicles.length) return null;
    return report.vehicles.find((vehicle) => vehicle.plate === selectedPlate) || report.vehicles[0];
  }, [report, selectedPlate]);

  // El PYG por vehículo siempre se lee del libro contable (asientos publicados
  // del periodo); no hay fuente operativa ni activación que alternar.
  const reportReady = !!report && !loading && !error && loadedPeriod === period;

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
                <p className="text-sm text-content-muted">{mainView === "contable" ? "Matriz interactiva del estado de resultados por cuenta PUC, sucursal y centro de costo: actual, año anterior y presupuesto, con desglose hasta el centro de costo." : "Estado de resultados por vehículo construido automáticamente desde el libro contable (asientos publicados del periodo seleccionado) con rangos PUC configurables: ingresos, gastos, subtotales y presupuesto del PYG Contable. La vista Por CC conserva esa estructura con los centros de costo en las columnas."}</p>
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
                  <button aria-label="Actualizar" className="h-9 rounded-md border border-line bg-surface px-3" onClick={() => void load(period)} type="button"><RefreshCw size={16} /></button>
                  <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!reportReady} onClick={() => report && exportWorkbook(report)} type="button"><Download size={16} /> Excel</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {mainView === "vehiculo" ? <nav className="flex gap-1 overflow-x-auto p-2">{VIEWS.map(([key, label]) => <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${view === key ? "bg-apex text-white" : "text-content-muted hover:bg-surface-muted hover:text-content-strong"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}</nav> : null}
      </header>

      {mainView === "contable" ? <AccountingPyg period={period} onPeriodChange={setPeriod} /> : view === "configuracion" ? (
        <ConfigView canWrite={canWrite} onSaved={() => void load(period)} />
      ) : (
        <>
          {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-400">{error}</div> : null}
          {reportReady ? (
            <>
              {(report.warnings?.length || 0) > 0 ? (
                <details className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={16} /> {report.warnings?.length} aviso(s) del PYG por vehículo (libro contable)</summary>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                    {report.warnings?.map((warning) => <li key={`${warning.code}-${warning.message}`}><strong>{warning.code}:</strong> {warning.message}</li>)}
                  </ul>
                </details>
              ) : null}
              <UnmappedNotice report={report} />
              {report.data_status.vehicle_count === 0 ? <NoVehiclesNotice onConfig={() => setView("configuracion")} /> : null}
              {view === "consolidado" ? <ConsolidatedView canWrite={canWrite} onConfig={() => setView("configuracion")} report={report} /> : view === "centros" ? <PygCentersMatrix report={report} /> : <VehiclesView key={report.period} onSelectPlate={setSelectedPlate} report={report} selectedPlate={selectedVehicle?.plate || ""} />}
              <SourceNote period={report.period} />
            </>
          ) : (
            <div className="apex-section-card p-12 text-center text-content-muted">{loading ? "Leyendo el libro contable del periodo…" : "Construyendo el estado de resultados…"}</div>
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

function ConsolidatedView({ report, canWrite, onConfig }: { report: TransportPygReport; canWrite: boolean; onConfig: () => void }) {
  const gastos = rowOfCorporate(report, "TOTAL_GASTOS_OPERACIONALES");
  const utilidadOp = rowOfCorporate(report, "UTILIDAD_OPERACIONAL");
  const utilidadNeta = rowOfCorporate(report, "UTILIDAD_NETA");
  const impuesto = rowOfCorporate(report, "IMPUESTO_REGIMEN_SIMPLE");
  const incomeDetail = `${report.data_status.vehicles_with_income}/${report.data_status.vehicle_count} vehículos con producción` + (report.data_status.unassigned_centers ? ` · ${report.data_status.unassigned_centers} bloque sin vehículo` : "");
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<BadgeDollarSign size={18} />} label="Ingresos" value={money.format(report.corporate.income_actual)} detail={incomeDetail} />
        <Kpi icon={<Fuel size={18} />} label="Gastos operacionales" value={money.format(gastos?.actual ?? 0)} detail={gastos?.budget == null ? "Sin presupuesto definido" : `Presupuesto ${money.format(gastos.budget)}`} />
        <Kpi icon={<Gauge size={18} />} label="Utilidad operacional" tone={(utilidadOp?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadOp?.actual ?? 0)} detail={`Margen ${report.corporate.income_actual ? percent.format(((utilidadOp?.actual ?? 0) / report.corporate.income_actual) * 100) : "—"}%`} />
        <Kpi icon={<Wallet size={18} />} label="Impuesto régimen simple" value={money.format(impuesto?.actual ?? 0)} detail="Según cuentas 54* contabilizadas" />
        <Kpi icon={<PieChart size={18} />} label="Utilidad neta" tone={(utilidadNeta?.actual ?? 0) >= 0 ? "success" : "error"} value={money.format(utilidadNeta?.actual ?? 0)} detail={`Cumplimiento presupuesto ${utilidadNeta?.cump != null ? percent.format(utilidadNeta.cump * 100) : "—"}%`} />
      </section>
      <StatementTable caption={`Periodo ${report.period_start} a ${report.period_end} · consolidado de las ${report.data_status.vehicle_count} placas activas y de los centros sin vehículo · leído del libro contable (asientos publicados del periodo) con rangos PUC.`} rows={report.corporate.rows} title={`PYG corporativo · ${report.period}`} />
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
          <button className="inline-flex items-center gap-2 rounded-md border border-apex px-3 py-2 text-sm font-semibold text-apex" onClick={onConfig} type="button"><Settings2 size={16} /> Configurar Rangos PUC</button>
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
  const expandedHref = vehicle ? pygExpandedHref({ plate: vehicle.plate, period: report.period }) : "";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
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
        {vehicle ? (
          <div className="flex flex-col items-start gap-1">
            <ExpandedWindowLink href={expandedHref} key={expandedHref} />
            <p className="text-[11px] text-content-muted">Se abre en una pestaña o ventana nueva. Si no aparece, abre el enlace directamente desde aquí; esta página sigue igual.</p>
          </div>
        ) : null}
      </div>
      {unassignedSelected && report.unassigned ? (
        <>
          <UnassignedKpis unassigned={report.unassigned} />
          <StatementTable caption="Centros de costo del libro sin vehículo asignado; nunca se asignan dos veces ni desaparecen del consolidado." rows={report.unassigned.rows} title={`Sin vehículo / sin asignar · ${report.period}`} />
        </>
      ) : vehicle ? (
        <>
          <VehicleKpis vehicle={vehicle} />
          <StatementTable caption={`Estado de resultados de la placa ${vehicle.plate} en ${report.period}, leído del libro contable (asientos publicados del periodo).`} rows={vehicle.rows} title={`PYG ${vehicle.plate} · ${report.period}`} />
        </>
      ) : null}
    </div>
  );
}

function ConfigView({ canWrite, onSaved }: { canWrite: boolean; onSaved: () => void }) {
  return (
    <div className="space-y-4">
      <section className="apex-section-card p-4">
        <h2 className="font-semibold text-content-strong">Configuración de rangos PUC</h2>
        <p className="mt-1 text-xs text-content-muted">El PYG por vehículo se construye siempre desde el libro contable (asientos publicados del periodo). Aquí solo defines cómo se agrupan las cuentas en los conceptos, secciones y subtotales del estado de resultados; no hay fuente operativa ni impuesto que activar.</p>
      </section>
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
    },
    ...(report.centers?.length ? [{
      name: "Matriz CC",
      title: `PYG POR CENTRO DE COSTO · ${report.period}`,
      subtitle: "Misma estructura del PYG por vehículo con los centros de costo en las columnas: presupuesto, ejecutado, % del ingreso y cumplimiento",
      columns: [
        { key: "concepto", label: "CONCEPTO", width: 340 },
        ...report.centers.flatMap((center, index) => {
          const label = centerExcelLabel(center, index);
          return [
            { key: `cc${index}_presupuesto`, label: `${label} · PRESUPUESTO`, width: 140, numberFormat: "#,##0.00" },
            { key: `cc${index}_ejecutado`, label: `${label} · EJECUTADO`, width: 140, numberFormat: "#,##0.00" },
            { key: `cc${index}_porcentaje`, label: `${label} · %`, width: 90, numberFormat: "0.00" },
            { key: `cc${index}_cumplimiento`, label: `${label} · CUMP %`, width: 100, numberFormat: "0.00" }
          ];
        })
      ],
      rows: report.corporate.rows.map((concept) => {
        const record: Record<string, string | number> = { concepto: concept.name };
        report.centers?.forEach((center, index) => {
          const row = center.rows.find((item) => item.code === concept.code);
          record[`cc${index}_presupuesto`] = row?.budget == null ? "" : row.budget;
          record[`cc${index}_ejecutado`] = row?.actual ?? 0;
          record[`cc${index}_porcentaje`] = row?.pct == null ? "" : Math.round(row.pct * 10000) / 100;
          record[`cc${index}_cumplimiento`] = row?.cump == null ? "" : Math.round(row.cump * 10000) / 100;
        });
        return record;
      })
    }] : [])
  ];
  void downloadXlsxWorkbook(`pyg-transporte-${report.period}`, sheets);
}
