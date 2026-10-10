"use client";

import { ArrowLeft, Calculator, Download, FileText, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { API_BASE_URL } from "../../../../lib/apiBaseUrl";

type Employee = { id: number; code?: string; name?: string; salary_base?: number; contract_type?: string; metadata?: { name?: string } };
type Line = { code: string; name: string; quantity: number; rate: number; amount: number; source?: string; accrued_amount?: number; paid_amount?: number; balance_amount?: number };
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
type Balance = { id: number; employee_id: number; employee_name?: string; concept_code: string; period_key: string; accrued_amount: number; paid_amount: number; balance_amount: number };

const today = new Date().toISOString().slice(0, 10);

function money(value?: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function employeeLabel(employee: Employee) {
  return employee.metadata?.name || employee.name || employee.code || `Empleado ${employee.id}`;
}

export default function EmployeeTerminationLiquidationPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<TerminationDocument[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [preview, setPreview] = useState<TerminationDocument | null>(null);
  const [selected, setSelected] = useState<TerminationDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ employee_id: "", termination_date: today, termination_reason: "retiro_voluntario", contract_type: "indefinite", pending_salary_days: "0", remaining_days: "", recalculate: false, mark_inactive: false });

  async function load() {
    const [employeeRows, documentRows, balanceRows] = await Promise.all([
      api<Employee[]>("/api/v1/talento-humano/empleados?active=true", { cache: "no-store" }),
      api<TerminationDocument[]>("/api/v1/talento-humano/liquidacion-trabajador/documentos?limit=200", { cache: "no-store" }).catch(() => []),
      api<Balance[]>("/api/v1/talento-humano/liquidacion-trabajador/saldos?limit=500", { cache: "no-store" }).catch(() => [])
    ]);
    setEmployees(employeeRows);
    setDocuments(documentRows);
    setBalances(balanceRows);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "No se pudo cargar liquidacion"));
  }, []);

  const selectedEmployee = useMemo(() => employees.find((row) => String(row.id) === String(form.employee_id)), [employees, form.employee_id]);
  const employeeBalances = balances.filter((row) => String(row.employee_id) === String(form.employee_id));

  function payload() {
    return {
      employee_id: form.employee_id,
      termination_date: form.termination_date,
      termination_reason: form.termination_reason,
      contract_type: form.contract_type || selectedEmployee?.contract_type || "indefinite",
      pending_salary_days: Number(form.pending_salary_days || 0),
      remaining_days: form.remaining_days === "" ? undefined : Number(form.remaining_days),
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

  const canRun = Boolean(form.employee_id && form.termination_date && form.termination_reason);
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
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-sm">Empleado
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.employee_id} onChange={(event) => {
              const employee = employees.find((row) => String(row.id) === event.target.value);
              setForm((current) => ({ ...current, employee_id: event.target.value, contract_type: employee?.contract_type || current.contract_type }));
            }}>
              <option value="">Selecciona</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
            </select>
          </label>
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
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.contract_type} onChange={(event) => setForm((current) => ({ ...current, contract_type: event.target.value }))}>
              <option value="indefinite">Indefinido</option>
              <option value="fixed">Termino fijo</option>
              <option value="obra_labor">Obra labor</option>
            </select>
          </label>
          <label className="text-sm">Dias salario pendiente<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" value={form.pending_salary_days} onChange={(event) => setForm((current) => ({ ...current, pending_salary_days: event.target.value }))} /></label>
          <label className="text-sm">Dias faltantes contrato<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" value={form.remaining_days} onChange={(event) => setForm((current) => ({ ...current, remaining_days: event.target.value }))} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><input checked={form.recalculate} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, recalculate: event.target.checked }))} /> Recalcular si existe</label>
          <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><input checked={form.mark_inactive} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, mark_inactive: event.target.checked }))} /> Inactivar empleado</label>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={busy || !canRun} onClick={previewLiquidation} type="button"><Calculator size={16} /> Liquidacion de prueba</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy || !canRun} onClick={runLiquidation} type="button"><Play size={16} /> Crear documento</button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
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

        <div className="rounded-md border border-line bg-white">
          <div className="border-b border-line p-4"><h2 className="text-base font-semibold">Saldos de prestaciones</h2></div>
          <div className="max-h-[360px] overflow-auto">
            {employeeBalances.length ? employeeBalances.map((row) => (
              <div className="border-b border-line/70 p-3 text-sm" key={row.id}>
                <p className="font-semibold">{row.concept_code}</p>
                <p className="text-neutral-600">{row.period_key}</p>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs"><span>Causado {money(row.accrued_amount)}</span><span>Pagado {money(row.paid_amount)}</span><span>Saldo {money(row.balance_amount)}</span></div>
              </div>
            )) : <p className="p-4 text-sm text-neutral-500">Selecciona un empleado para ver saldos.</p>}
          </div>
        </div>
      </section>

      {selected ? (
        <section className="rounded-md border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line p-4"><h2 className="text-base font-semibold">Detalle legal y conceptos</h2><span className="text-sm text-neutral-500">{money(selected.net)}</span></div>
          <div className="grid gap-3 p-4 text-sm md:grid-cols-4">
            <Info label="Dias servicio" value={String(selected.source_summary?.dias_servicio ?? "--")} />
            <Info label="Dias indemnizacion" value={String(selected.source_summary?.dias_indemnizacion ?? "--")} />
            <Info label="Base salarial" value={money(Number(selected.source_summary?.base_salarial || 0))} />
            <Info label="Regla" value={String(selected.source_summary?.regla_indemnizacion ?? "--")} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2">Cantidad</th><th className="px-3 py-2">Tasa</th><th className="px-3 py-2">Valor</th></tr></thead>
              <tbody>{(selected.lines || []).map((line, index) => <tr className="border-b border-line/70" key={`${line.code}-${index}`}><td className="px-3 py-2 font-medium">{line.code}<p className="text-xs font-normal text-neutral-500">{line.name}</p></td><td className="px-3 py-2">{line.source}</td><td className="px-3 py-2">{line.quantity}</td><td className="px-3 py-2">{money(line.rate)}</td><td className="px-3 py-2 font-semibold">{money(line.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs uppercase text-neutral-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
