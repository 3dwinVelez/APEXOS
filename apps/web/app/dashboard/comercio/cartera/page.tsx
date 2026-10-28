"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, HandCoins, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, matchesQuery, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Cartera del Comercio (GET /api/v1/comercio/credits). El saldo, el vencimiento y los
// totales los calcula el servidor; el abono se reparte oldest-first entre cuotas.
type Installment = { id: number; number: number; due_date: string; amount: number; paid_amount: number; pending: number; status: "open" | "partial" | "paid" };
type Payment = { id: number; date: string; amount: number; method: string; note: string | null };
type Credit = {
  id: number;
  full_number: string;
  sale_id: number;
  customer_id: number | null;
  customer_name: string | null;
  financed_amount: number;
  down_payment: number;
  installment_count: number;
  frequency: string;
  first_due_date: string | null;
  status: "open" | "paid" | "voided";
  balance: number;
  paid_total: number;
  overdue: boolean;
  installments: Installment[];
  payments: Payment[];
};

// Etiqueta unica del estado de un credito: la usan el buscador, la tabla y la exportacion
// para que los tres digan exactamente lo mismo.
function creditState(credit: Credit): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (credit.status === "paid") return { label: "Pagado", tone: "ok" };
  if (credit.status === "voided") return { label: "Anulado", tone: "muted" };
  return credit.overdue ? { label: "Vencido", tone: "bad" } : { label: "Vigente", tone: "warn" };
}

