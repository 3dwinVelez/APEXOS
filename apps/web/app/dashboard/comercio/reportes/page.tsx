"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Reportes del Comercio (GET /api/v1/comercio/reports/summary). Todos los agregados los
// calcula el servidor; aqui solo se presentan con graficos CSS (sin dependencias nuevas).
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

export default function ComercioReportesPage() {
  const access = useComercioAccess();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const [summaryResult, movementResult] = await Promise.all([
        api<Summary>(`/api/v1/comercio/reports/summary?${params.toString()}`, { cache: "no-store" }),
        api<{ items: Movement[] }>(`/api/v1/comercio/movements?limit=50${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, { cache: "no-store" })
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

  const dailyMax = useMemo(() => Math.max(1, ...(summary?.daily_sales.map((row) => row.total) || [1])), [summary]);
  const methodMax = useMemo(() => Math.max(1, ...(summary?.cash_by_method.map((row) => row.total) || [1])), [summary]);
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Resultados" subtitle="Resultado del periodo: ventas, margen, gastos, cartera y caja por medio de pago. Rango de fechas incluido." title="Reportes" />
      <ComercioMessages error={error} />

      <section className="apex-section-card grid gap-3 p-4 sm:grid-cols-[220px_220px_auto] sm:items-end">
        <Field label="Desde">
          <input className="control" max={to} onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
        </Field>
        <Field label="Hasta">
          <input className="control" max={todayISO()} min={from} onChange={(event) => setTo(event.target.value)} type="date" value={to} />
        </Field>
        <button className="apex-secondary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> Calcular</button>
      </section>

      {loading || !summary ? (
        <div className="apex-section-card p-6 text-sm text-content-body">Calculando el periodo...</div>
      ) : (
        <>
          <section aria-label="Totales del periodo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Ventas</p>
              <p className="mt-1 text-2xl font-semibold">{money(summary.totals.sales)}</p>
              <p className="mt-1 text-xs text-content-muted">Costo de lo vendido: {money(summary.totals.cost_of_goods)}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Margen bruto</p>
              <p className="mt-1 text-2xl font-semibold">{money(summary.totals.gross_margin)}</p>
              <p className="mt-1 text-xs text-content-muted">Gastos: {money(summary.totals.expenses)} · Compras: {money(summary.totals.purchases)}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Resultado estimado</p>
              <p className={`mt-1 text-2xl font-semibold ${summary.totals.estimated_result < 0 ? "text-error" : "text-success"}`}>{money(summary.totals.estimated_result)}</p>
              <p className="mt-1 text-xs text-content-muted">Margen menos gastos operativos del rango.</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Efecto en caja</p>
              <p className="mt-1 text-2xl font-semibold">{money(summary.totals.cash_collected)}</p>
              <p className="mt-1 text-xs text-content-muted">Cartera: {money(summary.totals.receivable)} {summary.totals.overdue_receivable > 0 ? `· vencida ${money(summary.totals.overdue_receivable)}` : ""}</p>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Ventas por dia" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold">Ventas por dia</h2>
              {summary.daily_sales.length === 0 ? (
                <p className="mt-2 text-sm text-content-muted">Sin ventas en el rango.</p>
              ) : (
                <div className="mt-3 flex h-40 items-end gap-1 overflow-x-auto">
                  {summary.daily_sales.map((row) => (
                    <div className="flex min-w-[18px] flex-1 flex-col items-center justify-end gap-1" key={row.date} title={`${row.date}: ${money(row.total)}`}>
                      <div className="w-full rounded-t bg-apex/70" style={{ height: `${Math.max(4, Math.round((row.total / dailyMax) * 120))}px` }} />
                      <span className="rotate-0 text-[9px] text-content-muted">{row.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Recaudo por medio de pago" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold">Recaudo por medio de pago</h2>
              {summary.cash_by_method.length === 0 ? (
                <p className="mt-2 text-sm text-content-muted">Sin recaudo en el rango.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {summary.cash_by_method.map((row) => (
                    <li key={row.method}>
                      <div className="flex justify-between"><span>{row.method}</span><span className="font-semibold">{money(row.total)}</span></div>
                      <div className="mt-1 h-2 rounded bg-surface-muted"><div className="h-2 rounded bg-apex/70" style={{ width: `${Math.round((row.total / methodMax) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Productos mas vendidos" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold">Productos mas vendidos</h2>
              {summary.top_products.length === 0 ? (
                <p className="mt-2 text-sm text-content-muted">Sin ventas en el rango.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-content-muted"><th className="py-1">Producto</th><th className="text-right">Unidades</th><th className="text-right">Ingreso</th><th className="text-right">Margen</th></tr>
                  </thead>
                  <tbody>
                    {summary.top_products.map((row) => (
                      <tr className="border-b" key={`${row.product_name}`}>
                        <td className="py-1">{row.product_name}</td>
                        <td className="text-right">{row.quantity}</td>
                        <td className="text-right">{money(row.revenue)}</td>
                        <td className="text-right">{money(row.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section aria-label="Mejores clientes" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold">Mejores clientes</h2>
              {summary.top_customers.length === 0 ? (
                <p className="mt-2 text-sm text-content-muted">Sin ventas con cliente en el rango.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-content-muted"><th className="py-1">Cliente</th><th className="text-right">Ventas</th><th className="text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {summary.top_customers.map((row) => (
                      <tr className="border-b" key={row.customer_id}>
                        <td className="py-1">{row.customer_name || "--"}</td>
                        <td className="text-right">{row.sales}</td>
                        <td className="text-right font-semibold">{money(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          {summary.low_stock.length ? (
            <section aria-label="Productos por reponer" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold text-warning">Productos por reponer ({summary.low_stock.length})</h2>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {summary.low_stock.map((product) => (
                  <li key={product.id}>{product.code} · {product.name}: <span className="font-semibold">{product.stock}</span> {product.unit} (min {product.min_stock})</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Movimientos de inventario" className="apex-section-card">
            <h2 className="border-b border-line p-4 text-sm font-semibold">Movimientos de inventario (ultimos 50)</h2>
            {movements.length === 0 ? (
              <p className="p-6 text-center text-sm text-content-muted">Sin movimientos en el rango.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-surface-muted text-left text-xs uppercase text-content-muted">
                      <th className="p-3">Fecha</th><th>Producto</th><th className="text-right">Cambio</th><th className="text-right">Antes</th><th className="text-right">Despues</th><th>Motivo</th><th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr className="border-b" key={movement.id}>
                        <td className="p-3">{movement.occurred_at}</td>
                        <td className="p-3">{movement.product_name}</td>
                        <td className={`p-3 text-right font-semibold ${movement.change >= 0 ? "text-success" : "text-error"}`}>{movement.change > 0 ? "+" : ""}{movement.change}</td>
                        <td className="p-3 text-right">{movement.stock_before}</td>
                        <td className="p-3 text-right">{movement.stock_after}</td>
                        <td className="p-3"><StatusPill tone={movement.reason === "sale" || movement.reason === "sale_void" ? "warn" : "muted"}>{REASON_LABELS[movement.reason] || movement.reason}</StatusPill></td>
                        <td className="p-3 font-mono text-xs">{movement.reference || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
