"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter((row) => `${row.full_number} ${row.customer_name || ""} ${row.items.map((item) => item.product_name).join(" ")}`.toLowerCase().includes(needle));
  }, [sales, query]);

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
      <ModuleHeader eyebrow="M-30 · Ventas" subtitle="Toda venta queda congelada con su precio, costo y cliente. Las anulaciones devuelven stock y requieren permiso de aprobacion." title="Ventas" />
      <ComercioMessages error={error} message={message} />

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative block lg:col-span-2">
            <Search className="absolute left-3 top-3 text-content-muted" size={16} />
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por numero, cliente o producto" value={query} />
          </label>
          <Field label="Desde">
            <input className="control" max={to || todayISO()} onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </Field>
          <Field label="Hasta">
            <input className="control" max={todayISO()} min={from} onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </Field>
          <div className="flex items-end gap-2">
            <select className="control apex-select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="voided">Anuladas</option>
            </select>
            <button className="apex-secondary-action flex items-center gap-2 px-3 text-sm font-semibold" onClick={() => void load()} type="button" aria-label="Actualizar"><RefreshCw size={14} /></button>
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-content-muted">Cargando ventas...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-content-muted">Sin ventas en el rango seleccionado.</p>
        ) : (
          <>
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
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b bg-surface-muted text-left text-xs uppercase text-content-muted">
                    <th className="p-3">Numero</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Pago</th>
                    <th className="text-right">Lineas</th>
                    <th className="text-right">Descuento</th>
                    <th className="text-right">Total</th>
                    <th>Estado</th>
                    <th className="pr-3 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => (
                    <tr className="border-b" key={sale.id}>
                      <td className="p-3 font-mono font-semibold">{sale.full_number}</td>
                      <td className="p-3">{sale.date}</td>
                      <td className="p-3">{sale.customer_name || "--"}</td>
                      <td className="p-3">{sale.payment_type === "credit" ? "Credito" : sale.method || "Contado"}</td>
                      <td className="p-3 text-right">{sale.items.length}</td>
                      <td className="p-3 text-right">{money(sale.discount)}</td>
                      <td className="p-3 text-right font-semibold">{money(sale.total)}</td>
                      <td className="p-3">{sale.status === "voided" ? <StatusPill tone="bad">Anulada</StatusPill> : <StatusPill tone="ok">Activa</StatusPill>}</td>
                      <td className="p-3 pr-3 text-right">
                        <button className="h-7 min-h-0 inline-flex items-center apex-secondary-action px-2 py-1 text-xs font-semibold" onClick={() => setDetail(sale)} type="button">Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
