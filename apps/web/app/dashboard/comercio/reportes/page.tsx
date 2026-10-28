"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { CashMethodChart, SalesTrendChart, TopProductsChart } from "../ComercioCharts";
import {
  ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError,
  matchesQuery, money, todayISO, useComercioAccess,
} from "@/components/comercio/shared";

// Reportes del Comercio (GET /api/v1/comercio/reports/summary). Todos los agregados los
// calcula el servidor; aqui solo se ordenan, se grafican y se exportan.
type Summary = {
  range: { from: string | null; to: string | null };
  totals: {
    sales: number; cost_of_goods: number; gross_margin: number; expenses: number; purchases: number;
    estimated_result: number; receivable: number; overdue_receivable: number; inventory_value: number; cash_collected: number;
  };
  low_stock: { id: number; code: string; name: string; stock: number; min_stock: number; unit: string }[];
  top_products: { product_name: string; quantity: number; revenue: number; margin: number }[];
  top_customers: { customer_id: number; customer_name: string | null; total: number; sales: number }[];
  daily_sales: { date: string; total: number }[];
  cash_by_method: { method: string; total: number }[];
};

type Movement = {
  id: number;
  product_name: string;
  change: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  reference: string | null;
  occurred_at: string;
};

const REASON_LABELS: Record<string, string> = {
  initial: "Inicial",
  purchase: "Compra",
  sale: "Venta",
  sale_void: "Anulacion",
  adjustment: "Ajuste"
};

function firstOfMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function shiftDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function lastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
}

// Presets de rango: el comerciante no piensa en fechas, piensa en "hoy", "la semana" o "el mes".
const PRESETS = [
  { id: "hoy", label: "Hoy", build: () => ({ from: todayISO(), to: todayISO() }) },
  { id: "7d", label: "7 dias", build: () => ({ from: shiftDays(6), to: todayISO() }) },
  { id: "30d", label: "30 dias", build: () => ({ from: shiftDays(29), to: todayISO() }) },
  { id: "mes", label: "Este mes", build: () => ({ from: firstOfMonth(), to: todayISO() }) },
  { id: "anterior", label: "Mes anterior", build: lastMonthRange },
] as const;

const percent = (value: number, base: number) => (base > 0 ? `${((value / base) * 100).toFixed(1)}%` : "--");

