"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type Row = Record<string, any>;
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const date = (value?: string) =>
  value ? new Date(value).toLocaleDateString("es-CO") : "Sin registro";

export function Customer360({ customerId }: { customerId: number }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    api<Row>(`/api/v1/commercial-management/customers/${customerId}/overview`, { cache: "no-store" })
      .then(value => { if (active) setData(value); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [customerId]);
  async function complete(id: number) {
    await api(`/api/v1/commercial-management/commitments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setData(
      await api<Row>(
        `/api/v1/commercial-management/customers/${customerId}/overview`,
      ),
    );
  }
  if (error)
    return (
      <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
    );
  if (!data)
    return (
      <p className="rounded-md bg-paper p-3 text-sm text-neutral-600">
        Cargando información 360 del cliente…
      </p>
    );
  const customer = data.customer;
  return (
    <section className="space-y-3 rounded-lg border border-line p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-apex">
          Resumen 360 antes de iniciar
        </p>
        <h3 className="mt-1 font-semibold">{customer.legal_name}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Cupo disponible"
          value={money.format(Number(customer.credit_capacity || 0))}
        />
        <Metric label="Última compra / pedido" value={date(customer.last_purchase_at)} />
        <Metric label="Última visita" value={date(customer.last_visit_at)} />
        <Metric
          label="Pendientes"
          value={String(customer.commitments?.length || 0)}
        />
      </div>
      <div>
        <h4 className="text-sm font-semibold">Compromisos pendientes</h4>
        {customer.commitments?.length ? (
          <div className="mt-2 space-y-2">
            {customer.commitments.map((item: Row) => (
              <div
                className={`flex items-center justify-between gap-2 rounded-md p-2 text-xs ${new Date(item.due_date) < new Date() ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                key={item.id}
              >
                <span>
                  {item.description} · vence {date(item.due_date)}
                </span>
                <button
                  className="rounded border border-current px-2 py-1 font-semibold"
                  onClick={() => void complete(item.id)}
                  type="button"
                >
                  Cumplir
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            No hay compromisos pendientes.
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">Últimas visitas</h4>
          <div className="mt-1 space-y-1 text-xs">
            {customer.visits?.map((visit: Row) => (
              <p key={visit.id}>
                {date(visit.visit_date)} · {visit.reason?.name || "Sin motivo"}{" "}
                · {visit.result?.name || visit.status}
              </p>
            )) || null}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Últimas compras / pedidos</h4>
          <div className="mt-1 space-y-1 text-xs">
            {customer.orders?.map((order: Row) => (
              <p key={order.id}>
                {date(order.order_date)} · {order.order_number} · {order.status === "REGISTERED" ? "Registrado" : order.status === "CONFIRMED" ? "Confirmado" : "Facturado"} ·{" "}
                {money.format(Number(order.total))}
              </p>
            )) || null}
          </div>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold">
          Productos sugeridos por recurrencia
        </h4>
        {data.suggested_products?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.suggested_products.map((product: Row) => (
              <span
                className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-900"
                key={product.product_id}
              >
                {product.name} · {product.orders} pedidos recientes
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            Aún no hay compras suficientes para generar sugeridos.
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper p-2">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="mt-1 text-xs font-semibold">{value}</p>
    </div>
  );
}
