"use client";

import { ArrowLeft, Calculator, Download, FileText, Play, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { API_BASE_URL } from "../../../../lib/apiBaseUrl";
import TerminationManualAdjustments from "../../../../components/hr/TerminationManualAdjustments";
import TerminationDayReviews, { SalaryReviewTotals, type SalaryReviewSummary, type ReviewDay } from "../../../../components/hr/TerminationDayReviews";

type Employee = { id: number; code?: string; name?: string; contract_type?: string; metadata?: { name?: string; document?: string; document_type?: string } };
type Line = { code: string; name: string; quantity: number; rate: number; amount: number; source?: string; salary_constitutive?: boolean; metadata?: { date_start?: string; date_end?: string; base?: number }; accrued_amount?: number; paid_amount?: number; balance_amount?: number };
type TerminationDocument = {
  id?: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  termination_date: string;
  termination_reason: string;
  contract_type: string;
  gross: number;
  deductions: number;
  net: number;
  indemnization_amount: number;
  benefit_balance_amount: number;
  lines: Line[];
  source_summary?: Record<string, unknown>;
};
type Loan = { id: number; concept_name: string; mode: string; status: string; balance_amount: number };
type Authorization = { id: number; support: string; benefits_percent: number; legal_support: string };

const today = new Date().toISOString().slice(0, 10);
const contractLabels: Record<string, string> = { indefinite: "Indefinido", fixed: "Término fijo", obra_labor: "Obra o labor" };
const reasonLabels: Record<string, string> = { retiro_voluntario: "Retiro voluntario", terminacion_con_justa_causa: "Con justa causa", sin_justa_causa: "Sin justa causa", mutuo_acuerdo: "Mutuo acuerdo", vencimiento_contrato: "Vencimiento del contrato" };

function money(value?: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function employeeLabel(employee: Employee) {
  return employee.metadata?.name || employee.name || employee.code || `Empleado ${employee.id}`;
}

export default function EmployeeTerminationLiquidationPage() {
  const detailDialog = useRef<HTMLDialogElement>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractReady, setContractReady] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState<{ query: string; rows: Employee[]; error?: string }>();
  const documentQuery = employeeQuery.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const searchResult = employeeSearch?.query === employeeQuery ? employeeSearch : undefined;
  const [documents, setDocuments] = useState<TerminationDocument[]>([]);
  const [preview, setPreview] = useState<TerminationDocument | null>(null);
  const [selected, setSelected] = useState<TerminationDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [pendingDays, setPendingDays] = useState<number | null>(null);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ employee_id: "", termination_date: today, termination_reason: "retiro_voluntario", contract_type: "indefinite", pending_start: "", recalculate: false, mark_inactive: false });

  async function load() {
    const documentRows = await api<TerminationDocument[]>("/api/v1/talento-humano/liquidacion-trabajador/documentos?limit=200", { cache: "no-store" }).catch(() => []);
    setDocuments(documentRows);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "No se pudo cargar liquidacion"));
  }, []);

  useEffect(() => {
    if (selectedEmployee || documentQuery.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await api<Employee[]>(`/api/v1/talento-humano/empleados?document_search=${encodeURIComponent(documentQuery)}`, { cache: "no-store" });
        if (!cancelled) setEmployeeSearch({ query: employeeQuery, rows });
      } catch {
        if (!cancelled) setEmployeeSearch({ query: employeeQuery, rows: [], error: "No se pudo buscar. Vuelve a escribir el documento." });
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [documentQuery, employeeQuery, selectedEmployee]);

  function selectEmployee(employee: Employee) {
    setSelectedEmployee(employee);
    setEmployeeQuery(employee.metadata?.document || "");
    setForm((current) => ({ ...current, employee_id: String(employee.id), contract_type: employee.contract_type || "indefinite" }));
  }

  useEffect(() => {
    if (selected && detailDialog.current && !detailDialog.current.open) detailDialog.current.showModal();
  }, [selected]);

  useEffect(() => {
    setContractReady(false);
    if (!selectedEmployee) { setLoans([]); setAuthorizations([]); return; }
    let cancelled = false;
    setContractLoading(true);
    Promise.all([
      api<{ contract_type: string; status: string; valid_from: string; valid_to?: string }[]>(`/api/v1/talento-humano/empleados/${selectedEmployee.id}/contratos`, { cache: "no-store" }),
      api<Loan[]>(`/api/v1/talento-humano/libranzas/empleados?employee_id=${selectedEmployee.id}`, { cache: "no-store" })
    ]).then(([contracts, employeeLoans]) => {
      if (cancelled) return;
      const contract = contracts.find(row => row.valid_from.slice(0, 10) <= form.termination_date && (!row.valid_to || row.valid_to.slice(0, 10) >= form.termination_date));
      setForm(current => ({ ...current, contract_type: contract?.contract_type || selectedEmployee.contract_type || "indefinite" }));
      setLoans(employeeLoans.filter(row => row.status === "activa" && row.mode !== "perpetua"));
      setContractReady(true);
    }).catch(err => { if (!cancelled) setMessage(err instanceof Error ? err.message : "No se pudo consultar el contrato."); })
      .finally(() => { if (!cancelled) setContractLoading(false); });
    return () => { cancelled = true; };
  }, [selectedEmployee, form.termination_date]);

  useEffect(() => { setPreview(null); setSelected(null); }, [form.employee_id, form.termination_date, form.termination_reason, form.pending_start, authorizations]);

  function updateAuthorization(id: number, patch: Partial<Authorization>) {
    setAuthorizations(current => {
      const existing = current.find(row => row.id === id) || { id, support: "", benefits_percent: 0, legal_support: "" };
      return [...current.filter(row => row.id !== id), { ...existing, ...patch }];
    });
  }


  function payload() {
    return {
      employee_id: form.employee_id,
      termination_date: form.termination_date,
      termination_reason: form.termination_reason,
      pending_start: form.pending_start || undefined,
      libranza_authorizations: authorizations.filter(row => row.support.trim()),
      recalculate: form.recalculate,
      mark_inactive: form.mark_inactive
    };
  }

  async function previewLiquidation() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ document: TerminationDocument }>("/api/v1/talento-humano/liquidacion-trabajador/preview", { method: "POST", body: JSON.stringify(payload()) });
      setPreview(result.document);
      setSelected(result.document);
      setMessage("Liquidacion de prueba calculada.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo simular");
    } finally {
      setBusy(false);
    }
  }

  async function runLiquidation() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ document: TerminationDocument }>("/api/v1/talento-humano/liquidacion-trabajador/documentos", { method: "POST", body: JSON.stringify(payload()) });
      setPreview(null);
      setSelected(result.document);
      await load();
      setMessage("Documento de liquidacion de trabajador creado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(id?: number) {
    if (!id || !confirm("Esto borra el documento de liquidacion del trabajador y revierte sus saldos asociados. Continuar?")) return;
    setBusy(true);
    try {
      await api(`/api/v1/talento-humano/liquidacion-trabajador/documentos/${id}`, { method: "DELETE" });
      setSelected(null);
      await load();
      setMessage("Documento de liquidacion borrado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  async function openPdf(id?: number) {
    if (!id) return;
    const token = localStorage.getItem("token") || "";
    const response = await fetch(`${API_BASE_URL}/api/v1/talento-humano/liquidacion-trabajador/documentos/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  }

  const canRun = contractReady && !contractLoading && !manualBusy && !reviewBusy && Boolean(form.employee_id && form.termination_date && form.termination_reason);
  const rows = preview ? [preview, ...documents] : documents;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-3xl font-semibold">Liquidacion de trabajador</h1>
          <p className="mt-1 text-sm text-neutral-600">Calcula prestaciones pendientes, indemnizacion por retiro sin justa causa y documento final por empleado.</p>
        </div>
      </header>

      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{message}</p> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <fieldset disabled={busy || manualBusy || reviewBusy}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative text-sm">
            <label htmlFor="termination-employee-document">Empleado</label>
            <div className="relative mt-1">
              <Search aria-hidden="true" className="absolute left-3 top-3 text-neutral-500" size={16} />
              <input id="termination-employee-document" type="search" autoComplete="off" maxLength={80}
                className="h-10 w-full rounded-md border border-line pl-9 pr-3"
                placeholder="Número de documento" value={employeeQuery} disabled={busy || manualBusy || reviewBusy}
                onChange={(event) => {
                  setEmployeeQuery(event.target.value);
                  setSelectedEmployee(null);
                  setEmployeeSearch(undefined);
                  setForm((current) => ({ ...current, employee_id: "", contract_type: "indefinite" }));
                  if (preview) { setPreview(null); setSelected(null); }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !selectedEmployee && searchResult?.rows.length === 1) {
                    event.preventDefault();
                    selectEmployee(searchResult.rows[0]);
                  }
                }} />
            </div>
            {selectedEmployee ? <p className="mt-1 text-xs text-neutral-600">{employeeLabel(selectedEmployee)}</p> : documentQuery.length >= 2 ? (
              <div className="absolute z-20 mt-1 w-full min-w-52 rounded-md border border-line bg-white shadow-sm">
                {searchResult?.rows.length ? (
                  <ul aria-label="Empleados encontrados" className="max-h-64 overflow-y-auto">
                    {searchResult.rows.map((employee) => (
                      <li key={employee.id}>
                        <button type="button" className="w-full px-3 py-2 text-left hover:bg-paper focus-visible:bg-paper" onClick={() => selectEmployee(employee)}>
                          <span className="block font-medium">{employeeLabel(employee)}</span>
                          <span className="text-xs text-neutral-600">{employee.metadata?.document_type} {employee.metadata?.document}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p role="status" className="px-3 py-2">{searchResult ? searchResult.error || "No se encontraron empleados activos." : "Buscando…"}</p>}
              </div>
            ) : null}
          </div>
          <label className="text-sm">Fecha retiro<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={form.termination_date} onChange={(event) => setForm((current) => ({ ...current, termination_date: event.target.value }))} /></label>
          <label className="text-sm">Causal
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.termination_reason} onChange={(event) => setForm((current) => ({ ...current, termination_reason: event.target.value }))}>
              <option value="retiro_voluntario">Retiro voluntario</option>
              <option value="terminacion_con_justa_causa">Con justa causa</option>
              <option value="sin_justa_causa">Sin justa causa</option>
              <option value="mutuo_acuerdo">Mutuo acuerdo</option>
              <option value="vencimiento_contrato">Vencimiento contrato</option>
            </select>
          </label>
          <label className="text-sm">Tipo contrato
            <select aria-label="Tipo contrato vigente" disabled className="mt-1 h-10 w-full rounded-md border border-line px-3 bg-paper" value={form.contract_type}>
              <option value="indefinite">Indefinido</option><option value="fixed">Termino fijo</option><option value="obra_labor">Obra labor</option>
            </select>
            <span className="text-xs text-neutral-500">{contractLoading ? "Consultando contrato…" : "Derivado del maestro de contratos."}</span>
          </label>
          <label className="text-sm">Inicio del salario pendiente<input className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3" type="text" readOnly value={String(preview?.source_summary?.pendientes_desde || "Se determina al consultar los días")} /><span className="text-xs text-neutral-500">Se calcula desde el contrato y los periodos de nómina registrados.</span></label>
        </div>
        <p className="mt-3 text-sm text-neutral-600">Registra las bonificaciones y conceptos manuales en la sección de abajo. Los conceptos personalizados conservan la clasificación del maestro. Las prestaciones ya pagadas se descuentan y los pagos del retiro quedan incluidos en este mismo neto.</p>
        {loans.length ? <fieldset className="mt-4 space-y-3 rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Libranzas al corte</legend>
          <p className="text-xs text-neutral-600">Se intentará cancelar el saldo con autorización expresa para la liquidación final. Se preserva el 50 % del salario neto después de descuentos. Las prestaciones solo se usan con autorización y revisión jurídica del porcentaje; la indemnización queda excluida. El saldo no cubierto seguirá pendiente.</p>
          {loans.map(loan => {
            const auth = authorizations.find(row => row.id === loan.id);
            return <div key={loan.id} data-libranza-id={loan.id} className="grid gap-2 text-sm md:grid-cols-4">
              <p>{loan.concept_name} · #{loan.id}<span className="block text-xs">Saldo actual: {money(loan.balance_amount)}</span></p>
              <label>Soporte autorización final<input className="mt-1 w-full rounded-md border border-line p-2" maxLength={500} value={auth?.support || ""} onChange={event => updateAuthorization(loan.id, { support: event.target.value })} placeholder="Referencia del documento firmado" /></label>
              <label>% prestaciones autorizado<input className="mt-1 w-full rounded-md border border-line p-2" type="number" min={0} max={100} value={auth?.benefits_percent || 0} onChange={event => updateAuthorization(loan.id, { benefits_percent: Number(event.target.value) })} /></label>
              <label>Soporte revisión jurídica<input className="mt-1 w-full rounded-md border border-line p-2" maxLength={500} value={auth?.legal_support || ""} onChange={event => updateAuthorization(loan.id, { legal_support: event.target.value })} placeholder="Obligatorio para usar prestaciones" /></label>
            </div>;
          })}
        </fieldset> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><input checked={form.recalculate} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, recalculate: event.target.checked }))} /> Recalcular si existe</label>
          <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><input checked={form.mark_inactive} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, mark_inactive: event.target.checked }))} /> Inactivar empleado</label>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={busy || !canRun} onClick={previewLiquidation} type="button"><Calculator size={16} /> Liquidacion de prueba</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy || !canRun || pendingDays !== 0} onClick={runLiquidation} type="button"><Play size={16} /> Crear documento</button>
        </div>
        </fieldset>
      </section>

      <TerminationDayReviews employeeId={Number(form.employee_id) || null} terminationDate={form.termination_date} pendingStart={form.pending_start} refresh={reviewRefresh} disabled={busy || manualBusy} onBusy={setReviewBusy} onPendingChange={setPendingDays} onChanged={() => { setPreview(null); setSelected(null); }} />
      <TerminationManualAdjustments employeeId={Number(form.employee_id) || null} terminationDate={form.termination_date} pendingStart={form.pending_start} disabled={busy || reviewBusy} onBusy={setManualBusy} onChanged={() => { setPreview(null); setSelected(null); setPendingDays(null); setReviewRefresh(value => value + 1); }} />

      <section>
        <div className="rounded-md border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line p-4"><h2 className="text-base font-semibold">Documentos</h2><span className="text-sm text-neutral-500">{rows.length} registros</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Causal</th><th className="px-3 py-2">Prestaciones</th><th className="px-3 py-2">Indemnizacion</th><th className="px-3 py-2">Neto</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
              <tbody>{rows.map((row, index) => (
                <tr className="border-b border-line/70" key={`${row.id || "preview"}-${index}`}>
                  <td className="px-3 py-2 font-medium">{row.employee_name || row.employee_code || row.employee_id}{!row.id ? <p className="text-xs text-amber-600">Prueba sin guardar</p> : null}</td>
                  <td className="px-3 py-2">{String(row.termination_date).slice(0, 10)}</td>
                  <td className="px-3 py-2">{row.termination_reason}</td>
                  <td className="px-3 py-2">{money(row.benefit_balance_amount)}</td>
                  <td className="px-3 py-2">{money(row.indemnization_amount)}</td>
                  <td className="px-3 py-2 font-semibold">{money(row.net)}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="mr-2 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3" onClick={() => setSelected(row)} type="button"><FileText size={15} /> Ver</button>
                    <button className="mr-2 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 disabled:opacity-50" disabled={!row.id} onClick={() => openPdf(row.id)} type="button"><Download size={15} /> PDF</button>
                    <button className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-rose-700 disabled:opacity-50" disabled={!row.id} onClick={() => deleteDocument(row.id)} type="button"><Trash2 size={15} /> Borrar</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

      </section>

      {selected ? (
        <dialog ref={detailDialog} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-labelledby="termination-detail-title" className="m-auto max-h-[90dvh] w-[95vw] max-w-6xl overflow-auto rounded-md border border-line bg-white p-0 backdrop:bg-black/40">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white p-4">
            <div><h2 id="termination-detail-title" className="text-base font-semibold">Detalle completo de liquidación</h2><p className="text-sm">{selected.employee_name || String(selected.source_summary?.employee_name || "")} · Retiro {String(selected.termination_date).slice(0, 10)} · {contractLabels[selected.contract_type] || selected.contract_type}</p></div>
            <button type="button" autoFocus onClick={() => { detailDialog.current?.close(); setSelected(null); }} aria-label="Cerrar detalle de liquidación" className="rounded-md border border-line p-2"><X size={18} /></button>
          </div>
          <div className="grid gap-3 p-4 text-sm md:grid-cols-3"><Info label="Devengos" value={money(selected.gross)} /><Info label="Deducciones" value={money(selected.deductions)} /><Info label="Neto a pagar" value={money(selected.net)} /></div>
          {Number(selected.source_summary?.dias_sin_justificar || 0) > 0 ? <p role="alert" className="m-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Vista provisional: hay {Number(selected.source_summary?.dias_sin_justificar)} día(s) pendientes de justificar. No se puede guardar este retiro.</p> : null}
          {selected.source_summary?.resumen_salario_pendiente ? <div className="p-4"><SalaryReviewTotals summary={selected.source_summary.resumen_salario_pendiente as SalaryReviewSummary} /></div> : null}
          {Array.isArray(selected.source_summary?.revision_dias) ? <details className="mx-4 mb-4 rounded-md border border-line p-3 text-sm"><summary className="cursor-pointer font-semibold">Soporte de los días del salario pendiente</summary><ul className="mt-2 space-y-2">{(selected.source_summary.revision_dias as ReviewDay[]).map(day => <li key={day.date} className="border-t border-line pt-2">{day.date} · {day.status === "pendiente" ? "Pendiente de aclarar" : day.paid ? "Remunerado" : "No remunerado"} · {day.classification.replaceAll("_", " ")}{day.note ? <p>{day.note} · Responsable: {day.actor_name || day.actor_id || "Registrado en el soporte"}</p> : null}</li>)}</ul></details> : null}
          <div className="grid gap-3 p-4 text-sm md:grid-cols-4">
            <Info label="Ingreso" value={String(selected.source_summary?.fecha_ingreso || "--")} />
            <Info label="Pendientes desde" value={String(selected.source_summary?.pendientes_desde || "--")} />
            <Info label="Causal" value={reasonLabels[selected.termination_reason] || selected.termination_reason} />
            <Info label="Contrato maestro" value={String(selected.source_summary?.contrato_id || selected.source_summary?.contrato_fuente || "--")} />
            <Info label="Dias servicio" value={String(selected.source_summary?.dias_servicio ?? "--")} />
            <Info label="Días faltantes contrato" value={String(selected.source_summary?.dias_faltantes_contrato ?? "--")} />
            <Info label="Dias indemnizacion" value={String(selected.source_summary?.dias_indemnizacion ?? "--")} />
            <Info label="Base salarial" value={money(Number(selected.source_summary?.base_salarial || 0))} />
            <Info label="Regla" value={String(selected.source_summary?.regla_indemnizacion ?? "--")} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2">Cantidad</th><th className="px-3 py-2">Tasa</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Causado</th><th className="px-3 py-2">Pagado previo</th><th className="px-3 py-2">Saldo</th></tr></thead>
              <tbody>{(selected.lines || []).map((line, index) => <tr className="border-b border-line/70" key={`${line.code}-${index}`}><td className="px-3 py-2 font-medium">{line.code}<p className="text-xs font-normal text-neutral-500">{line.name}</p>{line.metadata?.base != null ? <p className="text-xs font-normal text-neutral-500">{line.metadata.date_start} a {line.metadata.date_end} · Base {money(line.metadata.base)}</p> : <p className="text-xs font-normal text-neutral-500">{line.salary_constitutive === false ? "No salarial" : "Salarial"}</p>}</td><td className="px-3 py-2">{line.source}</td><td className="px-3 py-2">{line.quantity}</td><td className="px-3 py-2">{money(line.rate)}</td><td className="px-3 py-2 font-semibold">{money(line.amount)}</td><td className="px-3 py-2">{line.accrued_amount == null ? "—" : money(line.accrued_amount)}</td><td className="px-3 py-2">{line.paid_amount == null ? "—" : money(line.paid_amount)}</td><td className="px-3 py-2">{line.balance_amount == null ? "—" : money(line.balance_amount)}</td></tr>)}</tbody>
            </table>
          </div>
          {Array.isArray(selected.source_summary?.pagos_prestaciones) ? <div className="space-y-2 p-4 text-sm"><h3 className="font-semibold">Pagos de prestaciones integrados</h3><p>Estos comprobantes forman parte del neto de esta liquidación y no se pagan nuevamente por separado.</p>{(selected.source_summary.pagos_prestaciones as { payment_type: string; document_id: number; amount: number }[]).map(row => <p key={row.document_id}>Comprobante #{row.document_id} · {row.payment_type} · {money(row.amount)} · Pago definitivo al trabajador</p>)}</div> : null}
          {Array.isArray(selected.source_summary?.libranzas) ? <div className="space-y-2 p-4 text-sm"><h3 className="font-semibold">Aplicación y saldos de libranzas</h3>{(selected.source_summary.libranzas as { libranza_id: number; balance_before: number; deducted: number; balance_after: number; reason: string }[]).map(row => <p key={row.libranza_id}>Libranza {row.libranza_id}: saldo {money(row.balance_before)} · descontado {money(row.deducted)} · pendiente {money(row.balance_after)}. {row.reason}</p>)}</div> : null}
          <p className="p-4 text-xs text-neutral-600">{String(selected.source_summary?.politica_libranza || "")}</p>
        </dialog>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs uppercase text-neutral-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
