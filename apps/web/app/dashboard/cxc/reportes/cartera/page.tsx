"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CxcNav } from "@/components/cxc-nav";

type AgingDoc = {
  id: number; number: string; customer: { id: number; name: string; tax_id: string } | null;
  date: string; due_date: string; total: number; balance: number;
  days_overdue: number; bucket: string;
};

type AgingReport = {
  date: string; documents: AgingDoc[];
  buckets: { current: number; d30: number; d60: number; d90: number; over90: number };
  total: number;
};

const BUCKET_LABELS: Record<string, string> = {
  current: "Al día", d30: "1-30 días", d60: "31-60 días", d90: "61-90 días", over90: "90+ días"
};
const BUCKET_COLORS: Record<string, string> = {
  current: "bg-emerald-100 text-emerald-800",
  d30: "bg-amber-100 text-amber-800",
  d60: "bg-orange-100 text-orange-800",
  d90: "bg-red-100 text-red-800",
  over90: "bg-red-200 text-red-900"
};

export default function CarteraPage() {
  const [report, setReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AgingReport>("/api/v1/accounts-receivable/reports/aging")
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Cartera por edades</h1>
      <CxcNav />
      {loading ? <p className="text-sm text-neutral-500">Cargando...</p> : !report ? <p className="text-sm text-red-700">Error al cargar reporte</p> : (
        <>
          <section className="flex flex-wrap gap-4">
            {Object.entries(report.buckets).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-line bg-white p-4 min-w-[120px]">
                <p className="text-xs text-neutral-500">{BUCKET_LABELS[key] || key}</p>
                <p className="text-lg font-semibold">${value.toLocaleString()}</p>
              </div>
            ))}
            <div className="rounded-lg border border-apex bg-apex/5 p-4 min-w-[120px]">
              <p className="text-xs text-apex">Total cartera</p>
              <p className="text-lg font-semibold">${report.total.toLocaleString()}</p>
            </div>
          </section>
          {report.documents.length === 0 ? <p className="text-sm text-neutral-500">No hay documentos vencidos</p> : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-neutral-600">
                  <th className="py-2 pr-4 font-medium">Documento</th>
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Emisión</th>
                  <th className="py-2 pr-4 font-medium">Vence</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Saldo</th>
                  <th className="py-2 pr-4 font-medium">Días vencido</th>
                  <th className="py-2 pr-4 font-medium">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {report.documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-line hover:bg-paper">
                    <td className="py-2 pr-4 font-mono">{doc.number}</td>
                    <td className="py-2 pr-4">{doc.customer?.name || `#${doc.customer?.id}`}</td>
                    <td className="py-2 pr-4">{new Date(doc.date).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{new Date(doc.due_date).toLocaleDateString()}</td>
                    <td className="py-2 pr-4 font-mono">${doc.total.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono">${doc.balance.toLocaleString()}</td>
                    <td className="py-2 pr-4">{doc.days_overdue}</td>
                    <td className="py-2 pr-4"><span className={`rounded-full px-2 py-0.5 text-xs ${BUCKET_COLORS[doc.bucket] || "bg-neutral-100"}`}>{BUCKET_LABELS[doc.bucket] || doc.bucket}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
