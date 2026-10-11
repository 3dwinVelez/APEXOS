"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Filter, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { GastosMenoresNav } from "@/components/gastos-menores-nav";
import { downloadXlsxWorkbook } from "@/lib/reportExports";

// DTOs de los 3 endpoints de reporteria (GET /api/v1/petty-cash/reports/*). Los totales, el
// echo de filtros, single_month y limit_pct los calcula el servidor: la UI solo los presenta.
type ReportTotals = {
  vouchers_count: number;
  lines_count: number;
  base_total: number;
  vat_total: number;
  total: number;
  advance_applied_total: number;
  cash_applied_total: number;
};

type ReportEcho = {
  year: number | null;
  month: number | null;
  date_from: string | null;
  date_to: string | null;
  box_id: number | null;
  box_code: string | null;
  concept_code: string | null;
  cost_center_code: string | null;
  branch_code: string | null;
  supplier_party_id: number | null;
  account_code: string | null;
  include_cancelled: boolean;
};

type ReportDateRange = { from: string | null; to: string | null };

type SummaryRow = {
  box_id?: number;
  box_code?: string | null;
  concept_code?: string | null;
  period?: string | null;
  cost_center_code?: string | null;
  supplier_party_id?: number | null;
  account_code?: string | null;
  account_name?: string | null;
  label: string;
} & ReportTotals;

type SummaryReport = {
  group_by: "box" | "concept" | "month" | "cost_center" | "supplier" | "account";
  filters: ReportEcho;
  date_range: ReportDateRange;
  rows: SummaryRow[];
  totals: ReportTotals;
  truncated: boolean;
};

type RankingRow = {
  box: { id: number; code: string | null; name: string | null; custodian_name: string | null; monthly_limit: number | null };
} & ReportTotals & {
  limit_month: string | null;
  limit_pct: number | null;
};

type RankingReport = {
  filters: ReportEcho;
  date_range: ReportDateRange;
  single_month: string | null;
  rows: RankingRow[];
  totals: ReportTotals;
  truncated: boolean;
};

type DetailRow = {
  voucher_id: number;
  full_number: string | null;
  date: string | null;
  period: string | null;
  status: string | null;
  voucher_description: string | null;
  advance_id: number | null;
  box_id: number | null;
  box_code: string | null;
  box_name: string | null;
  line_number: number;
  concept_code: string;
  concept_name: string | null;
  account_code: string;
  account_name: string | null;
  description: string;
  cost_center_code: string | null;
  branch_code: string | null;
  supplier_party_id: number | null;
  supplier_name: string | null;
  invoice_reference: string | null;
  base_amount: number;
  vat_code: string | null;
  vat_percent: number;
  vat_amount: number;
  total: number;
  advance_applied: number;
  cash_applied: number;
};

type DetailReport = {
  filters: ReportEcho;
  date_range: ReportDateRange;
  rows: DetailRow[];
  totals: ReportTotals;
  pagination: { limit: number; offset: number; returned: number; total: number };
  truncated: boolean;
};

// Maestros de los filtros. Se incluyen inactivos porque los comprobantes historicos pueden
// referenciarlos y el reporte debe poder filtrarlos igual.
type Box = { id: number; code: string; name: string; active: boolean };
type Concept = { id: number; code: string; name: string; active: boolean };
type Party = { id: number; code: string; name: string };
type Account = { id: number; code: string; name: string; active: boolean };
type OrgBranch = { code: string; name: string; active: boolean };
type OrgCostCenter = { code: string; name: string; active: boolean };
type OrgTree = { societies: { code: string; name: string }[]; branches: OrgBranch[]; cost_centers: OrgCostCenter[] };

type GroupBy = SummaryReport["group_by"];

type FilterState = {
  year: string;
  month: string;
  date_from: string;
  date_to: string;
  box_id: string;
  concept_code: string;
  cost_center_code: string;
  branch_code: string;
  supplier_party_id: string;
  account_code: string;
  include_cancelled: "true" | "false";
  group_by: GroupBy;
};

