"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CxcNav } from "@/components/cxc-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type CxcDoc = {
  id: number; number: string; document_kind: string; document_class: string;
  customer_id: number; customer_reference: string;
  posting_date: string; due_date: string;
  subtotal: number; tax_total: number; total: number; balance: number; status: string;
  retention_total?: number; created_at?: string; created_by?: number | null;
  lines?: Array<{ id: number; line_no: number; account_code: string; movement: string; amount: number; description: string; tax_type?: string | null; tax_base?: number; tax_rate?: number; tax_amount?: number }>;
  salesInvoice?: { id: number; number: string; customer?: { name?: string; legal_name?: string; tax_id?: string }; lines?: Array<{ id: number; line_no: number; qty: number; unit: string; unit_price: number; total: number; item?: { code: string; name: string } | null; place?: { code: string; name: string } | null }> } | null;
  accounting_document?: { full_number: string; posting_date: string; created_at: string; created_by_name?: string | null; lines?: Array<{ id: number; line_no: number; account_code: string; description: string; debit: number; credit: number }> } | null;
};
export default function CxcDocumentosPage() {
  const [docs, setDocs] = useState<CxcDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<CxcDoc | null>(null);
  const [filters, setFilters] = useState({ open_only: "false", customer_id: "" });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.open_only === "true") params.set("open_only", "true");
    if (filters.customer_id) params.set("customer_id", filters.customer_id);
    api<CxcDoc[]>(`/api/v1/accounts-receivable/documents?${params.toString()}`)
      .then((res) => setDocs(res || []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [filters.customer_id, filters.open_only]);

  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Cuentas por cobrar</h1>
      <CxcNav />
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filters.open_only === "true"} onChange={(e) => setFilters((p) => ({ ...p, open_only: e.target.checked ? "true" : "false" }))} />
          Solo saldo vivo
        </label>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white p-4">
        <p className="text-sm text-neutral-600">Los recaudos, bancos, aplicaciones parciales y anulaciones se administran desde Tesorería.</p>
        <Link className="inline-flex h-10 items-center rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/tesoreria?direction=receipt">Recibir pago</Link>
      </section>
      {loading ? <p className="text-sm text-neutral-500">Cargando...</p> : docs.length === 0 ? <p className="text-sm text-neutral-500">No hay documentos</p> : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-neutral-600">
              <th className="py-2 pr-4 font-medium">Documento</th>
              <th className="py-2 pr-4 font-medium">Cliente</th>
              <th className="py-2 pr-4 font-medium">Fecha</th>
              <th className="py-2 pr-4 font-medium">Vence</th>
              <th className="py-2 pr-4 font-medium">Total</th>
              <th className="py-2 pr-4 font-medium">Saldo</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} className="border-b border-line hover:bg-paper">
                <td className="py-2 pr-4 font-mono"><button className="text-apex underline-offset-2 hover:underline" onClick={() => setSelectedDocument(doc)} title="Ver detalle del documento" type="button">{doc.number}</button></td>
                <td className="py-2 pr-4">#{doc.customer_id}</td>
                <td className="py-2 pr-4">{new Date(doc.posting_date).toLocaleDateString()}</td>
                <td className="py-2 pr-4">{new Date(doc.due_date).toLocaleDateString()}</td>
                <td className="py-2 pr-4 font-mono">${doc.total.toLocaleString()}</td>
                <td className="py-2 pr-4 font-mono">${doc.balance.toLocaleString()}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${doc.status === "open" ? "bg-amber-100 text-amber-800" : doc.status === "cleared" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>
                    {doc.status === "open" ? "Pendiente" : doc.status === "cleared" ? "Pagado" : doc.status}
                  </span>
                </td>
                <td className="py-2"><Link href={`/dashboard/cxc/clientes/${doc.customer_id}/estado-cuenta`} className="text-apex underline text-xs">Estado cuenta</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedDocument ? (
        <ModalFrame title={`Documento ${selectedDocument.number}`} onClose={() => setSelectedDocument(null)} maxWidth="max-w-6xl">
          <div className="space-y-4">
            <section className="grid gap-3 rounded-md border border-line bg-paper p-3 text-sm md:grid-cols-4">
              <p><span className="block text-xs text-neutral-500">Cliente / NIT</span>{selectedDocument.salesInvoice?.customer?.legal_name || selectedDocument.salesInvoice?.customer?.name || `#${selectedDocument.customer_id}`}<span className="block">{selectedDocument.salesInvoice?.customer?.tax_id || "--"}</span></p>
              <p><span className="block text-xs text-neutral-500">Fecha / vencimiento</span>{new Date(selectedDocument.posting_date).toLocaleDateString("es-CO")}<span className="block">{new Date(selectedDocument.due_date).toLocaleDateString("es-CO")}</span></p>
              <p><span className="block text-xs text-neutral-500">Estado / saldo</span>{selectedDocument.status}<span className="block font-mono">${selectedDocument.balance.toLocaleString("es-CO")}</span></p>
              <p><span className="block text-xs text-neutral-500">Asiento / usuario</span>{selectedDocument.accounting_document?.full_number || "--"}<span className="block">{selectedDocument.accounting_document?.created_by_name || "--"}</span></p>
            </section>
            {selectedDocument.salesInvoice?.lines?.length ? <section className="overflow-x-auto rounded-md border border-line"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Pos.</th><th className="px-3 py-2">SKU / producto</th><th className="px-3 py-2">Bodega</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{selectedDocument.salesInvoice.lines.map((line) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2">{line.line_no}</td><td className="px-3 py-2"><span className="font-mono">{line.item?.code || "--"}</span> · {line.item?.name || "--"}</td><td className="px-3 py-2">{line.place ? `${line.place.code} - ${line.place.name}` : "--"}</td><td className="px-3 py-2 text-right">{line.qty} {line.unit}</td><td className="px-3 py-2 text-right">${line.unit_price.toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">${line.total.toLocaleString("es-CO")}</td></tr>)}</tbody></table></section> : null}
            {selectedDocument.accounting_document?.lines?.length ? <section className="overflow-x-auto rounded-md border border-line"><h3 className="border-b border-line px-3 py-2 font-semibold">Asiento contable</h3><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Cuenta</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2 text-right">Débito</th><th className="px-3 py-2 text-right">Crédito</th></tr></thead><tbody>{selectedDocument.accounting_document.lines.map((line) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2 font-mono">{line.account_code}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">${Number(line.debit || 0).toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">${Number(line.credit || 0).toLocaleString("es-CO")}</td></tr>)}</tbody></table></section> : null}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
