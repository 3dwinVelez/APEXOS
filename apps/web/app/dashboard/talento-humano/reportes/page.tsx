"use client";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/feedback";
import { downloadXlsxWorkbook } from "@/lib/reportExports";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { punctualityAlert, punctualityTypeNames, type PunctualityAlert, type PunctualityTone } from "@/lib/punchPunctuality";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Clock, Download, Eye, Filter, ImageOff, LogIn, MapPin, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Employee = { id: number | string; code: string; user_type?: string; position: string; department: string; metadata: { name: string; document: string; user_type?: string; identity_aliases?: string[] }; user: { name: string; email?: string } };
type Punch = { id: number; user_name: string; type: string; time: string; punched_at: string; date: string; latitude?: number; longitude?: number; accuracy_meters?: number; vehicle_plate: string; route_id?: number; extra_minutes: number; extra_reason?: string; extra_detail?: string };
type Attendance = { user_name: string; next_type: string | null; punches: Punch[] };
type WorkActivity = { id: number; employee_id?: number | string; user_id?: string; activity_type_name: string; observation: string; occurred_at: string; latitude: number; longitude: number; accuracy_meters?: number; user_name: string; route_id?: number | string; vehicle_plate?: string; evidence?: Array<{ base64_data?: string; file_name?: string }>; metadata?: { supplied_user_name?: string; employee_code?: string; employee_name?: string; identity_aliases?: string[] } };
type TimeRoute = { id: number; date: string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string; tolerance_minutes?: number };
type PunchAlert = { type: string; label: string; tone: PunctualityTone };
type ReportRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  role: string;
  document: string;
  date: string;
  route: string;
  vehicle: string;
  entry?: Punch;
  lunchStart?: Punch;
  lunchEnd?: Punch;
  exit?: Punch;
  workedMinutes: number;
  overtimeMinutes: number;
  overtimeReason: string;
  overtimeDetail: string;
  punchAlerts: PunchAlert[];
  activities: WorkActivity[];
  events: Array<{ kind: string; title: string; at: string; userName: string; gps?: string; accuracy?: number; detail?: string; alert?: PunctualityAlert | null; evidenceCount?: number }>;
};

function punctualityIconFor(tone: PunctualityTone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return AlertTriangle;
  return Clock;
}

type PayrollConcept = { code: string; name: string; type: "devengo" | "deduccion" };
type PayrollReportEmployee = { employee_id: number; employee_code?: string; employee_name: string; periods: number; concepts: Record<string, number>; total_devengado: number; total_deducido: number; neto: number };
type PayrollReport = { fecha_inicio: string; fecha_fin: string; concepts: PayrollConcept[]; employees: PayrollReportEmployee[]; totals: { by_concept: Record<string, number>; devengado: number; deducido: number; neto: number } };
type BenefitTriple = { causado: number; pagado: number; saldo: number; dias_pendientes?: number };
type BenefitEmployee = { employee_id: number; employee_code?: string; employee_document?: string; employee_name: string; concepts: Record<string, BenefitTriple>; total_causado: number; total_pagado: number; total_saldo: number };
type BenefitReport = { fecha_inicio: string; fecha_fin: string; concepts: string[]; employees: BenefitEmployee[]; totals: { causado: number; pagado: number; saldo: number; by_concept: Record<string, BenefitTriple> } };
type BenefitReportMode = "cesantias" | "prima" | "vacaciones";
type PayrollAuxiliaryType = "todos" | "nomina" | "prestaciones" | "aportes" | "libranzas";
type PayrollAuxiliaryRow = { year: number | string; month: number | string; concept: string; document: string; employee_name: string; cost_center: string; amount: number; nature: string; entity_nit: string; entity_name: string; type: string };
type PayrollAuxiliaryReport = { fecha_inicio: string; fecha_fin: string; tipo: PayrollAuxiliaryType; rows: PayrollAuxiliaryRow[] };

const BENEFIT_LABELS: Record<string, string> = { PRIMA_SERVICIOS: "Prima", CESANTIAS: "Cesantias", INTERESES_CESANTIAS: "Int. cesantias", VACACIONES: "Vacaciones" };
const BENEFIT_FILTERS: Record<BenefitReportMode, { label: string; codes: string[] }> = {
  cesantias: { label: "Cesantias e intereses", codes: ["CESANTIAS", "INTERESES_CESANTIAS"] },
  prima: { label: "Prima", codes: ["PRIMA_SERVICIOS"] },
  vacaciones: { label: "Vacaciones", codes: ["VACACIONES"] }
};

function money(value: number | undefined) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function benefitSum(source: Record<string, BenefitTriple> | undefined, codes: string[]): BenefitTriple {
  return codes.reduce((acc, code) => {
    const value = source?.[code] || { causado: 0, pagado: 0, saldo: 0 };
    return {
      causado: acc.causado + Number(value.causado || 0),
      pagado: acc.pagado + Number(value.pagado || 0),
      saldo: acc.saldo + Number(value.saldo || 0),
      dias_pendientes: Number(acc.dias_pendientes || 0) + Number(value.dias_pendientes || 0)
    };
  }, { causado: 0, pagado: 0, saldo: 0, dias_pendientes: 0 } as BenefitTriple);
}

