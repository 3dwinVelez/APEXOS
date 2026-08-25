"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import Link from "next/link";
import { Landmark, WalletCards } from "lucide-react";

type Account = { id: number; code: string; name: string; type?: string; active?: boolean; allows_tx?: boolean };
type Party = { id: number; name: string; legal_name?: string; tax_id?: string };
type Bank = { id: number; code: string; name: string; account_id: number; account_code: string; active: boolean };
type OpenItem = { id: number; number: string; posting_date: string; due_date: string; total: number; balance: number; society_code: string };
type Payment = { id: number; party_id: number; number: string; direction: string; posting_date: string; amount: number; status: string; reference?: string; party?: Party; bank: Bank; applications: Array<{ source_number: string; amount: number; balance_after: number }> };

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => Number(value || 0).toLocaleString("es-CO", { style: "currency", currency: "COP" });

export default function TreasuryPage() {
  const [tab, setTab] = useState<"payments" | "banks" | "report">("payments");
  const [direction, setDirection] = useState("receipt");
  const [parties, setParties] = useState<Party[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<OpenItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [partyId, setPartyId] = useState(0);
  const [bankId, setBankId] = useState(0);
  const [amounts, setAmounts] = useState<Record<number, number>>({});
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceReferences, setInvoiceReferences] = useState("");
  const [bankModal, setBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({ code: "", name: "", account_id: 0, active: true });
  const [filters, setFilters] = useState({ direction: "", status: "", date_from: "", date_to: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadBanks = useCallback(async () => setBanks(await api<Bank[]>("/api/v1/treasury/banks?include_inactive=true")), []);
  const loadPayments = useCallback(async () => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    setPayments(await api<Payment[]>(`/api/v1/treasury/payments${query.size ? `?${query}` : ""}`));
  }, [filters]);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search);
    const initialDirection = initial.get("direction") === "disbursement" ? "disbursement" : "receipt";
    setDirection(initialDirection);
    if (initial.get("tab") === "report") { setTab("report"); setFilters((old) => ({ ...old, direction: initialDirection })); }
    Promise.all([loadBanks(), api<Account[]>("/api/v1/accounting/accounts?active=true").then((rows) => setAccounts(rows.filter((row) => row.active !== false && row.allows_tx !== false && row.type === "asset" && row.code.startsWith("11"))))]).catch((err) => setError(err.message));
  }, [loadBanks]);
  useEffect(() => { loadPayments().catch((err) => setError(err.message)); }, [loadPayments]);
  useEffect(() => {
    setPartyId(0); setItems([]); setAmounts({}); setInvoiceReferences("");
    api<Party[]>(`/api/v1/accounting/third-parties?type=${direction === "receipt" ? "customer" : "supplier"}&active=true&limit=500`).then(setParties).catch((err) => setError(err.message));
  }, [direction]);
  useEffect(() => {
    if (!partyId) { setItems([]); return; }
    api<{ items: OpenItem[] }>(`/api/v1/treasury/open-items?direction=${direction}&party_id=${partyId}`).then((result) => { setItems(result.items); setAmounts({}); }).catch((err) => setError(err.message));
  }, [direction, partyId]);

  const requestedReferences = useMemo(() => [...new Set(invoiceReferences.split(/[\n,;]+/).map((value) => value.trim().toUpperCase()).filter(Boolean))], [invoiceReferences]);
  const visibleItems = useMemo(() => requestedReferences.length ? items.filter((item) => requestedReferences.includes(item.number.toUpperCase())) : items, [items, requestedReferences]);
  const missingReferences = useMemo(() => requestedReferences.filter((reference) => !items.some((item) => item.number.toUpperCase() === reference)), [items, requestedReferences]);
  const total = useMemo(() => visibleItems.reduce((sum, item) => sum + Number(amounts[item.id] || 0), 0), [amounts, visibleItems]);

  function markAllVisible() { setAmounts((current) => ({ ...current, ...Object.fromEntries(visibleItems.map((item) => [item.id, item.balance])) })); }
  function clearVisible() { setAmounts((current) => { const next = { ...current }; for (const item of visibleItems) delete next[item.id]; return next; }); }

  async function submitPayment(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const applications = visibleItems.map((item) => ({ source_id: item.id, amount: Number(amounts[item.id] || 0) })).filter((row) => row.amount > 0);
      const result = await api<Payment>("/api/v1/treasury/payments", { method: "POST", body: JSON.stringify({ direction, posting_date: date, party_id: partyId, bank_id: bankId, reference, notes, applications }) });
      setMessage(`${direction === "receipt" ? "Recaudo" : "Pago"} ${result.number} contabilizado correctamente.`);
      setAmounts({}); setReference(""); setNotes(""); setInvoiceReferences(""); setPartyId(0); await loadPayments();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el pago"); }
    finally { setSaving(false); }
  }

  async function saveBank(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await api("/api/v1/treasury/banks", { method: "POST", body: JSON.stringify(bankForm) }); setBankModal(false); setBankForm({ code: "", name: "", account_id: 0, active: true }); await loadBanks(); setMessage("Banco creado."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el banco"); }
    finally { setSaving(false); }
  }

  async function cancelPayment(payment: Payment) {
    if (!window.confirm(`Se creará un asiento inverso y se reabrirán las partidas de ${payment.number}. ¿Continuar?`)) return;
    try { await api(`/api/v1/treasury/payments/${payment.id}/cancel`, { method: "POST" }); await loadPayments(); setMessage(`${payment.number} anulado con asiento inverso.`); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo anular"); }
  }

  function downloadCsv() {
    const rows = [["Documento", "Tipo", "Fecha", "Tercero", "NIT", "Banco", "Importe", "Estado", "Referencia"], ...payments.map((row) => [row.number, row.direction === "receipt" ? "Recaudo" : "Pago proveedor", row.posting_date.slice(0, 10), row.party?.legal_name || row.party?.name || "", row.party?.tax_id || "", row.bank.name, row.amount, row.status, row.reference || ""])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = "pagos-tesoreria.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="apex-workspace-shell space-y-4">
    <header className="apex-section-card p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-apex">M-08 · Finanzas</p><h1 className="text-3xl font-semibold">Tesorería</h1><p className="mt-1 text-sm text-neutral-600">Recaudos, pagos, bancos y movimientos organizados en un solo espacio.</p></div><Link className="apex-primary-action inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold" href="/dashboard/tesoreria/anticipos"><WalletCards size={16} /> Anticipos y cruces</Link></div></header>
    <nav aria-label="Herramientas de tesorería" className="apex-section-card flex flex-wrap gap-2 p-2">{[["payments", "Recaudos y pagos"], ["banks", "Bancos"], ["report", "Movimientos"]].map(([value, label]) => <button key={value} onClick={() => setTab(value as typeof tab)} className={`h-9 rounded-md px-4 text-sm font-medium ${tab === value ? "bg-apex text-white" : "border border-line bg-white hover:border-apex hover:text-apex"}`} type="button">{label}</button>)}<Link className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium hover:border-apex hover:text-apex" href="/dashboard/tesoreria/anticipos"><Landmark size={15} /> Anticipos</Link></nav>
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

    {tab === "payments" ? <form className="space-y-4" onSubmit={submitPayment}>
      <section aria-label="Datos del movimiento" className="apex-section-card grid gap-4 p-4 md:grid-cols-3 xl:grid-cols-6">
        <label className="text-sm">Operación<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="receipt">Recibir pago cliente (CI)</option><option value="disbursement">Pagar proveedor (CE)</option></select></label>
        <label className="text-sm">Fecha<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label className="text-sm xl:col-span-2">{direction === "receipt" ? "Cliente" : "Proveedor"}<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={partyId} onChange={(e) => setPartyId(Number(e.target.value))} required><option value={0}>Seleccionar tercero</option>{parties.map((party) => <option value={party.id} key={party.id}>{party.tax_id} · {party.legal_name || party.name}</option>)}</select></label>
        <label className="text-sm xl:col-span-2">Banco<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={bankId} onChange={(e) => setBankId(Number(e.target.value))} required><option value={0}>Seleccionar banco</option>{banks.filter((bank) => bank.active).map((bank) => <option value={bank.id} key={bank.id}>{bank.code} · {bank.name} · {bank.account_code}</option>)}</select></label>
        <label className="text-sm xl:col-span-2">Referencia<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <label className="text-sm xl:col-span-4">Observaciones<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </section>
      <section aria-label="Selección de documentos" className="apex-section-card p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><label className="flex-1 text-sm font-medium">Facturas por referencia<textarea className="mt-1 min-h-20 w-full rounded-md border border-line px-3 py-2 font-mono text-sm" placeholder="Una referencia por línea o separadas por coma" value={invoiceReferences} onChange={(e) => setInvoiceReferences(e.target.value)} /></label><div className="flex flex-wrap gap-2"><button className="h-10 rounded-md border border-apex px-3 text-sm text-apex" disabled={!visibleItems.length} onClick={markAllVisible} type="button">Marcar todo</button><button className="h-10 rounded-md border border-line px-3 text-sm" disabled={!visibleItems.length} onClick={clearVisible} type="button">Desmarcar todo</button></div></div><p className="mt-2 text-xs text-neutral-500">{requestedReferences.length ? `${visibleItems.length} de ${requestedReferences.length} referencias encontradas` : "Sin filtro: se muestran todas las facturas abiertas del tercero."}</p>{missingReferences.length ? <p className="mt-1 text-xs text-amber-700">No encontradas o sin saldo: {missingReferences.join(", ")}</p> : null}</section>
      <section className="overflow-x-auto rounded-md border border-line bg-white"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Documento</th><th>Fecha</th><th>Vencimiento</th><th className="text-right">Total</th><th className="text-right">Saldo actual</th><th className="px-3 text-right">Valor a pagar</th></tr></thead><tbody>{visibleItems.map((item) => <tr className="border-b border-line/70" key={item.id}><td className="px-3 py-2 font-mono">{item.number}</td><td>{new Date(item.posting_date).toLocaleDateString("es-CO")}</td><td>{new Date(item.due_date).toLocaleDateString("es-CO")}</td><td className="text-right">{money(item.total)}</td><td className="text-right">{money(item.balance)}</td><td className="px-3 py-2 text-right"><div className="flex justify-end gap-2"><input className="h-9 w-36 rounded-md border border-line px-2 text-right" type="number" min={0} max={item.balance} step="0.01" value={amounts[item.id] || ""} onChange={(e) => setAmounts((old) => ({ ...old, [item.id]: Number(e.target.value) }))} /><button type="button" className="h-9 rounded-md border border-line px-2" onClick={() => setAmounts((old) => ({ ...old, [item.id]: item.balance }))}>Total</button></div></td></tr>)}</tbody></table>{partyId && !items.length ? <p className="p-4 text-sm text-neutral-500">El tercero no tiene facturas abiertas.</p> : null}{partyId && items.length > 0 && !visibleItems.length ? <p className="p-4 text-sm text-neutral-500">Ninguna factura abierta coincide con las referencias ingresadas.</p> : null}</section>
      <div className="flex items-center justify-end gap-4"><span className="text-lg font-semibold">Total: {money(total)}</span><button disabled={saving || !partyId || !bankId || total <= 0} className="h-11 rounded-md bg-apex px-5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Contabilizando..." : direction === "receipt" ? "Registrar recaudo" : "Registrar pago"}</button></div>
    </form> : null}

    {tab === "banks" ? <section className="space-y-3"><div className="flex justify-end"><button className="h-10 rounded-md bg-apex px-4 text-sm text-white" onClick={() => setBankModal(true)}>Nuevo banco</button></div><div className="overflow-x-auto rounded-md border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th className="px-3 py-2">Código</th><th>Banco</th><th>Cuenta contable</th><th>Estado</th></tr></thead><tbody>{banks.map((bank) => <tr className="border-b border-line/70" key={bank.id}><td className="px-3 py-2 font-mono">{bank.code}</td><td>{bank.name}</td><td>{bank.account_code}</td><td>{bank.active ? "Activo" : "Inactivo"}</td></tr>)}</tbody></table></div></section> : null}

    {tab === "report" ? <section className="space-y-3"><div className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-5"><select className="h-10 rounded-md border border-line px-3" value={filters.direction} onChange={(e) => setFilters((old) => ({ ...old, direction: e.target.value }))}><option value="">Todos</option><option value="receipt">Recaudos</option><option value="disbursement">Pagos proveedores</option></select><select className="h-10 rounded-md border border-line px-3" value={filters.status} onChange={(e) => setFilters((old) => ({ ...old, status: e.target.value }))}><option value="">Todos los estados</option><option value="posted">Contabilizado</option><option value="cancelled">Anulado</option></select><input className="h-10 rounded-md border border-line px-3" type="date" value={filters.date_from} onChange={(e) => setFilters((old) => ({ ...old, date_from: e.target.value }))} /><input className="h-10 rounded-md border border-line px-3" type="date" value={filters.date_to} onChange={(e) => setFilters((old) => ({ ...old, date_to: e.target.value }))} /><button className="h-10 rounded-md border border-line" onClick={downloadCsv}>Descargar CSV</button></div><PaymentsTable payments={payments} cancelPayment={cancelPayment} /></section> : null}

    {bankModal ? (
      <ModalFrame title="Nuevo banco" onClose={() => setBankModal(false)} maxWidth="max-w-xl">
        <form className="space-y-4" onSubmit={saveBank}>
          <label className="block text-sm">Código<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={bankForm.code} onChange={(e) => setBankForm((old) => ({ ...old, code: e.target.value }))} required /></label>
          <label className="block text-sm">Nombre<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={bankForm.name} onChange={(e) => setBankForm((old) => ({ ...old, name: e.target.value }))} required /></label>
          <label className="block text-sm">Cuenta contable<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={bankForm.account_id} onChange={(e) => setBankForm((old) => ({ ...old, account_id: Number(e.target.value) }))} required><option value={0}>Seleccionar cuenta</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.code} · {account.name}</option>)}</select></label>
          <div className="flex justify-end gap-2"><button type="button" className="h-10 rounded-md border border-line px-4" onClick={() => setBankModal(false)}>Cancelar</button><button disabled={saving || !bankForm.account_id} className="h-10 rounded-md bg-apex px-4 text-white">Guardar</button></div>
        </form>
      </ModalFrame>
    ) : null}
  </div>;
}

function PaymentsTable({ payments, cancelPayment }: { payments: Payment[]; cancelPayment: (payment: Payment) => void }) {
  return <div className="overflow-x-auto rounded-md border border-line bg-white"><table className="w-full min-w-[950px] text-sm"><thead><tr className="border-b border-line text-left"><th className="px-3 py-2">Documento</th><th>Fecha</th><th>Tipo</th><th>Tercero</th><th>Banco</th><th className="text-right">Importe</th><th>Partidas</th><th>Estado</th><th></th></tr></thead><tbody>{payments.map((row) => <tr className="border-b border-line/70" key={row.id}><td className="px-3 py-2 font-mono">{row.number}</td><td>{new Date(row.posting_date).toLocaleDateString("es-CO")}</td><td>{row.direction === "receipt" ? "Recaudo" : "Pago proveedor"}</td><td>{row.party?.legal_name || row.party?.name || row.party_id}</td><td>{row.bank.name}</td><td className="text-right">{money(row.amount)}</td><td>{row.applications.map((item) => `${item.source_number}: ${money(item.amount)}`).join(" · ")}</td><td>{row.status === "posted" ? "Contabilizado" : "Anulado"}</td><td>{row.status === "posted" ? <button className="text-red-700 underline" onClick={() => cancelPayment(row)}>Anular</button> : null}</td></tr>)}</tbody></table></div>;
}
