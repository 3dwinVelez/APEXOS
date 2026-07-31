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
type Account = { id: number; code: string; name: string; active: boolean };

export default function CxcDocumentosPage() {
  const [docs, setDocs] = useState<CxcDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [payment, setPayment] = useState({ amount: 0, method: "bank_transfer", account_id: 0, reference: "", date: new Date().toISOString().slice(0, 10) });
  const [message, setMessage] = useState("");
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
  useEffect(() => {
    api<Account[]>("/api/v1/accounting/accounts").then((rows) => setAccounts((rows || []).filter((row) => row.active !== false && /^(11|1105|1110)/.test(row.code)))).catch(() => setAccounts([]));
  }, []);

  async function registerPayment() {
    const selectedDocs = docs.filter((doc) => selected.includes(doc.id));
    if (!selectedDocs.length || selectedDocs.some((doc) => doc.customer_id !== selectedDocs[0].customer_id)) {
      setMessage("Seleccione facturas abiertas de un mismo cliente");
      return;
    }
    try {
      await api("/api/v1/accounts-receivable/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: selectedDocs[0].customer_id,
          cabdoc_ids: selected,
          ...payment,
          account_id: payment.account_id || undefined
        })
      });
      setMessage("Recaudo contabilizado correctamente");
      setSelected([]);
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar el recaudo");
    }
  }

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
      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm">{message}</p> : null}
      <section className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-6">
        <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={payment.date} onChange={(e) => setPayment((row) => ({ ...row, date: e.target.value }))} />
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={payment.method} onChange={(e) => setPayment((row) => ({ ...row, method: e.target.value }))}>
          <option value="cash">Efectivo</option><option value="bank_transfer">Transferencia bancaria</option><option value="check">Cheque</option><option value="credit_card">Tarjeta</option><option value="other">Otro</option>
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={payment.account_id} onChange={(e) => setPayment((row) => ({ ...row, account_id: Number(e.target.value) }))}>
          <option value={0}>Cuenta caja/banco</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
        <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={0.01} step="0.01" placeholder="Importe" value={payment.amount || ""} onChange={(e) => setPayment((row) => ({ ...row, amount: Number(e.target.value) }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Referencia" value={payment.reference} onChange={(e) => setPayment((row) => ({ ...row, reference: e.target.value }))} />
        <button className="h-10 rounded-md bg-apex px-3 text-sm text-white" type="button" onClick={registerPayment}>Registrar recaudo</button>
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
                <td className="py-2 pr-4 font-mono"><input className="mr-2" type="checkbox" disabled={doc.balance <= 0.01} checked={selected.includes(doc.id)} onChange={(e) => setSelected((rows) => e.target.checked ? [...rows, doc.id] : rows.filter((id) => id !== doc.id))} />{doc.number}</td>
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
