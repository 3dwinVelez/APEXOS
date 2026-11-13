"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calculator, Download, FileText, Play, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/apiBaseUrl";

type Employee = { id: number; code: string; name?: string; display_name?: string; full_name?: string; metadata?: { name?: string } };
type PayrollLine = { code: string; name: string; quantity: number; rate: number; amount: number; source: string };
type PayrollDocument = {
  id?: number;
  employee_id: number;
  employee_code?: string;
  employee_document?: string;
  employee_name?: string;
  period_key: string;
  period_type: string;
  date_start?: string;
  date_end?: string;
  days_worked?: number;
  ordinary_hours?: number;
  overtime_hrs?: number;
  gross: number;
  deductions: number;
  net: number;
  lines: PayrollLine[];
  source_summary?: Record<string, unknown>;
};
type Adjustment = {
  id: number;
  employee_id: number;
  employee_code?: string;
  employee_name?: string;
  period_key: string;
  adjustment_type: string;
  concept_code: string;
  description: string;
  minutes: number;
  amount: number;
  status: string;
  metadata?: {
    work_date?: string;
    start_time?: string;
    end_time?: string;
    date_start?: string;
    date_end?: string;
    days?: number;
    paid_by?: string;
    frozen_historical_reference?: { monthlyAmount?: number; sourcePeriod?: string | null; capturedAt?: string | null };
    continuity_key?: string;
    recognized_value?: number;
    document_support?: string;
  };
};
type ValidationIssue = { severity: "error" | "warning" | "info"; code: string; employee_id?: number; employee_name?: string; message: string };
type PeriodClosure = {
  id: number;
  period_key: string;
  status: string;
  payroll_documents: number;
  total_payroll_gross: number;
  total_payroll_net: number;
  total_social_contributions: number;
  total_provisions: number;
  validation_summary?: { issues?: ValidationIssue[] };
};
type LiquidatedPeriod = { period_key: string; period_type: string; date_start: string; date_end: string; documents: number; gross: number; deductions: number; net: number; employees_text: string };

const today = new Date();
const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const currentMonthMid = new Date(today.getFullYear(), today.getMonth(), 15).toISOString().slice(0, 10);

function money(value: number | string | undefined) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function employeeName(row: Partial<Employee> & Partial<PayrollDocument> & Partial<Adjustment>) {
  return row.employee_name || row.display_name || row.full_name || row.metadata?.name || row.name || row.employee_code || `Empleado ${row.employee_id || ""}`;
}

function periodKey(type: string, start: string, end: string) {
  return `${type}:${start}:${end}`;
}

function dateOnly(value: string | undefined) {
  return String(value || "").slice(0, 10);
}

function safeFilePart(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "sin_dato";
}

function employeeDocument(row: Partial<PayrollDocument>) {
  return String(row.employee_document || row.employee_code || row.employee_id || "")
    .replace(/^EMP-/i, "")
    .replace(/[^\dA-Za-z-]/g, "") || String(row.employee_id || "empleado");
}

function periodFromKey(key: string) {
  const [type, start, end] = String(key || "").split(":");
  return { type, start, end };
}

function numericSummaryValue(summary: Record<string, unknown> | undefined, key: string) {
  const value = summary?.[key];
  return typeof value === "number" ? value : Number(value || 0);
}

function rowNumberValue(row: Record<string, string | number>, key: string) {
  return Number(row[key] || 0);
}

function excelCellText(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object" && "result" in value) return excelCellText((value as { result?: unknown }).result);
  if (value && typeof value === "object" && "text" in value) return String((value as { text?: unknown }).text || "");
  return String(value ?? "");
}

function hasWorkedTime(row: PayrollDocument) {
  return Number(row.days_worked || 0) > 0
    || Number(row.ordinary_hours || 0) > 0
    || Number(row.overtime_hrs || 0) > 0
    || numericSummaryValue(row.source_summary, "days_worked") > 0
    || numericSummaryValue(row.source_summary, "ordinary_hours") > 0
    || numericSummaryValue(row.source_summary, "workdays") > 0
    || (row.lines || []).some((line) => (Number(line.quantity || 0) > 0 || Number(line.amount || 0) > 0) && !String(line.code || "").startsWith("DED_"));
}

const SOCIAL_BENEFIT_LINE_CODES = new Set(["PRIMA_SERVICIOS", "CESANTIAS", "INTERESES_CESANTIAS", "VACACIONES"]);

function payrollReceiptLines(lines: PayrollLine[] = []) {
  return lines.filter((line) => !SOCIAL_BENEFIT_LINE_CODES.has(String(line.code || "").toUpperCase()));
}

const externalWorkdayConceptCodes = [
  ["JORNADA_ORDINARIA", "Jornada ordinaria", "Horas/dias trabajados externos"],
  ["HED", "Hora extra diurna", "Horas extra diurnas"],
  ["HEN", "Hora extra nocturna", "Horas extra nocturnas"],
  ["RECARGO_NOCTURNO", "Recargo nocturno", "Recargo nocturno ordinario"],
  ["DOM_FEST_DIURNO", "Dominical/festivo diurno", "Trabajo dominical o festivo diurno"],
  ["DOM_FEST_NOCTURNO", "Dominical/festivo nocturno", "Trabajo dominical o festivo nocturno"],
  ["HEDD", "Hora extra diurna dominical/festiva", "Hora extra diurna en domingo o festivo"],
  ["HEND", "Hora extra nocturna dominical/festiva", "Hora extra nocturna en domingo o festivo"],
  ["LICENCIA_REMUNERADA", "Licencia remunerada", "Dias de licencia pagada"],
  ["LICENCIA_NO_REMUNERADA", "Licencia no remunerada", "Dias de licencia no pagada"],
  ["INCAPACIDAD_GENERAL", "Incapacidad general", "Dias de incapacidad general"],
  ["INCAPACIDAD_LABORAL", "Incapacidad laboral", "Dias de incapacidad laboral"],
  ["VACACIONES", "Vacaciones", "Dias de vacaciones"],
  ["COMISION", "Comision", "Valor manual de comision"],
  ["BONIFICACION_SALARIAL", "Bonificacion salarial", "Valor manual que constituye salario"],
  ["BONIFICACION_NO_SALARIAL", "Bonificacion no salarial", "Valor manual no salarial"],
  ["AJUSTE_MANUAL", "Ajuste manual", "Ajuste libre de valor o minutos"]
] as const;

