"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarCheck, FileSpreadsheet, RefreshCcw } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";

type BalanceSheet = { period: string; balanced: boolean; assets: { total: number }; liabilities: { total: number }; equity: { total: number } };
type IncomeStatement = { period: string; income: { total: number }; cogs: { total: number }; operating_profit: number; gross_margin_pct: number; net_margin_pct: number };
type TrialBalance = { period: string; balanced: boolean; totals: { debit: number; credit: number; balance: number }; rows: Array<{ code: string; name: string; debit: number; credit: number; balance: number }> };
type TaxReport = { period: string; taxes: Array<{ code: string; name: string; debit: number; credit: number; payable: number }>; totals: { debit: number; credit: number; payable: number } };
type Aging = { total: number; buckets: Record<string, number>; documents: Array<{ id: number; number: string; party?: { name: string } | null; balance: number; days_overdue: number; status: string }> };
type Ledger = { account: { code: string; name: string }; totals: { debit: number; credit: number; balance: number }; entries: Array<{ id: number; date: string; description: string; debit: number; credit: number; running_balance: number }> };
type Periods = Record<string, { status: string; notes?: string; updated_at?: string }>;

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default function ReportesContablesPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [accountCode, setAccountCode] = useState("1305");
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [taxes, setTaxes] = useState<TaxReport | null>(null);
  const [receivables, setReceivables] = useState<Aging | null>(null);
  const [payables, setPayables] = useState<Aging | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [periods, setPeriods] = useState<Periods>({});
  const [periodStatus, setPeriodStatus] = useState("open");
  const [error, setError] = useState("");
  const [savingPeriod, setSavingPeriod] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [b, i, tb, tr, ar, ap, le, pe] = await Promise.all([
        api<BalanceSheet>(`/api/v1/accounting/reports/balance-sheet?period=${period}`),
        api<IncomeStatement>(`/api/v1/accounting/reports/income-statement?period=${period}`),
        api<TrialBalance>(`/api/v1/accounting/reports/trial-balance?period=${period}`),
        api<TaxReport>(`/api/v1/accounting/reports/taxes?period=${period}`),
        api<Aging>("/api/v1/accounting/reports/receivables"),
        api<Aging>("/api/v1/accounting/reports/payables"),
        api<Ledger>(`/api/v1/accounting/ledger/${accountCode}?period=${period}`),
        api<Periods>("/api/v1/accounting/periods")
      ]);
      setBalance(b);
      setIncome(i);
      setTrial(tb);
      setTaxes(tr);
      setReceivables(ar);
      setPayables(ap);
      setLedger(le);
      setPeriods(pe);
      setPeriodStatus(pe[period]?.status || "open");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar reportes");
    }
  }, [accountCode, period]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadLedger() {
    setError("");
    try {
      setLedger(await api<Ledger>(`/api/v1/accounting/ledger/${accountCode}?period=${period}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el auxiliar");
    }
  }

  async function savePeriod() {
    setSavingPeriod(true);
    setError("");
    try {
      await api(`/api/v1/accounting/periods/${period}`, {
        method: "PATCH",
        body: JSON.stringify({ status: periodStatus, notes: `Actualizado desde reportes ${period}` })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el periodo");
    } finally {
      setSavingPeriod(false);
    }
  }

  const currentPeriod = periods[period];
  const taxPayable = taxes?.totals.payable || 0;
  const cards = useMemo(() => [
    { label: "Activo", value: balance ? money.format(balance.assets.total) : "-", tone: "text-neutral-900" },
    { label: "Pasivo", value: balance ? money.format(balance.liabilities.total) : "-", tone: "text-neutral-900" },
    { label: "Patrimonio", value: balance ? money.format(balance.equity.total) : "-", tone: "text-neutral-900" },
    { label: "Resultado operativo", value: income ? money.format(income.operating_profit) : "-", tone: income && income.operating_profit < 0 ? "text-red-700" : "text-emerald-700" },
    { label: "Impuestos por presentar", value: money.format(taxPayable), tone: taxPayable > 0 ? "text-amber-700" : "text-neutral-900" },
    { label: "Cartera pendiente", value: receivables ? money.format(receivables.total) : "-", tone: "text-neutral-900" }
  ], [balance, income, receivables, taxPayable]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Reportes contables</h1>
          <p className="mt-1 text-sm text-neutral-600">Balance, resultados, prueba, mayor, impuestos, cartera, proveedores y control de periodos.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium hover:bg-paper" onClick={load} type="button">
          <RefreshCcw size={16} /> Actualizar
        </button>
      </header>
      <ContabilidadNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[180px_1fr_180px_180px]">
        <label className="text-sm">
          Periodo
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <label className="text-sm">
          Cuenta auxiliar
          <div className="mt-1 flex gap-2">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={accountCode} onChange={(event) => setAccountCode(event.target.value)} placeholder="1305" />
            <button className="h-10 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={loadLedger} type="button">Consultar</button>
          </div>
        </label>
        <label className="text-sm">
          Estado periodo
          <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={periodStatus} onChange={(event) => setPeriodStatus(event.target.value)}>
            <option value="open">Abierto</option>
            <option value="review">En revision</option>
            <option value="closed">Cerrado</option>
          </select>
        </label>
        <button className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={savingPeriod} onClick={savePeriod} type="button">
          <CalendarCheck size={16} /> Guardar cierre
        </button>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div className="rounded-md border border-line bg-white p-3" key={card.label}>
            <p className="text-xs text-neutral-500">{card.label}</p>
            <p className={`mt-1 text-lg font-semibold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ReportBox title="Balance de prueba" subtitle={trial?.balanced ? "Debitos y creditos cuadrados" : "Revisar diferencias"}>
          <Summary debit={trial?.totals.debit} credit={trial?.totals.credit} balance={trial?.totals.balance} />
          <SmallTable rows={(trial?.rows || []).slice(0, 8).map((row) => [row.code, row.name, money.format(row.debit), money.format(row.credit)])} empty="Sin movimientos en el periodo." />
        </ReportBox>
        <ReportBox title="Impuestos y retenciones" subtitle="Base para preparar declaraciones y revision fiscal">
          <Summary debit={taxes?.totals.debit} credit={taxes?.totals.credit} balance={taxes?.totals.payable} />
          <SmallTable rows={(taxes?.taxes || []).map((row) => [row.code, row.name, money.format(row.payable)])} empty="No hay impuestos contabilizados en el periodo." />
        </ReportBox>
        <ReportBox title="Auxiliar por cuenta" subtitle={ledger ? `${ledger.account.code} ${ledger.account.name}` : "Selecciona una cuenta"}>
          <Summary debit={ledger?.totals.debit} credit={ledger?.totals.credit} balance={ledger?.totals.balance} />
          <SmallTable rows={(ledger?.entries || []).slice(0, 8).map((row) => [new Date(row.date).toLocaleDateString("es-CO"), row.description, money.format(row.debit), money.format(row.credit), money.format(row.running_balance)])} empty="Sin movimientos para esta cuenta." />
        </ReportBox>
        <ReportBox title="Cartera y proveedores" subtitle="Cuentas por cobrar y pagar con vencimientos">
          <div className="grid gap-3 md:grid-cols-2">
            <AgingBox title="Por cobrar" data={receivables} />
            <AgingBox title="Por pagar" data={payables} />
          </div>
        </ReportBox>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#146C6312] text-apex"><FileSpreadsheet size={18} /></span>
          <div>
            <h2 className="font-semibold">Periodo {period}: {currentPeriod?.status || "open"}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Un periodo cerrado bloquea nuevos asientos y pagos. La actualizacion queda auditada con usuario, fecha, valor anterior y valor nuevo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportBox({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Summary({ debit = 0, credit = 0, balance = 0 }: { debit?: number; credit?: number; balance?: number }) {
  return (
    <div className="mb-3 grid gap-2 text-sm md:grid-cols-3">
      <span className="rounded-md bg-paper px-3 py-2">Debitos: {money.format(debit)}</span>
      <span className="rounded-md bg-paper px-3 py-2">Creditos: {money.format(credit)}</span>
      <span className="rounded-md bg-paper px-3 py-2">Saldo: {money.format(balance)}</span>
    </div>
  );
}

function SmallTable({ rows, empty }: { rows: Array<Array<string | number>>; empty: string }) {
  if (!rows.length) return <p className="rounded-md bg-paper p-3 text-sm text-neutral-600">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-b border-line/70 last:border-0" key={index}>
              {row.map((cell, cellIndex) => <td className="py-2 pr-3" key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgingBox({ title, data }: { title: string; data: Aging | null }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-lg font-semibold">{money.format(data?.total || 0)}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-600">
        <span>0-30: {money.format(data?.buckets.d30 || 0)}</span>
        <span>31-60: {money.format(data?.buckets.d60 || 0)}</span>
        <span>61-90: {money.format(data?.buckets.d90 || 0)}</span>
        <span>+90: {money.format(data?.buckets.over90 || 0)}</span>
      </div>
    </div>
  );
}
