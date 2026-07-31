"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type StatementRow = {
  date: string; type: string; number: string; reference: string;
  debit: number; credit: number; balance: number; status: string;
  is_payment: boolean; running_balance: number;
};

type Statement = {
  customer: { id: number; name: string; tax_id: string };
  total_balance: number; credit_limit: number; credit_days: number;
  statement: StatementRow[];
};

export default function EstadoCuentaPage() {
  const { id } = useParams();
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Statement>(`/api/v1/accounts-receivable/customers/${id}/statement`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-neutral-500">Cargando...</p>;
  if (!data) return <p className="text-sm text-red-700">No se pudo cargar estado de cuenta</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Estado de cuenta</h1>
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <p className="text-neutral-500">Cliente</p>
            <p className="font-semibold">{data.customer.name}</p>
            <p className="text-neutral-500">{data.customer.tax_id ? `NIT: ${data.customer.tax_id}` : ""}</p>
          </div>
          <div className="text-right">
            <p>Saldo total: <strong className={data.total_balance > 0 ? "text-amber-700" : "text-emerald-700"}>${data.total_balance.toLocaleString()}</strong></p>
            <p>Crédito: ${(data.credit_limit || 0).toLocaleString()}</p>
            <p>Días crédito: {data.credit_days || 0}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Movimientos</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-neutral-600">
              <th className="py-2 pr-4 font-medium">Fecha</th>
              <th className="py-2 pr-4 font-medium">Tipo</th>
              <th className="py-2 pr-4 font-medium">Número</th>
              <th className="py-2 pr-4 font-medium">Referencia</th>
              <th className="py-2 pr-4 font-medium">Débito</th>
              <th className="py-2 pr-4 font-medium">Crédito</th>
              <th className="py-2 pr-4 font-medium">Saldo corrido</th>
            </tr>
          </thead>
          <tbody>
            {data.statement.map((row, i) => (
              <tr key={i} className={`border-b border-line ${row.is_payment ? "bg-blue-50" : ""}`}>
                <td className="py-2 pr-4">{new Date(row.date).toLocaleDateString()}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${row.is_payment ? "bg-blue-100 text-blue-800" : row.type === "NOTA_CREDITO" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {row.is_payment ? "Pago" : row.type === "NOTA_CREDITO" ? "NC" : "Factura"}
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono">{row.number}</td>
                <td className="py-2 pr-4">{row.reference || "—"}</td>
                <td className="py-2 pr-4 font-mono">${row.debit > 0 ? row.debit.toFixed(2) : ""}</td>
                <td className="py-2 pr-4 font-mono">${row.credit > 0 ? row.credit.toFixed(2) : ""}</td>
                <td className="py-2 pr-4 font-mono">${row.running_balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
