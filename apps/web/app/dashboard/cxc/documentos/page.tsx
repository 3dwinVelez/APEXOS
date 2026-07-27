"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CxcNav } from "@/components/cxc-nav";

type CxcDoc = {
  id: number; number: string; document_kind: string; document_class: string;
  customer_id: number; customer_reference: string;
  posting_date: string; due_date: string;
  subtotal: number; tax_total: number; total: number; balance: number; status: string;
};

export default function CxcDocumentosPage() {
  const [docs, setDocs] = useState<CxcDoc[]>([]);
  const [loading, setLoading] = useState(true);
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
                <td className="py-2 pr-4 font-mono">{doc.number}</td>
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
    </div>
  );
}
