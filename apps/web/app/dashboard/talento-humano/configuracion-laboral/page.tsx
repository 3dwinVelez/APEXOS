"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Clock3, Pencil, Percent, Plus, RefreshCw, Save, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type LaborParameter = {
  id: number;
  country: string;
  code: string;
  name: string;
  value: string | number;
  unit: string;
  valid_from: string;
  valid_to?: string | null;
  priority: number;
  active: boolean;
  source_note?: string | null;
};
type SurchargeConcept = {
  id: number;
  country: string;
  code: string;
  name: string;
  value_type: string;
  percent?: string | number | null;
  factor?: string | number | null;
  unit: string;
  valid_from: string;
  valid_to?: string | null;
  priority: number;
  active: boolean;
  source_note?: string | null;
};
type LaborDeduction = LaborParameter & { metadata?: { category?: string; basis?: string } };
type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean };
type PayrollConcept = {
  id: number;
  country: string;
  code: string;
  name: string;
  concept_type: string;
  salary_constitutive: boolean;
  affects_ibc: boolean;
  default_operation: string;
  valid_from: string;
  valid_to?: string | null;
  priority: number;
  active: boolean;
  source_note?: string | null;
  metadata?: { legal_group?: string; debit_account_code?: string; credit_account_code?: string };
};
type CalendarDay = { id: number; country: string; date: string; name: string; day_type: string; source?: string; active: boolean };

const parameterPresets = [
  ["JORNADA_NOCTURNA_INICIO", "Inicio jornada nocturna", "hour"],
  ["JORNADA_NOCTURNA_FIN", "Fin jornada nocturna", "hour"],
  ["MAX_HE_DIARIO", "Maximo diario de horas extra", "hour"],
  ["MAX_HE_SEMANAL", "Maximo semanal de horas extra", "hour"],
  ["JORNADA_ORDINARIA_SEMANAL", "Jornada ordinaria semanal", "hour"],
  ["KILOMETRAJE_INUSUAL", "Umbral kilometraje inusual", "km"],
  ["SMMLV", "Salario minimo mensual legal vigente", "currency"],
  ["EXONERACION_APORTES_TOPE_SMMLV", "Tope exoneracion aportes salud, ICBF y SENA", "smmlv"],
  ["EXONERACION_EMPRESA_ELEGIBLE", "Empresa elegible para exoneración ET 114-1 (explícita)", "booleano"],
  ["AUX_TRANSPORTE", "Auxilio de transporte mensual", "currency"],
  ["AUX_TRANSPORTE_TOPE_SMMLV", "Tope auxilio de transporte", "smmlv"]
] as const;

const conceptPresets = [
  ["HORA_ORDINARIA_DIURNA", "Hora ordinaria diurna"],
  ["RECARGO_NOCTURNO", "Recargo nocturno ordinario"],
  ["HED", "Hora extra diurna"],
  ["HEN", "Hora extra nocturna"],
  ["DOM_FEST_DIURNO", "Dominical/festivo diurno"],
  ["DOM_FEST_NOCTURNO", "Dominical/festivo nocturno"],
  ["HEDD", "Hora extra diurna dominical/festiva"],
  ["HEND", "Hora extra nocturna dominical/festiva"],
  ["DESCANSO_OBLIGATORIO", "Descanso obligatorio distinto al domingo"]
] as const;

const deductionPresets = [
  ["DED_SALUD", "Deduccion salud empleado"],
  ["DED_PENSION", "Deduccion pension empleado"],
  ["DED_FONDO_SOLIDARIDAD_PENSIONAL", "Fondo de solidaridad pensional"],
  ["APORTE_SALUD", "Aporte salud empleador"],
  ["APORTE_PENSION", "Aporte pension empleador"]
] as const;

