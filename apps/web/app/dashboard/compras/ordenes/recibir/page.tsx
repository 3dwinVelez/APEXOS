"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ComprasNav } from "@/components/compras-nav";

type PurchaseOrder = { id: number; number: string; status: string; total: number; lines: { id: number; qty: number }[] };

export default function RecibirOCPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const data = await api<PurchaseOrder[]>("/api/v1/purchases/orders");
    setOrders((data || []).filter((o) => ["draft", "sent", "confirmed", "partial"].includes(o.status)));
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
          received_lines: order.lines.map((line) => ({ line_id: line.id, qty_received: line.qty, location_id: 1 }))
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo recibir la orden");
    }
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
              <button className="rounded-md border border-line px-2 py-1 hover:bg-paper" onClick={() => receiveAll(o)} type="button">Recibir completa</button>
            </div>
          ))}
          {orders.length === 0 ? <p className="text-neutral-600">No hay ordenes pendientes.</p> : null}
        </div>
      </section>
    </div>
  );
}

