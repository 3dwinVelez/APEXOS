"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Package, Plus, ReceiptEuro, ShoppingCart, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ActionCard } from "@/components/ui/ActionCard";
import { ComercioNav } from "@/components/comercio-nav";
import { AccessDenied, ModuleHeader, describeError, money, useComercioAccess } from "@/components/comercio/shared";

// Tablero del modulo Comercio: resumen del dia y del mes, alertas de stock y ultimos movimientos.
// Los totales los calcula el servidor (GET /comercio/dashboard); la UI solo los presenta.
type Dashboard = {
  today: { sales: number; gross_margin: number; expenses: number; cash_collected: number; receivable: number; overdue_receivable: number; inventory_value: number };
  month: { sales: number; gross_margin: number; expenses: number; cash_collected: number; receivable: number; overdue_receivable: number; inventory_value: number; estimated_result: number };
  low_stock: { id: number; code: string; name: string; stock: number; min_stock: number }[];
  top_products: { product_name: string; quantity: number; revenue: number }[];
  cash_by_method: { method: string; total: number }[];
  recent_sales: { id: number; full_number: string; date: string; total: number; payment_type: string; customer_name: string | null; status: string }[];
  recent_movements: { id: number; product_name: string; change: number; stock_after: number; reason: string; occurred_at: string }[];
};

export default function ComercioHome() {
  const access = useComercioAccess();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Dashboard>("/api/v1/comercio/dashboard", { cache: "no-store" }));
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar el tablero de Comercio."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Tienda autonomica: productos, ventas, credito con cuotas, cartera, compras y gastos. Sus datos no se mezclan con el ERP." title="Comercio" />
      <ComercioNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading || !data ? (
        <div className="apex-section-card p-6 text-sm text-neutral-600">Cargando tablero...</div>
      ) : (
        <>
          <section aria-label="Resumen del dia" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ventas de hoy</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.today.sales)}</p>
              <p className="mt-1 text-xs text-neutral-500">Mes: {money(data.month.sales)}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Margen bruto hoy</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.today.gross_margin)}</p>
              <p className="mt-1 text-xs text-neutral-500">Resultado estimado del mes: {money(data.month.estimated_result)}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cartera pendiente</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.month.receivable)}</p>
              <p className="mt-1 text-xs text-neutral-500">{data.month.overdue_receivable > 0 ? `Vencido: ${money(data.month.overdue_receivable)}` : "Sin cuentas vencidas"}</p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Valor de inventario</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.month.inventory_value)}</p>
              <p className="mt-1 text-xs text-neutral-500">Efectivo recaudado hoy: {money(data.today.cash_collected)}</p>
            </div>
          </section>

          {data.low_stock.length ? (
            <section aria-label="Alertas de stock" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold text-amber-800">Productos por reponer ({data.low_stock.length})</h2>
              <ul className="mt-2 grid gap-1 text-sm text-neutral-700 sm:grid-cols-2">
                {data.low_stock.slice(0, 10).map((product) => (
                  <li key={product.id}>
                    <span className="font-semibold">{product.code}</span> · {product.name}: {product.stock} u (min {product.min_stock})
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Acciones de Comercio" className="apex-dense-actions">
            <ActionCard detail="Venta rapida en efectivo o a credito con cuotas." href="/dashboard/comercio/vender" icon={ShoppingCart} primary title="Vender" />
            <ActionCard detail="Productos con foto, precio, costo y stock propio." href="/dashboard/comercio/productos" icon={Package} title="Productos" />
            <ActionCard detail="Creditos vigentes, vencidos y registro de abonos." href="/dashboard/comercio/cartera" icon={ReceiptEuro} title="Cartera" />
            <ActionCard detail="Clientes del comercio con documento y telefono." href="/dashboard/comercio/clientes" icon={Users} title="Clientes" />
            <ActionCard detail="Registrar una compra de mercancia y ajustar el costo promedio." href="/dashboard/comercio/compras" icon={Plus} title="Compras" />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Ultimas ventas" className="apex-section-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Ultimas ventas</h2>
                <Link className="text-xs font-medium text-apex" href="/dashboard/comercio/ventas">Ver todas</Link>
              </div>
              {data.recent_sales.length ? (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {data.recent_sales.map((sale) => (
                    <li className="flex items-center justify-between gap-2 py-2" key={sale.id}>
                      <span className="font-mono text-xs">{sale.full_number}</span>
                      <span className="min-w-0 flex-1 truncate text-neutral-600">{sale.customer_name || (sale.payment_type === "credit" ? "Credito" : "Contado")}</span>
                      <span className="font-semibold">{money(sale.total)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-neutral-500">Aun no hay ventas registradas.</p>}
            </section>
            <section aria-label="Movimientos recientes" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold">Movimientos de inventario</h2>
              {data.recent_movements.length ? (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {data.recent_movements.map((movement) => (
                    <li className="flex items-center justify-between gap-2 py-2" key={movement.id}>
                      <span className="min-w-0 flex-1 truncate">{movement.product_name}</span>
                      <span className={movement.change >= 0 ? "text-emerald-700" : "text-red-700"}>{movement.change > 0 ? "+" : ""}{movement.change}</span>
                      <span className="text-xs text-neutral-500">{movement.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-neutral-500">Sin movimientos todavia.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
