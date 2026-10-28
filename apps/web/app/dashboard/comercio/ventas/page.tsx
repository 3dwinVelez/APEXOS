"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Download, RefreshCw, Search, ShoppingCart, X } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, matchesQuery, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Historial de ventas (GET /api/v1/comercio/sales). Las ventas no se borran: se anulan
// con permiso approve y el servidor devuelve el stock al inventario.
type SaleItem = { line_number: number; product_id: number | null; product_code: string | null; product_name: string; quantity: number; unit_price: number; unit_cost: number; line_total: number };
type Sale = {
  id: number;
  number: number;
  full_number: string;
  date: string;
  customer_id: number | null;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  cost_total: number;
  payment_type: "cash" | "credit";
  method: string | null;
  status: "active" | "voided";
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  items: SaleItem[];
};

export default function ComercioVentasPage() {
  const access = useComercioAccess();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [detail, setDetail] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const result = await api<{ items: Sale[]; total: number }>(`/api/v1/comercio/sales?${params.toString()}`, { cache: "no-store" });
      setSales(result.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar las ventas."));
    } finally {
      setLoading(false);
    }
  }, [from, to, statusFilter]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const filtered = useMemo(() => sales.filter((row) => matchesQuery(
    query,
    row.full_number,
    row.customer_name || "",
    row.payment_type === "credit" ? "credito" : row.method || "contado",
    row.status === "voided" ? "anulada" : "activa",
    row.items.map((item) => `${item.product_name} ${item.quantity}`).join(" ")
  )), [sales, query]);

  const hasFilters = Boolean(query.trim() || from || to || statusFilter !== "all");

  function clearFilters() {
    setQuery("");
    setFrom("");
    setTo("");
    setStatusFilter("all");
  }

  const totalFiltered = useMemo(() => filtered.reduce((sum, row) => sum + Number(row.total || 0), 0), [filtered]);

  function exportSales(rows: Sale[]) {
    downloadExcelWorkbook("comercio-ventas.xls", [{
      name: "Ventas",
      columns: [
        { key: "number", label: "Numero" },
        { key: "date", label: "Fecha" },
        { key: "customer", label: "Cliente", width: 200 },
        { key: "payment", label: "Pago" },
        { key: "items", label: "Lineas" },
        { key: "discount", label: "Descuento" },
        { key: "total", label: "Total" },
        { key: "state", label: "Estado" }
      ],
      rows: rows.map((row) => ({
        number: row.full_number,
        date: row.date,
        customer: row.customer_name || "",
        payment: row.payment_type === "credit" ? "Credito" : row.method || "Contado",
        items: row.items.length,
        discount: Number(row.discount),
        total: Number(row.total),
        state: row.status === "voided" ? "Anulada" : "Activa"
      }))
    }]);
  }

  const columns: DataColumn<Sale>[] = [
    { className: "font-mono font-semibold", cell: (row) => row.full_number, header: "Numero", hideable: false, id: "number", sortValue: (row) => row.id },
    { cell: (row) => row.date, header: "Fecha", id: "date", sortValue: (row) => row.date },
    {
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name || "Sin cliente"}</p>
          <p className="truncate text-xs text-content-muted">{row.items.map((item) => item.product_name).slice(0, 2).join(", ")}{row.items.length > 2 ? ` +${row.items.length - 2}` : ""}</p>
        </div>
      ),
      header: "Cliente y productos",
      id: "customer",
      sortValue: (row) => row.customer_name || ""
    },
    { cell: (row) => (row.payment_type === "credit" ? "Credito" : row.method || "Contado"), header: "Pago", id: "payment", sortValue: (row) => (row.payment_type === "credit" ? "credito" : row.method || "contado") },
    { className: "text-right", cell: (row) => row.items.length, header: "Lineas", id: "lines", sortValue: (row) => row.items.length },
    { className: "text-right", cell: (row) => (row.discount > 0 ? <span className="text-error">-{money(row.discount)}</span> : <span className="text-content-muted">--</span>), header: "Descuento", id: "discount", sortValue: (row) => Number(row.discount) },
    {
      className: "text-right",
      cell: (row) => (
        <div className="leading-tight">
          <span className="font-semibold">{money(row.total)}</span>
          <span className="block text-xs text-content-muted">margen {money(row.total - row.cost_total)}</span>
        </div>
      ),
      header: "Total",
      id: "total",
      sortValue: (row) => Number(row.total)
    },
    {
      cell: (row) => (row.status === "voided" ? <StatusPill tone="bad">Anulada</StatusPill> : row.payment_type === "credit" ? <StatusPill tone="warn">Credito</StatusPill> : <StatusPill tone="ok">Activa</StatusPill>),
      header: "Estado",
      id: "state",
      sortValue: (row) => (row.status === "voided" ? 0 : 1)
    },
    {
      className: "text-right",
      cell: (row) => <Button onClick={() => setDetail(row)} size="compact" variant="secondary"><Search size={12} /> Ver</Button>,
      header: "Acciones",
      hideable: false,
      id: "action"
    }
  ];

  async function voidSale() {
    if (!voidTarget) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/comercio/sales/${voidTarget.id}/void`, { method: "POST", body: JSON.stringify({ reason: voidReason.trim() || "Anulacion" }) });
      setMessage(`Venta ${voidTarget.full_number} anulada. El stock regreso al inventario.`);
      setVoidTarget(null);
      setVoidReason("");
      setDetail(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible anular la venta."));
    } finally {
      setSaving(false);
    }
  }
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader actions={<Link className="apex-primary-action inline-flex items-center gap-2 px-4 text-sm font-semibold" href="/dashboard/comercio/vender"><ShoppingCart size={14} /> Nueva venta</Link>} eyebrow="M-30 · Ventas" subtitle="Toda venta queda congelada con su precio, costo y cliente. Las anulaciones devuelven stock y requieren permiso de aprobacion." title="Ventas" />
      <ComercioMessages error={error} message={message} />

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_10rem_10rem_11rem] lg:items-end">
          <Field label="Buscar">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar ventas por numero, cliente, producto o forma de pago" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Numero, cliente o producto vendido" value={query} />
            </span>
          </Field>
          <Field label="Desde">
            <input className="control" max={to || todayISO()} onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </Field>
          <Field label="Hasta">
            <input className="control" max={todayISO()} min={from} onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </Field>
          <Field label="Estado">
            <select className="control apex-select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="voided">Anuladas</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-content-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {hasFilters ? <Button onClick={clearFilters} size="compact" variant="ghost"><X size={12} /> Limpiar filtros</Button> : null}
            <span aria-live="polite" className="font-semibold text-content-body">{filtered.length} de {sales.length} ventas · {money(totalFiltered)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!filtered.length} onClick={() => exportSales(filtered)} size="compact" variant="secondary"><Download size={14} /> Excel</Button>
            <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
          </div>
        </div>

        {!loading && filtered.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
            {filtered.map((sale) => (
              <li className="rounded-md border border-line p-3" key={sale.id}>
                <button className="w-full text-left" onClick={() => setDetail(sale)} type="button">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">{sale.full_number}</span>
                    <StatusPill tone={sale.status === "voided" ? "bad" : sale.payment_type === "credit" ? "warn" : "ok"}>
                      {sale.status === "voided" ? "Anulada" : sale.payment_type === "credit" ? "Credito" : sale.method || "Contado"}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-content-muted">{sale.date} · {sale.customer_name || "Sin cliente"} · {sale.items.length} linea(s)</p>
                  <p className="mt-1 text-lg font-semibold">{money(sale.total)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="hidden p-4 lg:block">
          <SmartDataTable
            bulkActions={(selected, clear) => (
              <>
                <Button onClick={() => exportSales(selected)} size="compact" variant="secondary"><Download size={14} /> Exportar {selected.length}</Button>
                <Button onClick={clear} size="compact" variant="ghost">Limpiar seleccion</Button>
              </>
            )}
            columns={columns}
            emptyDetail={sales.length ? "Ajusta el rango, el estado o limpia el buscador para volver a ver ventas." : "Registra la primera venta en Vender para ver aqui su historial congelado."}
            emptyTitle={sales.length ? "Ninguna venta con estos filtros" : "Aun no hay ventas"}
            loading={loading}
            pageSize={12}
            rowKey={(row) => row.id}
            rows={filtered}
            storageKey="comercio-ventas"
          />
        </div>
      </section>

      {detail ? (
        <ModalFrame maxWidth="md:max-w-2xl" onClose={() => setDetail(null)} title={`Venta ${detail.full_number}`}>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-content-muted">{detail.date} · {detail.payment_type === "credit" ? "Credito" : detail.method || "Contado"} · {detail.customer_name || "Sin cliente"}</p>
            {detail.status === "voided" && detail.void_reason ? (
              <p className="rounded-md border border-error/30 bg-error/10 p-2 text-xs text-error">Anulada: {detail.void_reason}</p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-content-muted">
                    <th className="py-1">#</th><th>Producto</th><th className="text-right">Cant</th><th className="text-right">Precio</th><th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr className="border-b" key={item.line_number}>
                      <td className="py-1 font-mono">{item.line_number}</td>
                      <td>{item.product_name}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td className="text-right">{money(item.unit_price)}</td>
                      <td className="text-right">{money(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-md bg-surface-muted p-3">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(detail.subtotal)}</span></div>
              <div className="flex justify-between"><span>Descuento</span><span>-{money(detail.discount)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{money(detail.total)}</span></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              {access.canApprove && detail.status === "active" ? (
                <button className="apex-secondary-action flex items-center gap-1 text-error px-4 text-sm font-semibold" onClick={() => { setVoidTarget(detail); setVoidReason(""); }} type="button">
                  <Ban size={14} /> Anular venta
                </button>
              ) : null}
              <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" onClick={() => setDetail(null)} type="button">Cerrar</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {voidTarget ? (
        <ModalFrame onClose={() => setVoidTarget(null)} title={`Anular venta ${voidTarget.full_number}`}>
          <div className="space-y-4">
            <p className="text-sm text-content-body">
              La venta queda en estado &quot;anulada&quot; y las cantidades regresan al inventario con su propio movimiento.
              Si era a credito y ya tiene abonos, el sistema bloqueara la anulacion.
            </p>
            <Field label="Motivo de la anulacion">
              <input className="control" maxLength={300} onChange={(event) => setVoidReason(event.target.value)} placeholder="Ej. Error de digitacion" value={voidReason} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setVoidTarget(null)} type="button">Cancelar</button>
              <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" disabled={saving} onClick={() => void voidSale()} type="button">{saving ? "Anulando..." : "Confirmar anulacion"}</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