function employeeDocument(employee: BenefitEmployee) {
  return employee.employee_document || employee.employee_code || "--";
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00-05:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dateKey(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function reportRangeError(from: string, to: string) {
  if (!from || !to) return "Selecciona una fecha inicial y una fecha final.";
  const start = new Date(`${from}T00:00:00-05:00`);
  const end = new Date(`${to}T00:00:00-05:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "La fecha final debe ser igual o posterior a la inicial.";
  if ((end.getTime() - start.getTime()) / 86400000 + 1 > 92) return "El rango maximo permitido es de 92 dias.";
  return "";
}

function minutesLabel(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function hour(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function employeeName(employee?: Employee, fallback = "") {
  return employee?.metadata?.name || employee?.user?.name || fallback || "Sin nombre";
}

function employeeSearchLabel(employee: Employee) {
  const document = employee.metadata?.document || employee.code || String(employee.id);
  return `${document} - ${employeeName(employee)}`;
}

function gps(point: { latitude?: number; longitude?: number }) {
  return point.latitude != null && point.longitude != null ? `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}` : "";
}

function reportPunchAlerts(entry: Punch | undefined, exit: Punch | undefined, route: TimeRoute | undefined): PunchAlert[] {
  return [entry, exit].flatMap((punch) => {
    if (!punch) return [];
    const alert = punctualityAlert({ type: punch.type, time: punch.time, punched_at: punch.punched_at, startTime: route?.start_time, endTime: route?.end_time, toleranceMinutes: route?.tolerance_minutes });
    return alert ? [{ type: punch.type, label: alert.label, tone: alert.tone }] : [];
  });
}

function PunchAlertStack({ alerts, rowKey }: { alerts: PunchAlert[]; rowKey: string }) {
  if (!alerts.length) return <span className="text-neutral-400">--</span>;
  return (
    <div className="w-[22rem] max-w-[min(22rem,calc(100vw-2rem))] space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        <span>{alerts.length} alerta{alerts.length === 1 ? "" : "s"}</span>
        {alerts.some((alert) => alert.tone === "warning") ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Revisar</span> : null}
      </div>
      <div className="grid gap-1.5">
        {alerts.map((alert, index) => {
          const AlertIcon = punctualityIconFor(alert.tone);
          return (
            <Badge className="min-h-8 w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-left leading-4" key={`${rowKey}-${alert.type}-${index}`} tone={alert.tone}>
              <AlertIcon className="shrink-0" size={14} />
              <span className="min-w-0">
                <span className="font-bold">{punctualityTypeNames[alert.type] || alert.type}:</span>{" "}
                <span className="font-semibold">{alert.label}</span>
              </span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

export default function HrReportsPage() {
  const detailDialogRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [activities, setActivities] = useState<WorkActivity[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [appliedRange, setAppliedRange] = useState({ from: today(), to: today() });
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [journeyFilter, setJourneyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [message, setMessage] = useState("");
  const [reportView, setReportView] = useState<"operativo" | "nomina" | "prestaciones" | "auxiliar">("operativo");
  const [benefitFrom, setBenefitFrom] = useState(today());
  const [benefitTo, setBenefitTo] = useState(today());
  const [benefitEmployee, setBenefitEmployee] = useState("all");
  const [benefitEmployeeSearch, setBenefitEmployeeSearch] = useState("");
  const [benefitMode, setBenefitMode] = useState<BenefitReportMode>("cesantias");
  const [benefitReport, setBenefitReport] = useState<BenefitReport | null>(null);
  const [benefitLoading, setBenefitLoading] = useState(false);
  const [payrollFrom, setPayrollFrom] = useState(today());
  const [payrollTo, setPayrollTo] = useState(today());
  const [payrollEmployee, setPayrollEmployee] = useState("all");
  const [payrollEmployeeSearch, setPayrollEmployeeSearch] = useState("");
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [auxiliaryFrom, setAuxiliaryFrom] = useState(today());
  const [auxiliaryTo, setAuxiliaryTo] = useState(today());
  const [auxiliaryEmployee, setAuxiliaryEmployee] = useState("all");
  const [auxiliaryEmployeeSearch, setAuxiliaryEmployeeSearch] = useState("");
  const [auxiliaryType, setAuxiliaryType] = useState<PayrollAuxiliaryType>("todos");
  const [auxiliaryLoading, setAuxiliaryLoading] = useState(false);

  async function loadPayrollReport() {
    if (payrollLoading) return;
    if (!payrollFrom || !payrollTo || payrollTo < payrollFrom) {
      setMessage("Selecciona un rango de fechas valido para el reporte de nomina.");
      return;
    }
    setPayrollLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ fecha_inicio: payrollFrom, fecha_fin: payrollTo });
      const resolvedEmployee = resolveEmployeeSearch(payrollEmployeeSearch);
      if (!resolvedEmployee) {
        setMessage("No encontre un empleado con ese texto. Puedes buscar por cedula, codigo o nombre.");
        return;
      }
      setPayrollEmployee(resolvedEmployee);
      if (resolvedEmployee !== "all") params.set("employee_id", resolvedEmployee);
      const result = await api<PayrollReport>(`/api/v1/talento-humano/nomina/reportes/conceptos?${params.toString()}`, { cache: "no-store" });
      setPayrollReport(result);
      if (!result.employees.length) setMessage("No hay nomina liquidada en ese rango.");
    } catch (error) {
      setPayrollReport(null);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar el reporte de nomina.");
    } finally {
      setPayrollLoading(false);
    }
  }

  async function exportPayrollReport() {
    if (!payrollReport || !payrollReport.employees.length) return;
    if (!canExport) { setMessage("Tu rol no tiene permiso para exportar reportes."); return; }
    setExporting(true);
    setMessage("");
    try {
      const concepts = payrollReport.concepts;
      const columns = [
        { key: "empleado", label: "Empleado", width: 200 },
        { key: "documento", label: "Documento", width: 120 },
        { key: "periodos", label: "Periodos", width: 80 },
        ...concepts.map((concept) => ({ key: concept.code, label: `${concept.name}${concept.type === "deduccion" ? " (ded.)" : ""}`, width: 130, numberFormat: "#,##0" })),
        { key: "total_devengado", label: "Total devengado", width: 130, numberFormat: "#,##0" },
        { key: "total_deducido", label: "Total deducido", width: 130, numberFormat: "#,##0" },
        { key: "neto", label: "Neto", width: 130, numberFormat: "#,##0" }
      ];
      const rows = payrollReport.employees.map((employee) => {
        const base: Record<string, string | number> = { empleado: employee.employee_name, documento: employee.employee_code || "", periodos: employee.periods, total_devengado: employee.total_devengado, total_deducido: employee.total_deducido, neto: employee.neto };
        for (const concept of concepts) base[concept.code] = Math.abs(Number(employee.concepts[concept.code] || 0));
        return base;
      });
      await downloadXlsxWorkbook(`apexos-nomina-conceptos-${payrollReport.fecha_inicio}-${payrollReport.fecha_fin}.xlsx`, [
        { name: "Nomina por concepto", title: "Reporte de nomina por concepto", subtitle: `Periodo ${payrollReport.fecha_inicio} a ${payrollReport.fecha_fin} | ${payrollReport.employees.length} empleado(s)`, columns, rows }
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible generar el Excel.");
    } finally {
      setExporting(false);
    }
  }

  async function loadBenefitReport() {
    if (benefitLoading) return;
    if (!benefitFrom || !benefitTo || benefitTo < benefitFrom) {
      setMessage("Selecciona un rango de fechas valido para el reporte de prestaciones.");
      return;
    }
    setBenefitLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ fecha_inicio: benefitFrom, fecha_fin: benefitTo });
      const resolvedEmployee = resolveEmployeeSearch(benefitEmployeeSearch);
      if (!resolvedEmployee) {
        setMessage("No encontre un empleado con ese texto. Puedes buscar por cedula, codigo o nombre.");
        return;
      }
      setBenefitEmployee(resolvedEmployee);
      if (resolvedEmployee !== "all") params.set("employee_id", resolvedEmployee);
      const result = await api<BenefitReport>(`/api/v1/talento-humano/nomina/reportes/prestaciones?${params.toString()}`, { cache: "no-store" });
      setBenefitReport(result);
      if (!result.employees.length) setMessage("No hay saldos de prestaciones en ese rango.");
    } catch (error) {
      setBenefitReport(null);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar el reporte de prestaciones.");
    } finally {
      setBenefitLoading(false);
    }
  }

  async function exportBenefitReport() {
    if (!benefitReport || !benefitReport.employees.length) return;
    if (!canExport) { setMessage("Tu rol no tiene permiso para exportar reportes."); return; }
    setExporting(true);
    setMessage("");
    try {
      const selectedBenefit = BENEFIT_FILTERS[benefitMode];
      const columns = [
        { key: "empleado", label: "Empleado", width: 200 },
        { key: "cedula", label: "Cedula", width: 120 },
        ...(benefitMode === "cesantias" ? [
          { key: "cesantias_causado", label: "Cesantias causado", width: 130, numberFormat: "#,##0" },
          { key: "cesantias_pagado", label: "Cesantias pagado", width: 130, numberFormat: "#,##0" },
          { key: "cesantias_saldo", label: "Cesantias saldo", width: 130, numberFormat: "#,##0" },
          { key: "intereses_causado", label: "Intereses causado", width: 130, numberFormat: "#,##0" },
          { key: "intereses_pagado", label: "Intereses pagado", width: 130, numberFormat: "#,##0" },
          { key: "intereses_saldo", label: "Intereses saldo", width: 130, numberFormat: "#,##0" }
        ] : [
          ...(benefitMode === "vacaciones" ? [{ key: "dias_pendientes", label: "Dias pendientes", width: 120, numberFormat: "#,##0.00" }] : []),
          { key: "causado", label: `${selectedBenefit.label} causado`, width: 130, numberFormat: "#,##0" },
          { key: "pagado", label: `${selectedBenefit.label} pagado`, width: 130, numberFormat: "#,##0" },
          { key: "saldo", label: `${selectedBenefit.label} saldo`, width: 130, numberFormat: "#,##0" }
        ])
      ];
      const rows = benefitReport.employees.map((employee) => {
        const cedula = employeeDocument(employee);
        if (benefitMode === "cesantias") {
          const cesantias = employee.concepts.CESANTIAS || { causado: 0, pagado: 0, saldo: 0 };
          const intereses = employee.concepts.INTERESES_CESANTIAS || { causado: 0, pagado: 0, saldo: 0 };
          return { empleado: employee.employee_name, cedula, cesantias_causado: cesantias.causado, cesantias_pagado: cesantias.pagado, cesantias_saldo: cesantias.saldo, intereses_causado: intereses.causado, intereses_pagado: intereses.pagado, intereses_saldo: intereses.saldo };
        }
        const total = benefitSum(employee.concepts, selectedBenefit.codes);
        return { empleado: employee.employee_name, cedula, ...(benefitMode === "vacaciones" ? { dias_pendientes: total.dias_pendientes || 0 } : {}), causado: total.causado, pagado: total.pagado, saldo: total.saldo };
      });
      await downloadXlsxWorkbook(`apexos-prestaciones-${benefitMode}-${benefitReport.fecha_inicio}-${benefitReport.fecha_fin}.xlsx`, [
        { name: selectedBenefit.label.slice(0, 31), title: `Reporte de ${selectedBenefit.label}`, subtitle: `Periodo ${benefitReport.fecha_inicio} a ${benefitReport.fecha_fin} | ${benefitReport.employees.length} empleado(s)`, columns, rows }
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible generar el Excel.");
    } finally {
      setExporting(false);
    }
  }

  async function exportAuxiliaryReport() {
    if (auxiliaryLoading) return;
    if (!canExport) { setMessage("Tu rol no tiene permiso para exportar reportes."); return; }
    if (!auxiliaryFrom || !auxiliaryTo || auxiliaryTo < auxiliaryFrom) {
      setMessage("Selecciona un rango de fechas valido para el auxiliar de nomina.");
      return;
    }
    setAuxiliaryLoading(true);
    setExporting(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ fecha_inicio: auxiliaryFrom, fecha_fin: auxiliaryTo, tipo: auxiliaryType });
      const resolvedEmployee = resolveEmployeeSearch(auxiliaryEmployeeSearch);
      if (!resolvedEmployee) {
        setMessage("No encontre un empleado con ese texto. Puedes buscar por cedula, codigo o nombre.");
        return;
      }
      setAuxiliaryEmployee(resolvedEmployee);
      if (resolvedEmployee !== "all") params.set("employee_id", resolvedEmployee);
      const result = await api<PayrollAuxiliaryReport>(`/api/v1/talento-humano/nomina/reportes/auxiliar?${params.toString()}`, { cache: "no-store" });
      if (!result.rows.length) {
        setMessage("No hay movimientos para exportar en ese rango.");
        return;
      }
      await downloadXlsxWorkbook(`apexos-auxiliar-nomina-${result.fecha_inicio}-${result.fecha_fin}.xlsx`, [
        {
          name: "Auxiliar nomina",
          title: "Auxiliar de nomina",
          subtitle: `Periodo ${result.fecha_inicio} a ${result.fecha_fin} | ${result.rows.length} movimiento(s)`,
          columns: [
            { key: "year", label: "Año", width: 80 },
            { key: "month", label: "Mes", width: 70 },
            { key: "concept", label: "Concepto", width: 220 },
            { key: "document", label: "Cedula", width: 130 },
            { key: "employee_name", label: "Nombre empleado", width: 230 },
            { key: "cost_center", label: "Centro de costos", width: 140 },
            { key: "amount", label: "Valor", width: 120, numberFormat: "#,##0" },
            { key: "nature", label: "Naturaleza", width: 110 },
            { key: "entity_nit", label: "Nit entidad", width: 130 },
            { key: "entity_name", label: "Entidad", width: 180 },
            { key: "type", label: "Tipo", width: 150 }
          ],
          rows: result.rows
        }
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible generar el auxiliar de nomina.");
    } finally {
      setAuxiliaryLoading(false);
      setExporting(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCanExport(hasStoredRolePermission("hr", "export"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [employeeRows, punchRows, activityRows, routeRows] = await Promise.all([
        api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => [] as Employee[]),
        api<Attendance[]>(`/api/v1/hr/attendance?fecha_inicio=${encodeURIComponent(appliedRange.from)}&fecha_fin=${encodeURIComponent(appliedRange.to)}`).catch(() => [] as Attendance[]),
        api<WorkActivity[]>(`/api/v1/hr/work-activities?fecha_inicio=${encodeURIComponent(appliedRange.from)}&fecha_fin=${encodeURIComponent(appliedRange.to)}&limit=5000`).catch(() => [] as WorkActivity[]),
        api<TimeRoute[]>(`/api/v1/hr/routes?fecha_inicio=${encodeURIComponent(appliedRange.from)}&fecha_fin=${encodeURIComponent(appliedRange.to)}`).catch(() => [] as TimeRoute[])
      ]);
      setEmployees(employeeRows);
      setPunches(punchRows.flatMap((att) => att.punches || []));
      setActivities(activityRows);
      setRoutes(routeRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar los reportes de Talento Humano.");
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => detailDialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  const rows = useMemo(() => {
    const groups = new Map<string, Punch[]>();
    for (const punch of punches) {
      const date = typeof punch.date === "string" ? punch.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const key = `${punch.user_name || "sin-empleado"}|${date}`;
      groups.set(key, [...(groups.get(key) || []), punch]);
    }
    return Array.from(groups.entries()).map(([key, group]) => {
      const sorted = group.sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
      const userName = sorted[0]?.user_name || "";
      const employee = employees.find((emp) => [emp.id, emp.code, employeeName(emp), emp.user?.email, ...(emp.metadata?.identity_aliases || [])].some((alias) => normalized(alias) === normalized(userName)));
      const route = routes.find((r) => String(r.id) === String(sorted[0]?.route_id));
      const entry = sorted.find((item) => item.type === "entrada");
      const lunchStart = sorted.find((item) => item.type === "inicio_almuerzo");
      const lunchEnd = sorted.find((item) => item.type === "fin_almuerzo");
      const exit = sorted.find((item) => item.type === "salida");
      const gross = entry && exit ? Math.max(0, new Date(exit.punched_at).getTime() - new Date(entry.punched_at).getTime()) / 60000 : 0;
      const lunch = lunchStart && lunchEnd ? Math.max(0, new Date(lunchEnd.punched_at).getTime() - new Date(lunchStart.punched_at).getTime()) / 60000 : 0;
      const userAliases = new Set([
        userName,
        employee?.id,
        employee?.code,
        employeeName(employee, ""),
        employee?.user?.email,
        employee?.metadata?.name,
        ...(Array.isArray(employee?.metadata?.identity_aliases) ? employee.metadata.identity_aliases : [])
      ].filter(Boolean).map((value) => String(value).trim().toLowerCase()));
      const routeActivities = activities.filter((activity) => {
        if (dateKey(activity.occurred_at) !== dateKey(sorted[0]?.date)) return false;
        const activityAliases = [
          activity.user_name,
          activity.employee_id,
          activity.user_id,
          activity.metadata?.supplied_user_name,
          activity.metadata?.employee_code,
          activity.metadata?.employee_name,
          ...(Array.isArray(activity.metadata?.identity_aliases) ? activity.metadata.identity_aliases : [])
        ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
        return activityAliases.some((alias) => userAliases.has(alias)) || Boolean(activity.route_id && String(activity.route_id) === String(sorted[0]?.route_id));
      });
      const events = [
        ...sorted.map((punch) => ({ kind: "Marcacion", title: punch.type, at: punch.punched_at, userName: punch.user_name || employeeName(employee, userName), gps: gps(punch), accuracy: punch.accuracy_meters, detail: punch.extra_minutes ? `${punch.extra_minutes} min extra` : "", alert: punctualityAlert({ type: punch.type, time: punch.time, punched_at: punch.punched_at, startTime: route?.start_time, endTime: route?.end_time, toleranceMinutes: route?.tolerance_minutes }), evidenceCount: 0 })),
        ...routeActivities.map((activity) => ({ kind: "Actividad", title: activity.activity_type_name || "Actividad operativa", at: activity.occurred_at, userName: activity.user_name || employeeName(employee, userName), gps: gps(activity), accuracy: activity.accuracy_meters, detail: activity.observation || "", alert: null, evidenceCount: activity.evidence?.length || 0 }))
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
      const punchAlerts = reportPunchAlerts(entry, exit, route);
      return {
        key,
        employeeId: String(employee?.id || userName),
        employeeName: employeeName(employee, userName),
        role: String(employee?.user_type || employee?.position || "operativo"),
        document: employee?.metadata?.document || "",
        date: dateKey(sorted[0]?.date),
        route: route ? `Ruta ${route.id}` : String(sorted[0]?.route_id || "--"),
        vehicle: sorted[0]?.vehicle_plate || route?.vehicle_plate || "--",
        entry,
        lunchStart,
        lunchEnd,
        exit,
        workedMinutes: Math.max(0, Math.round(gross - lunch)),
        overtimeMinutes: sorted.reduce((sum, punch) => sum + Number(punch.extra_minutes || 0), 0),
        overtimeReason: sorted.find((punch) => punch.extra_reason)?.extra_reason || "",
        overtimeDetail: sorted.find((punch) => punch.extra_detail)?.extra_detail || "",
        punchAlerts,
        activities: routeActivities,
        events
      } satisfies ReportRow;
    });
  }, [activities, employees, punches, routes]);

  const filtered = useMemo(() => rows.filter((row) => {
    const term = normalized(query);
    if (row.date < appliedRange.from || row.date > appliedRange.to) return false;
    if (employeeFilter !== "all" && row.employeeId !== employeeFilter) return false;
    if (onlyOvertime && !row.overtimeMinutes) return false;
    if (journeyFilter === "complete" && (!row.entry || !row.exit)) return false;
    if (journeyFilter === "incomplete" && row.entry && row.exit) return false;
    if (!term) return true;
    return normalized([row.employeeName, row.document, row.route, row.vehicle, row.role, row.overtimeReason, row.overtimeDetail, ...row.punchAlerts.map((alert) => alert.label), ...row.activities.map((activity) => activity.activity_type_name)].join(" ")).includes(term);
  }), [appliedRange, employeeFilter, journeyFilter, onlyOvertime, query, rows]);

  const activeFilters = [employeeFilter !== "all", onlyOvertime, journeyFilter !== "all", Boolean(query.trim())].filter(Boolean).length;

  function applyDateFilters() {
    const error = reportRangeError(from, to);
    if (error) return setMessage(error);
    setMessage("");
    setAppliedRange({ from, to });
  }

  function applyPreset(days: number | "month") {
    const end = today();
    const start = days === "month" ? `${end.slice(0, 8)}01` : shiftDate(end, -(days - 1));
    setFrom(start);
    setTo(end);
    setAppliedRange({ from: start, to: end });
  }

  function clearSmartFilters() {
    setEmployeeFilter("all");
    setOnlyOvertime(false);
    setJourneyFilter("all");
    setQuery("");
  }

  async function exportRows() {
    if (!canExport) {
      setMessage("Tu rol no tiene permiso para exportar reportes de Talento Humano.");
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const uniqueEmployees = new Set(filtered.map((row) => row.employeeId)).size;
      const workedHours = filtered.reduce((sum, row) => sum + row.workedMinutes, 0) / 60;
      const overtimeHours = filtered.reduce((sum, row) => sum + row.overtimeMinutes, 0) / 60;
      await downloadXlsxWorkbook(`apexos-reporte-talento-humano-${appliedRange.from}-${appliedRange.to}.xlsx`, [
        {
          name: "Resumen",
          title: "Reporte de Talento Humano",
          subtitle: `Periodo ${appliedRange.from} a ${appliedRange.to} | Datos filtrados: ${filtered.length} jornada(s)`,
          columns: [{ key: "indicador", label: "Indicador", width: 220 }, { key: "valor", label: "Valor", width: 160 }],
          rows: [
            { indicador: "Jornadas incluidas", valor: filtered.length },
            { indicador: "Empleados", valor: uniqueEmployees },
            { indicador: "Horas laboradas", valor: Number(workedHours.toFixed(2)) },
            { indicador: "Horas extra", valor: Number(overtimeHours.toFixed(2)) },
            { indicador: "Jornadas incompletas", valor: filtered.filter((row) => !row.entry || !row.exit).length },
            { indicador: "Jornadas con alerta critica", valor: filtered.filter((row) => row.punchAlerts.some((alert) => alert.tone === "warning")).length },
            { indicador: "Eventos de trazabilidad", valor: filtered.reduce((sum, row) => sum + row.events.length, 0) }
          ]
        },
        {
          name: "Jornadas",
          title: "Detalle de jornadas",
          subtitle: `Periodo ${appliedRange.from} a ${appliedRange.to} | Exportado con los filtros visibles`,
          columns: [
            { key: "fecha", label: "Fecha", width: 95, numberFormat: "yyyy-mm-dd" }, { key: "empleado", label: "Empleado", width: 180 },
            { key: "rol", label: "Rol", width: 120 }, { key: "documento", label: "Documento", width: 110 }, { key: "ruta", label: "Ruta", width: 110 },
            { key: "vehiculo", label: "Vehiculo", width: 95 }, { key: "entrada", label: "Entrada", width: 85 }, { key: "almuerzo_inicio", label: "Inicio almuerzo", width: 100 },
            { key: "almuerzo_fin", label: "Fin almuerzo", width: 100 }, { key: "cierre", label: "Cierre", width: 85 },
            { key: "alerta_entrada", label: "Alerta entrada", width: 150 }, { key: "alerta_cierre", label: "Alerta cierre", width: 150 },
            { key: "horas_laboradas", label: "Horas laboradas", width: 110, numberFormat: "0.00" }, { key: "horas_extra", label: "Horas extra", width: 95, numberFormat: "0.00" },
            { key: "estado", label: "Estado jornada", width: 115 }, { key: "motivo_extra", label: "Motivo extra", width: 180 },
            { key: "justificacion_extra", label: "Justificacion extra", width: 240 }, { key: "actividades", label: "Actividades", width: 90 }, { key: "eventos", label: "Eventos", width: 85 }
          ],
          rows: filtered.map((row) => ({
            fecha: new Date(`${row.date}T12:00:00-05:00`), empleado: row.employeeName, rol: row.role, documento: row.document, ruta: row.route, vehiculo: row.vehicle,
            entrada: hour(row.entry?.punched_at), almuerzo_inicio: hour(row.lunchStart?.punched_at), almuerzo_fin: hour(row.lunchEnd?.punched_at), cierre: hour(row.exit?.punched_at),
            alerta_entrada: row.punchAlerts.find((alert) => alert.type === "entrada")?.label || "", alerta_cierre: row.punchAlerts.find((alert) => alert.type === "salida")?.label || "",
            horas_laboradas: Number((row.workedMinutes / 60).toFixed(2)), horas_extra: Number((row.overtimeMinutes / 60).toFixed(2)), estado: row.entry && row.exit ? "Completa" : "Incompleta",
            motivo_extra: row.overtimeReason, justificacion_extra: row.overtimeDetail, actividades: row.activities.length, eventos: row.events.length
          }))
        },
        {
          name: "Trazabilidad",
          title: "Eventos de trazabilidad",
          subtitle: "Marcaciones y actividades asociadas a cada jornada filtrada",
          columns: [
            { key: "fecha", label: "Fecha", width: 95, numberFormat: "yyyy-mm-dd" }, { key: "empleado", label: "Empleado", width: 180 }, { key: "ruta", label: "Ruta", width: 110 },
            { key: "tipo", label: "Tipo", width: 100 }, { key: "evento", label: "Evento", width: 160 }, { key: "hora", label: "Hora", width: 85 },
            { key: "alerta", label: "Alerta marcacion", width: 160 },
            { key: "gps", label: "GPS", width: 150 }, { key: "detalle", label: "Detalle", width: 280 }
          ],
          rows: filtered.flatMap((row) => row.events.map((event) => ({ fecha: new Date(`${row.date}T12:00:00-05:00`), empleado: row.employeeName, ruta: row.route, tipo: event.kind, evento: event.title, hora: hour(event.at), alerta: event.alert?.label || "", gps: event.gps || "", detalle: event.detail || "" })))
        }
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible generar el archivo Excel.");
    } finally {
      setExporting(false);
    }
  }

  const selectedBenefit = BENEFIT_FILTERS[benefitMode];
  const selectedBenefitTotals = benefitReport ? benefitSum(benefitReport.totals.by_concept, selectedBenefit.codes) : { causado: 0, pagado: 0, saldo: 0 };
  const resolveEmployeeSearch = useCallback((value: string) => {
    const term = normalized(value);
    if (!term) return "all";
    const exact = employees.find((employee) => {
      const values = [employee.id, employee.code, employee.metadata?.document, employee.metadata?.name, employee.user?.name].map(normalized);
      return values.includes(term) || normalized(employeeSearchLabel(employee)) === term;
    });
    if (exact) return String(exact.id);
    const partial = employees.find((employee) => [employee.code, employee.metadata?.document, employee.metadata?.name, employee.user?.name, employeeSearchLabel(employee)].some((candidate) => normalized(candidate).includes(term)));
    return partial ? String(partial.id) : "";
  }, [employees]);

  function applyEmployeeSearch(value: string, setFilter: (next: string) => void, setSearch: (next: string) => void) {
    const resolved = resolveEmployeeSearch(value);
    if (resolved === "all") {
      setFilter("all");
      setSearch("");
      setMessage("");
      return;
    }
    if (!resolved) {
      setMessage("No encontre un empleado con ese texto. Puedes buscar por cedula, codigo o nombre.");
      return;
    }
    const employee = employees.find((item) => String(item.id) === resolved);
    setFilter(resolved);
    setSearch(employee ? employeeSearchLabel(employee) : value);
    setMessage("");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex h-10 items-center gap-2 rounded-md text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={17} /> Talento Humano</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-apex">Reportes operativos</p>
          <h1 className="mt-1 text-3xl font-semibold">Horas laboradas y trazabilidad</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Consulta jornada, marcaciones, actividades GPS, horas extra, motivo y justificacion por empleado.</p>
        </div>
        {reportView === "operativo" ? <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={loading || exporting || !canExport} onClick={() => void exportRows()} title={canExport ? "Descargar el subconjunto filtrado" : "Tu rol no tiene permiso hr:export"} type="button"><Download size={16} /> {exporting ? "Generando Excel..." : "Descargar Excel"}</button> : null}
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <div className="flex flex-wrap gap-2 rounded-md border border-line bg-white p-1.5">
        <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold ${reportView === "operativo" ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setReportView("operativo")} type="button">Operativo (jornadas)</button>
        <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold ${reportView === "nomina" ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setReportView("nomina")} type="button">Nomina por concepto</button>
        <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold ${reportView === "prestaciones" ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setReportView("prestaciones")} type="button">Prestaciones sociales</button>
        <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold ${reportView === "auxiliar" ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setReportView("auxiliar")} type="button">Auxiliar de nomina</button>
      </div>
      <datalist id="hr-report-employees">
        {employees.map((employee) => <option key={employee.id} value={employeeSearchLabel(employee)} />)}
      </datalist>

      {reportView === "auxiliar" ? (
        <section className="space-y-4 rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr_1.1fr_auto]">
            <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" max={auxiliaryTo} type="date" value={auxiliaryFrom} onChange={(event) => setAuxiliaryFrom(event.target.value)} /></label>
            <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" min={auxiliaryFrom} type="date" value={auxiliaryTo} onChange={(event) => setAuxiliaryTo(event.target.value)} /></label>
            <label className="text-sm font-semibold">Empleado<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" list="hr-report-employees" placeholder="Cedula, codigo o nombre" value={auxiliaryEmployeeSearch} onChange={(event) => setAuxiliaryEmployeeSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyEmployeeSearch(auxiliaryEmployeeSearch, setAuxiliaryEmployee, setAuxiliaryEmployeeSearch); } }} /></label>
            <label className="text-sm font-semibold">Tipo<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={auxiliaryType} onChange={(event) => setAuxiliaryType(event.target.value as PayrollAuxiliaryType)}><option value="todos">Todos</option><option value="nomina">Nomina</option><option value="prestaciones">Prestaciones sociales</option><option value="aportes">Aportes seguridad social</option><option value="libranzas">Libranzas</option></select></label>
            <button className="inline-flex h-10 items-center gap-2 self-end rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={auxiliaryLoading || exporting || !canExport} onClick={() => void exportAuxiliaryReport()} type="button"><Download size={16} /> {auxiliaryLoading || exporting ? "Generando..." : "Excel"}</button>
          </div>
          <p className="text-xs text-neutral-500">Genera el auxiliar sin previsualizar movimientos en pantalla. Incluye año, mes, concepto, cedula, empleado, centro de costos, valor, naturaleza, entidad y tipo.</p>
        </section>
      ) : null}

      {reportView === "prestaciones" ? (
        <>
          <section className="space-y-4 rounded-md border border-line bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto_auto]">
              <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" max={benefitTo} type="date" value={benefitFrom} onChange={(event) => setBenefitFrom(event.target.value)} /></label>
              <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" min={benefitFrom} type="date" value={benefitTo} onChange={(event) => setBenefitTo(event.target.value)} /></label>
              <label className="text-sm font-semibold">Empleado<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" list="hr-report-employees" placeholder="Cedula, codigo o nombre" value={benefitEmployeeSearch} onChange={(event) => setBenefitEmployeeSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyEmployeeSearch(benefitEmployeeSearch, setBenefitEmployee, setBenefitEmployeeSearch); } }} /></label>
              <label className="text-sm font-semibold">Prestacion<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={benefitMode} onChange={(event) => setBenefitMode(event.target.value as BenefitReportMode)}><option value="cesantias">Cesantias e intereses</option><option value="prima">Prima</option><option value="vacaciones">Vacaciones</option></select></label>
              <button className="inline-flex h-10 items-center gap-2 self-end rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-paper disabled:opacity-60" disabled={benefitLoading} onClick={() => void loadBenefitReport()} type="button"><Filter size={16} /> {benefitLoading ? "Consultando..." : "Consultar"}</button>
              <button className="inline-flex h-10 items-center gap-2 self-end rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={exporting || !benefitReport?.employees.length || !canExport} onClick={() => void exportBenefitReport()} type="button"><Download size={16} /> {exporting ? "Generando..." : "Excel"}</button>
            </div>
            <p className="text-xs text-neutral-500">Filtra la prestacion que quieres revisar y consulta causado, pagado y saldo por empleado.</p>
          </section>

          {benefitReport?.employees.length ? (
            <section className="overflow-hidden rounded-md border border-line bg-white">
              <div className="border-b border-line p-4"><h2 className="font-semibold">{selectedBenefit.label}</h2><p className="text-sm text-neutral-500">{benefitReport.employees.length} empleado(s) | {benefitReport.fecha_inicio} a {benefitReport.fecha_fin}</p></div>
              <div className="overflow-x-auto">
                <table className={`w-full text-left text-sm ${benefitMode === "cesantias" ? "min-w-[1120px]" : "min-w-[780px]"}`}>
                  <thead className="bg-paper text-xs uppercase text-neutral-500">
                    {benefitMode === "cesantias" ? (
                      <>
                        <tr>
                          <th className="px-3 py-2 align-middle" rowSpan={2}>Empleado</th>
                          <th className="px-3 py-2 align-middle" rowSpan={2}>Cedula</th>
                          <th className="border-l border-line px-3 py-2 text-center" colSpan={3}>Cesantias</th>
                          <th className="border-l border-line px-3 py-2 text-center" colSpan={3}>Intereses a las cesantias</th>
                        </tr>
                        <tr>
                          <th className="border-l border-line px-3 py-2 text-right">Causado</th>
                          <th className="px-3 py-2 text-right">Pagado</th>
                          <th className="px-3 py-2 text-right">Saldo</th>
                          <th className="border-l border-line px-3 py-2 text-right">Causado</th>
                          <th className="px-3 py-2 text-right">Pagado</th>
                          <th className="px-3 py-2 text-right">Saldo</th>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <th className="px-3 py-2">Empleado</th>
                        <th className="px-3 py-2">Cedula</th>
                        {benefitMode === "vacaciones" ? <th className="px-3 py-2 text-right">Dias pendientes</th> : null}
                        <th className="px-3 py-2 text-right">Causado</th>
                        <th className="px-3 py-2 text-right">Pagado</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-line">
                    {benefitReport.employees.map((employee) => {
                      const total = benefitSum(employee.concepts, selectedBenefit.codes);
                      const cesantias = employee.concepts.CESANTIAS || { causado: 0, pagado: 0, saldo: 0 };
                      const intereses = employee.concepts.INTERESES_CESANTIAS || { causado: 0, pagado: 0, saldo: 0 };
                      return (
                        <tr className="hover:bg-paper" key={employee.employee_id}>
                          <td className="px-3 py-2 font-medium">{employee.employee_name}</td>
                          <td className="px-3 py-2 text-neutral-600">{employeeDocument(employee)}</td>
                          {benefitMode === "cesantias" ? (
                            <>
                              <td className="border-l border-line px-3 py-2 text-right">{money(cesantias.causado)}</td>
                              <td className="px-3 py-2 text-right">{money(cesantias.pagado)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{money(cesantias.saldo)}</td>
                              <td className="border-l border-line px-3 py-2 text-right">{money(intereses.causado)}</td>
                              <td className="px-3 py-2 text-right">{money(intereses.pagado)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{money(intereses.saldo)}</td>
                            </>
                          ) : (
                            <>
                              {benefitMode === "vacaciones" ? <td className="px-3 py-2 text-right">{Number(total.dias_pendientes || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}</td> : null}
                              <td className="px-3 py-2 text-right">{money(total.causado)}</td>
                              <td className="px-3 py-2 text-right">{money(total.pagado)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{money(total.saldo)}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-paper font-semibold">
                    <tr>
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2"></td>
                      {benefitMode === "cesantias" ? (
                        <>
                          <td className="border-l border-line px-3 py-2 text-right">{money(benefitReport.totals.by_concept.CESANTIAS?.causado)}</td>
                          <td className="px-3 py-2 text-right">{money(benefitReport.totals.by_concept.CESANTIAS?.pagado)}</td>
                          <td className="px-3 py-2 text-right">{money(benefitReport.totals.by_concept.CESANTIAS?.saldo)}</td>
                          <td className="border-l border-line px-3 py-2 text-right">{money(benefitReport.totals.by_concept.INTERESES_CESANTIAS?.causado)}</td>
                          <td className="px-3 py-2 text-right">{money(benefitReport.totals.by_concept.INTERESES_CESANTIAS?.pagado)}</td>
                          <td className="px-3 py-2 text-right">{money(benefitReport.totals.by_concept.INTERESES_CESANTIAS?.saldo)}</td>
                        </>
                      ) : (
                        <>
                          {benefitMode === "vacaciones" ? <td className="px-3 py-2 text-right">{Number(selectedBenefitTotals.dias_pendientes || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}</td> : null}
                          <td className="px-3 py-2 text-right">{money(selectedBenefitTotals.causado)}</td>
                          <td className="px-3 py-2 text-right">{money(selectedBenefitTotals.pagado)}</td>
                          <td className="px-3 py-2 text-right">{money(selectedBenefitTotals.saldo)}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : <section className="rounded-md border border-line bg-white p-4 text-sm text-neutral-500">Selecciona un rango y consulta para ver los saldos de prestaciones.</section>}
        </>
      ) : null}

      {reportView === "nomina" ? (
        <>
          <section className="space-y-4 rounded-md border border-line bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.3fr_auto_auto]">
              <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" max={payrollTo} type="date" value={payrollFrom} onChange={(event) => setPayrollFrom(event.target.value)} /></label>
              <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" min={payrollFrom} type="date" value={payrollTo} onChange={(event) => setPayrollTo(event.target.value)} /></label>
              <label className="text-sm font-semibold">Empleado<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" list="hr-report-employees" placeholder="Cedula, codigo o nombre" value={payrollEmployeeSearch} onChange={(event) => setPayrollEmployeeSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyEmployeeSearch(payrollEmployeeSearch, setPayrollEmployee, setPayrollEmployeeSearch); } }} /></label>
              <button className="inline-flex h-10 items-center gap-2 self-end rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-paper disabled:opacity-60" disabled={payrollLoading} onClick={() => void loadPayrollReport()} type="button"><Filter size={16} /> {payrollLoading ? "Consultando..." : "Consultar"}</button>
              <button className="inline-flex h-10 items-center gap-2 self-end rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={exporting || !payrollReport?.employees.length || !canExport} onClick={() => void exportPayrollReport()} type="button"><Download size={16} /> {exporting ? "Generando..." : "Excel"}</button>
            </div>
            <p className="text-xs text-neutral-500">Suma los conceptos pagados (devengos) y descontados (deducciones) por empleado para la nomina liquidada en el rango.</p>
          </section>

          {payrollReport?.employees.length ? (
            <section className="overflow-hidden rounded-md border border-line bg-white">
              <div className="border-b border-line p-4"><h2 className="font-semibold">Nomina por concepto</h2><p className="text-sm text-neutral-500">{payrollReport.employees.length} empleado(s) | {payrollReport.fecha_inicio} a {payrollReport.fecha_fin}</p></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-paper text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Empleado</th>
                      {payrollReport.concepts.map((concept) => <th className={`px-3 py-2 text-right ${concept.type === "deduccion" ? "text-rose-600" : ""}`} key={concept.code}>{concept.name}</th>)}
                      <th className="px-3 py-2 text-right">Devengado</th>
                      <th className="px-3 py-2 text-right">Deducido</th>
                      <th className="px-3 py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payrollReport.employees.map((employee) => (
                      <tr className="hover:bg-paper" key={employee.employee_id}>
                        <td className="px-3 py-2 font-medium">{employee.employee_name}<p className="text-xs font-normal text-neutral-500">{employee.periods} periodo(s)</p></td>
                        {payrollReport.concepts.map((concept) => <td className={`px-3 py-2 text-right ${concept.type === "deduccion" ? "text-rose-600" : ""}`} key={concept.code}>{employee.concepts[concept.code] ? money(Math.abs(employee.concepts[concept.code])) : "--"}</td>)}
                        <td className="px-3 py-2 text-right">{money(employee.total_devengado)}</td>
                        <td className="px-3 py-2 text-right text-rose-600">{money(employee.total_deducido)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{money(employee.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-paper font-semibold">
                    <tr>
                      <td className="px-3 py-2">Total</td>
                      {payrollReport.concepts.map((concept) => <td className={`px-3 py-2 text-right ${concept.type === "deduccion" ? "text-rose-600" : ""}`} key={concept.code}>{payrollReport.totals.by_concept[concept.code] ? money(Math.abs(payrollReport.totals.by_concept[concept.code])) : "--"}</td>)}
                      <td className="px-3 py-2 text-right">{money(payrollReport.totals.devengado)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{money(payrollReport.totals.deducido)}</td>
                      <td className="px-3 py-2 text-right">{money(payrollReport.totals.neto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : <section className="rounded-md border border-line bg-white p-4 text-sm text-neutral-500">Selecciona un rango y consulta para ver la nomina por concepto.</section>}
        </>
      ) : null}

      {reportView === "operativo" ? (
      <>
      <section className="space-y-4 rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500"><CalendarDays size={15} /> Rangos rapidos</span>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset(1)} type="button">Hoy</button>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset(7)} type="button">Ultimos 7 dias</button>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset(30)} type="button">Ultimos 30 dias</button>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset("month")} type="button">Mes actual</button>
          <span className="ml-auto text-xs text-neutral-500">Rango aplicado: {appliedRange.from} a {appliedRange.to}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.3fr_1fr_auto_auto]">
          <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" max={to} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" min={from} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label className="text-sm font-semibold">Empleado<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" list="hr-report-employees" placeholder="Cedula, codigo o nombre" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyEmployeeSearch(employeeSearch, setEmployeeFilter, setEmployeeSearch); } }} /></label>
          <label className="text-sm font-semibold">Estado de jornada<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={journeyFilter} onChange={(event) => setJourneyFilter(event.target.value)}><option value="all">Todas</option><option value="complete">Completas</option><option value="incomplete">Incompletas</option></select></label>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input checked={onlyOvertime} onChange={(event) => setOnlyOvertime(event.target.checked)} type="checkbox" /> Solo extras</label>
          <button className="inline-flex h-10 items-center gap-2 self-end rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-paper disabled:opacity-60" disabled={loading} onClick={applyDateFilters} type="button"><Filter size={16} /> {loading ? "Consultando..." : "Aplicar rango"}</button>
        </div>
        {activeFilters ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600 hover:bg-paper" onClick={clearSmartFilters} type="button"><RotateCcw size={15} /> Limpiar filtros inteligentes ({activeFilters})</button> : null}
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="font-semibold">Detalle profesional de jornada</h2><p className="text-sm text-neutral-500">{filtered.length} de {rows.length} registro(s) encontrados</p></div>
          <label className="relative w-full sm:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Empleado, documento, ruta, vehiculo, rol o actividad" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500"><tr>{["Fecha", "Empleado", "Rol", "Ruta", "Vehiculo", "Entrada", "Cierre", "Alertas", "Laboradas", "Extra", "Motivo", "Trazabilidad", ""].map((head) => <th className="px-4 py-3" key={head}>{head}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <tr className="hover:bg-paper" key={row.key}>
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3 font-semibold">{row.employeeName}<p className="text-xs font-normal text-neutral-500">{row.document || "Sin documento"}</p></td>
                  <td className="px-4 py-3">{row.role}</td>
                  <td className="px-4 py-3">{row.route}</td>
                  <td className="px-4 py-3">{row.vehicle}</td>
                  <td className="px-4 py-3">{hour(row.entry?.punched_at)}</td>
                  <td className="px-4 py-3">{hour(row.exit?.punched_at)}</td>
                  <td className="px-4 py-3 align-top"><PunchAlertStack alerts={row.punchAlerts} rowKey={row.key} /></td>
                  <td className="px-4 py-3 font-semibold">{minutesLabel(row.workedMinutes)}</td>
                  <td className={`px-4 py-3 font-semibold ${row.overtimeMinutes ? "text-amber-700" : ""}`}>{minutesLabel(row.overtimeMinutes)}</td>
                  <td className="max-w-[220px] truncate px-4 py-3">{row.overtimeReason || "--"}</td>
                  <td className="px-4 py-3">{row.events.length} evento(s)</td>
                  <td className="px-4 py-3"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 font-semibold hover:bg-white" onClick={() => setSelected(row)} type="button"><Eye size={15} /> Ver</button></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={13}>{loading ? "Cargando..." : "Sin registros para el filtro seleccionado."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      </>
      ) : null}

      {mounted && selected ? createPortal((
        <div className="z-[1000]">
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-neutral-950/40 p-0 md:items-center md:p-6">
          <section aria-label="Trazabilidad de jornada" aria-modal="true" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-full flex-col overflow-hidden overscroll-contain rounded-t-overlay border border-line bg-surface text-content-body shadow-overlay md:max-h-[calc(100dvh-3rem)] md:max-w-6xl md:rounded-overlay" ref={detailDialogRef} role="dialog" tabIndex={-1}>
            <header className="border-b border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-apex/10 text-apex"><Clock size={20} /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-content-strong">{selected.employeeName}</h2>
                      <Badge tone={selected.entry && selected.exit ? "success" : "warning"}>{selected.entry && selected.exit ? "Jornada completa" : "Jornada incompleta"}</Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-content-muted">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {selected.date}</span>
                      <span>{selected.route}</span>
                      <span>{selected.vehicle}</span>
                    </div>
                  </div>
                </div>
                <button aria-label="Cerrar trazabilidad" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold hover:bg-surface-muted" onClick={() => setSelected(null)} type="button">Cerrar</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5" tone="neutral"><Clock size={12} /> {selected.events.filter((event) => event.kind === "Marcacion").length} marcaciones</Badge>
                <Badge className="gap-1.5" tone="info"><ClipboardList size={12} /> {selected.events.filter((event) => event.kind === "Actividad").length} actividades</Badge>
                <Badge className="gap-1.5" tone={selected.events.some((event) => event.alert?.tone === "warning") ? "warning" : "success"}><AlertTriangle size={12} /> {selected.events.filter((event) => event.alert).length} alertas</Badge>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid-cols-[320px_1fr] lg:overflow-hidden">
              <section className="border-b border-line p-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-content-muted">Jornada</h3>
                  <span className="text-xs font-semibold text-content-muted">{selected.events.length} evento(s)</span>
                </div>
                <div className="mt-3 space-y-2">
                  <Metric label="Horas laboradas" value={minutesLabel(selected.workedMinutes)} />
                  <Metric label="Horas extra" value={minutesLabel(selected.overtimeMinutes)} />
                  <Metric label="Entrada" value={hour(selected.entry?.punched_at)} />
                  <Metric label="Cierre" value={hour(selected.exit?.punched_at)} />
                </div>
                <p className="mt-3 rounded-md bg-surface-muted p-3 text-xs text-content-muted">Vista consolidada del reporte. Las marcaciones y actividades conservan la misma lectura visual del monitor operativo.</p>
              </section>
              <section className="flex min-h-0 flex-col p-4 lg:overflow-hidden">
              {selected.overtimeMinutes ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Justificacion de extension</p><p className="mt-1">Motivo: {selected.overtimeReason || "--"}</p><p className="mt-1">{selected.overtimeDetail || "Sin detalle registrado."}</p></div> : null}
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-content-strong">Trazabilidad cronologica del equipo</h3>
                    <p className="mt-1 text-sm text-content-muted">Marcaciones y actividades con hora, GPS, tolerancia y evidencia fotografica.</p>
                  </div>
                </div>
                <div className="mt-3 min-h-0 flex-1 overscroll-contain lg:overflow-y-auto">
                <ol className="space-y-3">
                  {selected.events.map((event, index) => {
                    const isMark = event.kind === "Marcacion";
                    return (
                      <li className="relative pl-14" key={`${event.kind}-${event.at}-${index}`}>
                        <span className="absolute left-0 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-apex text-white ring-4 ring-paper">{isMark ? <LogIn size={18} /> : <ClipboardList size={18} />}</span>
                        <article className="rounded-md border border-line bg-surface p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-content-strong">{punctualityTypeNames[event.title] || event.title}</p>
                                <Badge tone={isMark ? "neutral" : "info"}>{isMark ? "Marcacion" : "Actividad"}</Badge>
                                {event.alert ? <Badge tone={event.alert.tone}>{event.alert.label}</Badge> : null}
                              </div>
                              <p className="mt-1 text-sm text-content-muted">{event.userName} · <span className="font-semibold text-content-body">{hour(event.at)}</span></p>
                              {event.detail ? <p className="mt-1.5 text-sm text-content-body">{event.detail}</p> : null}
                              {event.gps ? <p className="mt-1.5 flex items-center gap-1.5 text-xs text-content-muted"><MapPin size={12} /> {event.gps}{event.accuracy != null ? ` · precision +/-${Math.round(Number(event.accuracy || 0))} m` : ""}</p> : null}
                            </div>
                          </div>
                          <div className="mt-3">
                            {event.evidenceCount ? <Badge tone="success">{event.evidenceCount} evidencia(s)</Badge> : <p className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-xs font-semibold text-content-subtle"><ImageOff size={14} /> Sin evidencia fotografica</p>}
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
                </div>
              </div>
              </section>
            </div>
          </section>
        </div>
        </div>
      ), document.body) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
