"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";

type Invoice = {
  id: number; number: string; customer: { id: number; name: string; tax_id: string };
  date: string; subtotal: number; tax_total: number; retention_total: number;
  total: number; balance: number; status: string;
  cxc: { id: number; number: string; balance: number; status: string } | null;
};

export default function FacturasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", search: "" });

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    api<Invoice[]>(`/api/v1/sales/invoices?${params.toString()}`)
      .then((res) => setInvoices(res || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filters]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Facturas de venta</h1>
      <VentasNav />
      <div className="flex flex-wrap items-center gap-3">
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="issued">Emitida</option>
          <option value="cancelled">Anulada</option>
        </select>
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Buscar factura o cliente" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
        <Link href="/dashboard/ventas/facturas/nueva" className="ml-auto h-10 rounded-md bg-apex px-4 text-sm text-white inline-flex items-center">
          + Nueva factura
        </Link>
      </div>
      {loading ? <p className="text-sm text-neutral-500">Cargando...</p> : invoices.length === 0 ? <p className="text-sm text-neutral-500">No hay facturas</p> : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-neutral-600">
              <th className="py-2 pr-4 font-medium">Número</th>
              <th className="py-2 pr-4 font-medium">Cliente</th>
              <th className="py-2 pr-4 font-medium">Fecha</th>
              <th className="py-2 pr-4 font-medium">Total</th>
              <th className="py-2 pr-4 font-medium">Saldo CxC</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-line hover:bg-paper">
                <td className="py-2 pr-4 font-mono">{inv.number}</td>
                <td className="py-2 pr-4">{inv.customer?.name || `#${inv.customer?.id}`}</td>
                <td className="py-2 pr-4">{new Date(inv.date).toLocaleDateString()}</td>
                <td className="py-2 pr-4">${inv.total.toLocaleString()}</td>
                <td className="py-2 pr-4">{inv.cxc ? `$${inv.cxc.balance.toLocaleString()}` : "—"}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${inv.status === "issued" ? "bg-emerald-100 text-emerald-800" : inv.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-600"}`}>
                    {inv.status === "issued" ? "Emitida" : inv.status === "cancelled" ? "Anulada" : "Borrador"}
                  </span>
                </td>
                <td className="py-2"><Link href={`/dashboard/ventas/facturas/${inv.id}`} className="text-apex underline">Ver</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
