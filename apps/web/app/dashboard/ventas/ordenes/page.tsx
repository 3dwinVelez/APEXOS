"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";

type SaleOrder = { id: number; number: string; status: string; total: number; party: { name: string } };

export default function OrdenesVentaPage() {
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SaleOrder[]>("/api/v1/sales/orders")
      .then((rows) => setOrders(rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Error cargando órdenes"));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Órdenes de venta</h1>
      <VentasNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="space-y-2 text-sm">
          {orders.map((o) => (
            <div key={o.id} className="rounded-md border border-line px-3 py-2">
              {o.number} · {o.status} · ${o.total} · {o.party.name || "Sin cliente"}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

