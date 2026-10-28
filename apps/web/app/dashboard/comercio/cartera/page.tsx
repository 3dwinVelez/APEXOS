"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return credits;
    return credits.filter((row) => `${row.full_number} ${row.customer_name || ""}`.toLowerCase().includes(needle));
  }, [credits, query]);

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
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
          <label className="relative block">
            <Search className="absolute left-3 top-3 text-content-muted" size={16} />
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por numero de credito o cliente" value={query} />
          </label>
          <select className="control apex-select" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="open">Vigentes</option>
            <option value="overdue">Vencidos</option>
            <option value="paid">Pagados</option>
            <option value="voided">Anulados</option>
            <option value="all">Todos</option>
          </select>
          <button className="apex-secondary-action flex items-center gap-2 px-4 text-sm font-semibold" onClick={() => void load()} type="button"><RefreshCw size={14} /> Actualizar</button>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-content-muted">Cargando cartera...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-content-muted">No hay creditos en esta vista.</p>
        ) : (
          <>
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
              {filtered.map((credit) => (
                <li className="rounded-md border border-line p-3" key={credit.id}>
                  <button className="w-full text-left" onClick={() => setDetail(credit)} type="button">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold">{credit.full_number}</span>
                      <StatusPill tone={credit.status === "paid" ? "ok" : credit.status === "voided" ? "muted" : credit.overdue ? "bad" : "warn"}>
                        {credit.status === "paid" ? "Pagado" : credit.status === "voided" ? "Anulado" : credit.overdue ? "Vencido" : "Vigente"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-xs text-content-muted">{credit.customer_name || "Sin nombre"} · saldo {money(credit.balance)}</p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-surface-muted text-left text-xs uppercase text-content-muted">
                    <th className="p-3">Credito</th>
                    <th>Cliente</th>
                    <th className="text-right">Financiado</th>
                    <th className="text-right">Inicial</th>
                    <th className="text-right">Abonado</th>
                    <th className="text-right">Saldo</th>
                    <th>Cuotas</th>
                    <th>Estado</th>
                    <th className="pr-3 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((credit) => (
                    <tr className="border-b" key={credit.id}>
                      <td className="p-3 font-mono font-semibold">{credit.full_number}</td>
                      <td className="p-3">{credit.customer_name || "--"}</td>
                      <td className="p-3 text-right">{money(credit.financed_amount)}</td>
                      <td className="p-3 text-right">{money(credit.down_payment)}</td>
                      <td className="p-3 text-right">{money(credit.paid_total)}</td>
                      <td className="p-3 text-right font-semibold">{money(credit.balance)}</td>
                      <td className="p-3">{credit.installments.filter((item) => item.status === "paid").length}/{credit.installment_count}</td>
                      <td className="p-3">
                        {credit.status === "paid" ? <StatusPill tone="ok">Pagado</StatusPill>
                          : credit.status === "voided" ? <StatusPill tone="muted">Anulado</StatusPill>
                          : credit.overdue ? <StatusPill tone="bad">Vencido</StatusPill>
                          : <StatusPill tone="warn">Vigente</StatusPill>}
                      </td>
                      <td className="p-3 pr-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="h-7 min-h-0 inline-flex items-center apex-secondary-action px-2 py-1 text-xs font-semibold" onClick={() => setDetail(credit)} type="button">Ver</button>
                          {access.canWrite && credit.status === "open" && credit.balance > 0 ? (
                            <button className="h-7 min-h-0 inline-flex items-center apex-primary-action px-2 py-1 text-xs font-semibold" onClick={() => { setPayTarget(credit); setPayForm({ amount: String(credit.balance), method: "Efectivo", date: todayISO(), note: "" }); }} type="button">Abonar</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
