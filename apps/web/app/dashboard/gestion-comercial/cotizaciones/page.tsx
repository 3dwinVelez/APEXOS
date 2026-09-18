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
  new Date(value).toLocaleDateString("es-CO", { dateStyle: "medium" });
const statusLabels: Record<string, string> = {
  OPEN: "Abierta",
  EXPIRED: "Vencida",
  CONVERTED: "Con pedido",
  CANCELLED: "Cancelada",
};

export default function QuotationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      setRows(
        await api<Row[]>("/api/v1/commercial-management/quotations", {
          cache: "no-store",
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible consultar las cotizaciones.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const advisors = useMemo(
    () => [
      ...new Map(
        rows.map((row) => [String(row.advisor_id), row.advisor]),
      ).entries(),
    ],
    [rows],
  );
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es");
    return rows.filter((row) => {
      const searchable = [
        row.quotation_number,
        row.customer?.legal_name,
        row.customer?.identification,
        row.advisor?.name,
        row.advisor?.code,
      ]
        .join(" ")
        .toLocaleLowerCase("es");
      return (
        (!text || searchable.includes(text)) &&
        (!status || row.display_status === status) &&
        (!advisor || String(row.advisor_id) === advisor)
      );
    });
  }, [rows, query, status, advisor]);
  async function openDetail(row: Row) {
    try {
      setSelected(
        await api<Row>(`/api/v1/commercial-management/quotations/${row.id}`, {
          cache: "no-store",
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible cargar la cotización.",
      );
    }
  }
  function download(row: Row) {
    downloadCommercialDocumentPdf({
      kind: "COTIZACION",
      number: row.quotation_number,
      date: row.quotation_date,
      valid_until: row.valid_until,
      status: row.display_status || row.status,
      customer: row.customer,
      advisor: row.advisor,
      lines: row.lines,
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      notes: row.notes,
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
            <h1 className="text-2xl font-semibold">Cotizaciones</h1>
            <p className="text-sm text-neutral-600">
              Consulta oportunidades abiertas, vencidas o convertidas en pedido.
            </p>
          </div>
          <p className="text-sm font-semibold">
            {filtered.length} de {rows.length} cotizaciones
          </p>
        </div>
      </header>
      {message ? (
        <div className="rounded-md border border-line bg-white p-3 text-sm">
          {message}
        </div>
      ) : null}
      <section className="apex-section-card overflow-hidden">
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-neutral-400"
              size={16}
            />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Número, cliente o asesor"
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Asesor</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  className="border-t border-line hover:bg-paper/60"
                  key={row.id}
                >
                  <td className="px-4 py-3">
                    <button
                      className="font-semibold text-apex hover:underline"
                      onDoubleClick={() => void openDetail(row)}
                      title="Doble clic para ver detalle"
                      type="button"
                    >
                      {row.quotation_number}
                    </button>
                  </td>
                  <td className="px-4 py-3">{date(row.quotation_date)}</td>
                  <td className="px-4 py-3">{date(row.valid_until)}</td>
                  <td className="px-4 py-3">{row.customer?.legal_name}</td>
                  <td className="px-4 py-3">{row.advisor?.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {money.format(Number(row.total))}
                  </td>
                  <td className="px-4 py-3">
                    {statusLabels[row.display_status] || row.display_status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-3 text-xs font-semibold text-apex"
                      onClick={() => download(row)}
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
              No hay cotizaciones que coincidan con los filtros.
            </p>
          ) : null}
        </div>
      </section>
      {selected ? (
        <QuotationDetail
          row={selected}
          onClose={() => setSelected(null)}
          onDownload={() => download(selected)}
        />
      ) : null}
    </div>
  );
}

function QuotationDetail({
  row,
  onClose,
  onDownload,
}: {
  row: Row;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [showOrder, setShowOrder] = useState(false);
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
                Detalle de cotización
              </p>
              <h2 className="text-xl font-semibold">{row.quotation_number}</h2>
              <p className="text-sm text-neutral-600">
                Emitida {date(row.quotation_date)} · vence{" "}
                {date(row.valid_until)}
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
              <strong>{row.customer?.legal_name}</strong>
            </p>
            <p>
              <span className="block text-xs text-neutral-500">Asesor</span>
              <strong>{row.advisor?.name}</strong>
            </p>
            <p>
              <span className="block text-xs text-neutral-500">Estado</span>
              {statusLabels[row.display_status || row.status] || row.status}
            </p>
            <div>
              <span className="block text-xs text-neutral-500">
                Pedido generado
              </span>
              {row.sales_order ? (
                <button
                  className="font-semibold text-apex underline-offset-2 hover:underline"
                  onDoubleClick={() => setShowOrder(true)}
                  title="Doble clic para ver el pedido"
                  type="button"
                >
                  {row.sales_order.order_number}
                </button>
              ) : (
                "Sin pedido"
              )}
            </div>
          </div>
          {row.notes ? <div className="mt-4 whitespace-pre-wrap rounded-md bg-paper p-3 text-sm"><strong>Observaciones</strong><p>{row.notes}</p></div> : null}
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[620px] text-sm">
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
                {row.lines?.map((line: Row) => (
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
              Total {money.format(Number(row.total))}
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
      {showOrder && row.sales_order ? (
        <GeneratedOrderDetail
          order={row.sales_order}
          customer={row.customer}
          advisor={row.advisor}
          quotationNumber={row.quotation_number}
          onClose={() => setShowOrder(false)}
        />
      ) : null}
    </>
  );
}

function GeneratedOrderDetail({
  order,
  customer,
  advisor,
  quotationNumber,
  onClose,
}: {
  order: Row;
  customer: Row;
  advisor: Row;
  quotationNumber: string;
  onClose: () => void;
}) {
  const download = () =>
    downloadCommercialDocumentPdf({
      kind: "PEDIDO",
      number: order.order_number,
      date: order.order_date,
      status: order.status,
      customer,
      advisor,
      lines: order.lines,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      notes: order.notes,
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
              Pedido generado desde {quotationNumber}
            </p>
            <h2 className="text-xl font-semibold">{order.order_number}</h2>
            <p className="text-sm text-neutral-600">
              {order.order_date
                ? date(order.order_date)
                : "Fecha no disponible"}{" "}
              · {order.status || "Registrado"}
            </p>
          </div>
          <button
            aria-label="Cerrar pedido"
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
        <div className="mt-4 flex items-center justify-between gap-3">
          <strong className="text-xl">
            Total {money.format(Number(order.total))}
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
