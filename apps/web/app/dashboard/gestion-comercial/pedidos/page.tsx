"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/lib/api";
import { downloadCommercialDocumentPdf } from "@/lib/commercialDocumentPdf";
import { ArrowLeft, Download, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
const inputClass =
  "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
});
const date = (value: string) =>
  new Date(value).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const statusLabels: Record<string, string> = {
  REGISTERED: "Registrado",
  CONFIRMED: "Confirmado",
  INVOICED: "Facturado",
  CANCELLED: "Cancelado",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      setOrders(
        await api<Row[]>("/api/v1/commercial-management/orders", {
          cache: "no-store",
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible consultar los pedidos.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const advisors = useMemo(
    () => [
      ...new Map(
        orders.map((order) => [String(order.advisor_id), order.advisor]),
      ).entries(),
    ],
    [orders],
  );
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      const created = new Date(order.order_date);
      const searchable = [
        order.order_number,
        order.customer?.legal_name,
        order.customer?.identification,
        order.advisor?.name,
        order.advisor?.code,
      ]
        .join(" ")
        .toLocaleLowerCase("es");
      return (
        (!text || searchable.includes(text)) &&
        (!status || order.status === status) &&
        (!advisor || String(order.advisor_id) === advisor) &&
        (!from || created >= new Date(`${from}T00:00:00-05:00`)) &&
        (!to || created <= new Date(`${to}T23:59:59-05:00`))
      );
    });
  }, [orders, query, status, advisor, from, to]);
  async function openDetail(order: Row) {
    try {
      setSelected(
        await api<Row>(`/api/v1/commercial-management/orders/${order.id}`, {
          cache: "no-store",
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible cargar el detalle del pedido.",
      );
    }
  }
  function download(order: Row) {
    downloadCommercialDocumentPdf({
      kind: "PEDIDO",
      number: order.order_number,
      date: order.order_date,
      status: order.status,
      customer: order.customer,
      advisor: order.advisor,
      lines: order.lines,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      notes: order.notes,
    });
  }
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-5">
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-apex"
          href="/dashboard/gestion-comercial"
        >
          <ArrowLeft size={15} />
          Volver
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Pedidos generados</h1>
            <p className="text-sm text-neutral-600">
              Consulta la venta registrada y abre el detalle con doble clic
              sobre el número del pedido.
            </p>
          </div>
          <p className="text-sm font-semibold">
            {filtered.length} de {orders.length} pedidos
          </p>
        </div>
      </header>
      {message ? (
        <div className="rounded-md border border-line bg-white p-3 text-sm">
          {message}
        </div>
      ) : null}
      <section className="apex-section-card overflow-hidden">
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-neutral-400"
              size={16}
            />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Número, cliente, identificación o asesor"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className={inputClass}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={advisor}
            onChange={(event) => setAdvisor(event.target.value)}
          >
            <option value="">Todos los asesores</option>
            {advisors.map(([id, item]) => (
              <option key={id} value={id}>
                {item?.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Fecha inicial"
            className={inputClass}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <input
            aria-label="Fecha final"
            className={inputClass}
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Fecha de creación</th>
                <th className="px-4 py-3">Número de pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Asesor</th>
                <th className="px-4 py-3 text-right">Cantidades</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr
                  className="border-t border-line hover:bg-paper/60"
                  key={order.id}
                >
                  <td className="px-4 py-3">{date(order.order_date)}</td>
                  <td className="px-4 py-3">
                    <button
                      className="font-semibold text-apex underline-offset-2 hover:underline"
                      title="Doble clic para ver el detalle"
                      onDoubleClick={() => void openDetail(order)}
                      type="button"
                    >
                      {order.order_number}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <strong>{order.customer?.legal_name}</strong>
                    <p className="text-xs text-neutral-500">
                      {order.customer?.identification}
                    </p>
                  </td>
                  <td className="px-4 py-3">{order.advisor?.name}</td>
                  <td className="px-4 py-3 text-right">
                    {order.lines?.reduce(
                      (sum: number, line: Row) => sum + Number(line.quantity),
                      0,
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {money.format(Number(order.total))}
                  </td>
                  <td className="px-4 py-3">
                    {statusLabels[order.status] || order.status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      aria-label={`Descargar ${order.order_number}`}
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-3 text-xs font-semibold text-apex"
                      onClick={() => download(order)}
                      type="button"
                    >
                      <Download size={14} />
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="p-8 text-center text-sm text-neutral-500">
              No hay pedidos que coincidan con los filtros.
            </p>
          ) : null}
        </div>
      </section>
      {selected ? (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onDownload={() => download(selected)}
        />
      ) : null}
    </div>
  );
}

function OrderDetail({
  order,
  onClose,
  onDownload,
}: {
  order: Row;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [showQuotation, setShowQuotation] = useState(false);
  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-apex">
                Detalle del pedido
              </p>
              <h2 className="text-xl font-semibold">{order.order_number}</h2>
              <p className="text-sm text-neutral-600">
                {date(order.order_date)} ·{" "}
                {statusLabels[order.status] || order.status}
              </p>
            </div>
            <button
              aria-label="Cerrar detalle"
              className="rounded-md border border-line p-2"
              onClick={onClose}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 rounded-md bg-paper p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="block text-xs text-neutral-500">Cliente</span>
              <strong>{order.customer?.legal_name}</strong>
            </p>
            <p>
              <span className="block text-xs text-neutral-500">Asesor</span>
              <strong>{order.advisor?.name}</strong>
            </p>
            <p>
              <span className="block text-xs text-neutral-500">
                Identificación
              </span>
              {order.customer?.identification || "—"}
            </p>
            <div>
              <span className="block text-xs text-neutral-500">
                Cotización origen
              </span>
              {order.quotation ? (
                <button
                  className="font-semibold text-apex underline-offset-2 hover:underline"
                  onDoubleClick={() => setShowQuotation(true)}
                  title="Doble clic para ver la cotización"
                  type="button"
                >
                  {order.quotation.quotation_number}
                </button>
              ) : (
                "Pedido directo"
              )}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="bg-paper text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines?.map((line: Row) => (
                  <tr className="border-t border-line" key={line.id}>
                    <td className="px-3 py-3 font-mono">{line.product_code}</td>
                    <td className="px-3 py-3">{line.product_name}</td>
                    <td className="px-3 py-3 text-right">
                      {Number(line.quantity)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {money.format(Number(line.unit_price))}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {money.format(Number(line.line_total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <strong className="text-xl">
              Total {money.format(Number(order.total))}
            </strong>
            <button
              className="apex-primary-action inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
              onClick={onDownload}
              type="button"
            >
              <Download size={16} />
              Descargar PDF
            </button>
          </div>
        </div>
      </div>
      {showQuotation && order.quotation ? (
        <QuotationOriginDetail
          quotation={order.quotation}
          customer={order.customer}
          advisor={order.advisor}
          onClose={() => setShowQuotation(false)}
        />
      ) : null}
    </>
  );
}

function QuotationOriginDetail({
  quotation,
  customer,
  advisor,
  onClose,
}: {
  quotation: Row;
  customer: Row;
  advisor: Row;
  onClose: () => void;
}) {
  const download = () =>
    downloadCommercialDocumentPdf({
      kind: "COTIZACION",
      number: quotation.quotation_number,
      date: quotation.quotation_date,
      valid_until: quotation.valid_until,
      status: quotation.status,
      customer,
      advisor,
      lines: quotation.lines,
      subtotal: quotation.subtotal,
      discount: quotation.discount,
      total: quotation.total,
      notes: quotation.notes,
    });
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-apex">
              Cotización origen
            </p>
            <h2 className="text-xl font-semibold">
              {quotation.quotation_number}
            </h2>
            <p className="text-sm text-neutral-600">
              Emitida {date(quotation.quotation_date)} · vence{" "}
              {date(quotation.valid_until)}
            </p>
          </div>
          <button
            aria-label="Cerrar cotización"
            className="rounded-md border border-line p-2"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-paper text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines?.map((line: Row) => (
                <tr className="border-t border-line" key={line.id}>
                  <td className="px-3 py-3 font-mono">{line.product_code}</td>
                  <td className="px-3 py-3">{line.product_name}</td>
                  <td className="px-3 py-3 text-right">
                    {Number(line.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {money.format(Number(line.unit_price))}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {money.format(Number(line.line_total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <strong className="text-xl">
            Total {money.format(Number(quotation.total))}
          </strong>
          <button
            className="apex-primary-action inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
            onClick={download}
            type="button"
          >
            <Download size={16} />
            Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
