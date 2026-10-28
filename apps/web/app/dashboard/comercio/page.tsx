"use client";

// Portafolio del modulo Comercio (M-30): cockpit del mes + las 9 aplicaciones agrupadas por
// workflow, igual que Transporte y Gastos Menores. La navegacion dentro del modulo es esta
// rejilla, no una barra de pestañas: el sidebar solo enlaza la raiz del modulo.
// Los unicos calculos que hace la UI son las sumas de ingreso/egreso del mes; el resto de
// totales los entrega el servidor en GET /comercio/dashboard.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  HandCoins,
  Package,
  Receipt,
  Settings2,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet
} from "lucide-react";
import { api } from "@/lib/api";
import { ActionCard } from "@/components/ui/ActionCard";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { comercioGate, describeError, money, useComercioAccess } from "@/components/comercio/shared";

type Dashboard = {
  today: { sales: number; gross_margin: number; expenses: number; income: number; cash_collected: number; receivable: number; overdue_receivable: number; inventory_value: number };
  month: { sales: number; gross_margin: number; expenses: number; income: number; purchases: number; cost_of_goods: number; cash_collected: number; receivable: number; overdue_receivable: number; inventory_value: number; estimated_result: number };
  low_stock: { id: number; code: string; name: string; stock: number; min_stock: number }[];
  top_products: { product_name: string; quantity: number; revenue: number }[];
  cash_by_method: { method: string; total: number }[];
  recent_sales: { id: number; full_number: string; date: string; total: number; payment_type: string; customer_name: string | null; status: string }[];
  recent_movements: { id: number; product_name: string; change: number; stock_after: number; reason: string; occurred_at: string }[];
};

