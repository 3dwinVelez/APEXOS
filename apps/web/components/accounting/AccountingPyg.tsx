"use client";

import { api } from "@/lib/api";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { downloadXlsxWorkbook, type XlsxReportSheet } from "@/lib/reportExports";
import AccountingPygBudget from "@/components/accounting/AccountingPygBudget";
import { BarChart3, ChevronDown, ChevronRight, Download, Info, ListTree, RefreshCw, Search, Target, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DimKey = "puc" | "branch" | "cost_center";
type PygNode = {
  key: string; dimension: DimKey; code: string; name: string; section: string | null; level: number;
  account_id: number | null; inactive: boolean; is_leaf: boolean; children: PygNode[];
  actual: number; prior: number; difference: number; variation_pct: number | null;
  budget: number | null; budget_status: "none" | "partial" | "complete";
  budget_variance: number | null; budget_execution_pct: number | null;
  leaf_rows: number; budget_rows: number; has_movement: boolean;
};
type PygSection = {
  key: string; label: string; actual: number; prior: number; difference: number; variation_pct: number | null;
  budget: number | null; budget_status: string; leaf_rows: number; budget_rows: number;
};
type PygReport = {
  period: string; mode: string; dimensions: string[];
  filters: { branch: string | null; cost_center: string | null };
  range: { start: string; end: string; periods: string[] };
  prior_range: { start: string; end: string; periods: string[] };
  budget_periods: string[];
  budget_periods_found: string[];
  budget_coverage: "none" | "partial" | "full";
  sections: PygSection[];
  unclassified: { income: PygSection; expense: PygSection };
  net: { actual: number; prior: number; budget: number | null; budget_status: string; difference: number; variation_pct: number | null };
  nodes: PygNode[];
  organization: {
    branches: Array<{ code: string; name: string; active: boolean; society_code: string | null }>;
    cost_centers: Array<{ code: string; name: string; active: boolean; branch_code: string | null; society_code: string | null }>;
  };
  linkage: {
    ledger_entries: number; linked: number; orphan: number; ambiguous: number; partial: number;
    missing_branch: number; missing_center: number; coverage_pct: number | null;
    orphan_amount: number; ambiguous_amount: number; missing_branch_amount: number; missing_center_amount: number;
  };
  warnings: Array<{ code: string; message: string }>;
  is_empty: boolean;
  metadata: { generated_at: string; source: string; amount_convention: string; accounts_included: number; prior_year_only: boolean };
};
type OrgTree = {
  societies: Array<{ code: string; name: string; active: boolean }>;
  branches: Array<{ code: string; name: string; active: boolean; society_code: string | null }>;
  cost_centers: Array<{ code: string; name: string; active: boolean; branch_code: string | null; society_code: string | null }>;
};

const DIM_OPTIONS: Array<{ value: DimKey; label: string }> = [
  { value: "puc", label: "Cuenta PUC" },
  { value: "branch", label: "Sucursal" },
  { value: "cost_center", label: "Centro de costo" }
];
const PRESETS: Array<{ label: string; dims: DimKey[] }> = [
  { label: "PUC · Sucursal · Centro", dims: ["puc", "branch", "cost_center"] },
  { label: "Sucursal · PUC · Centro", dims: ["branch", "puc", "cost_center"] },
  { label: "Centro · PUC · Sucursal", dims: ["cost_center", "puc", "branch"] }
];
const SECTION_BAND: Record<string, string> = {
  ingresos4: "bg-emerald-500/10",
  gastos5: "bg-amber-500/10",
  costos6: "bg-orange-500/10",
  costosproduccion7: "bg-rose-500/10",
  no_clasificado: "bg-purple-500/10",
  mixed: "bg-surface-muted/70"
};
const SECTION_SHORT: Record<string, string> = {
  ingresos4: "Ingresos", gastos5: "Gastos", costos6: "Costos", costosproduccion7: "Costos producción", no_clasificado: "Fuera del PUC", mixed: "Mixto"
};
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const percent = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

function Money({ value, strong = false }: { value: number | null; strong?: boolean }) {
  if (value == null) return <span className="text-content-subtle">—</span>;
  const negative = value < 0;
  return <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${negative ? "text-red-400" : ""}`}>{negative ? `(${formatRegionalMoney(Math.abs(value))})` : formatRegionalMoney(value)}</span>;
}
function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-content-subtle">—</span>;
  const negative = value < 0;
  return <span className={`tabular-nums ${negative ? "text-red-400" : "text-emerald-400"}`}>{negative ? `(${formatRegionalMoney(Math.abs(value))})` : formatRegionalMoney(value)}</span>;
}
function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-content-subtle">—</span>;
  const negative = value < 0;
  return <span className={`tabular-nums ${negative ? "text-red-400" : "text-emerald-400"}`}>{percent.format(value)}%</span>;
}

function pruneToSearch(nodes: PygNode[], query: string): PygNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const keep = (node: PygNode): PygNode | null => {
    const self = node.name.toLowerCase().includes(q) || String(node.code).toLowerCase().includes(q);
    const children = node.children.map(keep).filter((child): child is PygNode => child !== null);
    if (self || children.length) return { ...node, children };
    return null;
  };
  return nodes.map(keep).filter((node): node is PygNode => node !== null);
}

export default function AccountingPyg() {
  const [period, setPeriod] = useState(currentMonth());
  const [mode, setMode] = useState<"month" | "ytd">("month");
  const [dims, setDims] = useState<DimKey[]>(["puc", "branch", "cost_center"]);
  const [branch, setBranch] = useState("");
  const [center, setCenter] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"matriz" | "presupuesto">("matriz");
  const [report, setReport] = useState<PygReport | null>(null);
  const [org, setOrg] = useState<OrgTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const requestRef = useRef<AbortController | null>(null);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({ period, mode });
    for (const dim of dims) params.append("dimensions", dim);
    if (branch) params.set("branch", branch);
    if (center) params.set("cost_center", center);
    return `/api/v1/accounting/reports/pyg-interactive?${params.toString()}`;
  }, [period, mode, dims, branch, center]);

  const fetchReport = useCallback(async (signal?: AbortSignal) => {
    return api<PygReport>(buildUrl(), { cache: "no-store", ...(signal ? { signal } : {}) });
  }, [buildUrl]);

  useEffect(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setReport(null);
    setError("");
    setLoading(true);
    fetchReport(controller.signal)
      .then((data) => { setReport(data); setExpanded(new Set(data.nodes.map((node) => node.key))); })
      .catch((value) => { if (value?.name !== "AbortError") setError(value instanceof Error ? value.message : "No fue posible leer el PYG interactivo."); })
      .finally(() => { if (requestRef.current === controller) { setLoading(false); requestRef.current = null; } });
    return () => controller.abort();
  }, [fetchReport]);

  const refresh = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const data = await fetchReport(controller.signal);
      setReport(data);
      setExpanded((current) => {
        const next = new Set(current);
        for (const node of data.nodes) next.add(node.key);
        return next;
      });
    } catch (value) {
      if (value?.name !== "AbortError") setError(value instanceof Error ? value.message : "No fue posible actualizar el PYG interactivo.");
    } finally {
      setRefreshing(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [fetchReport]);

  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    api<OrgTree>("/api/v1/accounting/organization-tree", { cache: "no-store", signal: controller.signal })
      .then(setOrg)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const setDimAt = (index: number, value: DimKey) => setDims((current) => current.map((dim, dimIndex) => (dimIndex === index ? value : dim)));
  const optionsFor = (index: number) => DIM_OPTIONS.filter((option) => option.value === dims[index] || !dims.includes(option.value));

  const searchActive = search.trim().length > 0;
  const visibleNodes = useMemo(() => (report ? pruneToSearch(report.nodes, search) : []), [report, search]);
  const expandableKeys = useMemo(() => {
    const keys: string[] = [];
    const walk = (nodes: PygNode[]) => {
      for (const node of nodes) {
        if (node.children.length) keys.push(node.key);
        walk(node.children);
      }
    };
    walk(visibleNodes);
    return keys;
  }, [visibleNodes]);
  const allExpanded = expandableKeys.every((key) => expanded.has(key));
  const toggleAll = () => setExpanded((current) => {
    const next = new Set(current);
    if (allExpanded) for (const key of expandableKeys) next.delete(key);
    else for (const key of expandableKeys) next.add(key);
    return next;
  });

  const chartData = useMemo(() => {
    if (!report) return [];
    return report.sections.map((section) => ({
      name: SECTION_SHORT[section.key] || section.label,
      Actual: section.actual,
      "Año anterior": section.prior,
      ...(section.budget !== null ? { Presupuesto: section.budget } : {})
    }));
  }, [report]);

  const exportWorkbook = () => {
    if (!report) return;
    const walk = (nodes: PygNode[], depth: number, out: Array<Record<string, string | number | null>>) => {
      for (const node of nodes) {
        out.push({
          ruta: `${"  ".repeat(depth)}${node.name}${node.inactive ? " (inactiva)" : ""}`,
          seccion: node.section ? SECTION_SHORT[node.section] || node.section : "",
          actual: node.actual,
          anterior: node.prior,
          diferencia: node.difference,
          variacion_pct: node.variation_pct,
          presupuesto: node.budget,
          desvio: node.budget_variance,
          ejecucion_pct: node.budget_execution_pct
        });
        walk(node.children, depth + 1, out);
      }
    };
    const rows: Array<Record<string, string | number | null>> = [];
    walk(visibleNodes, 0, rows);
    const moneyFormat = "#,##0.00";
    const matrixSheet: XlsxReportSheet = {
      name: "Matriz",
      title: `PYG INTERACTIVO · ${report.period} · ${report.mode === "ytd" ? "ACUMULADO" : "MES"}`,
      subtitle: `Dimensiones ${report.dimensions.join(" · ")} · Rango ${report.range.start} a ${report.range.end} · Año anterior ${report.prior_range.start} a ${report.prior_range.end}`,
      columns: [
        { key: "ruta", label: "RUTA", width: 420 },
        { key: "seccion", label: "SECCIÓN", width: 130 },
        { key: "actual", label: "ACTUAL", width: 130, numberFormat: moneyFormat },
        { key: "anterior", label: "AÑO ANTERIOR", width: 130, numberFormat: moneyFormat },
        { key: "diferencia", label: "DIFERENCIA", width: 130, numberFormat: moneyFormat },
        { key: "variacion_pct", label: "VARIACIÓN %", width: 110, numberFormat: "0.00" },
        { key: "presupuesto", label: "PRESUPUESTO", width: 130, numberFormat: moneyFormat },
        { key: "desvio", label: "DESVÍO", width: 130, numberFormat: moneyFormat },
        { key: "ejecucion_pct", label: "EJECUCIÓN %", width: 110, numberFormat: "0.00" }
      ],
      rows
    };
    const summarySheet: XlsxReportSheet = {
      name: "Resumen",
      title: `RESUMEN PYG · ${report.period} · ${report.mode === "ytd" ? "ACUMULADO" : "MES"}`,
      subtitle: `Fuente LedgerEntry · Convención contribución neta firmada · ${report.metadata.accounts_included} cuentas incluidas`,
      columns: [
        { key: "concepto", label: "CONCEPTO", width: 300 },
        { key: "actual", label: "ACTUAL", width: 130, numberFormat: moneyFormat },
        { key: "anterior", label: "AÑO ANTERIOR", width: 130, numberFormat: moneyFormat },
        { key: "diferencia", label: "DIFERENCIA", width: 130, numberFormat: moneyFormat },
        { key: "variacion_pct", label: "VARIACIÓN %", width: 110, numberFormat: "0.00" },
        { key: "presupuesto", label: "PRESUPUESTO", width: 130, numberFormat: moneyFormat }
      ],
      rows: [
        ...report.sections.map((section) => ({
          concepto: section.label, actual: section.actual, anterior: section.prior, diferencia: section.difference,
          variacion_pct: section.variation_pct, presupuesto: section.budget
        })),
        {
          concepto: "UTILIDAD NETA", actual: report.net.actual, anterior: report.net.prior, diferencia: report.net.difference,
          variacion_pct: report.net.variation_pct, presupuesto: report.net.budget
        }
      ]
    };
    void downloadXlsxWorkbook(`pyg-interactivo-${report.period}`, [matrixSheet, summarySheet]);
  };

  return (
    <div className="space-y-4">
      <section className="apex-section-card overflow-hidden">
        <div className="border-b border-line bg-surface-muted p-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <label className="text-xs text-content-muted">Periodo<input className="mt-1 block h-9 rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => setPeriod(event.target.value)} type="month" value={period} /></label>
            <label className="text-xs text-content-muted">Rango
              <select className="mt-1 block h-9 rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => setMode(event.target.value as "month" | "ytd")} value={mode}>
                <option value="month">Mes</option>
                <option value="ytd">Acumulado año</option>
              </select>
            </label>
            <div className="text-xs text-content-muted">
              <span className="block">Agrupación (orden de columnas de la matriz)</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {dims.map((dim, index) => (
                  <select aria-label={`Posición ${index + 1} de agrupación`} className="h-9 rounded-md border border-line bg-surface px-2 text-content-strong" key={index} onChange={(event) => setDimAt(index, event.target.value as DimKey)} value={dim}>
                    {optionsFor(index).map((option) => <option key={option.value} value={option.value}>{index + 1}. {option.label}</option>)}
                  </select>
                ))}
                <span className="ml-1 flex gap-1">
                  {PRESETS.map((preset) => (
                    <button className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${preset.dims.join(",") === dims.join(",") ? "border-apex bg-apex/10 text-apex" : "border-line text-content-muted hover:text-content-strong"}`} key={preset.label} onClick={() => setDims(preset.dims)} type="button">{preset.label}</button>
                  ))}
                </span>
              </div>
            </div>
            <label className="text-xs text-content-muted">Sucursal
              <select className="mt-1 block h-9 max-w-[180px] rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => setBranch(event.target.value)} value={branch}>
                <option value="">Todas</option>
                {(org?.branches || []).map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-content-muted">Centro de costo
              <select className="mt-1 block h-9 max-w-[180px] rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => setCenter(event.target.value)} value={center}>
                <option value="">Todos</option>
                {(org?.cost_centers || []).filter((row) => !branch || row.branch_code === branch).map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
              </select>
            </label>
            <div className="ml-auto flex items-end gap-2">
              <button aria-label="Actualizar reporte" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-content-strong disabled:opacity-50" disabled={refreshing} onClick={() => void refresh()} type="button"><RefreshCw className={refreshing ? "animate-spin" : ""} size={15} /> Actualizar</button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!report} onClick={exportWorkbook} type="button"><Download size={15} /> Excel</button>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2">
          <button className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === "matriz" ? "bg-apex text-white" : "text-content-muted hover:bg-surface-muted hover:text-content-strong"}`} onClick={() => setTab("matriz")} type="button"><ListTree size={15} /> Matriz interactiva</button>
          <button className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === "presupuesto" ? "bg-apex text-white" : "text-content-muted hover:bg-surface-muted hover:text-content-strong"}`} onClick={() => setTab("presupuesto")} type="button"><Target size={15} /> Presupuesto PUC</button>
        </nav>
      </section>

      {tab === "presupuesto" ? <AccountingPygBudget defaultPeriod={report?.period || period} onSaved={() => void refresh()} /> : null}

      {tab === "matriz" ? (
        <>
          {error ? <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400"><TriangleAlert className="mt-0.5 shrink-0" size={18} />{error}</div> : null}
          {loading || !report ? (
            <div className="apex-section-card p-12 text-center text-content-muted">Construyendo la matriz contable desde el libro mayor…</div>
          ) : report.is_empty ? (
            <div className="apex-section-card p-12 text-center text-content-muted">
              <BarChart3 className="mx-auto mb-3 text-content-subtle" size={32} />
              <p className="font-semibold text-content-strong">Sin movimiento contable en el rango seleccionado.</p>
              <p className="text-sm">Registra comprobantes en las cuentas PUC 4-7 para poblar el estado de resultados. Los presupuestos del periodo también aparecerían aquí.</p>
            </div>
          ) : (
            <>
              {report.warnings.length ? (
                <div className="space-y-1.5">
                  {report.warnings.map((warning) => (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300" key={`${warning.code}-${warning.message}`}>
                      <TriangleAlert className="mt-0.5 shrink-0" size={16} />
                      <span>{warning.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {report.sections.map((section) => <Kpi key={section.key} label={SECTION_SHORT[section.key] || section.label} value={section.actual} prior={section.prior} />)}
                <article className="apex-section-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-content-muted">Utilidad neta</p>
                  <p className={`mt-1 text-xl font-bold ${report.net.actual >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRegionalMoney(report.net.actual)}</p>
                  <p className="mt-1 text-xs text-content-muted">Año anterior {formatRegionalMoney(report.net.prior)} · <span className={report.net.variation_pct == null ? "" : report.net.variation_pct >= 0 ? "text-emerald-400" : "text-red-400"}>{report.net.variation_pct == null ? "—" : `${report.net.variation_pct >= 0 ? "+" : ""}${percent.format(report.net.variation_pct)}%`}</span></p>
                </article>
              </section>

              <div className="space-y-4">
                <section className="apex-section-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted p-3">
                    <div>
                      <h2 className="font-semibold text-content-strong">Matriz {report.mode === "ytd" ? "acumulada" : "mensual"} · {report.period}</h2>
                      <p className="text-xs text-content-muted">
                        {report.range.start} a {report.range.end} · Año anterior {report.prior_range.start} a {report.prior_range.end} · Agrupación {report.dimensions.map((dim) => DIM_OPTIONS.find((option) => option.value === dim)?.label).join(" → ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-content-subtle" size={14} />
                        <input aria-label="Buscar en la matriz" className="h-9 w-56 rounded-md border border-line bg-surface pl-8 pr-2 text-xs text-content-strong" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cuenta, sucursal o centro…" type="text" value={search} />
                      </label>
                      <button className="h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-content-strong" onClick={toggleAll} type="button">{allExpanded ? "Contraer todo" : "Expandir todo"}</button>
                    </div>
                  </div>
                  {searchActive ? (
                    <p className="border-b border-line bg-surface-muted/50 px-3 py-1.5 text-[11px] text-content-muted"><Info className="mr-1 inline" size={12} />Los totales de los nodos padre incluyen todas las fuentes del rango, también las filas ocultas por la búsqueda.</p>
                  ) : null}
                  <div className="max-h-[62vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase text-content-muted">
                        <tr>
                          <th className="px-3 py-2 text-left">Cuenta / dimensión</th>
                          <th className="px-2 py-2 text-right">Actual</th>
                          <th className="px-2 py-2 text-right">Año anterior</th>
                          <th className="px-2 py-2 text-right">Diferencia</th>
                          <th className="px-2 py-2 text-right">Var. %</th>
                          <th className="px-2 py-2 text-right">Presupuesto</th>
                          <th className="px-2 py-2 text-right">Desvío</th>
                          <th className="px-2 py-2 text-right">Ejecución %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleNodes.map((node) => (
                          <NodeRows depth={0} expanded={expanded} key={node.key} node={node} onToggle={(key) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} searchActive={searchActive} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-muted/50 px-3 py-2 text-[11px] text-content-muted">
                    <span>Enlace contable: {report.linkage.ledger_entries} asientos · {report.linkage.coverage_pct == null ? "—" : `${percent.format(report.linkage.coverage_pct)}%`} con metadata</span>
                    <span>{report.linkage.orphan} sin comprobante ({formatRegionalMoney(report.linkage.orphan_amount)})</span>
                    <span>{report.linkage.ambiguous} con metadata múltiple ({formatRegionalMoney(report.linkage.ambiguous_amount)})</span>
                    {report.budget_coverage !== "none" ? <span>Presupuesto: {report.budget_periods_found.length}/{report.budget_periods.length} periodos del rango{report.budget_coverage === "partial" ? " (parcial)" : ""}</span> : null}
                    <span className="ml-auto">Actualizado {new Date(report.metadata.generated_at).toLocaleTimeString("es-CO")} · Fuente libro mayor</span>
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="apex-section-card p-4">
                    <h2 className="font-semibold text-content-strong">Resultado por sección</h2>
                    <p className="mb-3 text-xs text-content-muted">Actual vs. año anterior y presupuesto firmados por naturaleza contable.</p>
                    {chartData.length ? (
                      <div className="h-[300px]"><ResponsiveContainer><BarChartLayout data={chartData} hasBudget={chartData.some((row) => "Presupuesto" in row)} /></ResponsiveContainer></div>
                    ) : <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-content-muted">Sin datos para graficar.</p>}
                  </section>
                  <section className="apex-section-card p-4">
                    <h2 className="font-semibold text-content-strong">Convenciones</h2>
                    <ul className="mt-2 space-y-1.5 text-xs text-content-muted">
                      <li>· Los importes vienen del libro mayor (LedgerEntry); los comprobantes solo aportan sucursal y centro de costo.</li>
                      <li>· Los gastos y costos se muestran negativos entre paréntesis; los totales por sucursal o centro equivalen a la utilidad neta.</li>
                      <li>· Asientos sin comprobante vinculado se agrupan en «Sin sucursal» / «Sin centro de costo».</li>
                      <li>· «—» indica variación no calculable (año anterior en cero) o presupuesto sin planear.</li>
                      <li>· Cuentas inactivas con movimiento histórico se incluyen y se marcan como inactivas.</li>
                    </ul>
                  </section>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, prior }: { label: string; value: number; prior: number }) {
  const variation = prior === 0 ? null : ((value - prior) / Math.abs(prior)) * 100;
  const negative = value < 0;
  return (
    <article className="apex-section-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-content-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${negative ? "text-red-400" : "text-content-strong"}`}>{negative ? `(${formatRegionalMoney(Math.abs(value))})` : formatRegionalMoney(value)}</p>
      <p className="mt-1 text-xs text-content-muted">Año anterior {formatRegionalMoney(prior)} · <span className={variation == null ? "" : variation >= 0 ? "text-emerald-400" : "text-red-400"}>{variation == null ? "—" : `${variation >= 0 ? "+" : ""}${percent.format(variation)}%`}</span></p>
    </article>
  );
}

function BarChartLayout({ data, hasBudget }: { data: Array<Record<string, string | number>>; hasBudget: boolean }) {
  return (
    <BarChart data={data}>
      <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={{ background: "#0f1f2a", border: "1px solid #334155", borderRadius: 10, color: "#f8fafc" }} />
      <Legend />
      <Bar dataKey="Actual" fill="#14b8a6" radius={[4, 4, 0, 0]} />
      <Bar dataKey="Año anterior" fill="#64748b" radius={[4, 4, 0, 0]} />
      {hasBudget ? <Bar dataKey="Presupuesto" fill="#38bdf8" radius={[4, 4, 0, 0]} /> : null}
    </BarChart>
  );
}

function NodeRows({ node, depth, expanded, searchActive, onToggle }: {
  node: PygNode; depth: number; expanded: Set<string>; searchActive: boolean;
  onToggle: (key: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = searchActive || expanded.has(node.key);
  const band = SECTION_BAND[node.section || ""] || "";
  const sectionHeader = depth === 0 && !!node.section;
  const padding = { paddingLeft: `${8 + depth * 18}px` };
  const muted = !node.has_movement && node.budget === null;
  return (
    <>
      <tr className={`border-t border-line ${band}`}>
        <td className="whitespace-nowrap px-3 py-1.5" style={padding}>
          <span className="inline-flex items-center gap-1.5">
            {hasChildren ? (
              <button aria-label={open ? `Contraer ${node.name}` : `Expandir ${node.name}`} className="rounded p-0.5 text-content-muted hover:bg-surface-muted" onClick={() => onToggle(node.key)} type="button">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            ) : <span className="inline-block w-[18px]" />}
            <span className={`${muted ? "text-content-subtle" : "text-content-strong"} ${hasChildren ? "font-semibold" : ""}`}>{node.name}</span>
            {node.inactive ? <span className="rounded-full bg-content-subtle/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-content-muted">Inactiva</span> : null}
            {sectionHeader && node.section ? <span className="rounded-full bg-apex/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-apex">{SECTION_SHORT[node.section] || node.section}</span> : null}
            {node.budget_status === "partial" ? <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400" title="Algunas cuentas del nodo tienen presupuesto y otras no">PRESUPUESTO PARCIAL</span> : null}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right"><Money strong={hasChildren} value={node.actual} /></td>
        <td className="px-2 py-1.5 text-right text-content-muted"><Money value={node.prior} /></td>
        <td className="px-2 py-1.5 text-right"><Delta value={node.difference} /></td>
        <td className="px-2 py-1.5 text-right"><Pct value={node.variation_pct} /></td>
        <td className="px-2 py-1.5 text-right text-content-muted"><Money value={node.budget} /></td>
        <td className="px-2 py-1.5 text-right"><Delta value={node.budget_variance} /></td>
        <td className="px-2 py-1.5 text-right"><Pct value={node.budget_execution_pct} /></td>
      </tr>
      {hasChildren && open ? node.children.map((child) => <NodeRows depth={depth + 1} expanded={expanded} key={child.key} node={child} onToggle={onToggle} searchActive={searchActive} />) : null}
    </>
  );
}
