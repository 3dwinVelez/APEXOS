"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";

type BalanceSheet = { period: string; balanced: boolean; assets: { total: number }; liabilities: { total: number }; equity: { total: number } };
type IncomeStatement = { period: string; income: { total: number }; cogs: { total: number }; operating_profit: number };

export default function ReportesContablesPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<BalanceSheet>("/api/v1/accounting/reports/balance-sheet"),
      api<IncomeStatement>(`/api/v1/accounting/reports/income-statement?period=${period}`)
    ]).then(([b, i]) => {
      setBalance(b);
      setIncome(i);
    }).catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar reportes"));
  }, [period]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Reportes contables</h1>
      <ContabilidadNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <input className="h-10 rounded-md border border-line px-3 text-sm" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">Balance general</h2>
          {balance ? <>
            <p>Periodo: {balance.period}</p>
            <p>Activo: ${balance.assets.total}</p>
            <p>Pasivo: ${balance.liabilities.total}</p>
            <p>Patrimonio: ${balance.equity.total}</p>
            <p>Cuadrado: {balance.balanced ? "Sí" : "No"}</p>
          </> : null}
        </div>
        <div className="rounded-md border border-line bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">Estado de resultados</h2>
          {income ? <>
            <p>Periodo: {income.period}</p>
            <p>Ingresos: ${income.income.total}</p>
            <p>Costo de ventas: ${income.cogs.total}</p>
            <p>Utilidad operativa: ${income.operating_profit}</p>
          </> : null}
        </div>
      </section>
    </div>
  );
}

