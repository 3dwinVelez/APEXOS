"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ComprasNav } from "@/components/compras-nav";

type PurchaseOrder = { id: number; number: string; status: string; total: number; metadata?: { warehouse_id?: number }; lines: { id: number; qty: number; pending_quantity?: number; received_quantity?: number }[] };
type Location = { id: number; place_id: number; label: string };

export default function RecibirOCPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);

  async function load() {
    const [data, locationRows] = await Promise.all([api<PurchaseOrder[]>("/api/v1/purchases/orders"), api<Location[]>("/api/v1/inventory/locations")]);
    setOrders((data || []).filter((o) => ["confirmed", "partial", "received"].includes(o.status)));
    setLocations(locationRows);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Error cargando ordenes"));
  }, []);

  async function receiveAll(order: PurchaseOrder) {
    setError("");
    try {
      await api(`/api/v1/purchases/orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          received_lines: order.lines.filter((line) => Number(line.pending_quantity ?? line.qty) > 0).map((line) => ({ line_id: line.id, qty_received: Number(line.pending_quantity ?? line.qty), location_id: locations.find((location) => location.place_id === order.metadata?.warehouse_id)?.id }))
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo recibir la orden");
    }
  }

  async function returnAll(order: PurchaseOrder) {
    const location = locations.find((row) => row.place_id === order.metadata?.warehouse_id);
    if (!location) return setError("La OC no tiene una ubicacion activa en su bodega");
    const reason = window.prompt("Motivo de la devolucion", "Devolucion a proveedor");
    if (reason === null) return;
    try {
      await api(`/api/v1/purchases/orders/${order.id}/return`, { method: "POST", body: JSON.stringify({ reason, returned_lines: order.lines.filter((line) => Number(line.received_quantity || 0) > 0).map((line) => ({ line_id: line.id, qty_returned: Number(line.received_quantity), location_id: location.id })) }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo devolver la mercancia"); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Recibir ordenes de compra</h1>
      <ComprasNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="space-y-2 text-sm">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <span>{o.number} · {o.status} · ${o.total}</span>
              <div className="flex gap-2">{o.status !== "received" ? <button className="rounded-md border border-line px-2 py-1 hover:bg-paper" onClick={() => receiveAll(o)} type="button">Recibir pendiente</button> : null}<button className="rounded-md border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50" disabled={!o.lines.some((line) => Number(line.received_quantity || 0) > 0)} onClick={() => returnAll(o)} type="button">Devolver mercancia</button></div>
            </div>
          ))}
          {orders.length === 0 ? <p className="text-neutral-600">No hay ordenes pendientes.</p> : null}
        </div>
      </section>
    </div>
  );
}

