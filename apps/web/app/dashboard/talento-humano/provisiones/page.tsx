"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Play } from "lucide-react";
import { api } from "@/lib/api";

type ProvisionLine = {
  employee_id: number;
  employee_name?: string;
  code: string;
  name: string;
  base?: number;
  quantity: number;
  formula?: string;
  amount: number;
  payroll_document_id?: number;
};

type ProvisionPreview = {
  period_key: string;
  period_type: string;
  date_start: string;
  date_end: string;
  payroll_documents: number;
  lines: ProvisionLine[];
  total_provisions: number;
  provisioned_lines?: number;
};

type LiquidatedPeriod = {
  period_key: string;
  period_type: string;
  date_start: string;
  date_end: string;
  documents: number;
};

type PayrollDocumentRow = {
  period_key: string;
  period_type?: string;
  date_start?: string;
  date_end?: string;
};

type EmployeeProvisionRow = {
  employee_id: number;
  employee_name?: string;
  payroll_document_id?: number;
  concepts: Record<string, number>;
  total: number;
};

const PROVISION_CONCEPTS: { code: string; label: string }[] = [
  { code: "PRIMA_SERVICIOS", label: "Prima" },
  { code: "CESANTIAS", label: "Cesantias" },
  { code: "INTERESES_CESANTIAS", label: "Int. cesantias" },
  { code: "VACACIONES", label: "Vacaciones" }
];

const today = new Date();
const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

function money(value: number | string | undefined) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function periodKey(type: string, start: string, end: string) {
  return `${type}:${start}:${end}`;
}

function dateOnly(value: string | undefined) {
  return String(value || "").slice(0, 10);
}

function periodFromKey(key: string) {
  const [type, start, end] = String(key || "").split(":");
  return { type, start, end };
}