const COMERCIO_APPS = [
  {
    title: "Vender y cobrar hoy",
    detail: "El mostrador: registrar la venta, revisar el comprobante y cobrar lo pendiente.",
    actions: [
      { href: "/dashboard/comercio/vender", title: "Vender", detail: "Cobro en efectivo, medio digital o credito con cuotas.", icon: ShoppingCart, primary: true },
      { href: "/dashboard/comercio/ventas", title: "Ventas", detail: "Comprobantes emitidos, su detalle y anuracion con motivo.", icon: Receipt },
      { href: "/dashboard/comercio/cartera", title: "Cartera", detail: "Creditos vigentes y vencidos con abono por cuota.", icon: HandCoins }
    ]
  },
  {
    title: "Maestros del negocio",
    detail: "Lo que sostienes en stock y con quien trabajas.",
    actions: [
      { href: "/dashboard/comercio/productos", title: "Productos", detail: "Foto, precio de lista, descuento, costo promedio y stock.", icon: Package },
      { href: "/dashboard/comercio/clientes", title: "Clientes", detail: "Documento, contacto y saldo de cada cliente.", icon: Users },
      { href: "/dashboard/comercio/compras", title: "Compras", detail: "Recepcion de mercancia y recosto del promedio ponderado.", icon: Wallet }
    ]
  },
  {
    title: "Caja, resultados y vitrina",
    detail: "El dinero que entra y sale, como va el mes y que ven tus clientes.",
    actions: [
      { href: "/dashboard/comercio/gastos", title: "Ingresos y egresos", detail: "Movimientos de caja por direccion, medio y responsable.", icon: BarChart3 },
      { href: "/dashboard/comercio/reportes", title: "Reportes", detail: "Tendencia diaria, margen, rankings y exportacion a Excel.", icon: TrendingUp },
      { href: "/dashboard/comercio/configuracion", title: "Configuracion", detail: "Datos del negocio, redes, WhatsApp y campana de descuentos.", icon: Settings2 }
    ]
  }
] as const;

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
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  const incomeMonth = data ? data.month.sales + data.month.income : 0;
  const expenseMonth = data ? data.month.purchases + data.month.expenses : 0;

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-apex">M-30 · Comercial</p>
            <h1 className="text-3xl font-semibold">Comercio</h1>
            <p className="mt-1 max-w-3xl text-sm text-content-body">
              Tienda autonoma con su propio inventario, cartera y caja. Sus datos no se mezclan con el ERP.
            </p>
          </div>
          <Link className="apex-secondary-action inline-flex items-center gap-2" href="/dashboard/comercio/vender">
            <ShoppingCart size={16} /> Abrir el mostrador
          </Link>
        </div>
      </header>

      {error ? <Alert tone="error" title="No se pudo cargar el tablero">{error} <button className="font-semibold underline" onClick={() => void load()} type="button">Reintentar</button></Alert> : null}

      <section aria-label="Indicadores del mes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !data ? [0, 1, 2, 3].map((index) => <Skeleton className="h-28" key={index} />) : (
          <>
            <Kpi label="Ingresos del mes" tone="success" value={money(incomeMonth)}
              detail={`Ventas ${money(data.month.sales)} · otros ingresos ${money(data.month.income)}`} />
            <Kpi label="Egresos del mes" tone="error" value={money(expenseMonth)}
              detail={`Compras ${money(data.month.purchases)} · gastos ${money(data.month.expenses)}`} />
            <Kpi label="Resultado estimado" tone={data.month.estimated_result >= 0 ? "neutral" : "error"} value={money(data.month.estimated_result)}
              detail={`Margen bruto ${money(data.month.gross_margin)} · costo mercancia ${money(data.month.cost_of_goods)}`} />
            <Kpi label="Cartera pendiente" tone={data.month.overdue_receivable > 0 ? "warning" : "neutral"} value={money(data.month.receivable)}
              detail={data.month.overdue_receivable > 0 ? `Vencido ${money(data.month.overdue_receivable)}` : "Sin cuentas vencidas"} />
          </>
        )}
      </section>

      <section aria-label="Actividad de hoy" className="apex-section-card flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Hoy</p>
        {loading || !data ? <Skeleton className="h-5 w-64" /> : (
          <>
            <p>Ventas: <span className="font-semibold text-content-strong">{money(data.today.sales)}</span></p>
            <p>Ingresos extra: <span className="font-semibold text-success">{money(data.today.income)}</span></p>
            <p>Gastos: <span className="font-semibold text-error">{money(data.today.expenses)}</span></p>
            <p>Efectivo recaudado: <span className="font-semibold text-content-strong">{money(data.today.cash_collected)}</span></p>
            <p>Inventario valorado: <span className="font-semibold text-content-strong">{money(data.month.inventory_value)}</span></p>
          </>
        )}
      </section>

      {data && data.low_stock.length > 0 ? (
        <Alert tone="warning" title={`Reposicion pendiente · ${data.low_stock.length} productos por debajo del minimo`}>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.low_stock.slice(0, 6).map((product) => (
              <span key={product.id}><span className="font-mono text-xs">{product.code}</span> {product.name}: {product.stock} u (min {product.min_stock})</span>
            ))}
          </div>
          <Link className="mt-2 inline-flex items-center gap-1 font-semibold text-content-strong underline underline-offset-2" href="/dashboard/comercio/productos">
            <AlertTriangle size={14} /> Ajustar stock y minimos
          </Link>
        </Alert>
      ) : null}

      {COMERCIO_APPS.map((group) => (
        <section className="space-y-2" key={group.title}>
          <div>
            <h2 className="text-lg font-semibold text-content-strong">{group.title}</h2>
            <p className="text-sm text-content-body">{group.detail}</p>
          </div>
          <div className="apex-dense-actions">
            {group.actions.map((action) => <ActionCard key={action.href} {...action} />)}
          </div>
        </section>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recaudo por medio de pago" href="/dashboard/comercio/gastos" hrefLabel="Ver caja">
          {data && data.cash_by_method.length ? (
            <ul className="mt-2 space-y-2">
              {data.cash_by_method.map((row) => {
                const max = Math.max(...data.cash_by_method.map((item) => item.total), 1);
                return (
                  <li key={row.method}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-content-body">{row.method}</span>
                      <span className="font-semibold text-content-strong">{money(row.total)}</span>
                    </div>
                    <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-apex" style={{ width: `${Math.max(4, Math.round((row.total / max) * 100))}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState className="min-h-32 border-0 py-6" title="Sin recaudo en el mes" description="Cuando registres la primera venta veras aqui como entra el dinero." />}
        </Panel>
        <Panel title="Productos mas vendidos" href="/dashboard/comercio/reportes" hrefLabel="Ver reportes">
          {data && data.top_products.length ? (
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.top_products.slice(0, 6).map((product, index) => (
                <li className="flex items-center gap-3 py-2" key={product.product_name}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-apex/10 text-xs font-bold text-apex">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-content-body">{product.product_name}</span>
                  <span className="text-xs text-content-muted">{product.quantity} u</span>
                  <span className="font-semibold text-content-strong">{money(product.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState className="min-h-32 border-0 py-6" title="Aun sin ventas" description="El ranking se construye desde las ventas del mes en curso." />}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ultimas ventas" href="/dashboard/comercio/ventas" hrefLabel="Ver todas">
          {data && data.recent_sales.length ? (
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.recent_sales.map((sale) => (
                <li className="flex items-center justify-between gap-2 py-2" key={sale.id}>
                  <span className="font-mono text-xs text-content-muted">{sale.full_number}</span>
                  <span className="min-w-0 flex-1 truncate text-content-body">{sale.customer_name || (sale.payment_type === "credit" ? "Credito" : "Contado")}</span>
                  <span className="font-semibold text-content-strong">{money(sale.total)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState className="min-h-32 border-0 py-6" title="Aun no hay ventas" description="Abre el mostrador para registrar la primera." />}
        </Panel>
        <Panel title="Movimientos de inventario" href="/dashboard/comercio/productos" hrefLabel="Ver productos">
          {data && data.recent_movements.length ? (
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.recent_movements.map((movement) => (
                <li className="flex items-center justify-between gap-2 py-2" key={movement.id}>
                  <span className="min-w-0 flex-1 truncate text-content-body">{movement.product_name}</span>
                  <span className={movement.change >= 0 ? "font-semibold text-success" : "font-semibold text-error"}>{movement.change > 0 ? "+" : ""}{movement.change}</span>
                  <span className="w-28 shrink-0 truncate text-right text-xs text-content-muted">{movement.reason}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState className="min-h-32 border-0 py-6" title="Sin movimientos todavia" description="Compras, ventas y ajustes quedan registrados aqui." />}
        </Panel>
      </div>
    </div>
  );
}

const kpiTones = {
  success: "text-success",
  error: "text-error",
  warning: "text-warning",
  neutral: "text-content-strong"
} as const;

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: keyof typeof kpiTones }) {
  return (
    <div className="apex-section-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${kpiTones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-content-muted">{detail}</p>
    </div>
  );
}

function Panel({ title, href, hrefLabel, children }: { title: string; href: string; hrefLabel: string; children: React.ReactNode }) {
  return (
    <section className="apex-section-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-content-strong">
          <Boxes size={16} className="text-apex" /> {title}
        </h2>
        <Link className="inline-flex items-center gap-1 text-xs font-semibold text-apex" href={href}>{hrefLabel} <ArrowUpRight size={13} /></Link>
      </div>
      {children}
    </section>
  );
}
