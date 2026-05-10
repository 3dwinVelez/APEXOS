"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";

export default function PlanCuentasPage() {
  const [ok, setOk] = useState("");
  const [error, setError] = useState("");
  const [country, setCountry] = useState("CO");

  async function initChart() {
    setError("");
    setOk("");
    try {
      const rows = await api<any[]>("/api/v1/accounting/chart/init", {
        method: "POST",
        body: JSON.stringify({ country })
      });
      setOk(`Plan disponible con ${rows.length} cuentas`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo inicializar");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Plan de cuentas</h1>
      <ContabilidadNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      <section className="grid gap-2 rounded-md border border-line bg-white p-4 md:grid-cols-3">
        <input className="h-10 rounded-md border border-line px-3 text-sm" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="País base (CO, MX, PE...)" />
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white md:col-span-2" onClick={initChart} type="button">Inicializar / completar plan de cuentas</button>
      </section>
    </div>
  );
}