export default function SocialBenefitProvisionsPage() {
  const [periodType, setPeriodType] = useState("mes");
  const [startDate, setStartDate] = useState(currentMonthStart);
  const [endDate, setEndDate] = useState(currentMonthEnd);
  const [preview, setPreview] = useState<ProvisionPreview | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "warning" | "error">("info");
  const [busy, setBusy] = useState(false);
  const [liquidatedPeriods, setLiquidatedPeriods] = useState<LiquidatedPeriod[]>([]);
  const currentPeriodKey = useMemo(() => periodKey(periodType, startDate, endDate), [periodType, startDate, endDate]);

  const loadLiquidatedPeriods = useCallback(async () => {
    const rows = await api<PayrollDocumentRow[]>("/api/v1/talento-humano/nomina/liquidaciones?limit=500", { cache: "no-store" }).catch(() => []);
    const periodMap = new Map<string, LiquidatedPeriod>();
    for (const row of rows) {
      const parsed = periodFromKey(row.period_key);
      const current = periodMap.get(row.period_key) || {
        period_key: row.period_key,
        period_type: row.period_type || parsed.type || "mes",
        date_start: dateOnly(row.date_start) || parsed.start || "",
        date_end: dateOnly(row.date_end) || parsed.end || "",
        documents: 0
      };
      current.documents += 1;
      periodMap.set(row.period_key, current);
    }
    setLiquidatedPeriods(Array.from(periodMap.values()).sort((a, b) => b.period_key.localeCompare(a.period_key)));
  }, []);

  useEffect(() => {
    loadLiquidatedPeriods().catch(() => undefined);
  }, [loadLiquidatedPeriods]);

  function selectLiquidatedPeriod(key: string) {
    const selected = liquidatedPeriods.find((period) => period.period_key === key);
    if (!selected) return;
    const parsed = periodFromKey(selected.period_key);
    setPreview(null);
    setMessage("");
    setMessageType("info");
    setPeriodType(selected.period_type || parsed.type || "mes");
    setStartDate(selected.date_start || parsed.start || startDate);
    setEndDate(selected.date_end || parsed.end || endDate);
  }
  const rows = preview?.lines || [];
  const conceptTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of rows) totals.set(line.code, (totals.get(line.code) || 0) + Number(line.amount || 0));
    return Array.from(totals.entries());
  }, [rows]);
  const employeeRows = useMemo(() => {
    const map = new Map<number, EmployeeProvisionRow>();
    for (const line of rows) {
      let row = map.get(line.employee_id);
      if (!row) {
        row = {
          employee_id: line.employee_id,
          employee_name: line.employee_name,
          payroll_document_id: line.payroll_document_id,
          concepts: {},
          total: 0
        };
        map.set(line.employee_id, row);
      }
      if (!row.employee_name && line.employee_name) row.employee_name = line.employee_name;
      if (!row.payroll_document_id && line.payroll_document_id) row.payroll_document_id = line.payroll_document_id;
      row.concepts[line.code] = (row.concepts[line.code] || 0) + Number(line.amount || 0);
      row.total += Number(line.amount || 0);
    }
    return Array.from(map.values());
  }, [rows]);

  async function previewProvisions() {
    setBusy(true);
    setMessage("");
    setMessageType("info");
    try {
      const result = await api<ProvisionPreview>("/api/v1/talento-humano/provisiones/prestaciones-sociales/preview", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: currentPeriodKey })
      });
      setPreview(result);
      setMessageType(result.lines.length ? "success" : "warning");
      setMessage(result.lines.length
        ? `Previsualizacion generada: ${result.lines.length} linea(s), ${result.payroll_documents} documento(s) de nomina, total ${money(result.total_provisions)}.`
        : `Hay ${result.payroll_documents} documento(s) de nomina para ${currentPeriodKey}, pero no se generaron lineas de provision. Revisa bases y dias de prestaciones en la nomina.`);
    } catch (error) {
      setPreview(null);
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo previsualizar la provision.");
    } finally {
      setBusy(false);
    }
  }

  async function runProvisions() {
    setBusy(true);
    setMessage("");
    setMessageType("info");
    try {
      const result = await api<ProvisionPreview>("/api/v1/talento-humano/provisiones/prestaciones-sociales/documentos", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: currentPeriodKey })
      });
      setPreview(result);
      const provisioned = result.provisioned_lines ?? result.lines.length;
      setMessageType(provisioned > 0 ? "success" : "warning");
      setMessage(provisioned > 0
        ? `Provision exitosa para ${currentPeriodKey}: ${provisioned} linea(s), ${result.payroll_documents} documento(s) base, total ${money(result.total_provisions)}.`
        : `El proceso termino sin errores, pero no genero lineas para ${currentPeriodKey}. Revisa que la nomina del periodo tenga base de prestaciones y dias liquidados.`);
      await loadLiquidatedPeriods();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo provisionar prestaciones.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">Talento Humano - Nomina</p>
        <h1 className="text-3xl font-semibold">Provisionar prestaciones sociales</h1>
        <p className="mt-1 text-sm text-neutral-600">Calcula prima, cesantias, intereses y vacaciones a partir de documentos de nomina ya liquidados.</p>
      </header>

      {message ? (
        <p className={`rounded-md border p-3 text-sm ${
          messageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : messageType === "warning" ? "border-amber-200 bg-amber-50 text-amber-800"
              : messageType === "error" ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-line bg-white text-neutral-700"
        }`}>
          {message}
        </p>
      ) : null}

      <section className="rounded-md border border-line bg-white p-4">
        <label className="mb-3 block text-sm">Periodo liquidado
          <select
            className="mt-1 h-10 w-full rounded-md border border-line px-3"
            value={liquidatedPeriods.some((period) => period.period_key === currentPeriodKey) ? currentPeriodKey : ""}
            onChange={(event) => selectLiquidatedPeriod(event.target.value)}
          >
            <option value="">{liquidatedPeriods.length ? "Selecciona un periodo con nomina liquidada" : "No hay periodos de nomina liquidados"}</option>
            {liquidatedPeriods.map((period) => (
              <option key={period.period_key} value={period.period_key}>
                {`${period.period_type} ${period.date_start} a ${period.date_end} (${period.documents} doc.)`}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm">Tipo periodo
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={periodType} onChange={(event) => setPeriodType(event.target.value)}>
              <option value="quincena">Quincena</option>
              <option value="mes">Mes</option>
            </select>
          </label>
          <label className="text-sm">Fecha inicio
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="text-sm">Fecha fin
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <div className="text-sm md:col-span-2">
            Periodo
            <p className="mt-1 flex h-10 items-center rounded-md border border-line bg-paper px-3 font-mono text-xs">{currentPeriodKey}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-60" disabled={busy} onClick={previewProvisions} type="button"><Calculator size={16} /> Previsualizar</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={runProvisions} type="button"><Play size={16} /> {busy ? "Procesando..." : "Provisionar"}</button>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-base font-semibold">Prestaciones a provisionar</h2>
            <p className="text-sm text-neutral-500">{preview ? `${preview.payroll_documents} documento(s) de nomina usados como base` : "Selecciona un periodo y previsualiza para ver la tabla."}</p>
          </div>
          <div className="grid gap-2 text-right sm:grid-cols-2 lg:grid-cols-5">
            {conceptTotals.map(([code, total]) => <div className="rounded-md border border-line bg-paper px-3 py-2" key={code}><p className="text-[11px] uppercase text-neutral-500">{code}</p><p className="text-sm font-semibold">{money(total)}</p></div>)}
            <div className="rounded-md border border-apex/20 bg-apex/5 px-3 py-2"><p className="text-[11px] uppercase text-neutral-500">Total</p><p className="text-sm font-semibold">{money(preview?.total_provisions || 0)}</p></div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                <th className="px-3 py-2">Empleado</th>
                <th className="px-3 py-2">Doc. nomina</th>
                {PROVISION_CONCEPTS.map((concept) => <th className="px-3 py-2 text-right" key={concept.code}>{concept.label}</th>)}
                <th className="px-3 py-2 text-right">Total provision</th>
              </tr>
            </thead>
            <tbody>{employeeRows.map((row) => (
              <tr className="border-b border-line/70" key={row.employee_id}>
                <td className="px-3 py-2 font-medium">{row.employee_name || row.employee_id}</td>
                <td className="px-3 py-2">{row.payroll_document_id || "--"}</td>
                {PROVISION_CONCEPTS.map((concept) => <td className="px-3 py-2 text-right" key={concept.code}>{money(row.concepts[concept.code] || 0)}</td>)}
                <td className="px-3 py-2 text-right font-semibold">{money(row.total)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!employeeRows.length ? <p className="p-4 text-sm text-neutral-500">Selecciona un periodo con nomina liquidada y previsualiza la provision.</p> : null}
        </div>
      </section>
    </div>
  );
}
