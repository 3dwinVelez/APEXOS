"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type Concept = { code: string; name: string; salary_constitutive: boolean };
type Adjustment = { id: number; concept_code: string; description: string; amount: number; metadata?: { work_date?: string; date_start?: string } };
type Context = { pending_start: string; termination_date: string; requires_recalculation: boolean; concepts: Concept[]; adjustments: Adjustment[] };
type Props = { employeeId: number | null; terminationDate: string; pendingStart: string; disabled: boolean; onChanged: () => void; onBusy: (busy: boolean) => void };
const base = "/api/v1/talento-humano/liquidacion-trabajador/ajustes";
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(Number(value));

export default function TerminationManualAdjustments({ employeeId, terminationDate, pendingStart, disabled, onChanged, onBusy }: Props) {
  const [workDate, setWorkDate] = useState(terminationDate);
  const [code, setCode] = useState("BONIFICACION_SALARIAL");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<{ key: string; data?: Context; error?: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const requestId = useRef("");
  const query = new URLSearchParams({ employee_id: String(employeeId || ""), termination_date: terminationDate, ...(pendingStart ? { pending_start: pendingStart } : {}), ...(workDate ? { work_date: workDate } : {}) }).toString();
  const data = result?.key === query ? result.data : undefined;
  const concept = data?.concepts.find(row => row.code === code);

  useEffect(() => { setWorkDate(terminationDate); setAmount(""); setDescription(""); setMessage(""); requestId.current = ""; }, [employeeId, terminationDate, pendingStart]);
  useEffect(() => {
    if (!employeeId || !terminationDate || !workDate) return;
    let cancelled = false;
    api<Context>(`${base}?${query}`, { cache: "no-store" }).then(data => { if (!cancelled) setResult({ key: query, data }); })
      .catch(err => { if (!cancelled) setResult({ key: query, error: err instanceof Error ? err.message : "No se pudieron consultar los ajustes." }); });
    return () => { cancelled = true; };
  }, [employeeId, terminationDate, workDate, query]);

  async function mutate(id?: number) {
    if (inFlight.current || disabled || !data) return;
    inFlight.current = true; setBusy(true); onBusy(true); setMessage("");
    try {
      if (id) await api(`${base}/${id}?${query}`, { method: "DELETE" });
      else {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        await api(base, { method: "POST", body: JSON.stringify({ employee_id: employeeId, termination_date: terminationDate, pending_start: pendingStart || undefined, work_date: workDate, concept_code: code, amount: Number(amount), description, request_id: requestId.current }) });
        setAmount(""); setDescription(""); requestId.current = "";
      }
      onChanged();
      const next = await api<Context>(`${base}?${query}`, { cache: "no-store" });
      setResult({ key: query, data: next });
      setMessage(`${id ? "Concepto anulado." : "Concepto registrado."} ${next.requires_recalculation ? "Recalcula el documento de retiro para actualizarlo." : "Calcula la liquidación para incluir el cambio."}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar el ajuste.");
    } finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }

  const valid = Boolean(concept && Number.isFinite(Number(amount)) && Number(amount) > 0 && workDate && data && workDate >= data.pending_start && workDate <= terminationDate);
  return <section aria-labelledby="termination-manual-title" className="rounded-md border border-line bg-white p-4">
    <h2 id="termination-manual-title" className="text-base font-semibold">Bonificaciones y conceptos manuales</h2>
    <p className="mt-1 text-sm text-neutral-600">Registra aquí los devengos adicionales del empleado. Se guardan como ajustes compartidos con nómina y se incluyen una sola vez en la liquidación. La clasificación salarial proviene del maestro.</p>
    {!employeeId ? <p className="mt-3 text-sm text-neutral-500">Selecciona un empleado para registrar sus conceptos.</p> : <>
      {data?.requires_recalculation ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Ya existe una liquidación para este retiro. Los cambios requieren recalcular ese documento.</p> : null}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
      {result?.key === query && result.error ? <p role="alert" className="mt-3 text-sm text-red-700">{result.error}</p> : null}
      <fieldset disabled={busy || disabled} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm">Concepto manual<select aria-label="Concepto manual" className="mt-1 h-10 w-full rounded-md border border-line px-2" value={code} onChange={event => { setCode(event.target.value); requestId.current = ""; }}><option value="">Seleccionar concepto</option>{data?.concepts.map(row => <option key={row.code} value={row.code}>{row.name} ({row.code})</option>)}</select></label>
        <label className="text-sm">Fecha del concepto<input aria-label="Fecha del concepto" className="mt-1 h-10 w-full rounded-md border border-line px-2" type="date" min={data?.pending_start} max={terminationDate} value={workDate} onChange={event => { setWorkDate(event.target.value); requestId.current = ""; }} /></label>
        <label className="text-sm">Valor del concepto<input aria-label="Valor del concepto" className="mt-1 h-10 w-full rounded-md border border-line px-2" type="number" min="0.01" step="0.01" max="999999999999.99" value={amount} onChange={event => { setAmount(event.target.value); requestId.current = ""; }} /></label>
        <label className="text-sm">Descripción del concepto<input aria-label="Descripción del concepto" className="mt-1 h-10 w-full rounded-md border border-line px-2" maxLength={500} value={description} onChange={event => { setDescription(event.target.value); requestId.current = ""; }} /></label>
        <div className="text-sm"><p>Clasificación</p><p data-testid="termination-manual-classification" className="mt-1 py-2 font-semibold">{concept ? concept.salary_constitutive ? "Salarial" : "No salarial" : "Según el concepto"}</p><button type="button" className="rounded-md bg-apex px-3 py-2 font-semibold text-white disabled:opacity-50" disabled={busy || disabled || !valid} onClick={() => void mutate()}>Registrar concepto</button></div>
      </fieldset>
      {data ? <p className="mt-2 text-xs text-neutral-500">Tramo pendiente: {data.pending_start} a {data.termination_date}. Los conceptos que ya cubre una nómina no se registran en este retiro.</p> : !result?.error ? <p role="status" className="mt-2 text-sm">Consultando conceptos…</p> : null}
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-line text-left"><th className="p-2">Concepto</th><th className="p-2">Descripción</th><th className="p-2">Fecha</th><th className="p-2">Valor</th><th className="p-2">Acciones</th></tr></thead><tbody>{data?.adjustments.map(row => <tr data-adjustment-id={row.id} key={row.id} className="border-b border-line/70"><td className="p-2">{row.concept_code}</td><td className="p-2">{row.description}</td><td className="p-2">{row.metadata?.work_date || row.metadata?.date_start || "Según periodo"}</td><td className="p-2">{money(row.amount)}</td><td className="p-2"><button type="button" aria-label={`Anular concepto ${row.id}`} className="rounded-md border border-line px-2 py-1 text-red-700 disabled:opacity-50" disabled={busy || disabled || !(row.metadata?.work_date || row.metadata?.date_start)} onClick={() => void mutate(row.id)}>Anular</button></td></tr>)}</tbody></table></div>
      {data && !data.adjustments.length ? <p className="mt-2 text-sm text-neutral-500">Sin conceptos manuales pendientes.</p> : null}
    </>}
  </section>;
}