const GROUP_LABELS: Record<GroupBy, string> = {
  box: "Caja",
  concept: "Concepto",
  month: "Mes",
  cost_center: "Centro de costo",
  supplier: "Proveedor",
  account: "Cuenta"
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

function defaultFilters(): FilterState {
  return {
    year: String(new Date().getFullYear()),
    month: "",
    date_from: "",
    date_to: "",
    box_id: "",
    concept_code: "",
    cost_center_code: "",
    branch_code: "",
    supplier_party_id: "",
    account_code: "",
    include_cancelled: "false",
    group_by: "box"
  };
}

// Parametros compartidos por los 3 endpoints. group_by NO viaja aqui: solo summary lo consume
// (reportGroupBy); detail y boxes-ranking lo ignoran.
function baseParams(target: FilterState) {
  const params = new URLSearchParams();
  if (target.year) params.set("year", target.year);
  if (target.month) params.set("month", target.month);
  if (target.date_from) params.set("date_from", target.date_from);
  if (target.date_to) params.set("date_to", target.date_to);
  if (target.box_id) params.set("box_id", target.box_id);
  if (target.concept_code) params.set("concept_code", target.concept_code);
  if (target.cost_center_code) params.set("cost_center_code", target.cost_center_code);
  if (target.branch_code) params.set("branch_code", target.branch_code);
  if (target.supplier_party_id) params.set("supplier_party_id", target.supplier_party_id);
  if (target.account_code) params.set("account_code", target.account_code);
  params.set("include_cancelled", target.include_cancelled);
  return params;
}

function summaryParams(target: FilterState) {
  const params = baseParams(target);
  params.set("group_by", target.group_by);
  return params;
}

function rangeLabels(target: FilterState) {
  const monthLabel = target.month ? String(target.month).padStart(2, "0") : null;
  const from = target.date_from || (target.year ? `${target.year}-${monthLabel || "01"}` : "");
  const to = target.date_to || (target.year ? `${target.year}-${monthLabel || "12"}` : "");
  return { from: from || "inicio", to: to || "hoy" };
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export default function ReportesGastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canExport: false });
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTree>({ societies: [], branches: [], cost_centers: [] });
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [applied, setApplied] = useState<FilterState>(defaultFilters);
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [ranking, setRanking] = useState<RankingReport | null>(null);
  const [detail, setDetail] = useState<DetailReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("accounting", "read"),
      // Sigue el precedente de Talento Humano: exportar es una capacidad propia del rol.
      canExport: hasStoredRolePermission("accounting", "export")
    });
  }, []);

  const loadMasters = useCallback(async () => {
    try {
      const [boxRows, conceptRows, supplierRows, accountRows, tree] = await Promise.all([
        api<Box[]>("/api/v1/petty-cash/boxes?include_inactive=true"),
        api<Concept[]>("/api/v1/petty-cash/concepts?include_inactive=true"),
        api<Party[]>("/api/v1/accounting/third-parties?type=supplier&active=true&limit=500"),
        api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000"),
        api<OrgTree>("/api/v1/accounting/organization-tree")
      ]);
      setBoxes(boxRows);
      setConcepts(conceptRows);
      setSuppliers(supplierRows);
      setAccounts(accountRows);
      setOrgTree(tree);
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los maestros de los filtros."));
    }
  }, []);

  const loadReports = useCallback(async (target: FilterState) => {
    setLoading(true);
    try {
      const base = baseParams(target);
      const grouped = summaryParams(target);
      const [summaryData, rankingData, detailData] = await Promise.all([
        api<SummaryReport>(`/api/v1/petty-cash/reports/summary?${grouped.toString()}`),
        api<RankingReport>(`/api/v1/petty-cash/reports/boxes-ranking?${base.toString()}`),
        api<DetailReport>(`/api/v1/petty-cash/reports/detail?${base.toString()}`)
      ]);
      setSummary(summaryData);
      setRanking(rankingData);
      setDetail(detailData);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible generar los reportes de gastos menores."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) {
      void loadMasters();
      void loadReports(applied);
    }
  }, [access.ready, access.canRead, loadMasters, loadReports, applied]);

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function consultar() {
    setMessage("");
    const target = { ...filters };
    setApplied(target);
  }

  function limpiar() {
    const target = defaultFilters();
    setFilters(target);
    setApplied(target);
    setMessage("");
  }

  // Porcentaje del total: calculo presentacional sobre los totales que devuelve el servidor.
  const shareOfTotal = useMemo(() => (rowTotal: number) => {
    const grand = summary?.totals.total || 0;
    if (!grand) return 0;
    return Number(((rowTotal / grand) * 100).toFixed(2));
  }, [summary]);

  const anyTruncated = Boolean(summary?.truncated || ranking?.truncated || detail?.truncated);
  const totals = summary?.totals || ranking?.totals || detail?.totals || null;

  async function exportRows() {
    if (!access.canExport) {
      setMessage("Tu rol no tiene permiso para exportar reportes de Gastos Menores.");
      return;
    }
    if (!summary || !ranking || !detail) return;
    setExporting(true);
    setMessage("");
    try {
      const range = rangeLabels(applied);
      const groups = summary.rows.map((row) => ({
        dimension: row.label,
        comprobantes: row.vouchers_count,
        lineas: row.lines_count,
        base: row.base_total,
        iva: row.vat_total,
        total: row.total,
        anticipo: row.advance_applied_total,
        efectivo: row.cash_applied_total,
        pct_del_total: shareOfTotal(row.total)
      }));
      const rankingRows = ranking.rows.map((row) => ({
        caja: row.box.code && row.box.name ? `${row.box.code} - ${row.box.name}` : `Caja #${row.box.id}`,
        custodio: row.box.custodian_name || "Sin custodio",
        comprobantes: row.vouchers_count,
        lineas: row.lines_count,
        base: row.base_total,
        iva: row.vat_total,
        total: row.total,
        anticipo: row.advance_applied_total,
        efectivo: row.cash_applied_total,
        tope_mensual: row.box.monthly_limit ?? 0,
        mes_del_tope: row.limit_month || "",
        pct_del_tope: row.limit_pct ?? 0
      }));
      const detailRows = detail.rows.map((row) => ({
        fecha: row.date ? new Date(`${row.date.slice(0, 10)}T12:00:00-05:00`) : "",
        documento: row.full_number || "",
        caja: row.box_code ? `${row.box_code} - ${row.box_name || ""}` : `Caja #${row.box_id}`,
        concepto: row.concept_name || row.concept_code,
        descripcion: row.description,
        cuenta: row.account_name ? `${row.account_code} - ${row.account_name}` : row.account_code,
        centro_costo: row.cost_center_code || "",
        sede: row.branch_code || "",
        proveedor: row.supplier_name || "",
        factura: row.invoice_reference || "",
        base: row.base_amount,
        iva: row.vat_amount,
        total: row.total,
        anticipo: row.advance_applied,
        efectivo: row.cash_applied,
        estado: row.status === "cancelled" ? "Anulado" : "Contabilizado"
      }));
      await downloadXlsxWorkbook(`apexos-reporte-gastos-menores-${range.from}-${range.to}.xlsx`, [
        {
          name: "Resumen",
          title: "Reporte de Gastos Menores",
          subtitle: `Periodo ${range.from} a ${range.to} | Agrupado por ${GROUP_LABELS[summary.group_by]} | Anulados ${summary.filters.include_cancelled ? "incluidos" : "excluidos"}`,
          columns: [{ key: "indicador", label: "Indicador", width: 220 }, { key: "valor", label: "Valor", width: 160 }],
          rows: [
            { indicador: "Comprobantes", valor: summary.totals.vouchers_count },
            { indicador: "Lineas de gasto", valor: summary.totals.lines_count },
            { indicador: "Base gravable", valor: summary.totals.base_total },
            { indicador: "IVA", valor: summary.totals.vat_total },
            { indicador: "Total gastado", valor: summary.totals.total },
            { indicador: "Anticipo aplicado", valor: summary.totals.advance_applied_total },
            { indicador: "Efectivo de caja aplicado", valor: summary.totals.cash_applied_total },
            { indicador: "Cajas con gasto", valor: ranking.rows.length },
            { indicador: "Filas de detalle", valor: detail.pagination.total },
            { indicador: "Reporte truncado al tope de filas", valor: anyTruncated ? "Si: ajusta los filtros" : "No" }
          ]
        },
        {
          name: "Por caja",
          title: "Ranking de cajas menores",
          subtitle: "Quien esta gastando mas plata: totales por caja con tope mensual cuando el filtro cae en un mes unico",
          columns: [
            { key: "caja", label: "Caja", width: 200 }, { key: "custodio", label: "Custodio", width: 160 },
            { key: "comprobantes", label: "Comprobantes", width: 110 }, { key: "lineas", label: "Lineas", width: 80 },
            { key: "base", label: "Base", width: 120, numberFormat: "#,##0.00" }, { key: "iva", label: "IVA", width: 110, numberFormat: "#,##0.00" },
            { key: "total", label: "Total", width: 120, numberFormat: "#,##0.00" },
            { key: "anticipo", label: "Anticipo", width: 110, numberFormat: "#,##0.00" }, { key: "efectivo", label: "Efectivo", width: 110, numberFormat: "#,##0.00" },
            { key: "tope_mensual", label: "Tope mensual", width: 120, numberFormat: "#,##0.00" },
            { key: "mes_del_tope", label: "Mes del tope", width: 100 },
            { key: "pct_del_tope", label: "% del tope", width: 100, numberFormat: "0.00" }
          ],
          rows: rankingRows
        },
        {
          name: `Por ${GROUP_LABELS[summary.group_by]}`,
          title: `Gasto por ${GROUP_LABELS[summary.group_by]}`,
          subtitle: `Agrupacion ${summary.group_by} del periodo ${range.from} a ${range.to}`,
          columns: [
            { key: "dimension", label: GROUP_LABELS[summary.group_by], width: 220 },
            { key: "comprobantes", label: "Comprobantes", width: 110 }, { key: "lineas", label: "Lineas", width: 80 },
            { key: "base", label: "Base", width: 120, numberFormat: "#,##0.00" }, { key: "iva", label: "IVA", width: 110, numberFormat: "#,##0.00" },
            { key: "total", label: "Total", width: 120, numberFormat: "#,##0.00" },
            { key: "anticipo", label: "Anticipo", width: 110, numberFormat: "#,##0.00" }, { key: "efectivo", label: "Efectivo", width: 110, numberFormat: "#,##0.00" },
            { key: "pct_del_total", label: "% del total", width: 100, numberFormat: "0.00" }
          ],
          rows: groups
        },
        {
          name: "Detalle",
          title: "Detalle de lineas de gasto",
          subtitle: `Periodo ${range.from} a ${range.to} | ${detail.pagination.total} linea(s) con los filtros aplicados`,
          columns: [
            { key: "fecha", label: "Fecha", width: 95, numberFormat: "yyyy-mm-dd" }, { key: "documento", label: "Documento", width: 120 },
            { key: "caja", label: "Caja", width: 180 }, { key: "concepto", label: "Concepto", width: 160 },
            { key: "descripcion", label: "Descripcion", width: 240 }, { key: "cuenta", label: "Cuenta contable", width: 200 },
            { key: "centro_costo", label: "Centro costo", width: 110 }, { key: "sede", label: "Sede", width: 100 },
            { key: "proveedor", label: "Proveedor", width: 160 }, { key: "factura", label: "Factura", width: 110 },
            { key: "base", label: "Base", width: 120, numberFormat: "#,##0.00" }, { key: "iva", label: "IVA", width: 110, numberFormat: "#,##0.00" },
            { key: "total", label: "Total", width: 120, numberFormat: "#,##0.00" },
            { key: "anticipo", label: "Anticipo", width: 110, numberFormat: "#,##0.00" }, { key: "efectivo", label: "Efectivo", width: 110, numberFormat: "#,##0.00" },
            { key: "estado", label: "Estado", width: 110 }
          ],
          rows: detailRows
        }
      ]);
    } catch (caught) {
      setMessage(describeError(caught, "No fue posible generar el archivo Excel."));
    } finally {
      setExporting(false);
    }
  }

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Reportes no disponibles para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          Los reportes comparten los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultarlos.
        </p>
      </section>
    );
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">Gastos Menores</p>
            <h1 className="text-3xl font-semibold">Reportes de gasto</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Qué caja gasta más y en qué concepto: resumen por dimensión, ranking de cajas y detalle línea por línea.
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={loading || exporting || !access.canExport}
            onClick={() => void exportRows()}
            title={access.canExport ? "Descargar el subconjunto filtrado en Excel" : "Tu rol no tiene permiso accounting:export"}
            type="button"
          >
            <Download size={16} /> {exporting ? "Generando Excel..." : "Descargar Excel"}
          </button>
        </div>
      </header>
      <GastosMenoresNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Filter size={15} /> Filtros del reporte
          </span>
          <span className="text-xs text-neutral-500">Año/mes y rango de fechas se intersecan: aplica el más restrictivo.</span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-5">
          <Field label="Año">
            <input
              className="control"
              max="2100"
              min="2000"
              onChange={(event) => setFilter("year", event.target.value)}
              placeholder="Todos"
              type="number"
              value={filters.year}
            />
          </Field>
          <Field label="Mes">
            <select
              className="control"
              disabled={!filters.year}
              onChange={(event) => setFilter("month", event.target.value)}
              value={filters.month}
            >
              <option value="">Todo el año</option>
              {MONTHS.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Desde">
            <input className="control" onChange={(event) => setFilter("date_from", event.target.value)} type="date" value={filters.date_from} />
          </Field>
          <Field label="Hasta">
            <input className="control" onChange={(event) => setFilter("date_to", event.target.value)} type="date" value={filters.date_to} />
          </Field>
          <Field label="Caja">
            <select className="control" onChange={(event) => setFilter("box_id", event.target.value)} value={filters.box_id}>
              <option value="">Todas</option>
              {boxes.map((row) => (
                <option key={row.id} value={row.id}>{row.code} - {row.name}{row.active === false ? " (inactiva)" : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Concepto">
            <select className="control" onChange={(event) => setFilter("concept_code", event.target.value)} value={filters.concept_code}>
              <option value="">Todos</option>
              {concepts.map((row) => (
                <option key={row.id} value={row.code}>{row.name}{row.active === false ? " (inactivo)" : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Centro de costo">
            <select className="control" onChange={(event) => setFilter("cost_center_code", event.target.value)} value={filters.cost_center_code}>
              <option value="">Todos</option>
              {orgTree.cost_centers.map((row) => (
                <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Sede">
            <select className="control" onChange={(event) => setFilter("branch_code", event.target.value)} value={filters.branch_code}>
              <option value="">Todas</option>
              {orgTree.branches.map((row) => (
                <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Proveedor">
            <select className="control" onChange={(event) => setFilter("supplier_party_id", event.target.value)} value={filters.supplier_party_id}>
              <option value="">Todos</option>
              {suppliers.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Cuenta contable">
            <select className="control" onChange={(event) => setFilter("account_code", event.target.value)} value={filters.account_code}>
              <option value="">Todas</option>
              {accounts.map((row) => (
                <option key={row.id} value={row.code}>{row.code} - {row.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Comprobantes anulados">
            <select
              className="control"
              onChange={(event) => setFilter("include_cancelled", event.target.value === "true" ? "true" : "false")}
              value={filters.include_cancelled}
            >
              <option value="false">Excluidos</option>
              <option value="true">Incluidos</option>
            </select>
          </Field>
          <Field label="Agrupar resumen por">
            <select className="control" onChange={(event) => setFilter("group_by", event.target.value as GroupBy)} value={filters.group_by}>
              {(Object.keys(GROUP_LABELS) as GroupBy[]).map((key) => (
                <option key={key} value={key}>{GROUP_LABELS[key]}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="btn-primary" disabled={loading} onClick={consultar} type="button">
              <BarChart3 size={16} /> {loading ? "Consultando..." : "Consultar"}
            </button>
            <button className="btn-secondary" onClick={limpiar} type="button">
              <RotateCcw size={16} /> Limpiar
            </button>
          </div>
        </div>
      </section>

      {anyTruncated ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          El reporte alcanzó el tope de 20000 filas y fue truncado. Estrecha el filtro (año y mes) para ver el volumen completo.
        </p>
      ) : null}

      {loading ? (
        <div className="apex-section-card p-6 text-sm text-neutral-600">Generando reportes de gastos menores...</div>
      ) : (
        <>
          {totals ? (
            <section aria-label="Totales del periodo filtrado" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Comprobantes</p>
                <p className="mt-1 text-2xl font-semibold">{totals.vouchers_count}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Líneas de gasto</p>
                <p className="mt-1 text-2xl font-semibold">{totals.lines_count}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Base gravable</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.base_total)}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">IVA</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.vat_total)}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total gastado</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.total)}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Anticipo aplicado</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.advance_applied_total)}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Efectivo de caja</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.cash_applied_total)}</p>
              </div>
              <div className="apex-section-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cajas con gasto</p>
                <p className="mt-1 text-2xl font-semibold">{ranking ? ranking.rows.length : 0}</p>
              </div>
            </section>
          ) : null}

          {ranking ? (
            <section className="rounded-md border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
                <h2 className="text-sm font-semibold">Ranking de cajas: quién gasta más</h2>
                <p className="text-xs text-neutral-500">
                  {ranking.single_month
                    ? `Porcentaje contra el tope mensual de ${ranking.single_month}.`
                    : "El % del tope solo se calcula cuando el filtro cae en un mes único (año y mes, sin rango de fechas)."}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-sm">
                  <thead>
                    <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                      <th className="p-3">Caja</th>
                      <th>Custodio</th>
                      <th className="text-center">Comprobantes</th>
                      <th className="text-center">Líneas</th>
                      <th className="text-right">Base</th>
                      <th className="text-right">IVA</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Anticipo</th>
                      <th className="text-right">Efectivo</th>
                      <th className="text-right">Tope mensual</th>
                      <th className="p-3 text-right">% del tope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.rows.map((row) => (
                      <tr className="border-b" key={row.box.id}>
                        <td className="p-3 font-medium">{row.box.code ? `${row.box.code} · ${row.box.name || ""}` : `Caja #${row.box.id}`}</td>
                        <td className="p-3">{row.box.custodian_name || "Sin custodio"}</td>
                        <td className="p-3 text-center">{row.vouchers_count}</td>
                        <td className="p-3 text-center">{row.lines_count}</td>
                        <td className="p-3 text-right">{money(row.base_total)}</td>
                        <td className="p-3 text-right">{money(row.vat_total)}</td>
                        <td className="p-3 text-right font-medium">{money(row.total)}</td>
                        <td className="p-3 text-right">{money(row.advance_applied_total)}</td>
                        <td className="p-3 text-right">{money(row.cash_applied_total)}</td>
                        <td className="p-3 text-right">{row.box.monthly_limit !== null && row.box.monthly_limit !== undefined ? money(row.box.monthly_limit) : "Sin tope"}</td>
                        <td className="p-3 text-right">
                          {row.limit_pct !== null && row.limit_pct !== undefined ? `${row.limit_pct}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    {!ranking.rows.length ? (
                      <tr>
                        <td className="p-8 text-center text-neutral-500" colSpan={11}>Sin gastos para los filtros seleccionados.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {summary ? (
            <section className="rounded-md border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
                <h2 className="text-sm font-semibold">Gasto por {GROUP_LABELS[summary.group_by]}</h2>
                <p className="text-xs text-neutral-500">
                  {summary.truncated ? "Agrupación truncada al tope de filas: estrecha el filtro." : `Ordenado por total gasto (descendente); ${summary.rows.length} dimensión(es).`}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                      <th className="p-3">{GROUP_LABELS[summary.group_by]}</th>
                      <th className="text-center">Comprobantes</th>
                      <th className="text-center">Líneas</th>
                      <th className="text-right">Base</th>
                      <th className="text-right">IVA</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Anticipo</th>
                      <th className="text-right">Efectivo</th>
                      <th className="p-3 text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => (
                      <tr className="border-b" key={row.label}>
                        <td className="p-3 font-medium">{row.label}</td>
                        <td className="p-3 text-center">{row.vouchers_count}</td>
                        <td className="p-3 text-center">{row.lines_count}</td>
                        <td className="p-3 text-right">{money(row.base_total)}</td>
                        <td className="p-3 text-right">{money(row.vat_total)}</td>
                        <td className="p-3 text-right font-medium">{money(row.total)}</td>
                        <td className="p-3 text-right">{money(row.advance_applied_total)}</td>
                        <td className="p-3 text-right">{money(row.cash_applied_total)}</td>
                        <td className="p-3 text-right">{summary.totals.total ? `${shareOfTotal(row.total)}%` : "—"}</td>
                      </tr>
                    ))}
                    {!summary.rows.length ? (
                      <tr>
                        <td className="p-8 text-center text-neutral-500" colSpan={9}>Sin gastos para los filtros seleccionados.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {detail ? (
            <section className="rounded-md border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
                <h2 className="text-sm font-semibold">Detalle de líneas de gasto</h2>
                <p className="text-xs text-neutral-500">
                  {detail.pagination.total} línea(s) con los filtros aplicados
                  {detail.filters.include_cancelled ? " (anulados incluidos)" : " (anulados excluidos)"}.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead>
                    <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                      <th className="p-3">Documento</th>
                      <th>Fecha</th>
                      <th>Caja</th>
                      <th>Concepto</th>
                      <th>Descripción</th>
                      <th>Cuenta</th>
                      <th>Proveedor</th>
                      <th>Factura</th>
                      <th className="text-right">Base</th>
                      <th className="text-right">IVA</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Anticipo</th>
                      <th className="text-right">Efectivo</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((row) => (
                      <tr className="border-b" key={`${row.voucher_id}-${row.line_number}`}>
                        <td className="p-3 font-mono">{row.full_number}</td>
                        <td className="p-3">{row.date?.slice(0, 10)}</td>
                        <td className="p-3">{row.box_code ? `${row.box_code} · ${row.box_name || ""}` : `Caja #${row.box_id}`}</td>
                        <td className="p-3">{row.concept_name || row.concept_code}</td>
                        <td className="p-3">{row.description}</td>
                        <td className="p-3">{row.account_name ? `${row.account_code} · ${row.account_name}` : row.account_code}</td>
                        <td className="p-3">{row.supplier_name || "—"}</td>
                        <td className="p-3">{row.invoice_reference || "—"}</td>
                        <td className="p-3 text-right">{money(row.base_amount)}</td>
                        <td className="p-3 text-right">{row.vat_code ? money(row.vat_amount) : "Sin IVA"}</td>
                        <td className="p-3 text-right font-medium">{money(row.total)}</td>
                        <td className="p-3 text-right">{money(row.advance_applied)}</td>
                        <td className="p-3 text-right">{money(row.cash_applied)}</td>
                        <td className="p-3">{row.status === "cancelled" ? "Anulado" : "Contabilizado"}</td>
                      </tr>
                    ))}
                    {!detail.rows.length ? (
                      <tr>
                        <td className="p-8 text-center text-neutral-500" colSpan={14}>Sin líneas de gasto para los filtros seleccionados.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