export default function PayrollLiquidationPage() {
  const [periodReady, setPeriodReady] = useState(false);
  const [payrollMode, setPayrollMode] = useState<"marcaciones" | "archivo_plano">("marcaciones");
  const [periodType, setPeriodType] = useState("quincena");
  const [startDate, setStartDate] = useState(currentMonthStart);
  const [endDate, setEndDate] = useState(currentMonthMid);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [preview, setPreview] = useState<PayrollDocument[]>([]);
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [liquidatedPeriods, setLiquidatedPeriods] = useState<LiquidatedPeriod[]>([]);
  const [periodFilters, setPeriodFilters] = useState({ year: String(today.getFullYear()), month: "", period_type: "", employee: "" });
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [closures, setClosures] = useState<PeriodClosure[]>([]);
  const [externalImportIssues, setExternalImportIssues] = useState<ValidationIssue[]>([]);
  const [externalImportSummary, setExternalImportSummary] = useState("");
  const [externalRows, setExternalRows] = useState<Array<Record<string, string | number>>>([]);
  const [externalFileName, setExternalFileName] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<PayrollDocument | null>(null);
  const [receiptDocument, setReceiptDocument] = useState<PayrollDocument | null>(null);
  const [message, setMessage] = useState("");
  const [adjustmentError, setAdjustmentError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adjustment, setAdjustment] = useState({ employee_id: "", adjustment_type: "manual", concept_code: "AJUSTE_MANUAL", description: "", work_date: "", start_time: "", end_time: "", date_start: "", date_end: "", days: "", paid_by: "", sln_cause: "", pila_ibc_amount: "", ibc_reference_amount: "", ibc_reference_period: "", ibc_reference_captured_at: "", continuity_key: "", reference_source: "", reported_pila_id: "", recognized_value: "", document_support: "", lr_arl_policy: "", advance_obligation: "", advance_period: "", advance_support: "", advance_retention_health: "", advance_retention_pension: "", minutes: "", amount: "" });

  const currentPeriodKey = useMemo(() => periodKey(periodType, startDate, endDate), [periodType, startDate, endDate]);
  const periodRangeError = useMemo(() => {
    if (!startDate || !endDate) return "";
    if (endDate < startDate) return "La fecha final no puede ser menor que la inicial.";
    const spanDays = Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    if (spanDays > 31) return "El periodo no puede abarcar mas de un mes.";
    return "";
  }, [startDate, endDate]);
  const rows = preview.length ? preview : documents;
  const visibleRows = useMemo(() => rows.filter(hasWorkedTime), [rows]);
  const externalPreview = useMemo(() => {
    const documentsSet = new Set<string>();
    const concepts = new Map<string, number>();
    let totalDays = 0;
    let totalHours = 0;
    let totalMinutes = 0;
    let totalAmount = 0;
    let rowsWithMissingData = 0;
    for (const row of externalRows) {
      const document = String(row.document || row.employee_code || "").trim();
      const concept = String(row.concept_code || "").trim().toUpperCase();
      if (document) documentsSet.add(document);
      if (concept) concepts.set(concept, (concepts.get(concept) || 0) + 1);
      totalDays += rowNumberValue(row, "days");
      totalHours += rowNumberValue(row, "hours");
      totalMinutes += rowNumberValue(row, "minutes");
      totalAmount += rowNumberValue(row, "amount");
      if (!document || !concept) rowsWithMissingData += 1;
    }
    return {
      concepts,
      documents: documentsSet.size,
      rows: externalRows.length,
      rowsWithMissingData,
      totalAmount,
      totalDays,
      totalHours,
      totalMinutes
    };
  }, [externalRows]);
  const currentClosure = closures.find((closure) => closure.period_key === currentPeriodKey);
  const periodIsClosed = currentClosure?.status === "cerrado";
  const hasPayrollDocuments = documents.length > 0;
  const canRecalculatePayroll = hasPayrollDocuments && !periodIsClosed;
  const canDeletePayroll = hasPayrollDocuments && !periodIsClosed;
  const canClosePeriod = hasPayrollDocuments && !periodIsClosed;
  const showClosureSecondaryActions = hasPayrollDocuments || Boolean(currentClosure);
  const filteredLiquidatedPeriods = useMemo(() => {
    const employeeQuery = periodFilters.employee.trim().toLowerCase();
    return liquidatedPeriods
      .filter((period) => {
        const startYear = period.date_start.slice(0, 4);
        const endYear = period.date_end.slice(0, 4);
        const startMonth = period.date_start.slice(5, 7);
        const endMonth = period.date_end.slice(5, 7);
        if (periodFilters.year && startYear !== periodFilters.year && endYear !== periodFilters.year) return false;
        if (periodFilters.month && startMonth !== periodFilters.month && endMonth !== periodFilters.month) return false;
        if (periodFilters.period_type && period.period_type !== periodFilters.period_type) return false;
        if (employeeQuery && !period.employees_text.toLowerCase().includes(employeeQuery)) return false;
        return true;
      })
      .sort((a, b) => `${b.date_start}:${b.date_end}`.localeCompare(`${a.date_start}:${a.date_end}`));
  }, [liquidatedPeriods, periodFilters]);

  const loadBase = useCallback(async () => {
    const [employeeRows, documentRows, allDocumentRows, adjustmentRows, closureRows] = await Promise.all([
      api<Employee[]>("/api/v1/talento-humano/empleados?active=true"),
      api<PayrollDocument[]>(`/api/v1/talento-humano/nomina/liquidaciones?period_key=${encodeURIComponent(currentPeriodKey)}`, { cache: "no-store" }),
      api<PayrollDocument[]>("/api/v1/talento-humano/nomina/liquidaciones?limit=500", { cache: "no-store" }).catch(() => []),
      api<Adjustment[]>(`/api/v1/talento-humano/nomina/ajustes?period_key=${encodeURIComponent(currentPeriodKey)}`, { cache: "no-store" }),
      api<PeriodClosure[]>(`/api/v1/talento-humano/nomina/cierres?period_key=${encodeURIComponent(currentPeriodKey)}`, { cache: "no-store" }).catch(() => [])
    ]);
    const periodMap = new Map<string, LiquidatedPeriod>();
    for (const row of allDocumentRows) {
      const parsed = periodFromKey(row.period_key);
      const current = periodMap.get(row.period_key) || {
        period_key: row.period_key,
        period_type: row.period_type || parsed.type || "quincena",
        date_start: dateOnly(row.date_start) || parsed.start || "",
        date_end: dateOnly(row.date_end) || parsed.end || "",
        documents: 0,
        gross: 0,
        deductions: 0,
        employees_text: "",
        net: 0
      };
      current.documents += 1;
      current.gross += Number(row.gross || 0);
      current.deductions += Number(row.deductions || 0);
      current.net += Number(row.net || 0);
      current.employees_text = `${current.employees_text} ${row.employee_code || ""} ${row.employee_name || ""}`.trim();
      periodMap.set(row.period_key, current);
    }
    setEmployees(employeeRows);
    setDocuments(documentRows);
    setSelectedDocument((current) => {
      if (preview.length) return current;
      if (current && current.period_key === currentPeriodKey && documentRows.some((row) => row.employee_id === current.employee_id)) return current;
      return documentRows.find(hasWorkedTime) || documentRows[0] || null;
    });
    setLiquidatedPeriods(Array.from(periodMap.values()));
    setAdjustments(adjustmentRows);
    setClosures(closureRows);
  }, [currentPeriodKey]);

  useEffect(() => {
    loadBase().catch((err) => setMessage(err instanceof Error ? err.message : "No se pudo cargar nomina"));
  }, [loadBase]);

  async function previewLiquidation() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ documents: PayrollDocument[] }>("/api/v1/talento-humano/nomina/preview", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: currentPeriodKey })
      });
      const workedDocuments = result.documents.filter(hasWorkedTime);
      setPreview(result.documents);
      setSelectedDocument(workedDocuments[0] || null);
      setMessage("Liquidacion de prueba generada para validar conceptos.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo generar la prueba");
    } finally {
      setBusy(false);
    }
  }

  function selectLiquidatedPeriod(key: string) {
    const selected = liquidatedPeriods.find((period) => period.period_key === key);
    if (!selected) return;
    const parsed = periodFromKey(selected.period_key);
    setPreview([]);
    setSelectedDocument(selected.period_key === currentPeriodKey ? (documents.find(hasWorkedTime) || documents[0] || null) : null);
    setPeriodType(selected.period_type || parsed.type || "quincena");
    setStartDate(selected.date_start || parsed.start || startDate);
    setEndDate(selected.date_end || parsed.end || endDate);
    setPayrollMode("marcaciones");
    setPeriodReady(true);
  }

  async function consultPeriod() {
    setPreview([]);
    setSelectedDocument(null);
    setPeriodReady(true);
    await loadBase();
  }

  async function validateClosure() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ ok: boolean; issues: ValidationIssue[]; social_contributions?: { total_payable: number; missing_affiliations: number } }>("/api/v1/talento-humano/nomina/cierres/validar", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: currentPeriodKey })
      });
      setMessage(result.ok ? `Cierre validado. Aportes: ${money(result.social_contributions?.total_payable || 0)}.` : "El cierre tiene errores bloqueantes.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo validar el cierre");
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod(recalculate = false) {
    if (!recalculate && currentClosure?.status === "cerrado") {
      setMessage("El periodo ya esta cerrado.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/talento-humano/nomina/cierres/${recalculate ? "recalcular" : "cerrar"}`, {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: currentPeriodKey, recalculate })
      });
      setPreview([]);
      await loadBase();
      setMessage(recalculate ? "Cierre recalculado con nomina y aportes." : "Periodo cerrado: nomina y aportes liquidados.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo cerrar el periodo");
    } finally {
      setBusy(false);
    }
  }

  async function reopenPeriod() {
    if (!currentClosure) return;
    if (!confirm("Esto reabre el periodo para permitir correcciones. Continuar?")) return;
    setBusy(true);
    try {
      await api("/api/v1/talento-humano/nomina/cierres/reabrir", { method: "POST", body: JSON.stringify({ period_key: currentPeriodKey }) });
      await loadBase();
      setMessage("Periodo reabierto para correcciones.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo reabrir el periodo");
    } finally {
      setBusy(false);
    }
  }

  async function runLiquidation(recalculate = false) {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/talento-humano/nomina/liquidaciones", {
        method: "POST",
        body: JSON.stringify({ fecha_inicio: startDate, fecha_fin: endDate, period_type: periodType, period_key: currentPeriodKey, recalculate })
      });
      setPreview([]);
      await loadBase();
      setMessage(recalculate ? "Documento borrado y liquidacion regenerada." : "Liquidacion real creada por empleado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo liquidar");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLiquidation() {
    if (!confirm("Esto borra los documentos de nomina del periodo para volver a ejecutar. Continuar?")) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/talento-humano/nomina/liquidaciones", { method: "DELETE", body: JSON.stringify({ period_key: currentPeriodKey }) });
      setDocuments([]);
      setPreview([]);
      setSelectedDocument(null);
      setMessage("Documentos de nomina borrados para el periodo.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo borrar la liquidacion");
    } finally {
      setBusy(false);
    }
  }

  async function createAdjustment() {
    setBusy(true);
    setMessage("");
    setAdjustmentError("");
    try {
      await api("/api/v1/talento-humano/nomina/ajustes", {
        method: "POST",
        body: JSON.stringify({
          employee_id: adjustment.employee_id,
          period_key: currentPeriodKey,
          adjustment_type: adjustment.adjustment_type,
          concept_code: adjustment.concept_code,
          description: adjustment.description,
          work_date: adjustment.work_date,
          start_time: adjustment.start_time,
          end_time: adjustment.end_time,
          date_start: adjustment.date_start,
          date_end: adjustment.date_end,
          days: Number(adjustment.days || 0),
          paid_by: adjustment.paid_by,
          suspension_cause: adjustment.sln_cause || undefined,
          document_support: adjustment.document_support || undefined,
          reference_source: adjustment.reference_source || undefined,
          reported_pila_id: adjustment.reported_pila_id || undefined,
          pila_ibc_amount: adjustment.pila_ibc_amount,
          ibc_reference_amount: adjustment.ibc_reference_amount ? Number(adjustment.ibc_reference_amount) : undefined,
          ibc_reference_period: adjustment.ibc_reference_period || undefined,
          ibc_reference_captured_at: adjustment.ibc_reference_captured_at || undefined,
          continuity_key: adjustment.continuity_key || undefined,
          recognized_value: ["licencia_remunerada", "sln", "vacaciones_disfrutadas", "vacaciones_compensadas"].includes(adjustment.adjustment_type) ? Number(adjustment.recognized_value || 0) : undefined,
          minutes: Number(adjustment.minutes || 0),
          amount: ["licencia_remunerada", "sln", "vacaciones_disfrutadas", "vacaciones_compensadas"].includes(adjustment.adjustment_type) ? Number(adjustment.recognized_value || 0) : Number(adjustment.amount || 0),
          advance_obligation_id: adjustment.advance_obligation || undefined,
          advance_period: adjustment.advance_period || undefined,
          advance_support: adjustment.advance_support || undefined,
          advance_retention_health: adjustment.advance_retention_health !== "" ? Number(adjustment.advance_retention_health) : undefined,
          advance_retention_pension: adjustment.advance_retention_pension !== "" ? Number(adjustment.advance_retention_pension) : undefined,
          metadata: adjustment.adjustment_type === "jornada_ordinaria" ? { work_date: adjustment.work_date, start_time: adjustment.start_time, end_time: adjustment.end_time } : {
            date_start: adjustment.date_start,
            date_end: adjustment.date_end,
            days: Number(adjustment.days || 0),
            paid_by: adjustment.paid_by,
            suspension_cause: adjustment.sln_cause || undefined,
            reference_source: adjustment.reference_source || undefined,
            reported_pila_id: adjustment.reported_pila_id || undefined,
            pila_ibc_amount: adjustment.pila_ibc_amount ? Number(adjustment.pila_ibc_amount) : undefined,
            frozen_historical_reference: adjustment.ibc_reference_amount ? { monthlyAmount: Number(adjustment.ibc_reference_amount), sourcePeriod: adjustment.ibc_reference_period || null, capturedAt: adjustment.ibc_reference_captured_at || null } : undefined,
            continuity_key: adjustment.continuity_key || undefined,
            recognized_value: adjustment.recognized_value ? Number(adjustment.recognized_value) : undefined,
            document_support: adjustment.document_support || undefined,
            lr_arl_policy: adjustment.lr_arl_policy || undefined,
            advance_obligation_id: adjustment.advance_obligation || undefined,
            advance_period: adjustment.advance_period || undefined,
            advance_support: adjustment.advance_support || undefined,
          }
        })
      });
      setAdjustment((current) => ({ ...current, description: "", work_date: "", start_time: "", end_time: "", date_start: "", date_end: "", days: "", paid_by: "", sln_cause: "", pila_ibc_amount: "", ibc_reference_amount: "", ibc_reference_period: "", ibc_reference_captured_at: "", continuity_key: "", reference_source: "", reported_pila_id: "", recognized_value: "", document_support: "", lr_arl_policy: "", advance_obligation: "", advance_period: "", advance_support: "", advance_retention_health: "", advance_retention_pension: "", minutes: "", amount: "" }));
      await loadBase();
      setMessage("Ajuste agregado. Ejecuta prueba o recalcula para verlo en la liquidacion.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "No se pudo agregar el ajuste";
      setAdjustmentError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function downloadExternalWorkdayTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Jornadas externas");
    sheet.addRow(["document", "concept_code", "date_start", "date_end", "work_date", "days", "hours", "minutes", "amount", "observation"]);
    sheet.addRow(["123456789", "HED", startDate, endDate, startDate, 0, 2, 120, 0, "Ejemplo"]);
    sheet.columns.forEach((column) => { column.width = 18; });
    const conceptsSheet = workbook.addWorksheet("Conceptos nomina");
    conceptsSheet.addRow(["concept_code", "nombre", "descripcion"]);
    externalWorkdayConceptCodes.forEach((row) => conceptsSheet.addRow(row));
    conceptsSheet.columns = [{ width: 28 }, { width: 32 }, { width: 48 }];
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla-jornadas-externas-nomina.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function readExternalWorkdayExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("El archivo no contiene hojas.");
      const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value || "").trim());
      const rows: Array<Record<string, string | number>> = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const entry: Record<string, string | number> = {};
        headers.forEach((header, index) => { entry[header] = excelCellText(row.getCell(index + 1).value); });
        if (entry.document || entry.employee_code) rows.push(entry);
      });
      const fileStartDate = String(rows[0]?.date_start || rows[0]?.work_date || "").slice(0, 10);
      const fileEndDate = String(rows[0]?.date_end || rows[0]?.work_date || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(fileStartDate)) setStartDate(fileStartDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(fileEndDate)) setEndDate(fileEndDate);
      setExternalRows(rows);
      setExternalFileName(file.name);
      setExternalImportIssues([]);
      setExternalImportSummary("");
      setMessage(`${rows.length} jornada(s) externas listas para importar.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo leer el Excel.");
    } finally {
      event.target.value = "";
    }
  }

  async function importExternalWorkdays() {
    if (!externalRows.length) return;
    setBusy(true);
    try {
      const result = await api<{ imported: number; issues: ValidationIssue[] }>("/api/v1/talento-humano/nomina/jornadas-externas/importar", { method: "POST", body: JSON.stringify({ period_key: currentPeriodKey, rows: externalRows }) });
      setExternalImportIssues(result.issues || []);
      setExternalImportSummary(`Importadas ${result.imported} jornada(s) externas para ${currentPeriodKey}.`);
      setExternalRows([]);
      setExternalFileName("");
      await loadBase();
      setMessage(`Jornadas externas importadas: ${result.imported}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "No se pudieron importar jornadas externas.";
      setExternalImportSummary("");
      setExternalImportIssues([{ severity: "error", code: "IMPORTACION_JORNADAS_EXTERNAS", message: errorMessage }]);
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function deleteExternalWorkdays() {
    if (!confirm("Esto anula las jornadas importadas por archivo plano para este periodo. Solo aplica si no has liquidado ni cerrado el periodo. Continuar?")) return;
    setBusy(true);
    try {
      const result = await api<{ deleted: number; period_key: string }>("/api/v1/talento-humano/nomina/jornadas-externas", { method: "DELETE", body: JSON.stringify({ period_key: currentPeriodKey }) });
      setExternalRows([]);
      setExternalFileName("");
      setExternalImportIssues([]);
      setExternalImportSummary(`Jornadas importadas anuladas: ${result.deleted} para ${result.period_key}.`);
      setPreview([]);
      setSelectedDocument(null);
      await loadBase();
      setMessage(`Jornadas importadas anuladas: ${result.deleted}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "No se pudieron borrar las jornadas importadas.";
      setExternalImportSummary("");
      setExternalImportIssues([{ severity: "error", code: "BORRADO_JORNADAS_EXTERNAS", message: errorMessage }]);
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAdjustment(id: number) {
    setBusy(true);
    setAdjustmentError("");
    try {
      await api(`/api/v1/talento-humano/nomina/ajustes/${id}`, { method: "DELETE" });
      await loadBase();
      setMessage("Ajuste anulado. Recalcula o vuelve a liquidar el periodo para actualizar los comprobantes.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "No se pudo anular el ajuste";
      setAdjustmentError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function openPdf(id?: number) {
    if (!id) return;
    const token = localStorage.getItem("token") || "";
    const response = await fetch(`${API_BASE_URL}/api/v1/talento-humano/nomina/liquidaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  }

  async function downloadPdf(row: PayrollDocument) {
    if (!row.id) return;
    const token = localStorage.getItem("token") || "";
    const response = await fetch(`${API_BASE_URL}/api/v1/talento-humano/nomina/liquidaciones/${row.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("No se pudo descargar el comprobante");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `comprobante_nomina_${safeFilePart(employeeDocument(row))}_${safeFilePart(employeeName(row))}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadAllPdfs() {
    const rowsToDownload = visibleRows.filter((row) => row.id);
    if (!rowsToDownload.length) {
      setMessage("No hay comprobantes PDF guardados para descargar en este periodo.");
      return;
    }
    setBusy(true);
    setMessage(`Descargando ${rowsToDownload.length} comprobante(s) PDF...`);
    try {
      for (const row of rowsToDownload) {
        await downloadPdf(row);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      setMessage(`Se descargaron ${rowsToDownload.length} comprobante(s) PDF con cedula y nombre del empleado.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudieron descargar todos los PDFs");
    } finally {
      setBusy(false);
    }
  }

  const isWorkdayCorrection = adjustment.adjustment_type === "jornada_ordinaria";
  const isSegmentedNovelty = ["licencia_remunerada", "sln", "vacaciones_disfrutadas", "vacaciones_compensadas"].includes(adjustment.adjustment_type);
  const requiresPilaAttestation = isSegmentedNovelty && adjustment.adjustment_type !== "vacaciones_compensadas";
  const requiresFrozenIbcReference = ["licencia_remunerada", "sln", "vacaciones_disfrutadas"].includes(adjustment.adjustment_type);
  const canCreateAdjustment = Boolean(adjustment.employee_id)
    && (!isWorkdayCorrection || Boolean(adjustment.work_date && adjustment.start_time && adjustment.end_time))
    && (!isSegmentedNovelty || Boolean(adjustment.date_start && adjustment.date_end && (adjustment.adjustment_type === "vacaciones_compensadas" || adjustment.days)))
    && (!isSegmentedNovelty || Boolean(adjustment.document_support))
    && (!requiresPilaAttestation || Boolean(adjustment.reference_source && adjustment.reported_pila_id))
    && (!requiresFrozenIbcReference || Boolean(adjustment.ibc_reference_amount && adjustment.ibc_reference_period && adjustment.ibc_reference_captured_at))
    && (adjustment.adjustment_type !== "sln" || Boolean(adjustment.sln_cause))
    && (!(Number(adjustment.advance_retention_health || 0) > 0 || Number(adjustment.advance_retention_pension || 0) > 0) || Boolean(adjustment.advance_obligation && adjustment.advance_period && adjustment.advance_support))
    && (!isSegmentedNovelty || adjustment.recognized_value !== "");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">Talento Humano - Nomina</p>
          <h1 className="text-3xl font-semibold">Liquidacion de nomina</h1>
          <p className="mt-1 text-sm text-neutral-600">Prueba conceptos, genera documentos por empleado y descarga comprobantes PDF.</p>
        </div>
      </header>

      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{message}</p> : null}

      {periodReady ? (
      <section className="rounded-md border border-line bg-white p-2">
        <div className="grid gap-2 md:grid-cols-2" role="tablist" aria-label="Tipo de liquidacion de nomina">
          <button
            aria-selected={payrollMode === "marcaciones"}
            className={`flex min-h-16 items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition ${payrollMode === "marcaciones" ? "border-apex bg-apex/5 text-apex" : "border-line bg-white text-neutral-700 hover:bg-paper"}`}
            onClick={() => setPayrollMode("marcaciones")}
            role="tab"
            type="button"
          >
            <Play size={18} />
            <span>
              <span className="block font-semibold">Liquidacion con marcaciones</span>
              <span className="block text-xs text-neutral-500">Validar, probar, liquidar, ajustar y cerrar el periodo.</span>
            </span>
          </button>
          <button
            aria-selected={payrollMode === "archivo_plano"}
            className={`flex min-h-16 items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition ${payrollMode === "archivo_plano" ? "border-apex bg-apex/5 text-apex" : "border-line bg-white text-neutral-700 hover:bg-paper"}`}
            onClick={() => setPayrollMode("archivo_plano")}
            role="tab"
            type="button"
          >
            <Upload size={18} />
            <span>
              <span className="block font-semibold">Archivo plano</span>
              <span className="block text-xs text-neutral-500">Descargar plantilla e importar jornadas externas por Excel.</span>
            </span>
          </button>
        </div>
      </section>
      ) : null}

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Consultar liquidacion</h2>
          <p className="mt-1 text-sm text-neutral-500">Busca periodos liquidados por ano, mes, tipo o empleado antes de abrir el detalle.</p>
        </div>
        <div className="mb-4 rounded-md border border-line">
          <div className="border-b border-line p-3">
            <p className="text-sm font-semibold">Periodos liquidados</p>
            <p className="text-xs text-neutral-500">Buscar periodos liquidados</p>
            <p className="text-xs text-neutral-500">{filteredLiquidatedPeriods.length} de {liquidatedPeriods.length} periodo(s) encontrados</p>
          </div>
          <div className="grid gap-3 p-3 md:grid-cols-5">
            <label className="text-sm">Ano
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3" inputMode="numeric" maxLength={4} value={periodFilters.year} onChange={(event) => setPeriodFilters((current) => ({ ...current, year: event.target.value }))} placeholder="2026" />
            </label>
            <label className="text-sm">Mes
              <select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3" value={periodFilters.month} onChange={(event) => setPeriodFilters((current) => ({ ...current, month: event.target.value }))}>
                <option value="">Todos</option>
                <option value="01">Enero</option>
                <option value="02">Febrero</option>
                <option value="03">Marzo</option>
                <option value="04">Abril</option>
                <option value="05">Mayo</option>
                <option value="06">Junio</option>
                <option value="07">Julio</option>
                <option value="08">Agosto</option>
                <option value="09">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </select>
            </label>
            <label className="text-sm">Tipo
              <select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3" value={periodFilters.period_type} onChange={(event) => setPeriodFilters((current) => ({ ...current, period_type: event.target.value }))}>
                <option value="">Todos</option>
                <option value="quincena">Quincena</option>
                <option value="mes">Mes</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2">Empleado
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={periodFilters.employee} onChange={(event) => setPeriodFilters((current) => ({ ...current, employee: event.target.value }))} placeholder="Cedula, codigo o nombre" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-paper text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Fecha inicio</th>
                  <th className="px-3 py-3">Fecha fin</th>
                  <th className="px-3 py-3">Periodo</th>
                  <th className="px-3 py-3 text-right">Documentos</th>
                  <th className="px-3 py-3 text-right">Devengado</th>
                  <th className="px-3 py-3 text-right">Deducciones</th>
                  <th className="px-3 py-3 text-right">Neto</th>
                  <th className="px-3 py-3 text-right">Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredLiquidatedPeriods.map((period) => (
                  <tr className={`border-t border-line ${period.period_key === currentPeriodKey && periodReady ? "bg-apex/5" : ""}`} key={period.period_key}>
                    <td className="px-3 py-3 capitalize">{period.period_type}</td>
                    <td className="px-3 py-3">{period.date_start}</td>
                    <td className="px-3 py-3">{period.date_end}</td>
                    <td className="px-3 py-3 font-mono text-xs">{period.period_key}</td>
                    <td className="px-3 py-3 text-right">{period.documents}</td>
                    <td className="px-3 py-3 text-right">{money(period.gross)}</td>
                    <td className="px-3 py-3 text-right">{money(period.deductions)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{money(period.net)}</td>
                    <td className="px-3 py-3 text-right">
                      <button className="inline-flex h-9 items-center justify-center rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => selectLiquidatedPeriod(period.period_key)} type="button">Ver detalle</button>
                    </td>
                  </tr>
                ))}
                {!filteredLiquidatedPeriods.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-neutral-500" colSpan={9}>{liquidatedPeriods.length ? "No hay periodos con esos filtros." : "Liquida un periodo para que aparezca aqui."}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mb-3">
          <p className="text-sm font-semibold">Consulta manual por fechas</p>
          <p className="text-xs text-neutral-500">Usa esta opcion si quieres consultar un rango especifico o preparar una nueva liquidacion.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm">Tipo periodo
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={periodType} onChange={(event) => { setPeriodType(event.target.value); setPeriodReady(false); }}>
              <option value="quincena">Quincena</option>
              <option value="mes">Mes</option>
            </select>
          </label>
          <label className="text-sm">Fecha inicio
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPeriodReady(false); }} />
          </label>
          <label className="text-sm">Fecha fin
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPeriodReady(false); }} />
          </label>
          <div className="text-sm">
            Periodo
            <p className="mt-1 flex h-10 items-center rounded-md border border-line bg-paper px-3 font-mono text-xs">{currentPeriodKey}</p>
          </div>
          <div className="flex items-end">
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || Boolean(periodRangeError)} onClick={() => void consultPeriod()} type="button"><FileText size={16} /> Consultar periodo</button>
          </div>
        </div>
        {periodRangeError ? <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{periodRangeError}</p> : null}
        {!periodReady ? <p className="mt-4 rounded-md border border-line bg-paper p-3 text-sm text-neutral-600">Elige un periodo y consulta para ver documentos, conceptos, ajustes o cargar archivo plano.</p> : null}
        {periodReady && payrollMode === "marcaciones" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase text-emerald-700">Proceso principal</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-900">Liquidar nomina {periodType === "mes" ? "mensual" : "quincenal"}</p>
                <p className="text-sm text-neutral-600">{hasPayrollDocuments ? "El periodo ya tiene documentos. Puedes revisar, recalcular o cerrar." : "Crea un documento por empleado para el periodo seleccionado."}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold disabled:opacity-60" disabled={busy} onClick={previewLiquidation} type="button"><Calculator size={17} /> Liquidacion de prueba</button>
                {!hasPayrollDocuments ? (
                  <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => runLiquidation(false)} type="button"><Play size={17} /> Liquidar nomina</button>
                ) : null}
                {canRecalculatePayroll ? (
                  <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => runLiquidation(true)} type="button"><RotateCcw size={17} /> Recalcular nomina</button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-line p-3">
            <p className="text-sm font-semibold">Estado del periodo</p>
            <p className="mt-1 text-sm text-neutral-600">{hasPayrollDocuments ? `${documents.length} documento(s) de nomina guardados.` : "Todavia no hay documentos guardados para este periodo."}</p>
            {canDeletePayroll ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Mas acciones</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm text-rose-700 disabled:opacity-60" disabled={busy} onClick={deleteLiquidation} type="button"><Trash2 size={16} /> Borrar documentos</button>
                </div>
              </details>
            ) : null}
          </div>
        </div>
        ) : null}
      </section>

      {periodReady && payrollMode === "marcaciones" ? (
      <>
      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Cierre integral del periodo</h2>
            <p className="text-sm text-neutral-500">Ejecuta en cadena validacion, nomina, aportes sociales y bloqueo del periodo.</p>
          </div>
          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${currentClosure?.status === "cerrado" ? "bg-emerald-50 text-emerald-700" : currentClosure?.status === "reabierto" ? "bg-amber-50 text-amber-700" : "bg-paper text-neutral-600"}`}>{currentClosure?.status || "sin cierre"}</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <KpiValue label="Nomina neta" value={money(currentClosure?.total_payroll_net || 0)} />
          <KpiValue label="Aportes" value={money(currentClosure?.total_social_contributions || 0)} />
          <KpiValue label="Documentos" value={String(currentClosure?.payroll_documents || documents.length || 0)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy || !canClosePeriod} onClick={() => closePeriod(false)} type="button"><Play size={16} /> Cerrar periodo</button>
          {showClosureSecondaryActions ? (
            <details>
              <summary className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line px-3 text-sm font-medium">Mas acciones</summary>
              <div className="mt-2 flex flex-wrap gap-2 rounded-md border border-line bg-white p-2 shadow-sm">
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={busy} onClick={validateClosure} type="button"><FileText size={16} /> Validar cierre</button>
                {hasPayrollDocuments ? (
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={busy} onClick={() => closePeriod(true)} type="button"><RotateCcw size={16} /> Recalcular cierre</button>
                ) : null}
                {periodIsClosed ? (
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-200 px-3 text-sm text-amber-700 disabled:opacity-60" disabled={busy} onClick={reopenPeriod} type="button">Reabrir periodo</button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-base font-semibold">Documentos por empleado</h2>
            <p className="text-sm text-neutral-500">{preview.length ? "Vista de prueba sin guardar" : "Liquidaciones guardadas del periodo"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-500">{visibleRows.length} de {rows.length} registros con horas</span>
            {!preview.length && visibleRows.some((row) => row.id) ? (
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => void downloadAllPdfs()} type="button"><Download size={15} /> Descargar PDFs</button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Dias</th><th className="px-3 py-2">Ordinarias</th><th className="px-3 py-2">Extras/recargos</th><th className="px-3 py-2">Devengado</th><th className="px-3 py-2">Deducciones</th><th className="px-3 py-2">Neto</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
            <tbody>{visibleRows.map((row) => (
              <tr className="border-b border-line/70" key={`${row.employee_id}-${row.period_key}`}>
                <td className="px-3 py-2 font-medium">{employeeName(row)}<p className="text-xs font-normal text-neutral-500">{row.employee_code || row.employee_id}</p></td>
                <td className="px-3 py-2">{String(row.days_worked ?? row.source_summary?.days_worked ?? 0)}</td>
                <td className="px-3 py-2">{String(row.ordinary_hours ?? row.source_summary?.ordinary_hours ?? 0)}</td>
                <td className="px-3 py-2">{row.overtime_hrs ?? 0}</td>
                <td className="px-3 py-2">{money(row.gross)}</td>
                <td className="px-3 py-2">{money(row.deductions)}</td>
                <td className="px-3 py-2 font-semibold">{money(row.net)}</td>
                <td className="px-3 py-2 text-right">
                  <button className="mr-2 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm" onClick={() => setReceiptDocument(row)} type="button"><FileText size={15} /> Ver</button>
                  <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-50" disabled={!row.id} onClick={() => void downloadPdf(row)} type="button"><Download size={15} /> PDF</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!visibleRows.length ? <p className="p-4 text-sm text-neutral-500">No hay empleados con dias u horas cargadas para este periodo.</p> : null}
        </div>
      </section>

      <section>
        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Ajustes manuales, licencias y vacaciones</h2>
          <div className="mt-3 grid gap-3">
            <label className="text-sm">Empleado
              <select data-testid="ibc-adjustment-employee" className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.employee_id} onChange={(event) => setAdjustment((current) => ({ ...current, employee_id: event.target.value }))}>
                <option value="">Seleccionar</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}
              </select>
            </label>
            <label className="text-sm">Tipo
              <select data-testid="ibc-novelty-type" className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.adjustment_type} onChange={(event) => {
                const nextType = event.target.value;
                const conceptByType: Record<string, string> = {
                  jornada_ordinaria: "JORNADA_ORDINARIA",
                  comision: "COMISION",
                  bonificacion: "BONIFICACION_SALARIAL",
                  licencia_remunerada: "LICENCIA_REMUNERADA",
                  licencia_no_remunerada: "SLN",
                  incapacidad_general: "INCAPACIDAD_GENERAL",
                  incapacidad_laboral: "INCAPACIDAD_LABORAL",
                  maternidad_paternidad: "LICENCIA_MATERNIDAD_PATERNIDAD",
                  vacaciones: "VACACIONES",
                  vacaciones_disfrutadas: "VACACIONES",
                  vacaciones_compensadas: "VACACIONES_COMPENSADAS",
                  sln: "SLN"
                };
                setAdjustment((current) => ({ ...current, adjustment_type: nextType, concept_code: conceptByType[nextType] || current.concept_code }));
              }}>
                <option value="manual">Ajuste manual</option>
                <option value="jornada_ordinaria">Olvido de marcacion</option>
                <option value="comision">Comisión</option>
                <option value="bonificacion">Bonificación</option>
                <option value="licencia_remunerada">Licencia remunerada</option>
                <option value="sln">SLN · suspensión disciplinaria/licencia no remunerada</option>
                <option value="incapacidad_general">Incapacidad general</option>
                <option value="incapacidad_laboral">Incapacidad laboral</option>
                <option value="maternidad_paternidad">Maternidad/Paternidad</option>
                <option value="vacaciones_disfrutadas">VAC disfrutadas</option>
                <option value="vacaciones_compensadas">VAC compensadas en dinero</option>
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Codigo concepto
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.concept_code} onChange={(event) => setAdjustment((current) => ({ ...current, concept_code: event.target.value }))}>
                  <option value="AJUSTE_MANUAL">AJUSTE_MANUAL</option>
                  <option value="JORNADA_ORDINARIA">JORNADA_ORDINARIA</option>
                  <option value="COMISION">COMISION</option>
                  <option value="BONIFICACION_SALARIAL">BONIFICACION_SALARIAL</option>
                  <option value="BONIFICACION_NO_SALARIAL">BONIFICACION_NO_SALARIAL</option>
                  <option value="LICENCIA_REMUNERADA">LICENCIA_REMUNERADA</option>
                  <option value="SLN">SLN</option>
                  <option value="INCAPACIDAD_GENERAL">INCAPACIDAD_GENERAL</option>
                  <option value="INCAPACIDAD_LABORAL">INCAPACIDAD_LABORAL</option>
                  <option value="LICENCIA_MATERNIDAD_PATERNIDAD">LICENCIA_MATERNIDAD_PATERNIDAD</option>
                  <option value="VACACIONES">VACACIONES (disfrutadas)</option>
                  <option value="VACACIONES_COMPENSADAS">VACACIONES_COMPENSADAS</option>
                </select>
              </label>
              {isWorkdayCorrection ? (
                <>
                  <label className="text-sm">Fecha trabajada<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={adjustment.work_date} onChange={(event) => setAdjustment((current) => ({ ...current, work_date: event.target.value }))} /></label>
                  <label className="text-sm">Hora inicio<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="time" value={adjustment.start_time} onChange={(event) => setAdjustment((current) => ({ ...current, start_time: event.target.value }))} /></label>
                  <label className="text-sm">Hora fin<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="time" value={adjustment.end_time} onChange={(event) => setAdjustment((current) => ({ ...current, end_time: event.target.value }))} /></label>
                </>
              ) : null}
              {["licencia_remunerada", "sln", "vacaciones_disfrutadas", "vacaciones_compensadas", "incapacidad_general", "incapacidad_laboral", "maternidad_paternidad"].includes(adjustment.adjustment_type) ? (
                <>
                  <label className="text-sm">{adjustment.adjustment_type === "vacaciones_compensadas" ? "Fecha reconocimiento" : "Fecha inicio novedad"}<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={adjustment.date_start} onChange={(event) => setAdjustment((current) => ({ ...current, date_start: event.target.value, ...(current.adjustment_type === "vacaciones_compensadas" ? { date_end: event.target.value } : {}) }))} /></label>
                  {adjustment.adjustment_type !== "vacaciones_compensadas" ? <label className="text-sm">Fecha fin novedad<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={adjustment.date_end} onChange={(event) => setAdjustment((current) => ({ ...current, date_end: event.target.value }))} /></label> : null}
                  {adjustment.adjustment_type !== "vacaciones_compensadas" ? <label className="text-sm">Dias novedad<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min="0" max="30" value={adjustment.days} onChange={(event) => setAdjustment((current) => ({ ...current, days: event.target.value }))} /></label> : <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 md:col-span-2">VAC compensadas se registra como valor reconocido para parafiscales. No crea días de descanso ni aporte adicional de salud, pensión o ARL.</p>}
                  <label className="text-sm">Responsable pago<select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3" value={adjustment.paid_by} onChange={(event) => setAdjustment((current) => ({ ...current, paid_by: event.target.value }))}><option value="">No definido</option><option value="empresa">Empresa</option><option value="eps">EPS</option><option value="arl">ARL</option><option value="empleado">Empleado/no remunerado</option></select></label>
                  {adjustment.adjustment_type === "sln" ? <label className="text-sm">Causal SLN<select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3" value={adjustment.sln_cause} onChange={(event) => setAdjustment((current) => ({ ...current, sln_cause: event.target.value }))}><option value="">Seleccionar causal</option><option value="suspension_disciplinaria">Suspensión disciplinaria sin remuneración</option><option value="licencia_no_remunerada">Licencia no remunerada</option></select></label> : null}
                  {adjustment.adjustment_type === "licencia_remunerada" ? <label className="text-sm">Política ARL licencia remunerada<select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3" value={adjustment.lr_arl_policy} onChange={(event) => setAdjustment((current) => ({ ...current, lr_arl_policy: event.target.value }))}><option value="">Seleccionar política</option><option value="cotiza">Cotiza ARL</option><option value="no_cotiza">No cotiza ARL</option></select></label> : null}
                  <label className="text-sm">IBC PILA legacy (no sustituye referencia histórica)<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" value={adjustment.pila_ibc_amount} onChange={(event) => setAdjustment((current) => ({ ...current, pila_ibc_amount: event.target.value }))} /></label>
                  {requiresFrozenIbcReference ? <>
                    <label className="text-sm">IBC histórico congelado al inicio<input data-testid="ibc-reference-amount" className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min="0" value={adjustment.ibc_reference_amount} onChange={(event) => setAdjustment((current) => ({ ...current, ibc_reference_amount: event.target.value }))} /></label>
                    <label className="text-sm">Periodo del IBC reportado<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="month" value={adjustment.ibc_reference_period} onChange={(event) => setAdjustment((current) => ({ ...current, ibc_reference_period: event.target.value }))} /></label>
                    <label className="text-sm">Fecha de captura<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={adjustment.ibc_reference_captured_at} onChange={(event) => setAdjustment((current) => ({ ...current, ibc_reference_captured_at: event.target.value }))} /></label>
                    <label className="text-sm">Soporte / origen del IBC<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.document_support} onChange={(event) => setAdjustment((current) => ({ ...current, document_support: event.target.value }))} placeholder="Nómina, planilla o documento" /></label>
                    <label className="text-sm">Origen de referencia<select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3" value={adjustment.reference_source} onChange={(event) => setAdjustment((current) => ({ ...current, reference_source: event.target.value }))}><option value="">Seleccionar origen</option><option value="manual_reported_pila">Planilla reportada manualmente</option><option value="operator_attested">Atestación explícita del operador</option></select></label>
                    <label className="text-sm">ID planilla / atestación<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.reported_pila_id} onChange={(event) => setAdjustment((current) => ({ ...current, reported_pila_id: event.target.value }))} placeholder="Referencia verificable" /></label>
                    <label className="text-sm">Clave de continuidad<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.continuity_key} onChange={(event) => setAdjustment((current) => ({ ...current, continuity_key: event.target.value }))} placeholder="Empleado + novedad continua" /></label>
                  </> : null}
                  {adjustment.adjustment_type === "vacaciones_compensadas" ? <>
                    <label className="text-sm">Valor reconocido para parafiscales<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min="0" value={adjustment.recognized_value} onChange={(event) => setAdjustment((current) => ({ ...current, recognized_value: event.target.value }))} /></label>
                    <label className="text-sm">Soporte documental<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.document_support} onChange={(event) => setAdjustment((current) => ({ ...current, document_support: event.target.value }))} /></label>
                  </> : null}
                  {adjustment.adjustment_type !== "vacaciones_compensadas" ? <label className="text-sm">Valor reconocido del segmento<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min="0" value={adjustment.recognized_value} onChange={(event) => setAdjustment((current) => ({ ...current, recognized_value: event.target.value }))} />{adjustment.adjustment_type === "sln" ? <span className="mt-1 block text-xs text-amber-700">Para SLN registra 0: no se descuenta aporte ordinario al trabajador.</span> : null}</label> : null}
                  {adjustment.adjustment_type === "vacaciones_disfrutadas" ? <>
                    <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 md:col-span-2">Si hubo anticipo, registra la retención efectivamente aplicada a la misma obligación y período para descontarla una sola vez.</p>
                    <label className="text-sm">Obligación del anticipo<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.advance_obligation} onChange={(event) => setAdjustment((current) => ({ ...current, advance_obligation: event.target.value }))} placeholder="VACACIONES_SALUD / VACACIONES_PENSION" /></label>
                    <label className="text-sm">Período de obligación<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.advance_period} onChange={(event) => setAdjustment((current) => ({ ...current, advance_period: event.target.value }))} placeholder={currentPeriodKey} /></label>
                    <label className="text-sm">Soporte de retención<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.advance_support} onChange={(event) => setAdjustment((current) => ({ ...current, advance_support: event.target.value }))} placeholder="Comprobante / documento" /></label>
                    <label className="text-sm">Retención anticipada salud<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min="0" value={adjustment.advance_retention_health} onChange={(event) => setAdjustment((current) => ({ ...current, advance_retention_health: event.target.value }))} /></label>
                    <label className="text-sm">Retención anticipada pensión<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min="0" value={adjustment.advance_retention_pension} onChange={(event) => setAdjustment((current) => ({ ...current, advance_retention_pension: event.target.value }))} /></label>
                  </> : null}
                </>
              ) : null}
              {!isSegmentedNovelty ? <>
                <label className="text-sm">Minutos<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" value={adjustment.minutes} onChange={(event) => setAdjustment((current) => ({ ...current, minutes: event.target.value }))} /></label>
                <label className="text-sm">Valor COP<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" value={adjustment.amount} onChange={(event) => setAdjustment((current) => ({ ...current, amount: event.target.value }))} /></label>
              </> : null}
              {adjustment.adjustment_type === "sln" ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">SLN no genera descuento monetario ordinario al trabajador por los días suspendidos. Registra solo días, causal y soporte.</p> : null}
              <label className="text-sm">Motivo opcional<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={adjustment.description} onChange={(event) => setAdjustment((current) => ({ ...current, description: event.target.value }))} /></label>
            </div>
            <button data-testid="ibc-add-adjustment" className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={busy || !canCreateAdjustment} onClick={createAdjustment} type="button"><Plus size={16} /> Agregar ajuste</button>
          </div>
        </div>
      </section>
      </>
      ) : null}

      {receiptDocument && typeof document !== "undefined" ? createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title">
          <div className="max-h-[90dvh] w-full max-w-4xl overflow-hidden rounded-md bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <h2 className="text-base font-semibold" id="receipt-dialog-title">Conceptos del comprobante</h2>
                <p className="mt-1 text-sm text-neutral-500">{employeeName(receiptDocument)} · Neto {money(receiptDocument.net)}</p>
              </div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line" onClick={() => setReceiptDocument(null)} type="button" aria-label="Cerrar detalle del comprobante"><X size={18} /></button>
            </div>
            <div className="max-h-[70dvh] overflow-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="sticky top-0 bg-paper text-left text-xs uppercase text-neutral-500">
                  <tr className="border-b border-line"><th className="px-3 py-3">Codigo</th><th className="px-3 py-3">Concepto</th><th className="px-3 py-3 text-right">Valor</th></tr>
                </thead>
                <tbody>{payrollReceiptLines(receiptDocument.lines || []).map((line, index) => (
                  <tr className="border-b border-line/70" key={`${line.code}-${index}`}><td className="px-3 py-3 font-medium">{line.code}</td><td className="px-3 py-3">{line.name}</td><td className="px-3 py-3 text-right">{money(line.amount)}</td></tr>
                ))}</tbody>
              </table>
              {!payrollReceiptLines(receiptDocument.lines || []).length ? <p className="p-4 text-sm text-neutral-500">Este comprobante no tiene conceptos para mostrar.</p> : null}
            </div>
          </div>
        </div>
      ), document.body) : null}

      {periodReady && payrollMode === "archivo_plano" ? (
      <section className="rounded-md border border-line bg-white p-4" role="tabpanel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Jornadas externas por Excel</h2>
            <p className="mt-1 text-sm text-neutral-600">Carga jornadas de otros sistemas usando cedula, concepto, fechas, dias, horas, extras, licencias o suspensiones.</p>
            <p className="mt-1 text-xs text-neutral-500">Despues de importar, vuelve a liquidacion con marcaciones para validar o liquidar el periodo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => void downloadExternalWorkdayTemplate()} type="button"><Download size={16} /> Plantilla</button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold"><Upload size={16} /> Seleccionar Excel<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void readExternalWorkdayExcel(event)} type="file" /></label>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || !externalRows.length} onClick={() => void importExternalWorkdays()} type="button"><Upload size={16} /> Importar jornadas</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-700 disabled:opacity-60" disabled={busy} onClick={() => void deleteExternalWorkdays()} type="button"><Trash2 size={16} /> Borrar importadas</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => setPayrollMode("marcaciones")} type="button"><Play size={16} /> Ir a liquidacion</button>
          </div>
        </div>
        {externalFileName ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{externalFileName}: {externalRows.length} fila(s) preparadas para {currentPeriodKey}.</p> : null}
        {externalRows.length ? (
          <div className="mt-3 rounded-md border border-line bg-white">
            <div className="border-b border-line p-3">
              <h3 className="text-sm font-semibold">Vista preliminar del archivo</h3>
              <p className="text-xs text-neutral-500">Revisa estos datos antes de importar las jornadas externas al periodo.</p>
            </div>
            <div className="grid gap-3 p-3 md:grid-cols-4">
              <KpiValue label="Filas" value={String(externalPreview.rows)} />
              <KpiValue label="Empleados" value={String(externalPreview.documents)} />
              <KpiValue label="Dias" value={String(externalPreview.totalDays)} />
              <KpiValue label="Horas" value={String(externalPreview.totalHours)} />
              <KpiValue label="Minutos" value={String(externalPreview.totalMinutes)} />
              <KpiValue label="Valor" value={money(externalPreview.totalAmount)} />
              <KpiValue label="Conceptos" value={String(externalPreview.concepts.size)} />
              <KpiValue label="Filas incompletas" value={String(externalPreview.rowsWithMissingData)} />
            </div>
            <div className="border-t border-line p-3 text-xs text-neutral-600">
              Conceptos: {Array.from(externalPreview.concepts.entries()).map(([code, count]) => `${code} (${count})`).join(", ") || "--"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-y border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Inicio</th><th className="px-3 py-2">Fin</th><th className="px-3 py-2">Fecha trabajo</th><th className="px-3 py-2">Dias</th><th className="px-3 py-2">Horas</th><th className="px-3 py-2">Minutos</th><th className="px-3 py-2">Valor</th></tr></thead>
                <tbody>{externalRows.slice(0, 8).map((row, index) => (
                  <tr className="border-b border-line/70" key={`${row.document || row.employee_code || "row"}-${index}`}>
                    <td className="px-3 py-2">{String(row.document || row.employee_code || "--")}</td>
                    <td className="px-3 py-2 font-medium">{String(row.concept_code || "--")}</td>
                    <td className="px-3 py-2">{String(row.date_start || "--")}</td>
                    <td className="px-3 py-2">{String(row.date_end || "--")}</td>
                    <td className="px-3 py-2">{String(row.work_date || "--")}</td>
                    <td className="px-3 py-2">{String(row.days || 0)}</td>
                    <td className="px-3 py-2">{String(row.hours || 0)}</td>
                    <td className="px-3 py-2">{String(row.minutes || 0)}</td>
                    <td className="px-3 py-2">{money(row.amount || 0)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {externalRows.length > 8 ? <p className="p-3 text-xs text-neutral-500">Mostrando 8 de {externalRows.length} filas.</p> : null}
          </div>
        ) : null}
        {externalImportSummary ? <p className="mt-3 rounded-md border border-line bg-paper p-3 text-sm text-neutral-700">{externalImportSummary}</p> : null}
        {externalImportIssues.length ? (
          <div className="mt-3 rounded-md border border-line bg-white">
            <div className="border-b border-line p-3">
              <h3 className="text-sm font-semibold">Resultado de importacion</h3>
              <p className="text-xs text-neutral-500">Errores y advertencias encontrados en el archivo plano.</p>
            </div>
            <div className="divide-y divide-line">
              {externalImportIssues.map((issue, index) => (
                <div className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm" key={`${issue.code}-${index}`}>
                  <div>
                    <p className="font-semibold">{issue.code} {issue.employee_name ? `- ${issue.employee_name}` : ""}</p>
                    <p className="text-neutral-600">{issue.message}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${issue.severity === "error" ? "bg-rose-50 text-rose-700" : issue.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>{issue.severity}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {periodReady && payrollMode === "marcaciones" ? (
      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <h2 className="text-base font-semibold">Ajustes activos del periodo</h2>
          {periodIsClosed ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">El periodo esta cerrado. Para anular ajustes de {currentPeriodKey}, primero usa Reabrir periodo.</p> : null}
          {adjustmentError ? <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{adjustmentError}</p> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Descripcion</th><th className="px-3 py-2">Minutos</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
            <tbody>{adjustments.map((row) => (
              <tr className="border-b border-line/70" key={row.id}><td className="px-3 py-2">{employeeName(row)}</td><td className="px-3 py-2">{row.adjustment_type}</td><td className="px-3 py-2 font-medium">{row.concept_code}</td><td className="px-3 py-2">{row.metadata?.work_date || "--"}</td><td className="px-3 py-2">{row.description}</td><td className="px-3 py-2">{row.minutes}</td><td className="px-3 py-2">{money(row.amount)}</td><td className="px-3 py-2 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm text-rose-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || periodIsClosed} onClick={() => deleteAdjustment(row.id)} title={periodIsClosed ? "Reabre el periodo antes de anular ajustes" : "Anular ajuste"} type="button"><Trash2 size={15} /> Anular</button></td></tr>
            ))}</tbody>
          </table>
          {!adjustments.length ? <p className="p-4 text-sm text-neutral-500">No hay ajustes activos para este periodo.</p> : null}
        </div>
      </section>
      ) : null}
    </div>
  );
}

function KpiValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
