"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { ComprasNav } from "@/components/compras-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type PurchaseOrderLine = {
  id: number;
  item_id?: number;
  description: string;
  qty: number;
  unit?: string;
  pending_quantity?: number;
  received_quantity?: number;
};

type PurchaseOrder = {
  id: number;
  number: string;
  date: string;
  status: string;
  total: number;
  party?: { id?: number; name?: string };
  metadata?: { warehouse_id?: number; warehouse_name?: string; expected_at?: string };
  lines: PurchaseOrderLine[];
  receipt_accounting_documents?: Array<{ id: number; full_number: string; posting_date: string; total_debit: number }>;
};

type Location = { id: number; place_id: number; label: string };

const statusLabels: Record<string, string> = {
  confirmed: "Pendiente de recibir",
  partial: "Recepción parcial",
  received: "Recibida completamente"
};

export default function RecibirOCPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ number: "", from: "", to: "", status: "", supplier: "", warehouse: "", product: "" });

  const suppliers = useMemo(() => [...new Map(orders.filter((row) => row.party?.id).map((row) => [row.party!.id, row.party!])).values()], [orders]);
  const warehouses = useMemo(() => [...new Map(orders.filter((row) => row.metadata?.warehouse_id).map((row) => [row.metadata!.warehouse_id, { id: row.metadata!.warehouse_id!, name: row.metadata?.warehouse_name || `Bodega ${row.metadata!.warehouse_id}` }])).values()], [orders]);
  const products = useMemo(() => [...new Map(orders.flatMap((row) => row.lines).filter((line) => line.item_id).map((line) => [line.item_id, { id: line.item_id!, name: line.description }])).values()], [orders]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const date = String(order.date || order.metadata?.expected_at || "").slice(0, 10);
    return (!filters.number || order.number.toLowerCase().includes(filters.number.toLowerCase()))
      && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
      && (!filters.status || order.status === filters.status)
      && (!filters.supplier || String(order.party?.id) === filters.supplier)
      && (!filters.warehouse || String(order.metadata?.warehouse_id) === filters.warehouse)
      && (!filters.product || order.lines.some((line) => String(line.item_id) === filters.product));
  }), [orders, filters]);

  async function load() {
    const [data, locationRows] = await Promise.all([
      api<PurchaseOrder[]>("/api/v1/purchases/orders"),
      api<Location[]>("/api/v1/inventory/locations")
    ]);
    setOrders((data || []).filter((order) => ["confirmed", "partial", "received"].includes(order.status)));
    setLocations(locationRows || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Error cargando órdenes"));
  }, []);

  function openReceipt(order: PurchaseOrder) {
    setError("");
    setOk("");
    setNotes("");
    setQuantities({});
    setExpandedOrderId((current) => current === order.id ? null : order.id);
  }

  function setReceiveAll(order: PurchaseOrder, checked: boolean) {
    setQuantities((current) => {
      const next = { ...current };
      for (const line of order.lines) {
        const pending = Number(line.pending_quantity ?? line.qty);
        if (checked && pending > 0) next[line.id] = String(pending);
        else delete next[line.id];
      }
      return next;
    });
  }

  async function receivePartial(order: PurchaseOrder) {
    setError("");
    setOk("");
    const receivedLines = order.lines.flatMap((line) => {
      const quantity = Number(quantities[line.id] || 0);
      return quantity > 0 ? [{ line_id: line.id, qty_received: quantity }] : [];
    });
    if (!receivedLines.length) {
      setError("Ingresa al menos una cantidad recibida mayor a cero.");
      return;
    }
    const invalidLine = order.lines.find((line) => {
      const quantity = Number(quantities[line.id] || 0);
      return quantity > Number(line.pending_quantity ?? line.qty) + 0.0001;
    });
    if (invalidLine) {
      setError(`La cantidad de ${invalidLine.description} supera el saldo pendiente.`);
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ accounting_document?: { full_number?: string } }>(`/api/v1/purchases/orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ received_lines: receivedLines, notes: notes.trim() || undefined })
      });
      setOk(`Recepción de ${order.number} registrada correctamente${result.accounting_document?.full_number ? ` y contabilizada como ${result.accounting_document.full_number}` : ""}.`);
      setQuantities({});
      setNotes("");
      setExpandedOrderId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la recepción");
    } finally {
      setSaving(false);
    }
  }

  async function returnAll(order: PurchaseOrder) {
    const location = locations.find((row) => row.place_id === order.metadata?.warehouse_id);
    if (!location) return setError("La OC no tiene una ubicación activa en su bodega");
    const reason = window.prompt("Motivo de la devolución", "Devolución a proveedor");
    if (reason === null) return;
    try {
      await api(`/api/v1/purchases/orders/${order.id}/return`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          returned_lines: order.lines
            .filter((line) => Number(line.received_quantity || 0) > 0)
            .map((line) => ({ line_id: line.id, qty_returned: Number(line.received_quantity), location_id: location.id }))
        })
      });
      setOk(`Devolución de ${order.number} registrada correctamente.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo devolver la mercancía");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Recepción de órdenes de compra</h1>
        <p className="mt-1 text-sm text-neutral-600">Consulta lo solicitado y registra las unidades realmente recibidas por posición.</p>
      </div>
      <ComprasNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}

      <section className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">Buscar órdenes</h2><p className="text-xs text-neutral-500">Combina filtros para encontrar rápidamente una recepción.</p></div>
          <button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => setFilters({ number: "", from: "", to: "", status: "", supplier: "", warehouse: "", product: "" })} type="button">Limpiar</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">Número de OC<input className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, number: e.target.value }))} placeholder="Ej. OC-000123" value={filters.number} /></label>
          <label className="text-sm">Fecha desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, from: e.target.value }))} type="date" value={filters.from} /></label>
          <label className="text-sm">Fecha hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))} type="date" value={filters.to} /></label>
          <label className="text-sm">Estado<select className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))} value={filters.status}><option value="">Todos</option><option value="confirmed">Pendiente</option><option value="partial">Parcial</option><option value="received">Recibida</option></select></label>
          <label className="text-sm">Proveedor<select className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, supplier: e.target.value }))} value={filters.supplier}><option value="">Todos</option>{suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="text-sm">Bodega<select className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, warehouse: e.target.value }))} value={filters.warehouse}><option value="">Todas</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="text-sm md:col-span-2">Producto<select className="mt-1 h-10 w-full rounded-md border border-line px-3" onChange={(e) => setFilters((v) => ({ ...v, product: e.target.value }))} value={filters.product}><option value="">Todos los SKU</option>{products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        </div>
        <p className="mt-3 text-xs text-neutral-500">{filteredOrders.length} de {orders.length} órdenes encontradas</p>
      </section>

      <section className="space-y-3">
        {filteredOrders.map((order) => {
          const expanded = expandedOrderId === order.id;
          const pendingLines = order.lines.filter((line) => Number(line.pending_quantity ?? line.qty) > 0);
          return (
            <article className="rounded-lg border border-line bg-white" key={order.id}>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{order.number}</h2>
                    <span className="rounded-full bg-paper px-2 py-1 text-xs font-medium">{statusLabels[order.status] || order.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    {order.party?.name || "Proveedor"} · {order.metadata?.warehouse_name || "Bodega destino"} · ${Number(order.total || 0).toLocaleString("es-CO")}
                  </p>
                  {order.receipt_accounting_documents?.length ? <p className="mt-1 text-xs text-apex">Contabilidad: {order.receipt_accounting_documents.map((row) => row.full_number).join(", ")}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.status !== "received" ? (
                    <button className="rounded-md bg-apex px-3 py-2 text-sm font-semibold text-white" onClick={() => openReceipt(order)} type="button">
                      Registrar recepción
                    </button>
                  ) : null}
                  <button className="rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50" disabled={!order.lines.some((line) => Number(line.received_quantity || 0) > 0)} onClick={() => returnAll(order)} type="button">
                    Devolver mercancía
                  </button>
                </div>
              </div>

              {expanded ? (
                <ModalFrame title={`Recibir orden ${order.number}`} onClose={() => setExpandedOrderId(null)} maxWidth="md:max-w-6xl">
                  <div className="mb-4 grid gap-2 rounded-md border border-line bg-paper p-3 text-sm sm:grid-cols-3">
                    <p><span className="block text-xs text-neutral-500">Proveedor</span><strong>{order.party?.name || "--"}</strong></p>
                    <p><span className="block text-xs text-neutral-500">Bodega destino</span><strong>{order.metadata?.warehouse_name || "--"}</strong></p>
                    <p><span className="block text-xs text-neutral-500">Estado</span><strong>{statusLabels[order.status] || order.status}</strong></p>
                  </div>
                  <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm font-medium">
                    <input
                      checked={pendingLines.length > 0 && pendingLines.every((line) => Number(quantities[line.id] || 0) === Number(line.pending_quantity ?? line.qty))}
                      disabled={saving || pendingLines.length === 0}
                      onChange={(event) => setReceiveAll(order, event.target.checked)}
                      type="checkbox"
                    />
                    Recibir todo lo pendiente
                  </label>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-paper text-left text-xs uppercase text-neutral-600">
                        <tr>
                          <th className="px-3 py-2">Posición / producto</th>
                          <th className="px-3 py-2 text-right">Pedido</th>
                          <th className="px-3 py-2 text-right">Recibido</th>
                          <th className="px-3 py-2 text-right">Pendiente</th>
                          <th className="px-3 py-2">Recibir ahora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line, index) => {
                          const pending = Number(line.pending_quantity ?? line.qty);
                          return (
                            <tr className="border-t border-line" key={line.id}>
                              <td className="px-3 py-3">
                                <p className="font-medium">{index + 1}. {line.description}</p>
                                <p className="text-xs text-neutral-500">SKU #{line.item_id || "—"} · {line.unit || "UND"}</p>
                              </td>
                              <td className="px-3 py-3 text-right">{Number(line.qty).toLocaleString("es-CO")}</td>
                              <td className="px-3 py-3 text-right">{Number(line.received_quantity || 0).toLocaleString("es-CO")}</td>
                              <td className="px-3 py-3 text-right font-semibold">{pending.toLocaleString("es-CO")}</td>
                              <td className="px-3 py-3">
                                <input
                                  aria-label={`Cantidad recibida posición ${index + 1}`}
                                  className="h-10 w-32 rounded-md border border-line px-3"
                                  disabled={pending <= 0 || saving}
                                  max={pending}
                                  min="0"
                                  onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                                  placeholder="0"
                                  step="any"
                                  type="number"
                                  value={quantities[line.id] || ""}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="text-sm font-medium">
                      Observaciones de la recepción
                      <input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" value={notes} />
                    </label>
                    <button className="h-10 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || pendingLines.length === 0} onClick={() => receivePartial(order)} type="button">
                      {saving ? "Registrando..." : "Confirmar cantidades"}
                    </button>
                  </div>
                </ModalFrame>
              ) : null}
            </article>
          );
        })}
        {filteredOrders.length === 0 ? <p className="rounded-md border border-line bg-white p-4 text-neutral-600">No hay órdenes que coincidan con los filtros.</p> : null}
      </section>
    </div>
  );
}
