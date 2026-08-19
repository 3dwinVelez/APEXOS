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
  receipt_accounting_documents?: AccountingDocument[];
};

type AccountingDocument = { id: number; full_number: string; operation_type?: "receipt" | "return"; is_reversal?: boolean; posting_date: string; total_debit: number; total_credit?: number; header_text?: string; created_at?: string; created_by_user?: { name: string; email: string } | null; operational_lines?: Array<{ movement_id: number; purchase_order_line_id?: number; sku: string; description: string; qty: number; unit: string; cost: number }>; lines?: Array<{ id: number; account_code: string; description: string; debit: number; credit: number }> };

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
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [returnOrder, setReturnOrder] = useState<PurchaseOrder | null>(null);
  const [returnReason, setReturnReason] = useState("Devolución a proveedor");
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});
  const [selectedAccountingDocument, setSelectedAccountingDocument] = useState<AccountingDocument | null>(null);
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
    const activeOrders = (data || []).filter((order) => ["confirmed", "partial", "received"].includes(order.status));
    setOrders(activeOrders);
    setLocations(locationRows || []);
    return activeOrders;
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

  async function receivePartial(order: PurchaseOrder, continueNext = false) {
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
      const refreshed = await load();
      if (continueNext) {
        const next = refreshed.find((candidate) => candidate.id !== order.id && ["confirmed", "partial"].includes(candidate.status));
        if (next) openReceipt(next);
        else setOk((current) => `${current} No quedan otras OC pendientes.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la recepción");
    } finally {
      setSaving(false);
    }
  }

  function openReturn(order: PurchaseOrder) {
    setError("");
    setOk("");
    setReturnReason("Devolución a proveedor");
    setReturnQuantities({});
    setReturnOrder(order);
  }

  async function returnMerchandise() {
    const order = returnOrder;
    if (!order) return;
    const location = locations.find((row) => row.place_id === order.metadata?.warehouse_id);
    if (!location) return setError("La OC no tiene una ubicación activa en su bodega");
    const reason = returnReason.trim();
    if (reason.length < 3) return setError("Escribe el motivo de la devolución");
    const returnedLines = order.lines.flatMap((line) => {
      const quantity = Number(returnQuantities[line.id] || 0);
      return quantity > 0 ? [{ line_id: line.id, qty_returned: quantity, location_id: location.id }] : [];
    });
    if (!returnedLines.length) return setError("Ingresa al menos una cantidad a devolver mayor a cero.");
    const invalidLine = order.lines.find((line) => Number(returnQuantities[line.id] || 0) > Number(line.received_quantity || 0) + 0.0001);
    if (invalidLine) return setError(`La devolución de ${invalidLine.description} supera lo recibido pendiente de devolver.`);
    setSaving(true);
    try {
      const result = await api<{ accounting_document?: { full_number?: string } }>(`/api/v1/purchases/orders/${order.id}/return`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          returned_lines: returnedLines
        })
      });
      setOk(`Devolución de ${order.number} registrada correctamente${result.accounting_document?.full_number ? ` y contabilizada como ${result.accounting_document.full_number}` : ""}.`);
      setReturnOrder(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo devolver la mercancía");
    } finally {
      setSaving(false);
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
                    <button className="font-semibold text-apex underline-offset-2 hover:underline" onDoubleClick={() => setSelectedOrder(order)} title="Doble clic para ver el detalle de la orden" type="button">{order.number}</button>
                    <span className="rounded-full bg-paper px-2 py-1 text-xs font-medium">{statusLabels[order.status] || order.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    {order.party?.name || "Proveedor"} · {order.metadata?.warehouse_name || "Bodega destino"} · ${Number(order.total || 0).toLocaleString("es-CO")}
                  </p>
                  {order.receipt_accounting_documents?.length ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="text-neutral-500">Documentos:</span>{order.receipt_accounting_documents.map((row) => <button className={`rounded border px-2 py-1 font-mono ${row.operation_type === "return" || row.is_reversal ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}`} key={row.id} onDoubleClick={() => setSelectedAccountingDocument(row)} title="Doble clic para ver documento y contabilización" type="button">{row.operation_type === "return" || row.is_reversal ? "Devolución" : "Entrada"} {row.full_number}</button>)}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.status !== "received" ? (
                    <button className="rounded-md bg-apex px-3 py-2 text-sm font-semibold text-white" onClick={() => openReceipt(order)} type="button">
                      Registrar recepción
                    </button>
                  ) : null}
                  <button className="rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50" disabled={!order.lines.some((line) => Number(line.received_quantity || 0) > 0)} onClick={() => openReturn(order)} type="button">
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
                                  onFocus={(event) => { if (Number(event.currentTarget.value) === 0) event.currentTarget.select(); }}
                                  onBlur={(event) => { if (event.currentTarget.value.trim() === "") setQuantities((current) => ({ ...current, [line.id]: "0" })); }}
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
                    <button className="h-10 rounded-md border border-apex px-4 text-sm font-semibold text-apex disabled:opacity-50" disabled={saving || pendingLines.length === 0} onClick={() => receivePartial(order, true)} type="button">Confirmar y siguiente OC</button>
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
      {selectedOrder ? (
        <ModalFrame title={`Orden de compra ${selectedOrder.number}`} onClose={() => setSelectedOrder(null)} maxWidth="md:max-w-6xl">
          <div className="space-y-4">
            <section className="grid gap-3 rounded-md border border-line bg-paper p-3 text-sm md:grid-cols-4">
              <p><span className="block text-xs text-neutral-500">Proveedor</span>{selectedOrder.party?.name || "--"}</p>
              <p><span className="block text-xs text-neutral-500">Fecha</span>{new Date(selectedOrder.date).toLocaleString("es-CO")}</p>
              <p><span className="block text-xs text-neutral-500">Bodega destino</span>{selectedOrder.metadata?.warehouse_name || "--"}</p>
              <p><span className="block text-xs text-neutral-500">Estado</span>{statusLabels[selectedOrder.status] || selectedOrder.status}</p>
            </section>
            <section className="overflow-x-auto rounded-md border border-line"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Pos.</th><th className="px-3 py-2">SKU / producto</th><th className="px-3 py-2 text-right">Pedido</th><th className="px-3 py-2 text-right">Recibido</th><th className="px-3 py-2 text-right">Pendiente</th></tr></thead><tbody>{selectedOrder.lines.map((line, index) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2"><span className="font-mono">{line.item_id || "--"}</span> · {line.description}</td><td className="px-3 py-2 text-right">{line.qty} {line.unit || "UND"}</td><td className="px-3 py-2 text-right">{line.received_quantity || 0}</td><td className="px-3 py-2 text-right">{line.pending_quantity ?? line.qty}</td></tr>)}</tbody></table></section>
            {selectedOrder.receipt_accounting_documents?.length ? <section className="rounded-md border border-line p-3"><p className="mb-2 text-sm font-medium">Documentos de mercancía</p><div className="flex flex-wrap gap-2">{selectedOrder.receipt_accounting_documents.map((document) => <button className={`rounded-md border px-3 py-2 text-sm font-mono ${document.operation_type === "return" || document.is_reversal ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}`} key={document.id} onDoubleClick={() => setSelectedAccountingDocument(document)} title="Doble clic para abrir el documento y su contabilización" type="button">{document.operation_type === "return" || document.is_reversal ? "Devolución" : "Entrada"} {document.full_number}</button>)}</div><p className="mt-2 text-xs text-neutral-500">Haz doble clic en el número para consultar su detalle.</p></section> : null}
          </div>
        </ModalFrame>
      ) : null}
      {returnOrder ? (
        <ModalFrame title={`Devolver mercancía - ${returnOrder.number}`} onClose={() => !saving && setReturnOrder(null)} maxWidth="md:max-w-4xl">
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Puedes devolver una o varias posiciones de forma parcial. Cada cantidad disminuirá el stock y quedará registrada en el kardex junto con su documento contable inverso.</div>
            <div className="overflow-x-auto rounded-md border border-line"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Pos.</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Disponible para devolver</th><th className="px-3 py-2 text-right">Devolver ahora</th></tr></thead><tbody>{returnOrder.lines.filter((line) => Number(line.received_quantity || 0) > 0).map((line, index) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right font-medium">{Number(line.received_quantity || 0).toLocaleString("es-CO")} {line.unit || "UND"}</td><td className="px-3 py-2"><input aria-label={`Cantidad a devolver de ${line.description}`} className="ml-auto block h-10 w-32 rounded-md border border-line px-3 text-right" inputMode="decimal" max={Number(line.received_quantity || 0)} min="0" onBlur={(event) => { if (event.target.value === "") setReturnQuantities((current) => ({ ...current, [line.id]: "0" })); }} onChange={(event) => setReturnQuantities((current) => ({ ...current, [line.id]: event.target.value }))} step="any" type="number" value={returnQuantities[line.id] ?? ""} /></td></tr>)}</tbody></table></div>
            <label className="block text-sm font-medium">Motivo de la devolución<textarea autoFocus className="mt-1 min-h-24 w-full rounded-md border border-line p-3 font-normal" maxLength={500} onChange={(event) => setReturnReason(event.target.value)} value={returnReason} /></label>
            <div className="flex justify-end gap-2"><button className="h-10 rounded-md border border-line px-4 text-sm" disabled={saving} onClick={() => setReturnOrder(null)} type="button">Cancelar</button><button className="h-10 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || returnReason.trim().length < 3} onClick={returnMerchandise} type="button">{saving ? "Registrando..." : "Confirmar devolución"}</button></div>
          </div>
        </ModalFrame>
      ) : null}
      {selectedAccountingDocument ? (
        <ModalFrame title={`${selectedAccountingDocument.operation_type === "return" || selectedAccountingDocument.is_reversal ? "Devolución" : "Entrada"} ${selectedAccountingDocument.full_number}`} onClose={() => setSelectedAccountingDocument(null)} maxWidth="md:max-w-5xl">
          <div className="space-y-4">
            <section className="grid gap-3 rounded-md border border-line bg-paper p-3 text-sm md:grid-cols-4"><p><span className="block text-xs text-neutral-500">Documento</span><strong>{selectedAccountingDocument.full_number}</strong></p><p><span className="block text-xs text-neutral-500">Tipo</span>{selectedAccountingDocument.operation_type === "return" || selectedAccountingDocument.is_reversal ? "Devolución de mercancía" : "Entrada de mercancía"}</p><p><span className="block text-xs text-neutral-500">Contabilización</span>{new Date(selectedAccountingDocument.posting_date).toLocaleString("es-CO")}</p><p><span className="block text-xs text-neutral-500">Usuario</span>{selectedAccountingDocument.created_by_user?.name || selectedAccountingDocument.created_by_user?.email || "--"}</p></section>
            <p className="text-sm"><span className="font-medium">Concepto:</span> {selectedAccountingDocument.header_text || "--"}</p>
            <section><h3 className="mb-2 text-sm font-semibold">Posiciones de mercancía</h3><div className="overflow-x-auto rounded-md border border-line"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Costo unitario</th></tr></thead><tbody>{selectedAccountingDocument.operational_lines?.map((line) => <tr className="border-b border-line/70" key={line.movement_id}><td className="px-3 py-2 font-mono">{line.sku}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">{Number(line.qty).toLocaleString("es-CO")} {line.unit}</td><td className="px-3 py-2 text-right">{Number(line.cost).toLocaleString("es-CO")}</td></tr>)}</tbody></table>{!selectedAccountingDocument.operational_lines?.length ? <p className="p-3 text-sm text-neutral-500">Este documento histórico no tiene movimientos físicos enlazados.</p> : null}</div></section>
            <section className="overflow-x-auto rounded-md border border-line"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Cuenta</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2 text-right">Débito</th><th className="px-3 py-2 text-right">Crédito</th></tr></thead><tbody>{selectedAccountingDocument.lines?.map((line) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2 font-mono">{line.account_code}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">{Number(line.debit || 0).toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">{Number(line.credit || 0).toLocaleString("es-CO")}</td></tr>)}</tbody></table></section>
            <div className="flex justify-end text-sm font-semibold"><span>Débitos {Number(selectedAccountingDocument.total_debit || 0).toLocaleString("es-CO")} · Créditos {Number(selectedAccountingDocument.total_credit || 0).toLocaleString("es-CO")}</span></div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
