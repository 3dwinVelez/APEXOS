"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
export type ReviewDay = { date: string; status: string; paid: boolean; classification: string; note: string; actor_name: string; actor_id?: number; reviewed_at?: string };
export type SalaryReviewSummary = { dias_reconocidos: number; dias_no_remunerados: number; dias_pendientes: number; valor_diario: number; salario_pendiente: number };
type Context = { days: ReviewDay[]; summary: SalaryReviewSummary; pending_start: string; classifications: Record<string, { label: string; paid: boolean }> };
const base = "/api/v1/talento-humano/liquidacion-trabajador/revision-dias";
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(value || 0);
export function SalaryReviewTotals({ summary }: { summary: SalaryReviewSummary }) {
  return <div className="grid gap-2 text-sm md:grid-cols-5" aria-label="Resumen del salario pendiente">{[["Días reconocidos", summary.dias_reconocidos], ["Días no remunerados", summary.dias_no_remunerados], ["Días por aclarar", summary.dias_pendientes], ["Valor diario", money(summary.valor_diario)], ["Salario básico pendiente", money(summary.salario_pendiente)]].map(([label, value]) => <p className="rounded-md border border-line bg-paper p-3" key={label}><span className="block text-xs text-neutral-600">{label}</span><strong>{value}</strong></p>)}</div>;
}
export default function TerminationDayReviews({ employeeId, terminationDate, pendingStart, refresh, disabled, onChanged, onBusy, onPendingChange }: { employeeId: number | null; terminationDate: string; pendingStart: string; refresh: number; disabled: boolean; onChanged: () => void; onBusy: (busy: boolean) => void; onPendingChange: (count: number | null) => void }) {
  const query = new URLSearchParams({ employee_id: String(employeeId || ""), termination_date: terminationDate, ...(pendingStart ? { pending_start: pendingStart } : {}) }).toString();
  const [result, setResult] = useState<{ key: string; data?: Context; error?: string }>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false), retry = useRef({ key: "", id: "" });
  const data = result?.key === query ? result.data : undefined;
  useEffect(() => {
    let cancelled = false; onPendingChange(null); setMessage("");
    if (employeeId && terminationDate) api<Context>(`${base}?${query}`, { cache: "no-store" }).then(data => { if (!cancelled) { setResult({ key: query, data }); onPendingChange(data.summary.dias_pendientes); } }).catch(error => { if (!cancelled) setResult({ key: query, error: error.message }); });
    return () => { cancelled = true; };
  }, [employeeId, terminationDate, query, refresh, onPendingChange]);
  async function save(day: ReviewDay, classification: string, note: string) {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusy(true); setMessage("");
    const key = JSON.stringify([query, day.date, classification, note]);
    if (retry.current.key !== key) retry.current = { key, id: crypto.randomUUID() };
    try {
      const response = await api<{ requires_recalculation: boolean }>(base, { method: "POST", body: JSON.stringify({ employee_id: employeeId, termination_date: terminationDate, ...(pendingStart ? { pending_start: pendingStart } : {}), work_date: day.date, classification, note, request_id: retry.current.id }) });
      onChanged(); onPendingChange(null);
      const next = await api<Context>(`${base}?${query}`, { cache: "no-store" }); setResult({ key: query, data: next }); onPendingChange(next.summary.dias_pendientes);
      setMessage(response.requires_recalculation ? "Justificación guardada. Recalcula el retiro existente para actualizar sus valores." : "Justificación guardada. La nómina y el retiro usarán esta revisión."); retry.current = { key: "", id: "" };
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar la justificación."); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  if (!employeeId) return null;
  return <section className="space-y-3 rounded-md border border-line bg-white p-4" aria-label="Revisión de días del retiro">
    <h2 className="font-semibold">Revisión del salario pendiente</h2>
    <p className="text-sm text-neutral-600">La fecha del contrato determina el inicio. Un día sin marcación requiere aclaración antes de guardar el retiro.</p>
    {!data ? <p role="status" className="text-sm">{result?.key === query && result.error ? result.error : "Consultando días pendientes…"}</p> : <>
      <SalaryReviewTotals summary={data.summary} />
      <p className="text-sm">Salarios pendientes desde {data.pending_start} hasta {terminationDate}.</p>
      {data.summary.dias_pendientes > 0 ? <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Hay {data.summary.dias_pendientes} día(s) por aclarar. La vista de prueba es provisional; el guardado definitivo está bloqueado.</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Fecha</th><th className="p-2">Estado / clasificación</th><th className="p-2">Observación y responsable</th><th className="p-2">Acción</th></tr></thead><tbody>{data.days.map(day => <ReviewRow key={`${day.date}:${day.reviewed_at || day.status}`} day={day} choices={data.classifications} disabled={disabled || busy} save={save} />)}</tbody></table></div>
      {!data.days.length ? <p className="text-sm">No hay días pendientes de salario en el tramo seleccionado.</p> : null}
    </>}
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
function ReviewRow({ day, choices, disabled, save }: { day: ReviewDay; choices: Context["classifications"]; disabled: boolean; save: (day: ReviewDay, classification: string, note: string) => Promise<void> }) {
  const [classification, setClassification] = useState(day.classification in choices ? day.classification : ""), [note, setNote] = useState(day.note);
  return <tr data-review-date={day.date} className="border-t border-line"><td className="p-2 align-top">{day.date}</td><td className="p-2 align-top">{day.status === "soportado" ? (day.paid ? "Jornada o novedad remunerada registrada" : "Novedad no remunerada registrada") : <><span className="block text-xs">{day.status === "pendiente" ? "Pendiente de aclarar" : day.paid ? "Justificado · remunerado" : "Justificado · no remunerado"}</span><select aria-label={`Clasificación ${day.date}`} className="mt-1 h-10 rounded-md border border-line px-2" disabled={disabled} value={classification} onChange={event => setClassification(event.target.value)}><option value="">Seleccionar</option>{Object.entries(choices).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}</select></>}</td><td className="p-2 align-top">{day.status !== "soportado" ? <textarea aria-label={`Observación ${day.date}`} className="w-full min-w-48 rounded-md border border-line p-2" disabled={disabled} value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /> : null}{day.actor_name ? <p className="text-xs text-neutral-600">{day.actor_name} · {day.reviewed_at}{day.status === "soportado" ? ` · Revisión previa: ${day.note}` : ""}</p> : null}</td><td className="p-2 align-top">{day.status !== "soportado" ? <button aria-label={`Guardar justificación ${day.date}`} className="rounded-md bg-apex px-3 py-2 text-white disabled:opacity-50" type="button" disabled={disabled || !classification || note.trim().length < 5} onClick={() => void save(day, classification, note)}>Guardar justificación</button> : null}</td></tr>;
}