export default function ComercioReportesPage() {
  const access = useComercioAccess();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const [summaryResult, movementResult] = await Promise.all([
        api<Summary>(`/api/v1/comercio/reports/summary?${params.toString()}`, { cache: "no-store" }),
        api<{ items: Movement[] }>(`/api/v1/comercio/movements?limit=200${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, { cache: "no-store" })
      ]);
      setSummary(summaryResult);
      setMovements(movementResult.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los reportes."));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const activePreset = useMemo(() => PRESETS.find((preset) => {
    const range = preset.build();
    return range.from === from && range.to === to;
  })?.id || "", [from, to]);

  const dailyMax = useMemo(() => {
    const rows = summary?.daily_sales || [];
    if (!rows.length) return null;
    return rows.reduce((best, row) => (row.total > best.total ? row : best), rows[0]);
  }, [summary]);

  const cashTotal = useMemo(() => (summary?.cash_by_method || []).reduce((sum, row) => sum + row.total, 0), [summary]);

  const reasons = useMemo(() => [...new Set(movements.map((row) => row.reason))], [movements]);
  const filteredMovements = useMemo(() => movements.filter((row) => {
    if (reason !== "all" && row.reason !== reason) return false;
    return matchesQuery(query, row.product_name, REASON_LABELS[row.reason] || row.reason, row.reference || "");
  }), [movements, reason, query]);

  const hasMovementFilters = Boolean(query || reason !== "all");

  function applyPreset(id: string) {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    const range = preset.build();
    setFrom(range.from);
    setTo(range.to);
  }

  function exportWorkbook() {
    if (!summary) return;
    downloadExcelWorkbook(`comercio-reportes-${from}-a-${to}.xlsx`, [
      {
        name: "Resumen",
        columns: [
          { key: "concepto", label: "Concepto", width: 220 },
          { key: "valor", label: "Valor", width: 150 }
        ],
        rows: [
          { concepto: `Rango ${from} a ${to}`, valor: "" },
          { concepto: "Ventas", valor: summary.totals.sales },
          { concepto: "Costo de lo vendido", valor: summary.totals.cost_of_goods },
          { concepto: "Margen bruto", valor: summary.totals.gross_margin },
          { concepto: "Gastos", valor: summary.totals.expenses },
          { concepto: "Compras", valor: summary.totals.purchases },
          { concepto: "Resultado estimado", valor: summary.totals.estimated_result },
          { concepto: "Efecto en caja", valor: summary.totals.cash_collected },
          { concepto: "Cartera por cobrar", valor: summary.totals.receivable },
          { concepto: "Cartera vencida", valor: summary.totals.overdue_receivable },
          { concepto: "Valor de inventario", valor: summary.totals.inventory_value }
        ]
      },
      {
        name: "Ventas por dia",
        columns: [
          { key: "date", label: "Fecha", width: 130 },
          { key: "total", label: "Ventas", width: 140 }
        ],
        rows: summary.daily_sales.map((row) => ({ date: row.date, total: row.total }))
      },
      {
        name: "Recaudo por medio",
        columns: [
          { key: "method", label: "Medio de pago", width: 160 },
          { key: "total", label: "Recaudo", width: 140 },
          { key: "share", label: "Participacion", width: 120 }
        ],
        rows: summary.cash_by_method.map((row) => ({ method: row.method, total: row.total, share: percent(row.total, cashTotal) }))
      },
      {
        name: "Top productos",
        columns: [
          { key: "product_name", label: "Producto", width: 240 },
          { key: "quantity", label: "Unidades", width: 110 },
          { key: "revenue", label: "Ingreso", width: 140 },
          { key: "margin", label: "Margen", width: 140 }
        ],
        rows: summary.top_products.map((row) => ({ ...row }))
      },
      {
        name: "Mejores clientes",
        columns: [
          { key: "customer_name", label: "Cliente", width: 240 },
          { key: "sales", label: "Ventas", width: 110 },
          { key: "total", label: "Total", width: 140 }
        ],
        rows: summary.top_customers.map((row) => ({ customer_name: row.customer_name || "Sin cliente", sales: row.sales, total: row.total }))
      },
      {
        name: "Movimientos",
        columns: [
          { key: "occurred_at", label: "Fecha", width: 160 },
          { key: "product_name", label: "Producto", width: 220 },
          { key: "change", label: "Cambio", width: 90 },
          { key: "stock_before", label: "Antes", width: 90 },
          { key: "stock_after", label: "Despues", width: 90 },
          { key: "reason", label: "Motivo", width: 120 },
          { key: "reference", label: "Referencia", width: 160 }
        ],
        rows: filteredMovements.map((row) => ({
          occurred_at: row.occurred_at,
          product_name: row.product_name,
          change: row.change,
          stock_before: row.stock_before,
          stock_after: row.stock_after,
          reason: REASON_LABELS[row.reason] || row.reason,
          reference: row.reference || ""
        }))
      }
    ]);
  }

  const movementColumns: DataColumn<Movement>[] = useMemo(() => [
    { id: "date", header: "Fecha", cell: (row) => <span className="whitespace-nowrap text-xs">{row.occurred_at}</span>, sortValue: (row) => row.occurred_at },
    { id: "product", header: "Producto", cell: (row) => row.product_name, sortValue: (row) => row.product_name },
    { id: "change", header: "Cambio", className: "text-right", cell: (row) => <span className={`font-semibold ${row.change >= 0 ? "text-success" : "text-error"}`}>{row.change > 0 ? "+" : ""}{row.change}</span>, sortValue: (row) => row.change },
    { id: "before", header: "Antes", className: "text-right", cell: (row) => row.stock_before, sortValue: (row) => row.stock_before },
    { id: "after", header: "Despues", className: "text-right", cell: (row) => row.stock_after, sortValue: (row) => row.stock_after },
    { id: "reason", header: "Motivo", cell: (row) => <StatusPill tone={row.reason === "sale" || row.reason === "sale_void" ? "warn" : "muted"}>{REASON_LABELS[row.reason] || row.reason}</StatusPill>, sortValue: (row) => REASON_LABELS[row.reason] || row.reason },
    { id: "reference", header: "Referencia", cell: (row) => <span className="font-mono text-xs">{row.reference || "--"}</span> }
  ], []);

  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Resultados" subtitle="Resultado del periodo: ventas, margen, gastos, caja, cartera e inventario. Elija el rango y exporte el detalle a Excel." title="Reportes" />
      <ComercioMessages error={error} />

      <section aria-label="Rango del reporte" className="apex-section-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-content-muted">Rapido</span>
          {PRESETS.map((preset) => (
            <button aria-pressed={activePreset === preset.id} key={preset.id}
              className={`inline-flex min-h-10 items-center rounded-control border px-3 text-xs font-semibold transition-colors ${activePreset === preset.id ? "border-apex/40 bg-apex/10 text-apex" : "border-line text-content-body hover:bg-surface-muted"}`}
              onClick={() => applyPreset(preset.id)} type="button">{preset.label}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(180px,220px)_auto_auto] sm:items-end">
          <Field label="Desde">
            <input className="control" max={to} onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </Field>
          <Field label="Hasta">
            <input className="control" max={todayISO()} min={from} onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </Field>
          <button className="apex-secondary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={loading || !summary} onClick={exportWorkbook} type="button"><Download size={14} /> Excel</button>
          <button className="apex-secondary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> Calcular</button>
        </div>
        <p aria-live="polite" className="text-xs text-content-muted">
          {loading ? "Calculando el periodo..." : `Del ${from} al ${to}. Los importes incluyen solo operaciones activas del rango.`}
        </p>
      </section>

      {loading || !summary ? (
        <div className="apex-section-card p-6 text-sm text-content-body">Calculando el periodo...</div>
      ) : (
        <>
          <section aria-label="Indicadores del periodo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Ventas</p>
              <p className="mt-1 text-xl font-semibold text-content-strong">{money(summary.totals.sales)}</p>
              <p className="mt-1 text-xs text-content-muted">Costo: {money(summary.totals.cost_of_goods)}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Margen bruto</p>
              <p className="mt-1 text-xl font-semibold text-content-strong">{money(summary.totals.gross_margin)}</p>
              <p className="mt-1 text-xs text-content-muted">{percent(summary.totals.gross_margin, summary.totals.sales)} de las ventas</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Resultado estimado</p>
              <p className={`mt-1 text-xl font-semibold ${summary.totals.estimated_result < 0 ? "text-error" : "text-success"}`}>{money(summary.totals.estimated_result)}</p>
              <p className="mt-1 text-xs text-content-muted">Gastos {money(summary.totals.expenses)} · Compras {money(summary.totals.purchases)}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Efecto en caja</p>
              <p className="mt-1 text-xl font-semibold text-content-strong">{money(summary.totals.cash_collected)}</p>
              <p className="mt-1 text-xs text-content-muted">Recaudo del rango por medio de pago</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Cartera</p>
              <p className="mt-1 text-xl font-semibold text-content-strong">{money(summary.totals.receivable)}</p>
              <p className={`mt-1 text-xs ${summary.totals.overdue_receivable > 0 ? "font-semibold text-error" : "text-content-muted"}`}>
                {summary.totals.overdue_receivable > 0 ? `Vencida ${money(summary.totals.overdue_receivable)}` : "Sin cartera vencida"}
              </p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Inventario</p>
              <p className="mt-1 text-xl font-semibold text-content-strong">{money(summary.totals.inventory_value)}</p>
              <p className={`mt-1 text-xs ${summary.low_stock.length ? "font-semibold text-warning" : "text-content-muted"}`}>
                {summary.low_stock.length ? `${summary.low_stock.length} productos por reponer` : "Inventario sin faltantes"}
              </p>
            </div>
          </section>

          <section aria-label="Tendencia de ventas por dia" className="apex-section-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-content-strong">Tendencia de ventas por dia</h2>
              <p className="text-xs text-content-muted">
                {dailyMax ? `Mejor dia ${dailyMax.date}: ${money(dailyMax.total)} · promedio ${money(summary.daily_sales.reduce((sum, row) => sum + row.total, 0) / summary.daily_sales.length)}` : "Sin ventas en el rango"}
              </p>
            </div>
            {summary.daily_sales.length === 0 ? (
              <p className="mt-3 rounded-control border border-dashed border-line p-6 text-center text-sm text-content-muted">No hay ventas entre el {from} y el {to}. Registre una venta o amplie el rango.</p>
            ) : (
              <>
                <div className="mt-3"><SalesTrendChart data={summary.daily_sales} /></div>
                <p className="mt-2 text-xs text-content-muted">La linea discontinua es el promedio movil de 7 dias. La suma de los dias coincide con la tarjeta de Ventas.</p>
              </>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Recaudo por medio de pago" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold text-content-strong">Recaudo por medio de pago</h2>
              {summary.cash_by_method.length === 0 ? (
                <p className="mt-3 rounded-control border border-dashed border-line p-6 text-center text-sm text-content-muted">Sin recaudo registrado en el rango.</p>
              ) : (
                <>
                  <div className="mt-3"><CashMethodChart data={summary.cash_by_method} /></div>
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                    {summary.cash_by_method.map((row) => <li key={row.method}>{row.method}: {money(row.total)} ({percent(row.total, cashTotal)})</li>)}
                  </ul>
                </>
              )}
            </section>

            <section aria-label="Productos mas vendidos" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold text-content-strong">Productos mas vendidos</h2>
              {summary.top_products.length === 0 ? (
                <p className="mt-3 rounded-control border border-dashed border-line p-6 text-center text-sm text-content-muted">Sin ventas de producto en el rango.</p>
              ) : (
                <div className="mt-3"><TopProductsChart data={summary.top_products} /></div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section aria-label="Mejores clientes" className="apex-section-card">
              <h2 className="border-b border-line p-4 text-sm font-semibold text-content-strong">Mejores clientes</h2>
              {summary.top_customers.length === 0 ? (
                <p className="p-6 text-center text-sm text-content-muted">Sin ventas con cliente registrado en el rango.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {summary.top_customers.map((row, index) => (
                    <li className="flex items-center gap-3 px-4 py-2.5" key={row.customer_id}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-apex/10 text-xs font-semibold text-apex">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{row.customer_name || "Cliente sin nombre"}</span>
                      <span className="text-xs text-content-muted">{row.sales} venta(s)</span>
                      <span className="w-28 text-right text-sm font-semibold text-content-strong">{money(row.total)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-label="Productos por reponer" className="apex-section-card">
              <h2 className="border-b border-line p-4 text-sm font-semibold text-content-strong">Productos por reponer ({summary.low_stock.length})</h2>
              {summary.low_stock.length === 0 ? (
                <p className="p-6 text-center text-sm text-content-muted">Ningun producto esta por debajo de su minimo.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {summary.low_stock.map((product) => (
                    <li className="flex items-center gap-3 px-4 py-2.5" key={product.id}>
                      <span className="min-w-0 flex-1 truncate text-sm">{product.name}</span>
                      <span className="font-mono text-xs text-content-muted">{product.code}</span>
                      <span className="w-32 text-right text-sm">
                        <span className="font-semibold text-warning">{product.stock}</span>
                        <span className="text-content-muted"> / min {product.min_stock} {product.unit}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-label="Movimientos de inventario" className="apex-section-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-content-strong">Movimientos de inventario</h2>
              <p className="text-xs text-content-muted">{movements.length} movimientos del rango (se muestran los mas recientes).</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(240px,1fr)_14rem_auto] sm:items-end">
              <Field label="Buscar movimiento" hint="Producto, motivo o referencia. Acentos ignorados.">
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={15} />
                  <input aria-label="Buscar movimiento de inventario" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o referencia..." value={query} />
                </div>
              </Field>
              <Field label="Motivo">
                <select aria-label="Filtrar movimientos por motivo" className="control apex-select" onChange={(event) => setReason(event.target.value)} value={reason}>
                  <option value="all">Todos los motivos</option>
                  {reasons.map((item) => <option key={item} value={item}>{REASON_LABELS[item] || item}</option>)}
                </select>
              </Field>
              {hasMovementFilters ? (
                <Button onClick={() => { setQuery(""); setReason("all"); }} type="button" variant="ghost">
                  <X size={14} /> Limpiar
                </Button>
              ) : <span />}
            </div>
            <p aria-live="polite" className="mt-2 text-xs text-content-muted">
              {filteredMovements.length} de {movements.length} movimientos{filteredMovements.length !== movements.length ? ` · ${movements.length - filteredMovements.length} ocultos por el filtro` : ""}
            </p>
            <div className="mt-3">
              <SmartDataTable columns={movementColumns} emptyDetail="Cambie el rango de fechas o registre una compra, venta o ajuste de inventario."
                emptyTitle={hasMovementFilters ? "Ningun movimiento coincide" : "Sin movimientos en el rango"}
                loading={loading} pageSize={12} rowKey={(row) => row.id} rows={filteredMovements} storageKey="comercio-movimientos-inventario" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