export default function ComercioCarteraPage() {
  const access = useComercioAccess();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [totals, setTotals] = useState({ outstanding: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");

  const [detail, setDetail] = useState<Credit | null>(null);
  const [payTarget, setPayTarget] = useState<Credit | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "Efectivo", date: todayISO(), note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (status !== "all") params.set("status", status);
      const result = await api<{ items: Credit[]; total: number; totals: { outstanding: number; overdue: number } }>(`/api/v1/comercio/credits?${params.toString()}`, { cache: "no-store" });
      setCredits(result.items);
      setTotals(result.totals);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar la cartera."));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const filtered = useMemo(() => credits.filter((row) => matchesQuery(
    query,
    row.full_number,
    row.customer_name || "",
    creditState(row).label,
    row.installments.map((item) => item.status).join(" ")
  )), [credits, query]);

  const hasFilters = Boolean(query.trim() || status !== "open");

  function clearFilters() {
    setQuery("");
    setStatus("open");
  }

  function exportCredits(rows: Credit[]) {
    downloadExcelWorkbook("comercio-cartera.xls", [{
      name: "Cartera",
      columns: [
        { key: "number", label: "Credito" },
        { key: "customer", label: "Cliente", width: 200 },
        { key: "financed", label: "Financiado" },
        { key: "down", label: "Inicial" },
        { key: "paid", label: "Abonado" },
        { key: "balance", label: "Saldo" },
        { key: "quota", label: "Cuotas pagadas" },
        { key: "first_due", label: "Primer vencimiento" },
        { key: "state", label: "Estado" }
      ],
      rows: rows.map((row) => {
        const state = creditState(row);
        return {
          number: row.full_number,
          customer: row.customer_name || "",
          financed: Number(row.financed_amount),
          down: Number(row.down_payment),
          paid: Number(row.paid_total),
          balance: Number(row.balance),
          quota: `${row.installments.filter((item) => item.status === "paid").length}/${row.installment_count}`,
          first_due: row.first_due_date || "",
          state: state.label
        };
      })
    }]);
  }

  const columns: DataColumn<Credit>[] = [
    { className: "font-mono font-semibold", cell: (row) => row.full_number, header: "Credito", hideable: false, id: "number", sortValue: (row) => row.id },
    {
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name || "Sin nombre"}</p>
          <p className="text-xs text-content-muted">{row.installment_count} cuota(s) {row.frequency === "weekly" ? "semanal" : row.frequency === "monthly" ? "mensual" : "quincenal"}</p>
        </div>
      ),
      header: "Cliente",
      hideable: false,
      id: "customer",
      sortValue: (row) => row.customer_name || ""
    },
    { className: "text-right", cell: (row) => money(row.financed_amount), header: "Financiado", id: "financed", sortValue: (row) => Number(row.financed_amount) },
    { className: "text-right", cell: (row) => <span className="text-content-muted">{money(row.down_payment)}</span>, header: "Inicial", id: "down", sortValue: (row) => Number(row.down_payment) },
    { className: "text-right", cell: (row) => <span className="text-success">{money(row.paid_total)}</span>, header: "Abonado", id: "paid", sortValue: (row) => Number(row.paid_total) },
    { className: "text-right", cell: (row) => <span className="font-semibold">{money(row.balance)}</span>, header: "Saldo", id: "balance", sortValue: (row) => Number(row.balance) },
    {
      cell: (row) => {
        const paid = row.installments.filter((item) => item.status === "paid").length;
        return (
          <div className="min-w-28">
            <p className="text-xs text-content-muted">{paid}/{row.installment_count} cuotas</p>
            <span aria-label={`${paid} de ${row.installment_count} cuotas pagadas`} aria-valuemax={row.installment_count} aria-valuemin={0} aria-valuenow={paid} className="mt-1 block h-1.5 rounded-full bg-surface-muted" role="progressbar">
              <span className="block h-1.5 rounded-full bg-apex" style={{ width: `${row.installment_count ? Math.round((paid / row.installment_count) * 100) : 0}%` }} />
            </span>
          </div>
        );
      },
      header: "Avance",
      id: "progress",
      sortValue: (row) => (row.installment_count ? row.installments.filter((item) => item.status === "paid").length / row.installment_count : 0)
    },
    {
      cell: (row) => {
        const state = creditState(row);
        return <StatusPill tone={state.tone}>{state.label}</StatusPill>;
      },
      header: "Estado",
      id: "state",
      sortValue: (row) => (row.status === "open" ? (row.overdue ? 0 : 1) : 2)
    },
    {
      className: "text-right",
      cell: (row) => <Button onClick={() => setDetail(row)} size="compact" variant="secondary"><Search size={12} /> Ver</Button>,
      header: "Acciones",
      hideable: false,
      id: "action"
    }
  ];

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!payTarget) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ credit: Credit; payment: Payment }>(`/api/v1/comercio/credits/${payTarget.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(payForm.amount), method: payForm.method, date: payForm.date, note: payForm.note.trim() || undefined })
      });
      setMessage(`Abono registrado en ${payTarget.full_number}. Nuevo saldo: ${money(result.credit.balance)}.`);
      setPayTarget(null);
      setDetail(null);
      setPayForm({ amount: "", method: "Efectivo", date: todayISO(), note: "" });
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible registrar el abono."));
    } finally {
      setSaving(false);
    }
  }
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Cartera" subtitle="Creditos con cuotas sin interes. Los abonos se aplican primero a la cuota mas antigua vencida." title="Cartera" />
      <ComercioMessages error={error} message={message} />

      <section aria-label="Totales de cartera" className="grid gap-3 sm:grid-cols-2">
        <div className="apex-section-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Saldo total pendiente</p>
          <p className="mt-1 text-2xl font-semibold">{money(totals.outstanding)}</p>
        </div>
        <div className="apex-section-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Cartera vencida</p>
          <p className={`mt-1 text-2xl font-semibold ${totals.overdue > 0 ? "text-error" : ""}`}>{money(totals.overdue)}</p>
        </div>
      </section>

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_13rem] lg:items-end">
          <Field hint="Ignora acentos: busca por numero, cliente o estado" label="Buscar">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar creditos por numero, cliente o estado" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="CRD-0001, cliente o vencido" value={query} />
            </span>
          </Field>
          <Field label="Vista">
            <select className="control apex-select" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="open">Vigentes</option>
              <option value="overdue">Vencidos</option>
              <option value="paid">Pagados</option>
              <option value="voided">Anulados</option>
              <option value="all">Todos</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-content-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {hasFilters ? <Button onClick={clearFilters} size="compact" variant="ghost"><X size={12} /> Limpiar filtros</Button> : null}
            <span aria-live="polite" className="font-semibold text-content-body">{filtered.length} credito(s) · saldo {money(filtered.reduce((sum, row) => sum + Number(row.balance || 0), 0))}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!filtered.length} onClick={() => exportCredits(filtered)} size="compact" variant="secondary"><Download size={14} /> Excel</Button>
            <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
          </div>
        </div>

        {!loading && filtered.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
            {filtered.map((credit) => (
              <li className="rounded-md border border-line p-3" key={credit.id}>
                <button className="w-full text-left" onClick={() => setDetail(credit)} type="button">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">{credit.full_number}</span>
                    <StatusPill tone={creditState(credit).tone}>{creditState(credit).label}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-content-muted">{credit.customer_name || "Sin nombre"} · saldo {money(credit.balance)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="hidden p-4 lg:block">
          <SmartDataTable
            bulkActions={(selected, clear) => (
              <>
                <Button onClick={() => exportCredits(selected)} size="compact" variant="secondary"><Download size={14} /> Exportar {selected.length}</Button>
                <Button onClick={clear} size="compact" variant="ghost">Limpiar seleccion</Button>
              </>
            )}
            columns={columns}
            emptyDetail={credits.length ? "Cambia la vista o limpia el buscador: en Todos tambien aparecen los pagados y anulados." : "Las ventas a credito con cuotas aparecen aqui automaticamente."}
            emptyTitle={credits.length ? "Ningun credito con estos filtros" : "Aun no hay creditos"}
            loading={loading}
            pageSize={12}
            rowKey={(row) => row.id}
            rows={filtered}
            storageKey="comercio-cartera"
          />
        </div>
      </section>

      {detail ? (
        <ModalFrame maxWidth="md:max-w-3xl" onClose={() => setDetail(null)} title={`Credito ${detail.full_number}`}>
          <div className="space-y-4 text-sm">
            <p className="text-xs text-content-muted">
              {detail.customer_name || "Sin nombre"} · financiado {money(detail.financed_amount)} en {detail.installment_count} cuota(s) {detail.frequency === "weekly" ? "semanal" : detail.frequency === "monthly" ? "mensual" : "quincenal"} · primer vencimiento {detail.first_due_date || "--"}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-content-muted">
                    <th className="py-1">#</th><th>Vence</th><th className="text-right">Cuota</th><th className="text-right">Pagado</th><th className="text-right">Pendiente</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.installments.map((item) => (
                    <tr className="border-b" key={item.id}>
                      <td className="py-1 font-mono">{item.number}</td>
                      <td className={item.status !== "paid" && item.due_date && item.due_date < todayISO() ? "font-semibold text-error" : ""}>{item.due_date}</td>
                      <td className="text-right">{money(item.amount)}</td>
                      <td className="text-right">{money(item.paid_amount)}</td>
                      <td className="text-right">{money(item.pending)}</td>
                      <td>{item.status === "paid" ? <StatusPill tone="ok">Pagada</StatusPill> : item.status === "partial" ? <StatusPill tone="warn">Parcial</StatusPill> : <StatusPill tone="muted">Pendiente</StatusPill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.payments.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase text-content-muted">Abonos registrados</h3>
                <ul className="mt-1 divide-y divide-line text-sm">
                  {detail.payments.map((payment) => (
                    <li className="flex justify-between py-1" key={payment.id}>
                      <span>{payment.date} · {payment.method}{payment.note ? ` · ${payment.note}` : ""}</span>
                      <span className="font-semibold">{money(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-xs text-content-muted">Sin abonos registrados todavia.</p>}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              {access.canWrite && detail.status === "open" && detail.balance > 0 ? (
                <button className="apex-primary-action flex items-center gap-1 px-4 text-sm font-semibold" onClick={() => { setPayTarget(detail); setPayForm({ amount: String(detail.balance), method: "Efectivo", date: todayISO(), note: "" }); }} type="button">
                  <HandCoins size={14} /> Registrar abono
                </button>
              ) : null}
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setDetail(null)} type="button">Cerrar</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {payTarget ? (
        <ModalFrame onClose={() => setPayTarget(null)} title={`Abono · ${payTarget.full_number}`}>
          <form className="space-y-4" onSubmit={savePayment}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Valor del abono (saldo ${money(payTarget.balance)})`}>
                <input className="control" max={payTarget.balance} min={1} onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })} required step="0.01" type="number" value={payForm.amount} />
              </Field>
              <Field label="Fecha">
                <input className="control" max={todayISO()} onChange={(event) => setPayForm({ ...payForm, date: event.target.value })} type="date" value={payForm.date} />
              </Field>
              <Field label="Medio de pago">
                <select className="control apex-select" onChange={(event) => setPayForm({ ...payForm, method: event.target.value })} value={payForm.method}>
                  <option>Efectivo</option>
                  <option>Nequi</option>
                  <option>Tarjeta</option>
                  <option>Transferencia</option>
                </select>
              </Field>
              <Field label="Nota (opcional)">
                <input className="control" maxLength={500} onChange={(event) => setPayForm({ ...payForm, note: event.target.value })} value={payForm.note} />
              </Field>
            </div>
            <p className="text-xs text-content-muted">El abono se aplica automaticamente a la cuota mas antigua pendiente. Si cubre todo el saldo, el credito queda pagado.</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setPayTarget(null)} type="button">Cancelar</button>
              <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" disabled={saving} type="submit">{saving ? "Registrando..." : "Registrar abono"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
