"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FacturacionNav } from "@/components/facturacion-nav";

type Invoice = { id: number; number: string; status: string; total: number; party: { name: string } };

export default function DocumentosFacturaPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Invoice[]>("/api/v1/invoicing/invoices")
      .then((rows) => setInvoices(rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Error cargando documentos"));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Documentos de facturación</h1>
      <FacturacionNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="space-y-2 text-sm">
          {invoices.map((inv) => (
            <div key={inv.id} className="rounded-md border border-line px-3 py-2">
              {inv.number} · {inv.status} · ${inv.total} · {inv.party.name || "Sin cliente"}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