const payrollConceptPresets = [
  ["PRIMA_SERVICIOS", "Prima de servicios", false, false],
  ["CESANTIAS", "Cesantias", false, false],
  ["INTERESES_CESANTIAS", "Intereses a las cesantias", false, false],
  ["VACACIONES", "Vacaciones", false, false],
  ["COMISION", "Comision salarial", true, true],
  ["BONIFICACION_SALARIAL", "Bonificacion salarial", true, true],
  ["BONIFICACION_NO_SALARIAL", "Bonificacion no salarial", false, false],
  ["LICENCIA_REMUNERADA", "Licencia remunerada", true, true],
  ["LICENCIA_NO_REMUNERADA", "Licencia no remunerada", false, false],
  ["DED_FONDO_SOLIDARIDAD_PENSIONAL", "Fondo de solidaridad pensional", false, false]
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyParameter() {
  return { country: "CO", code: "JORNADA_NOCTURNA_INICIO", name: "Inicio jornada nocturna", value: "19", unit: "hour", valid_from: today(), valid_to: "", priority: 100, active: true, source_note: "" };
}

function emptyConcept() {
  return { country: "CO", code: "RECARGO_NOCTURNO", name: "Recargo nocturno ordinario", value_type: "porcentaje_adicional", percent: "35", factor: "1.35", unit: "hour", valid_from: today(), valid_to: "", priority: 100, active: true, source_note: "" };
}

function emptyDeduction() {
  return { country: "CO", code: "DED_SALUD", name: "Deduccion salud empleado", value: "4", unit: "percent", valid_from: today(), valid_to: "", priority: 100, active: true, source_note: "Parametrizable por demanda" };
}

function emptyPayrollConcept() {
  return { country: "CO", code: "COMISION", name: "Comision salarial", concept_type: "devengo", salary_constitutive: true, affects_ibc: true, default_operation: "manual", debit_account_code: "", credit_account_code: "", valid_from: today(), valid_to: "", priority: 100, active: true, source_note: "" };
}

export default function LaborConfigurationPage() {
  const [parameters, setParameters] = useState<LaborParameter[]>([]);
  const [deductions, setDeductions] = useState<LaborDeduction[]>([]);
  const [concepts, setConcepts] = useState<SurchargeConcept[]>([]);
  const [payrollConcepts, setPayrollConcepts] = useState<PayrollConcept[]>([]);
  const [calendars, setCalendars] = useState<CalendarDay[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [country, setCountry] = useState("CO");
  const [activeTab, setActiveTab] = useState<"parameters" | "deductions" | "concepts" | "payrollConcepts" | "calendar">("parameters");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transportAllowancePayment, setTransportAllowancePayment] = useState("ambas");
  const [savingTransportPayment, setSavingTransportPayment] = useState(false);
  const [parameterModal, setParameterModal] = useState<null | { mode: "create" | "edit"; row?: LaborParameter }>(null);
  const [deductionModal, setDeductionModal] = useState<null | { mode: "create" | "edit"; row?: LaborDeduction }>(null);
  const [conceptModal, setConceptModal] = useState<null | { mode: "create" | "edit"; row?: SurchargeConcept }>(null);
  const [payrollConceptModal, setPayrollConceptModal] = useState<null | { mode: "create" | "edit"; row?: PayrollConcept }>(null);
  const [calendarModal, setCalendarModal] = useState<null | { mode: "create" | "edit"; row?: CalendarDay }>(null);
  const [parameterForm, setParameterForm] = useState(emptyParameter());
  const [deductionForm, setDeductionForm] = useState(emptyDeduction());
  const [conceptForm, setConceptForm] = useState(emptyConcept());
  const [payrollConceptForm, setPayrollConceptForm] = useState(emptyPayrollConcept());
  const [calendarForm, setCalendarForm] = useState({ country: "CO", date: today(), name: "Festivo", day_type: "festivo", source: "manual", active: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, accountRows, payrollConfig] = await Promise.all([
        api<{ parameters: LaborParameter[]; deductions?: LaborDeduction[]; concepts: SurchargeConcept[]; payroll_concepts?: PayrollConcept[]; calendars?: CalendarDay[] }>(`/api/v1/talento-humano/configuracion-laboral?all=1&country=${country}`, { cache: "no-store" }),
        api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000", { cache: "no-store" }).catch(() => []),
        api<{ parameters?: { transport_allowance_payment?: string } }>("/api/v1/talento-humano/configuracion-laboral/nomina", { cache: "no-store" }).catch(() => null)
      ]);
      setTransportAllowancePayment(payrollConfig?.parameters?.transport_allowance_payment === "ultima" ? "ultima" : "ambas");
      setParameters(Array.isArray(data.parameters) ? data.parameters : []);
      setDeductions(Array.isArray(data.deductions) ? data.deductions : []);
      setConcepts(Array.isArray(data.concepts) ? data.concepts : []);
      setPayrollConcepts(Array.isArray(data.payroll_concepts) ? data.payroll_concepts : []);
      setCalendars(Array.isArray(data.calendars) ? data.calendars : []);
      setAccounts((accountRows || []).filter((row) => row.active !== false && row.allows_tx !== false));
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => { void load(); }, [load]);

  const activeNightStart = useMemo(() => parameters.find((row) => row.active && row.code === "JORNADA_NOCTURNA_INICIO"), [parameters]);
  const activeNightEnd = useMemo(() => parameters.find((row) => row.active && row.code === "JORNADA_NOCTURNA_FIN"), [parameters]);
  const activeDailyExtra = useMemo(() => parameters.find((row) => row.active && row.code === "MAX_HE_DIARIO"), [parameters]);
  const activeWeeklyExtra = useMemo(() => parameters.find((row) => row.active && row.code === "MAX_HE_SEMANAL"), [parameters]);

  async function saveTransportAllowancePayment(mode: string) {
    const previous = transportAllowancePayment;
    setTransportAllowancePayment(mode);
    setSavingTransportPayment(true);
    try {
      await api("/api/v1/talento-humano/configuracion-laboral/nomina", {
        method: "PUT",
        body: JSON.stringify({ parameters: { transport_allowance_payment: mode } })
      });
    } catch {
      setTransportAllowancePayment(previous);
    } finally {
      setSavingTransportPayment(false);
    }
  }

  function openParameter(row?: LaborParameter) {
    if (row) {
      setParameterModal({ mode: "edit", row });
      setParameterForm({ country: row.country, code: row.code, name: row.name, value: String(row.value ?? ""), unit: row.unit, valid_from: String(row.valid_from).slice(0, 10), valid_to: row.valid_to ? String(row.valid_to).slice(0, 10) : "", priority: row.priority || 100, active: row.active !== false, source_note: row.source_note || "" });
    } else {
      setParameterModal({ mode: "create" });
      setParameterForm({ ...emptyParameter(), country });
    }
  }

  function openConcept(row?: SurchargeConcept) {
    if (row) {
      setConceptModal({ mode: "edit", row });
      setConceptForm({ country: row.country, code: row.code, name: row.name, value_type: row.value_type, percent: String(row.percent ?? ""), factor: String(row.factor ?? ""), unit: row.unit || "hour", valid_from: String(row.valid_from).slice(0, 10), valid_to: row.valid_to ? String(row.valid_to).slice(0, 10) : "", priority: row.priority || 100, active: row.active !== false, source_note: row.source_note || "" });
    } else {
      setConceptModal({ mode: "create" });
      setConceptForm({ ...emptyConcept(), country });
    }
  }

  function openDeduction(row?: LaborDeduction) {
    if (row) {
      setDeductionModal({ mode: "edit", row });
      setDeductionForm({ country: row.country, code: row.code, name: row.name, value: String(row.value ?? ""), unit: row.unit || "percent", valid_from: String(row.valid_from).slice(0, 10), valid_to: row.valid_to ? String(row.valid_to).slice(0, 10) : "", priority: row.priority || 100, active: row.active !== false, source_note: row.source_note || "" });
    } else {
      setDeductionModal({ mode: "create" });
      setDeductionForm({ ...emptyDeduction(), country });
    }
  }

  function openPayrollConcept(row?: PayrollConcept) {
    if (row) {
      setPayrollConceptModal({ mode: "edit", row });
      setPayrollConceptForm({ country: row.country, code: row.code, name: row.name, concept_type: row.concept_type, salary_constitutive: row.salary_constitutive !== false, affects_ibc: row.affects_ibc !== false, default_operation: row.default_operation || "manual", debit_account_code: row.metadata?.debit_account_code || "", credit_account_code: row.metadata?.credit_account_code || "", valid_from: String(row.valid_from).slice(0, 10), valid_to: row.valid_to ? String(row.valid_to).slice(0, 10) : "", priority: row.priority || 100, active: row.active !== false, source_note: row.source_note || "" });
    } else {
      setPayrollConceptModal({ mode: "create" });
      setPayrollConceptForm({ ...emptyPayrollConcept(), country });
    }
  }

  function openCalendar(row?: CalendarDay) {
    if (row) {
      setCalendarModal({ mode: "edit", row });
      setCalendarForm({ country: row.country, date: String(row.date).slice(0, 10), name: row.name, day_type: row.day_type, source: row.source || "manual", active: row.active !== false });
    } else {
      setCalendarModal({ mode: "create" });
      setCalendarForm({ country, date: today(), name: "Festivo", day_type: "festivo", source: "manual", active: true });
    }
  }

  function applyParameterPreset(code: string) {
    const preset = parameterPresets.find(([value]) => value === code);
    if (!preset) return;
    setParameterForm((current) => ({ ...current, code: preset[0], name: preset[1], unit: preset[2] }));
  }

  function applyConceptPreset(code: string) {
    const preset = conceptPresets.find(([value]) => value === code);
    if (!preset) return;
    setConceptForm((current) => ({ ...current, code: preset[0], name: preset[1] }));
  }

  function applyDeductionPreset(code: string) {
    const preset = deductionPresets.find(([value]) => value === code);
    if (!preset) return;
    setDeductionForm((current) => ({ ...current, code: preset[0], name: preset[1], unit: "percent" }));
  }

  function applyPayrollConceptPreset(code: string) {
    const preset = payrollConceptPresets.find(([value]) => value === code);
    if (!preset) return;
    setPayrollConceptForm((current) => ({ ...current, code: preset[0], name: preset[1], salary_constitutive: preset[2], affects_ibc: preset[3] }));
  }

  async function saveParameter() {
    if (!parameterModal) return;
    setSaving(true);
    try {
      const payload = { ...parameterForm, valid_to: parameterForm.valid_to || null, priority: Number(parameterForm.priority), value: Number(parameterForm.value) };
      const saved = parameterModal.mode === "edit" && parameterModal.row
        ? await api<LaborParameter>(`/api/v1/talento-humano/configuracion-laboral/parametros/${parameterModal.row.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<LaborParameter>("/api/v1/talento-humano/configuracion-laboral/parametros", { method: "POST", body: JSON.stringify(payload) });
      setParameters((current) => parameterModal.mode === "edit" ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
      setParameterModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveConcept() {
    if (!conceptModal) return;
    setSaving(true);
    try {
      const payload = { ...conceptForm, valid_to: conceptForm.valid_to || null, priority: Number(conceptForm.priority), percent: conceptForm.percent === "" ? null : Number(conceptForm.percent), factor: conceptForm.factor === "" ? null : Number(conceptForm.factor) };
      const saved = conceptModal.mode === "edit" && conceptModal.row
        ? await api<SurchargeConcept>(`/api/v1/talento-humano/configuracion-laboral/conceptos/${conceptModal.row.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<SurchargeConcept>("/api/v1/talento-humano/configuracion-laboral/conceptos", { method: "POST", body: JSON.stringify(payload) });
      setConcepts((current) => conceptModal.mode === "edit" ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
      setConceptModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveDeduction() {
    if (!deductionModal) return;
    setSaving(true);
    try {
      const payload = { ...deductionForm, valid_to: deductionForm.valid_to || null, priority: Number(deductionForm.priority), value: Number(deductionForm.value), metadata: { category: "deduction", basis: "ibc" } };
      const saved = deductionModal.mode === "edit" && deductionModal.row
        ? await api<LaborDeduction>(`/api/v1/talento-humano/configuracion-laboral/deducciones/${deductionModal.row.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<LaborDeduction>("/api/v1/talento-humano/configuracion-laboral/deducciones", { method: "POST", body: JSON.stringify(payload) });
      setDeductions((current) => deductionModal.mode === "edit" ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
      setDeductionModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function savePayrollConcept() {
    if (!payrollConceptModal) return;
    setSaving(true);
    try {
      const payload = { ...payrollConceptForm, valid_to: payrollConceptForm.valid_to || null, priority: Number(payrollConceptForm.priority), metadata: { debit_account_code: payrollConceptForm.debit_account_code, credit_account_code: payrollConceptForm.credit_account_code } };
      const saved = payrollConceptModal.mode === "edit" && payrollConceptModal.row
        ? await api<PayrollConcept>(`/api/v1/talento-humano/configuracion-laboral/conceptos-nomina/${payrollConceptModal.row.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<PayrollConcept>("/api/v1/talento-humano/configuracion-laboral/conceptos-nomina", { method: "POST", body: JSON.stringify(payload) });
      setPayrollConcepts((current) => payrollConceptModal.mode === "edit" ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
      setPayrollConceptModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveCalendarDay() {
    if (!calendarModal) return;
    setSaving(true);
    try {
      const saved = calendarModal.mode === "edit" && calendarModal.row
        ? await api<CalendarDay>(`/api/v1/talento-humano/configuracion-laboral/calendario/${calendarModal.row.id}`, { method: "PATCH", body: JSON.stringify(calendarForm) })
        : await api<CalendarDay>("/api/v1/talento-humano/configuracion-laboral/calendario", { method: "POST", body: JSON.stringify(calendarForm) });
      setCalendars((current) => calendarModal.mode === "edit" ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
      setCalendarModal(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-2xl font-semibold">Configuración laboral</h1>
          <p className="mt-1 text-sm text-neutral-600">Porcentajes, factores, límites y franja nocturna por país y vigencia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={country} onChange={(event) => setCountry(event.target.value)}>
            <option value="CO">Colombia</option>
          </select>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar</button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Kpi icon={<Clock3 size={18} />} label="Inicio nocturna" value={activeNightStart ? `${activeNightStart.value}:00` : "--"} />
        <Kpi icon={<Clock3 size={18} />} label="Fin nocturna" value={activeNightEnd ? `${activeNightEnd.value}:00` : "--"} />
        <Kpi icon={<Percent size={18} />} label="Extra diaria max." value={activeDailyExtra ? `${activeDailyExtra.value} h` : "--"} />
        <Kpi icon={<Percent size={18} />} label="Extra semanal max." value={activeWeeklyExtra ? `${activeWeeklyExtra.value} h` : "--"} />
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configuracion laboral">
            <TabButton active={activeTab === "parameters"} label="Parámetros laborales" count={parameters.length} onClick={() => setActiveTab("parameters")} />
            <TabButton active={activeTab === "deductions"} label="Deducciones y aportes" count={deductions.length} onClick={() => setActiveTab("deductions")} />
            <TabButton active={activeTab === "concepts"} label="Conceptos de recargo" count={concepts.length} onClick={() => setActiveTab("concepts")} />
            <TabButton active={activeTab === "payrollConcepts"} label="Conceptos de nómina" count={payrollConcepts.length} onClick={() => setActiveTab("payrollConcepts")} />
            <TabButton active={activeTab === "calendar"} label="Calendario laboral" count={calendars.length} onClick={() => setActiveTab("calendar")} />
          </div>
        </div>

        {activeTab === "parameters" ? (
          <TabPanel
            title="Parámetros laborales"
            description="Aquí se define desde qué hora aplica la jornada nocturna y los límites de alerta."
            actionLabel="Nuevo parámetro"
            onAction={() => openParameter()}
          >
            <div className="mb-4 rounded-md border border-line bg-paper p-3">
              <p className="text-sm font-semibold">Auxilio de transporte - forma de pago</p>
              <p className="mt-1 text-xs text-neutral-500">Define si el auxilio de transporte se paga en una sola quincena o prorrateado en ambas. Solo afecta liquidaciones por quincena.</p>
              <label className="mt-2 block text-sm sm:max-w-sm">Forma de pago
                <select
                  className="mt-1 h-10 w-full rounded-md border border-line px-3 disabled:opacity-60"
                  value={transportAllowancePayment}
                  disabled={savingTransportPayment}
                  onChange={(event) => void saveTransportAllowancePayment(event.target.value)}
                >
                  <option value="ambas">Ambas quincenas (prorrateado)</option>
                  <option value="ultima">Solo última quincena</option>
                </select>
              </label>
            </div>
            <DataTable rows={parameters} kind="parameter" onEdit={(row) => openParameter(row as LaborParameter)} />
          </TabPanel>
        ) : null}

        {activeTab === "deductions" ? (
          <TabPanel
            title="Deducciones y aportes"
            description="Salud y pension se parametrizan por codigo y vigencia; no quedan quemadas en el codigo."
            actionLabel="Nueva deducción"
            onAction={() => openDeduction()}
          >
            <p className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La exoneración ET 114-1 debe quedar explícita y sustentada. Configura el umbral vigente y la elegibilidad por razón social/trabajador cuando el backend la habilite; nunca se presume por estar bajo el tope.</p>
            <DataTable rows={deductions} kind="parameter" onEdit={(row) => openDeduction(row as LaborDeduction)} />
          </TabPanel>
        ) : null}

        {activeTab === "concepts" ? (
          <TabPanel
            title="Conceptos de recargo"
            description="Diferencia porcentaje adicional, factor total e informativo para evitar ambiguedades."
            actionLabel="Nuevo concepto"
            onAction={() => openConcept()}
          >
            <DataTable rows={concepts} kind="concept" onEdit={(row) => openConcept(row as SurchargeConcept)} />
          </TabPanel>
        ) : null}

        {activeTab === "payrollConcepts" ? (
          <TabPanel
            title="Conceptos de nómina"
            description="Define si comisiones, bonificaciones, licencias y vacaciones constituyen salario y si afectan IBC."
            actionLabel="Nuevo concepto"
            onAction={() => openPayrollConcept()}
          >
            <PayrollConceptTable rows={payrollConcepts} onEdit={openPayrollConcept} />
          </TabPanel>
        ) : null}

        {activeTab === "calendar" ? (
          <TabPanel
            title="Calendario laboral"
            description="Registra festivos, dominicales, no laborales y dias especiales por vigencia."
            actionLabel="Nuevo dia"
            onAction={() => openCalendar()}
          >
            <CalendarTable rows={calendars} onEdit={openCalendar} />
          </TabPanel>
        ) : null}
      </section>

      {parameterModal ? (
        <ConfigModal title={parameterModal.mode === "edit" ? "Editar parámetro" : "Nuevo parámetro"} onClose={() => setParameterModal(null)} onSave={() => void saveParameter()} saving={saving}>
          <Field label="Código"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={parameterForm.code} onChange={(event) => applyParameterPreset(event.target.value)}>{parameterPresets.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}</select></Field>
          <Field label="Nombre"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={parameterForm.name} onChange={(event) => setParameterForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Valor"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="number" step="0.01" value={parameterForm.value} onChange={(event) => setParameterForm((current) => ({ ...current, value: event.target.value }))} /></Field>
          <Field label="Unidad"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={parameterForm.unit} onChange={(event) => setParameterForm((current) => ({ ...current, unit: event.target.value }))} /></Field>
          <CommonFields active={parameterForm.active} priority={parameterForm.priority} sourceNote={parameterForm.source_note} validFrom={parameterForm.valid_from} validTo={parameterForm.valid_to} onChange={(patch) => setParameterForm((current) => ({ ...current, ...patch }))} />
        </ConfigModal>
      ) : null}

      {conceptModal ? (
        <ConfigModal title={conceptModal.mode === "edit" ? "Editar concepto" : "Nuevo concepto"} onClose={() => setConceptModal(null)} onSave={() => void saveConcept()} saving={saving}>
          <Field label="Código"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={conceptForm.code} onChange={(event) => applyConceptPreset(event.target.value)}>{conceptPresets.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}</select></Field>
          <Field label="Nombre"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={conceptForm.name} onChange={(event) => setConceptForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Tipo de valor"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={conceptForm.value_type} onChange={(event) => setConceptForm((current) => ({ ...current, value_type: event.target.value }))}><option value="porcentaje_adicional">Porcentaje adicional</option><option value="factor_total">Factor total</option><option value="informativo">Informativo/no liquidable</option></select></Field>
          <Field label="Porcentaje adicional"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="number" step="0.01" value={conceptForm.percent} onChange={(event) => setConceptForm((current) => ({ ...current, percent: event.target.value }))} /></Field>
          <Field label="Factor total"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="number" step="0.0001" value={conceptForm.factor} onChange={(event) => setConceptForm((current) => ({ ...current, factor: event.target.value }))} /></Field>
          <Field label="Unidad"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={conceptForm.unit} onChange={(event) => setConceptForm((current) => ({ ...current, unit: event.target.value }))} /></Field>
          <CommonFields active={conceptForm.active} priority={conceptForm.priority} sourceNote={conceptForm.source_note} validFrom={conceptForm.valid_from} validTo={conceptForm.valid_to} onChange={(patch) => setConceptForm((current) => ({ ...current, ...patch }))} />
        </ConfigModal>
      ) : null}

      {deductionModal ? (
        <ConfigModal title={deductionModal.mode === "edit" ? "Editar deducción" : "Nueva deducción"} onClose={() => setDeductionModal(null)} onSave={() => void saveDeduction()} saving={saving}>
          <Field label="Código"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={deductionForm.code} onChange={(event) => applyDeductionPreset(event.target.value)}>{deductionPresets.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}</select></Field>
          <Field label="Nombre"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={deductionForm.name} onChange={(event) => setDeductionForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Porcentaje"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="number" step="0.01" value={deductionForm.value} onChange={(event) => setDeductionForm((current) => ({ ...current, value: event.target.value }))} /></Field>
          <Field label="Unidad"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={deductionForm.unit} onChange={(event) => setDeductionForm((current) => ({ ...current, unit: event.target.value }))} /></Field>
          <CommonFields active={deductionForm.active} priority={deductionForm.priority} sourceNote={deductionForm.source_note} validFrom={deductionForm.valid_from} validTo={deductionForm.valid_to} onChange={(patch) => setDeductionForm((current) => ({ ...current, ...patch }))} />
        </ConfigModal>
      ) : null}

      {payrollConceptModal ? (
        <ConfigModal title={payrollConceptModal.mode === "edit" ? "Editar concepto de nómina" : "Nuevo concepto de nómina"} onClose={() => setPayrollConceptModal(null)} onSave={() => void savePayrollConcept()} saving={saving}>
          <Field label="Código"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={payrollConceptForm.code} onChange={(event) => applyPayrollConceptPreset(event.target.value)}>{payrollConceptPresets.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}</select></Field>
          <Field label="Nombre"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={payrollConceptForm.name} onChange={(event) => setPayrollConceptForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Tipo"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={payrollConceptForm.concept_type} onChange={(event) => setPayrollConceptForm((current) => ({ ...current, concept_type: event.target.value }))}><option value="devengo">Devengo</option><option value="deduccion">Deducción</option><option value="aporte_empleador">Aporte empleador</option><option value="informativo">Informativo</option></select></Field>
          <Field label="Operación"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={payrollConceptForm.default_operation} onChange={(event) => setPayrollConceptForm((current) => ({ ...current, default_operation: event.target.value }))}><option value="manual">Manual</option><option value="automatico">Automático</option></select></Field>
          <Field label="Cuenta debito"><AccountSelect accounts={accounts} value={payrollConceptForm.debit_account_code} onChange={(value) => setPayrollConceptForm((current) => ({ ...current, debit_account_code: value }))} /></Field>
          <Field label="Cuenta credito"><AccountSelect accounts={accounts} value={payrollConceptForm.credit_account_code} onChange={(value) => setPayrollConceptForm((current) => ({ ...current, credit_account_code: value }))} /></Field>
          <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={payrollConceptForm.salary_constitutive} onChange={(event) => setPayrollConceptForm((current) => ({ ...current, salary_constitutive: event.target.checked }))} type="checkbox" /> Constituye salario</label>
          <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={payrollConceptForm.affects_ibc} onChange={(event) => setPayrollConceptForm((current) => ({ ...current, affects_ibc: event.target.checked }))} type="checkbox" /> Afecta IBC</label>
          <CommonFields active={payrollConceptForm.active} priority={payrollConceptForm.priority} sourceNote={payrollConceptForm.source_note} validFrom={payrollConceptForm.valid_from} validTo={payrollConceptForm.valid_to} onChange={(patch) => setPayrollConceptForm((current) => ({ ...current, ...patch }))} />
        </ConfigModal>
      ) : null}

      {calendarModal ? (
        <ConfigModal title={calendarModal.mode === "edit" ? "Editar dia calendario" : "Nuevo dia calendario"} onClose={() => setCalendarModal(null)} onSave={() => void saveCalendarDay()} saving={saving}>
          <Field label="Fecha"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={calendarForm.date} onChange={(event) => setCalendarForm((current) => ({ ...current, date: event.target.value }))} /></Field>
          <Field label="Nombre"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={calendarForm.name} onChange={(event) => setCalendarForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Tipo"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={calendarForm.day_type} onChange={(event) => setCalendarForm((current) => ({ ...current, day_type: event.target.value }))}><option value="festivo">Festivo</option><option value="dominical">Dominical</option><option value="no_laboral">No laboral</option><option value="especial">Especial</option><option value="ordinario">Ordinario</option></select></Field>
          <Field label="Fuente"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={calendarForm.source} onChange={(event) => setCalendarForm((current) => ({ ...current, source: event.target.value }))} /></Field>
          <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={calendarForm.active} onChange={(event) => setCalendarForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /> Activo</label>
        </ConfigModal>
      ) : null}
    </div>
  );
}

function PayrollConceptTable({ rows, onEdit }: { rows: PayrollConcept[]; onEdit: (row: PayrollConcept) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Código</th><th className="px-3 py-3">Nombre</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Legal</th><th className="px-3 py-3">Vigencia</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr className="border-t border-line" key={`payroll-${row.id}`}><td className="px-3 py-3 font-semibold">{row.code}</td><td className="px-3 py-3">{row.name}</td><td className="px-3 py-3">{row.concept_type}</td><td className="px-3 py-3">{row.salary_constitutive ? "Salarial" : "No salarial"} · {row.affects_ibc ? "Afecta IBC" : "No IBC"}</td><td className="px-3 py-3">{String(row.valid_from).slice(0, 10)} - {row.valid_to ? String(row.valid_to).slice(0, 10) : "sin fin"}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{row.active ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-3 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={() => onEdit(row)} type="button"><Pencil size={14} /> Editar</button></td></tr>)}
          {!rows.length ? <tr><td className="px-3 py-8 text-center text-neutral-500" colSpan={7}>Sin registros.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function CalendarTable({ rows, onEdit }: { rows: CalendarDay[]; onEdit: (row: CalendarDay) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Nombre</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Fuente</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr className="border-t border-line" key={`calendar-${row.id}`}><td className="px-3 py-3 font-semibold">{String(row.date).slice(0, 10)}</td><td className="px-3 py-3">{row.name}</td><td className="px-3 py-3">{row.day_type}</td><td className="px-3 py-3">{row.source || "manual"}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{row.active ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-3 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={() => onEdit(row)} type="button"><Pencil size={14} /> Editar</button></td></tr>)}
          {!rows.length ? <tr><td className="px-3 py-8 text-center text-neutral-500" colSpan={6}>Sin registros.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function DataTable({ rows, kind, onEdit }: { rows: Array<LaborParameter | SurchargeConcept>; kind: "parameter" | "concept"; onEdit: (row: LaborParameter | SurchargeConcept) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Código</th><th className="px-3 py-3">Nombre</th><th className="px-3 py-3">Valor</th><th className="px-3 py-3">Vigencia</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Fuente</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const concept = row as SurchargeConcept;
            const value = kind === "concept" ? `${concept.value_type}${concept.percent != null ? ` · ${concept.percent}%` : ""}${concept.factor != null ? ` · factor ${concept.factor}` : ""}` : `${(row as LaborParameter).value} ${(row as LaborParameter).unit}`;
            return <tr className="border-t border-line" key={`${kind}-${row.id}`}><td className="px-3 py-3 font-semibold">{row.code}</td><td className="px-3 py-3">{row.name}</td><td className="px-3 py-3">{value}</td><td className="px-3 py-3">{String(row.valid_from).slice(0, 10)} - {row.valid_to ? String(row.valid_to).slice(0, 10) : "sin fin"}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{row.active ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-3">{row.source_note || "--"}</td><td className="px-3 py-3 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={() => onEdit(row)} type="button"><Pencil size={14} /> Editar</button></td></tr>;
          })}
          {!rows.length ? <tr><td className="px-3 py-8 text-center text-neutral-500" colSpan={7}>Sin registros.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-700 hover:bg-paper"}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
      <span className={`rounded px-1.5 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-paper text-neutral-600"}`}>{count}</span>
    </button>
  );
}

function TabPanel({ title, description, actionLabel, onAction, children }: { title: string; description: string; actionLabel: string; onAction: () => void; children: ReactNode }) {
  return (
    <div role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={onAction} type="button"><Plus size={16} /> {actionLabel}</button>
      </div>
      {children}
    </div>
  );
}

function CommonFields({ active, priority, sourceNote, validFrom, validTo, onChange }: { active: boolean; priority: number; sourceNote: string; validFrom: string; validTo: string; onChange: (patch: Record<string, string | number | boolean>) => void }) {
  return (
    <>
      <Field label="Vigencia desde"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={validFrom} onChange={(event) => onChange({ valid_from: event.target.value })} /></Field>
      <Field label="Vigencia hasta"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={validTo} onChange={(event) => onChange({ valid_to: event.target.value })} /></Field>
      <Field label="Prioridad"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="number" value={priority} onChange={(event) => onChange({ priority: Number(event.target.value) })} /></Field>
      <Field label="Fuente / observación"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={sourceNote} onChange={(event) => onChange({ source_note: event.target.value })} /></Field>
      <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={active} onChange={(event) => onChange({ active: event.target.checked })} type="checkbox" /> Configuración activa</label>
    </>
  );
}

function ConfigModal({ title, children, onClose, onSave, saving }: { title: string; children: ReactNode; onClose: () => void; onSave: () => void; saving: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-neutral-950/45 p-2 pt-3 sm:p-4 sm:pt-6" role="dialog" aria-modal="true">
      <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-line bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4"><div><p className="text-xs font-semibold uppercase text-apex">Configuración laboral</p><h2 className="mt-1 text-xl font-semibold">{title}</h2></div><button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-neutral-600 hover:bg-paper" onClick={onClose} type="button" aria-label="Cerrar"><X size={17} /></button></header>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">{children}</div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-white p-4"><button className="h-10 rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={onClose} type="button">Cancelar</button><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={onSave} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar"}</button></footer>
      </section>
    </div>,
    document.body
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <article className="rounded-md border border-line bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-apex">{icon}</span><span className="text-xl font-semibold">{value}</span></div><p className="mt-2 text-xs font-semibold uppercase text-neutral-500">{label}</p></article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>{children}</label>;
}

function AccountSelect({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (value: string) => void }) {
  return (
    <select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-mono" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Sin cuenta</option>
      {accounts.map((account) => <option key={account.id} value={account.code}>{account.code} - {account.name}</option>)}
    </select>
  );
}
