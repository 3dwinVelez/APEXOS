"use client";

import { ArrowLeft, Calculator, FileText, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/api";

type ContributionDocument = {
  id?: number;
  period_key: string;
  period_type: string;
  date_start: string;
  date_end: string;
  total_ibc: number;
  total_employee: number;
  total_employer: number;
  total_payable: number;
  source_summary?: { employees?: number; lines?: number; missing_affiliations?: number };
  employees?: ContributionEmployee[];
  lines?: ContributionLine[];
};
type ContributionEmployee = { employee_id: number; employee_name: string; employee_code?: string; ibc: number; employee_amount: number; employer_amount: number; total_amount: number; documents: number };
type ContributionLine = {
  id?: number;
  employee_name?: string;
  employee_code?: string;
  entity_type: string;
  entity_name?: string;
  concept_code: string;
  concept_name: string;
  ibc: number;
  employee_percent: number;
  employer_percent: number;
  employee_amount: number;
  employer_amount: number;
  total_amount: number;
  metadata?: { missing_affiliation?: boolean; source?: string; arl_risk_class?: number; novedades_pila?: Array<{ code: string; days: number }>; ibc_delta?: number };
};

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

function money(value?: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function contributionConceptKey(code: string) {
  return String(code || "")
    .replace(/^DED_/, "")
    .replace(/^APORTE_/, "");
}

function contributionConceptLabel(code: string, fallback = "") {
  const key = contributionConceptKey(code);
  const labels: Record<string, string> = {
    SALUD: "Salud",
    PENSION: "Pension",
    FONDO_SOLIDARIDAD_PENSIONAL: "Fondo solidaridad",
    ARL: "ARL",
    CAJA: "Caja de compensacion",
    ICBF: "ICBF",
    SENA: "SENA"
  };
  if (labels[key]) return labels[key];
  return String(fallback || key).replace(/^Deduccion\s+/i, "").replace(/^Aporte\s+/i, "").replace(/\s+emplead(or|o)$/i, "");
}

export default function SocialContributionsPage() {
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(monthEnd);
  const [periodType, setPeriodType] = useState("mes");
  const [documents, setDocuments] = useState<ContributionDocument[]>([]);
  const [preview, setPreview] = useState<ContributionDocument | null>(null);
  const [selected, setSelected] = useState<ContributionDocument | null>(null);
  const [lines, setLines] = useState<ContributionLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const periodKey = `${periodType}:${startDate}:${endDate}`;
  const rows = preview ? [preview, ...documents] : documents;
  const totals = selected || preview;

  const conceptGroups = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of lines) {
      const key = contributionConceptKey(line.concept_code);
      if (!map.has(key)) map.set(key, contributionConceptLabel(line.concept_code, line.concept_name || line.concept_code));
    }
    return Array.from(map.entries());
  }, [lines]);

  const employeeMatrix = useMemo(() => {
    const map = new Map<string, { key: string; employee_name: string; ibc: number; concepts: Record<string, { employee: number; employer: number }>; total_employee: number; total_employer: number; total: number }>();
    for (const line of lines) {
      const key = String(line.employee_code || line.employee_name || "");
      let row = map.get(key);
      if (!row) {
        row = { key, employee_name: line.employee_name || line.employee_code || key, ibc: 0, concepts: {}, total_employee: 0, total_employer: 0, total: 0 };
        map.set(key, row);
      }
      row.ibc = Math.max(row.ibc, Number(line.ibc || 0));
      const conceptKey = contributionConceptKey(line.concept_code);
      const current = row.concepts[conceptKey] || { employee: 0, employer: 0 };
      current.employee += Number(line.employee_amount || 0);
      current.employer += Number(line.employer_amount || 0);
      row.concepts[conceptKey] = current;
      row.total_employee += Number(line.employee_amount || 0);
      row.total_employer += Number(line.employer_amount || 0);
      row.total += Number(line.total_amount || 0);
    }
    return Array.from(map.values());
  }, [lines]);

  async function load() {
    const data = await api<ContributionDocument[]>("/api/v1/talento-humano/aportes-sociales/documentos?limit=100", { cache: "no-store" }).catch(() => []);
    setDocuments(data);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "No se pudieron cargar aportes"));
  }, []);

  async function previewDocument() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ document: ContributionDocument }>("/api/v1/talento-humano/aportes-sociales/preview", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: periodKey })
      });
      setPreview(result.document);
      setSelected(result.document);
      setLines(result.document.lines || []);
      setMessage("Aportes calculados en modo prueba.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo calcular");
    } finally {
      setBusy(false);
    }
  }

  async function runDocument(recalculate = false) {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/talento-humano/aportes-sociales/documentos", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: periodKey, recalculate })
      });
      setPreview(null);
      await load();
      setMessage(recalculate ? "Documento recalculado." : "Documento de aportes creado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(row: ContributionDocument) {
    setSelected(row);
    if (!row.id) {
      setLines(row.lines || []);
      return;
    }
    const data = await api<ContributionLine[]>(`/api/v1/talento-humano/aportes-sociales/documentos/${row.id}/lineas?limit=2000`, { cache: "no-store" });
    setLines(data);
  }

  async function deleteDocument(id?: number) {
    if (!id || !confirm("Esto borra el documento de aportes sociales del periodo. Continuar?")) return;
    setBusy(true);
    try {
      await api(`/api/v1/talento-humano/aportes-sociales/documentos/${id}`, { method: "DELETE" });
      setSelected(null);
      setLines([]);
      await load();
      setMessage("Documento de aportes borrado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
        <h1 className="mt-2 text-3xl font-semibold">Aportes sociales</h1>
        <p className="mt-1 text-sm text-neutral-600">Liquida salud, pension, ARL, caja, ICBF y SENA por periodo, empleado y entidad afiliada.</p>
      </header>

      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{message}</p> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">Tipo periodo<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={periodType} onChange={(event) => setPeriodType(event.target.value)}><option value="mes">Mes</option><option value="quincena">Quincena</option></select></label>
          <label className="text-sm">Fecha inicio<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-sm">Fecha fin<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <div className="text-sm">Periodo<p className="mt-1 flex h-10 items-center rounded-md border border-line bg-paper px-3 font-mono text-xs">{periodKey}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={busy} onClick={previewDocument} type="button"><Calculator size={16} /> Calcular prueba</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy} onClick={() => runDocument(false)} type="button"><Play size={16} /> Crear documento</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={busy} onClick={() => runDocument(true)} type="button"><Play size={16} /> Recalcular</button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Kpi label="IBC" value={money(totals?.total_ibc)} />
        <Kpi label="Empleado" value={money(totals?.total_employee)} />
        <Kpi label="Empleador" value={money(totals?.total_employer)} />
        <Kpi label="Total planilla" value={money(totals?.total_payable)} />
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4"><h2 className="text-base font-semibold">Documentos</h2><span className="text-sm text-neutral-500">{rows.length} registros</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Periodo</th><th className="px-3 py-2">IBC</th><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Empleador</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Alertas</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr className="border-b border-line/70" key={`${row.id || "preview"}-${index}`}><td className="px-3 py-2 font-medium">{row.period_key}{!row.id ? <p className="text-xs text-amber-600">Prueba sin guardar</p> : null}</td><td className="px-3 py-2">{money(row.total_ibc)}</td><td className="px-3 py-2">{money(row.total_employee)}</td><td className="px-3 py-2">{money(row.total_employer)}</td><td className="px-3 py-2 font-semibold">{money(row.total_payable)}</td><td className="px-3 py-2">{row.source_summary?.missing_affiliations || 0} afiliaciones faltantes</td><td className="px-3 py-2 text-right"><button className="mr-2 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3" onClick={() => openDocument(row)} type="button"><FileText size={15} /> Ver</button><button className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-rose-700 disabled:opacity-50" disabled={!row.id} onClick={() => deleteDocument(row.id)} type="button"><Trash2 size={15} /> Borrar</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4"><h2 className="text-base font-semibold">Resumen por empleado</h2><p className="text-sm text-neutral-500">IBC, aportes por concepto, deducciones del empleado y aportes del empleador.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm" data-table-layout="detail">
            <thead>
              <tr className="border-b border-line bg-paper text-center text-xs uppercase text-neutral-500">
                <th className="px-3 py-2 text-left" rowSpan={2}>Empleado</th>
                <th className="px-3 py-2 text-right" rowSpan={2}>IBC</th>
                <th className="border-l border-line px-3 py-2" colSpan={3}>Total</th>
                {conceptGroups.map(([code, name]) => <th className="border-l border-line px-3 py-2" colSpan={2} key={code}>{name}</th>)}
              </tr>
              <tr className="border-b border-line bg-paper text-[11px] uppercase text-neutral-500">
                <th className="border-l border-line px-3 py-1.5 text-right">Empleado</th>
                <th className="px-3 py-1.5 text-right">Empleador</th>
                <th className="px-3 py-1.5 text-right">Planilla</th>
                {conceptGroups.map(([code]) => <Fragment key={`${code}-sub`}><th className="border-l border-line px-3 py-1.5 text-right">Empleador</th><th className="px-3 py-1.5 text-right">Empleado</th></Fragment>)}
              </tr>
            </thead>
            <tbody>{employeeMatrix.map((row) => (
              <tr className="border-b border-line/70" key={row.key}>
                <td className="px-3 py-2 font-medium">{row.employee_name}</td>
                <td className="px-3 py-2 text-right">{money(row.ibc)}</td>
                <td className="border-l border-line px-3 py-2 text-right">{money(row.total_employee)}</td>
                <td className="px-3 py-2 text-right">{money(row.total_employer)}</td>
                <td className="px-3 py-2 text-right font-semibold">{money(row.total)}</td>
                {conceptGroups.map(([code]) => {
                  const cell = row.concepts[code];
                  return <Fragment key={`${row.key}-${code}`}><td className="border-l border-line px-3 py-2 text-right">{cell?.employer ? money(cell.employer) : "--"}</td><td className="px-3 py-2 text-right">{cell?.employee ? money(cell.employee) : "--"}</td></Fragment>;
                })}
              </tr>
            ))}</tbody>
            {employeeMatrix.length ? (
              <tfoot className="border-t-2 border-line bg-paper font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{money(totals?.total_ibc)}</td>
                  <td className="border-l border-line px-3 py-2 text-right">{money(totals?.total_employee)}</td>
                  <td className="px-3 py-2 text-right">{money(totals?.total_employer)}</td>
                  <td className="px-3 py-2 text-right">{money(totals?.total_payable)}</td>
                  {conceptGroups.map(([code]) => <Fragment key={`total-${code}`}><td className="border-l border-line px-3 py-2 text-right">{money(employeeMatrix.reduce((sum, row) => sum + (row.concepts[code]?.employer || 0), 0))}</td><td className="px-3 py-2 text-right">{money(employeeMatrix.reduce((sum, row) => sum + (row.concepts[code]?.employee || 0), 0))}</td></Fragment>)}
                </tr>
              </tfoot>
            ) : null}
          </table>
          {!employeeMatrix.length ? <p className="p-4 text-sm text-neutral-500">Calcula o abre un documento para ver el resumen por empleado.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line bg-white p-4"><p className="text-xs uppercase text-neutral-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
