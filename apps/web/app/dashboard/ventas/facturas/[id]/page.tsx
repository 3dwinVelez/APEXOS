"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";

type InvoiceDetail = {
  id: number; number: string; date: string; due_date: string; due_term: string;
  subtotal: number; tax_total: number; retention_total: number; discount_total: number;
  total: number; balance: number; status: string; header_text: string;
  society_code: string; branch_code: string; cost_center_code: string; notes: string;
  customer: { id: number; name: string; legal_name?: string; tax_id?: string; email?: string; balance: number; credit_limit: number };
  lines: Array<{ id: number; line_no: number; item: { id: number; code: string; name: string } | null; description: string; qty: number; unit: string; unit_price: number; discount: number; subtotal: number; tax_rate: number; tax_amount: number; total: number; place: { id: number; code: string; name: string } | null; customer_invoice_number: string | null }>;
  cxc: { id: number; number: string; balance: number; status: string; lines: Array<{ account_code: string; movement: string; amount: number; description: string }> } | null;
};

export default function FacturaDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  function load() {
    setLoading(true);
    api<InvoiceDetail>(`/api/v1/sales/invoices/${id}`)
      .then(setInvoice)
      .catch((err) => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  async function handleCancel() {
    if (!confirm("¿Anular esta factura? Se revertirá inventario y CxC.")) return;
    setCancelling(true);
    setError("");
    try {
      await api(`/api/v1/sales/invoices/${id}/cancel`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al anular");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <div className="space-y-4"><h1 className="text-3xl font-semibold">Factura</h1><VentasNav /><p className="text-sm text-neutral-500">Cargando...</p></div>;
  if (error) return <div className="space-y-4"><h1 className="text-3xl font-semibold">Factura</h1><VentasNav /><p className="text-sm text-red-700">{error}</p></div>;
  if (!invoice) return <div className="space-y-4"><h1 className="text-3xl font-semibold">Factura</h1><VentasNav /><p className="text-sm text-neutral-500">No encontrada</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Factura {invoice.number}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${invoice.status === "issued" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          {invoice.status === "issued" ? "Emitida" : "Anulada"}
        </span>
      </div>
      <VentasNav />

      {/* Customer info */}
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <p className="text-neutral-500">Cliente</p>
            <p className="font-semibold">{invoice.customer.legal_name || invoice.customer.name}</p>
            <p className="text-neutral-500">{invoice.customer.tax_id ? `NIT: ${invoice.customer.tax_id}` : ""}</p>
            {invoice.customer.email && <p className="text-neutral-500">{invoice.customer.email}</p>}
            <p className="mt-1 text-xs">Saldo: <strong>${invoice.customer.balance.toLocaleString()}</strong> / Crédito: ${(invoice.customer.credit_limit || 0).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p>Fecha: <strong>{new Date(invoice.date).toLocaleDateString()}</strong></p>
            <p>Vence: <strong>{new Date(invoice.due_date).toLocaleDateString()}</strong> ({invoice.due_term})</p>
            <p>Sociedad: {invoice.society_code} / Sucursal: {invoice.branch_code}</p>
            <p>Concepto: {invoice.header_text}</p>
          </div>
        </div>
      </section>

      {/* Lines */}
      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Detalle</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-neutral-600">
              <th className="py-2 pr-4 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Producto</th>
              <th className="py-2 pr-4 font-medium">Cant</th>
              <th className="py-2 pr-4 font-medium">Precio</th>
              <th className="py-2 pr-4 font-medium">Dto</th>
              <th className="py-2 pr-4 font-medium">Neto</th>
              <th className="py-2 pr-4 font-medium">IVA</th>
              <th className="py-2 pr-4 font-medium">Total</th>
              <th className="py-2 pr-4 font-medium">Bodega</th>
              <th className="py-2 pr-4 font-medium">Fact. cliente</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-line">
                <td className="py-2 pr-4">{line.line_no}</td>
                <td className="py-2 pr-4">{line.item?.code || ""} · {line.description}</td>
                <td className="py-2 pr-4">{line.qty} {line.unit}</td>
                <td className="py-2 pr-4 font-mono">${line.unit_price.toFixed(2)}</td>
                <td className="py-2 pr-4">{line.discount}%</td>
                <td className="py-2 pr-4 font-mono">${line.subtotal.toFixed(2)}</td>
                <td className="py-2 pr-4 font-mono">${line.tax_amount.toFixed(2)}</td>
                <td className="py-2 pr-4 font-mono">${line.total.toFixed(2)}</td>
                <td className="py-2 pr-4">{line.place?.code || "—"}</td>
                <td className="py-2 pr-4">{line.customer_invoice_number || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap justify-end gap-4 text-sm">
          <span>Subtotal: <strong className="font-mono">${invoice.subtotal.toFixed(2)}</strong></span>
          {invoice.discount_total > 0 && <span>Dto: <strong className="font-mono">-${invoice.discount_total.toFixed(2)}</strong></span>}
          <span>IVA: <strong className="font-mono">${invoice.tax_total.toFixed(2)}</strong></span>
          {invoice.retention_total > 0 && <span>Retención: <strong className="font-mono">-${invoice.retention_total.toFixed(2)}</strong></span>}
          <span className="text-lg">Total: <strong className="font-mono">${invoice.total.toFixed(2)}</strong></span>
        </div>
      </section>

      {/* CxC */}
      {invoice.cxc && (
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="mb-3 font-semibold">Cuenta por cobrar (CxC)</h2>
          <p className="text-sm">Documento: <strong>{invoice.cxc.number}</strong> — Saldo: <strong className={invoice.cxc.balance > 0 ? "text-amber-700" : "text-emerald-700"}>${invoice.cxc.balance.toFixed(2)}</strong> — Estado: {invoice.cxc.status}</p>
          {invoice.cxc.lines?.length > 0 && (
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-left text-neutral-600">
                  <th className="py-1 pr-2">Cuenta</th>
                  <th className="py-1 pr-2">Mov.</th>
                  <th className="py-1 pr-2">Valor</th>
                  <th className="py-1 pr-2">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {invoice.cxc.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-1 pr-2 font-mono">{l.account_code}</td>
                    <td className="py-1 pr-2">{l.movement === "debit" ? "Débito" : "Crédito"}</td>
                    <td className="py-1 pr-2 font-mono">${l.amount.toFixed(2)}</td>
                    <td className="py-1 pr-2">{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Actions */}
      {invoice.status === "issued" && (
        <button className="h-10 rounded-md border border-red-300 bg-red-50 px-4 text-sm text-red-700 disabled:opacity-50" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Anulando..." : "Anular factura"}
        </button>
      )}
    </div>
  );
}
