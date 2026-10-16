"use client";

import { api } from "@/lib/api";
import { activeOrganizationRows, branchesForSociety, costCentersForBranch, EMPTY_PAYROLL_ORGANIZATION, organizationAssignmentChanged, organizationSelection, type PayrollOrganizationTree } from "@/lib/payrollOrganization";
import { ArrowLeft, Eye, Link2, Pencil, Plus, RefreshCw, Save, Search, UserRoundCheck, UserRoundX, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type MasterItem = { code: string; name: string; active?: boolean };
type Employee = {
  id: number | string;
  code?: string;
  position?: string;
  department?: string;
  salary_base?: number;
  hire_date?: string;
  end_date?: string | null;
  contract_type?: string;
  active?: boolean;
  metadata?: {
    name?: string;
    document?: string;
    document_type?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    second_last_name?: string;
    cost_center?: string;
    branch_code?: string;
    society_code?: string;
    cost_center_code?: string;
    regime?: string;
    regimen?: string;
    sector?: string;
    accounting?: { society_code?: string; branch_code?: string; cost_center_code?: string; cost_center?: string };
    weekly_hours?: number;
    currency?: string;
    social_security?: {
      arl_risk_class?: number | string;
      exoneration_eligible?: boolean;
      exoneration_support?: string;
      regime?: string;
      sector?: string;
      sln_pension_employer_percent?: number | string;
    };
  };
  user?: { id?: number | string; name?: string; email?: string; active?: boolean };
};
type LaborEntity = { id: number; entity_type: string; legal_name: string; nit: string; active: boolean };
type Affiliation = { id: number; entity_type: string; entity_id: number; valid_from: string; valid_to?: string | null; status: string; entity_legal_name?: string; entity_nit?: string };
type SalaryHistory = { id: number; monthly_salary: string | number; currency: string; valid_from: string; valid_to?: string | null; reason: string };
type EmployeeContract = { id: number; contract_type: string; status: string; reason: string; valid_from: string; valid_to?: string | null; salary_base?: string | number; cost_center?: string; termination_reason?: string | null };
type EmployeeForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  second_last_name: string;
  name: string;
  document_type: string;
  document: string;
  code: string;
  position: string;
  cost_center: string;
  society_code: string;
  branch_code: string;
  weekly_hours: string;
  hire_date: string;
  contract_type: string;
  end_date: string;
  salary_base: string;
  arl_risk_class: string;
  exoneration_eligible: boolean;
  exoneration_support: string;
  regime: string;
  sector: string;
  sln_pension_employer_percent: string;
  eps_id: string;
  pension_fund_id: string;
  severance_fund_id: string;
  arl_id: string;
  compensation_fund_id: string;
};

const fallbackDocumentTypes: MasterItem[] = [
  { code: "CC", name: "Cedula de ciudadania" },
  { code: "CE", name: "Cedula de extranjeria" },
  { code: "NIT", name: "NIT" },
  { code: "PAS", name: "Pasaporte" }
];
const fallbackCostCenters: MasterItem[] = [
  { code: "CC-OPER", name: "Operacion" },
  { code: "CC-TRAN", name: "Transporte" },
  { code: "CC-ADMIN", name: "Administracion" }
];
const contractTypes = [
  { code: "obra_labor", name: "Obra labor" },
  { code: "indefinite", name: "Indefinido" },
  { code: "fixed", name: "Termino fijo" }
];
const entityTypes = [
  ["EPS", "EPS"],
  ["PENSION", "Fondo de pensiones"],
  ["FONDO_CESANTIAS", "Fondo de cesantias"],
  ["ARL", "ARL"],
  ["CAJA_COMPENSACION", "Caja de compensacion"],
  ["ICBF", "ICBF"],
  ["SENA", "SENA"]
] as const;
const initialAffiliationTypes = [
  ["EPS", "EPS", "eps_id"],
  ["PENSION", "Fondo de pensiones", "pension_fund_id"],
  ["FONDO_CESANTIAS", "Fondo de cesantias", "severance_fund_id"],
  ["ARL", "ARL", "arl_id"],
  ["CAJA_COMPENSACION", "Caja de compensacion", "compensation_fund_id"]
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function fullNameFromParts(form: EmployeeForm) {
  return [form.first_name, form.middle_name, form.last_name, form.second_last_name].map((part) => part.trim()).filter(Boolean).join(" ");
}

function employeeName(employee: Employee) {
  return employee.metadata?.name || employee.user?.name || employee.code || `Empleado ${employee.id}`;
}

function employeeCodeHelp() {
  return "El codigo interno se genera automaticamente desde el documento. El documento no se puede repetir.";
}

function emptyAffiliationForm() {
  return { entity_type: "EPS", entity_id: "", valid_from: today(), valid_to: "", status: "activa" };
}

function userState(employee: Employee) {
  if (!employee.user) return { label: "Sin usuario", className: "bg-amber-50 text-amber-800", icon: <UserRoundX size={15} /> };
  if (employee.user.active === false) return { label: "Usuario inactivo", className: "bg-rose-50 text-rose-700", icon: <UserRoundX size={15} /> };
  return { label: "Usuario asociado", className: "bg-emerald-50 text-emerald-700", icon: <UserRoundCheck size={15} /> };
}

export default function EmployeesMasterPage() {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<Employee[]>([]);
  const [entities, setEntities] = useState<LaborEntity[]>([]);
  const [documentTypes, setDocumentTypes] = useState<MasterItem[]>(fallbackDocumentTypes);
  const [costCenters, setCostCenters] = useState<MasterItem[]>(fallbackCostCenters);
  const [organization, setOrganization] = useState<PayrollOrganizationTree>(EMPTY_PAYROLL_ORGANIZATION);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");
  const [saving, setSaving] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([]);
  const [contractHistory, setContractHistory] = useState<EmployeeContract[]>([]);
  const [affiliationForm, setAffiliationForm] = useState(emptyAffiliationForm());
  const [salaryForm, setSalaryForm] = useState({ monthly_salary: "", valid_from: today(), reason: "Cambio salarial" });
  const [contractForm, setContractForm] = useState({ valid_from: today(), new_hire_date: today(), contract_type: "indefinite", end_date: "", salary_base: "", cost_center: "", reason: "Otrosi contractual", notes: "" });
  const [form, setForm] = useState<EmployeeForm>({
    first_name: "",
    middle_name: "",
    last_name: "",
    second_last_name: "",
    name: "",
    document_type: "CC",
    document: "",
    code: "",
    position: "",
    cost_center: "",
    society_code: "",
    branch_code: "",
    weekly_hours: "",
    hire_date: "",
    contract_type: "indefinite",
    end_date: "",
    salary_base: "",
    arl_risk_class: "1",
    exoneration_eligible: false,
    exoneration_support: "",
    regime: "ordinary",
    sector: "private",
    sln_pension_employer_percent: "12",
    eps_id: "",
    pension_fund_id: "",
    severance_fund_id: "",
    arl_id: "",
    compensation_fund_id: ""
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  function baseForm(): EmployeeForm {
    return {
      first_name: "",
      middle_name: "",
      last_name: "",
      second_last_name: "",
      name: "",
      document_type: documentTypes[0]?.code || "CC",
      document: "",
      code: "",
      position: "",
      cost_center: "",
      society_code: "",
      branch_code: "",
      weekly_hours: "",
      hire_date: today(),
      contract_type: "indefinite",
      end_date: "",
      salary_base: "",
      arl_risk_class: "1",
      exoneration_eligible: false,
      exoneration_support: "",
      regime: "ordinary",
      sector: "private",
      sln_pension_employer_percent: "12",
      eps_id: "",
      pension_fund_id: "",
      severance_fund_id: "",
      arl_id: "",
      compensation_fund_id: ""
    };
  }

  async function load() {
    setLoading(true);
    try {
      const [employeeData, entityData, masterData] = await Promise.all([
        api<Employee[]>("/api/v1/talento-humano/empleados?active=true", { cache: "no-store" }),
        api<LaborEntity[]>("/api/v1/talento-humano/entidades?limit=500", { cache: "no-store" }).catch(() => []),
        api<Record<string, MasterItem[]>>("/api/v1/admin/user-master-data", { cache: "no-store" }).catch(() => null)
      ]);
      setRows(Array.isArray(employeeData) ? employeeData : []);
      setEntities(Array.isArray(entityData) ? entityData : []);
      if (masterData?.document_types?.length) setDocumentTypes(masterData.document_types.filter((item) => item.active !== false));
      if (masterData?.cost_centers?.length) setCostCenters(masterData.cost_centers.filter((item) => item.active !== false));
      try {
        setOrganizationLoading(true);
        setOrganizationError("");
        setOrganization(await api<PayrollOrganizationTree>("/api/v1/talento-humano/empleados/organization-options", { cache: "no-store" }));
      } catch {
        setOrganization(EMPTY_PAYROLL_ORGANIZATION);
        setOrganizationError("No se pudo cargar el maestro contable. Configura sociedades, sucursales y centros antes de crear empleados.");
      } finally {
        setOrganizationLoading(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadAffiliations(employeeId: string | number) {
    const data = await api<Affiliation[]>(`/api/v1/talento-humano/empleados/${employeeId}/afiliaciones`, { cache: "no-store" }).catch(() => []);
    setAffiliations(Array.isArray(data) ? data : []);
  }

  async function loadSalaryHistory(employeeId: string | number) {
    const data = await api<SalaryHistory[]>(`/api/v1/talento-humano/empleados/${employeeId}/salarios`, { cache: "no-store" }).catch(() => []);
    setSalaryHistory(Array.isArray(data) ? data : []);
  }

  async function loadContractHistory(employeeId: string | number) {
    const data = await api<EmployeeContract[]>(`/api/v1/talento-humano/empleados/${employeeId}/contratos`, { cache: "no-store" }).catch(() => []);
    setContractHistory(Array.isArray(data) ? data : []);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((employee) => [
      employeeName(employee),
      employee.code,
      employee.metadata?.document,
      employee.position,
      employee.metadata?.cost_center,
      employee.user?.email
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [query, rows]);

  const availableEntities = useMemo(() => entities.filter((entity) => entity.active && entity.entity_type === affiliationForm.entity_type), [affiliationForm.entity_type, entities]);

  function openCreateEmployee() {
    setSelected(null);
    setMode("create");
    setModalMessage("");
    setAffiliations([]);
    setSalaryHistory([]);
    setContractHistory([]);
    setAffiliationForm(emptyAffiliationForm());
    setSalaryForm({ monthly_salary: "", valid_from: today(), reason: "Cambio salarial" });
    setContractForm({ valid_from: today(), new_hire_date: today(), contract_type: "indefinite", end_date: "", salary_base: "", cost_center: "", reason: "Otrosi contractual", notes: "" });
    setForm(baseForm());
  }

  function openEmployee(employee: Employee, nextMode: "view" | "edit") {
    const first = employee.metadata?.first_name || "";
    const middle = employee.metadata?.middle_name || "";
    const last = employee.metadata?.last_name || "";
    const secondLast = employee.metadata?.second_last_name || "";
    const builtName = [first, middle, last, secondLast].filter(Boolean).join(" ");
    const accounting = employee.metadata?.accounting || {};
    setSelected(employee);
    setMode(nextMode);
    setModalMessage("");
    setAffiliationForm(emptyAffiliationForm());
    setSalaryForm({ monthly_salary: employee.salary_base ? String(employee.salary_base) : "", valid_from: today(), reason: "Cambio salarial" });
    setContractForm({ valid_from: today(), new_hire_date: today(), contract_type: employee.contract_type || "indefinite", end_date: displayDate(employee.end_date), salary_base: employee.salary_base ? String(employee.salary_base) : "", cost_center: employee.metadata?.cost_center || "", reason: employee.active === false ? "Recontratacion" : "Otrosi contractual", notes: "" });
    setForm({
      first_name: first,
      middle_name: middle,
      last_name: last,
      second_last_name: secondLast,
      name: builtName || employeeName(employee),
      document_type: employee.metadata?.document_type || documentTypes[0]?.code || "CC",
      document: employee.metadata?.document || "",
      code: employee.code || "",
      position: employee.position || "",
      cost_center: accounting.cost_center_code || employee.metadata?.cost_center_code || employee.metadata?.cost_center || "",
      society_code: accounting.society_code || employee.metadata?.society_code || "",
      branch_code: accounting.branch_code || employee.metadata?.branch_code || "",
      weekly_hours: employee.metadata?.weekly_hours ? String(employee.metadata.weekly_hours) : "",
      hire_date: displayDate(employee.hire_date),
      contract_type: employee.contract_type || "indefinite",
      end_date: displayDate(employee.end_date),
      salary_base: employee.salary_base ? String(employee.salary_base) : "",
      arl_risk_class: String(employee.metadata?.social_security?.arl_risk_class || "1"),
      exoneration_eligible: employee.metadata?.social_security?.exoneration_eligible === true,
      exoneration_support: employee.metadata?.social_security?.exoneration_support || "",
      regime: employee.metadata?.regime || employee.metadata?.regimen || "ordinary",
      sector: employee.metadata?.sector || "private",
      sln_pension_employer_percent: String(employee.metadata?.social_security?.sln_pension_employer_percent || "12"),
      eps_id: "",
      pension_fund_id: "",
      severance_fund_id: "",
      arl_id: "",
      compensation_fund_id: ""
    });
    void loadAffiliations(employee.id);
    void loadSalaryHistory(employee.id);
    void loadContractHistory(employee.id);
  }

  function updateNamePart(key: keyof Pick<EmployeeForm, "first_name" | "middle_name" | "last_name" | "second_last_name">, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      return { ...next, name: fullNameFromParts(next) };
    });
  }

  async function saveEmployee() {
    const requiresEndDate = form.contract_type === "fixed";
    if (requiresEndDate && !form.end_date) {
      window.alert("La fecha de vencimiento del contrato es obligatoria para termino fijo.");
      return;
    }
    if (!form.name.trim()) {
      window.alert("Completa nombres y apellidos para generar el nombre completo.");
      return;
    }
    if (!form.document.trim()) {
      window.alert("El numero de documento es obligatorio y no se puede repetir.");
      return;
    }
    if (form.exoneration_eligible && !form.exoneration_support.trim()) {
      window.alert("La elegibilidad ET 114-1 requiere soporte explícito.");
      return;
    }
    const selectedAccounting = selected?.metadata?.accounting || {
      society_code: selected?.metadata?.society_code,
      branch_code: selected?.metadata?.branch_code,
      cost_center_code: selected?.metadata?.cost_center_code || selected?.metadata?.cost_center
    };
    const assignmentChanged = mode === "create" || !selected || organizationAssignmentChanged(selectedAccounting, {
      society_code: form.society_code,
      branch_code: form.branch_code,
      cost_center_code: form.cost_center
    });
    const resolvedOrganization = organizationSelection(organization, {
      society_code: form.society_code,
      branch_code: assignmentChanged ? form.branch_code : "",
      cost_center_code: assignmentChanged ? form.cost_center : ""
    }, { requireAssignment: mode === "create" || assignmentChanged });
    if (resolvedOrganization && "error" in resolvedOrganization) {
      window.alert(resolvedOrganization.error);
      return;
    }
    if (mode === "create" && !resolvedOrganization) {
      window.alert("Selecciona la sucursal y el centro de costo contable del empleado.");
      return;
    }
    setSaving(true);
    setModalMessage("");
    try {
      const payload = {
        first_name: form.first_name,
        middle_name: form.middle_name,
        last_name: form.last_name,
        second_last_name: form.second_last_name,
        name: form.name,
        document_type: form.document_type,
        document: form.document,
        position: form.position,
        ...(assignmentChanged ? {
          cost_center: form.cost_center,
          ...(resolvedOrganization && !("error" in resolvedOrganization) ? resolvedOrganization : {})
        } : {}),
        weekly_hours: form.weekly_hours ? Number(form.weekly_hours) : null,
        hire_date: form.hire_date || undefined,
        contract_type: form.contract_type,
        end_date: form.contract_type === "fixed" ? (form.end_date || null) : null,
        salary_base: form.salary_base ? Number(form.salary_base) : 0,
        arl_risk_class: Number(form.arl_risk_class || 1),
        exoneration_eligible: form.exoneration_eligible,
        exoneration_support: form.exoneration_support || undefined,
        regime: form.regime,
        sector: form.sector,
        sln_pension_employer_percent: Number(form.sln_pension_employer_percent || 12),
        salary_type: "monthly"
      };
      const isCreate = !selected;
      const saved = selected
        ? await api<Employee>(`/api/v1/talento-humano/empleados/${selected.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<Employee>("/api/v1/talento-humano/empleados", { method: "POST", body: JSON.stringify(payload) });
      if (isCreate) {
        const validFrom = form.hire_date || today();
        const initialAffiliations = initialAffiliationTypes
          .map(([entity_type, , field]) => ({ entity_type, entity_id: form[field] }))
          .filter((item) => item.entity_id);
        for (const affiliation of initialAffiliations) {
          await api<Affiliation>(`/api/v1/talento-humano/empleados/${saved.id}/afiliaciones`, {
            method: "POST",
            body: JSON.stringify({ entity_type: affiliation.entity_type, entity_id: Number(affiliation.entity_id), valid_from: validFrom, valid_to: null, status: "activa" })
          });
        }
      }
      setRows((current) => selected ? current.map((employee) => String(employee.id) === String(saved.id) ? saved : employee) : [saved, ...current]);
      setSelected(saved);
      setMode("view");
      const settled = await Promise.allSettled([loadAffiliations(saved.id), loadSalaryHistory(saved.id), loadContractHistory(saved.id)]);
      const failed = settled.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      setModalMessage(failed ? `Empleado guardado, pero no se pudo refrescar toda la informacion secundaria: ${failed.reason instanceof Error ? failed.reason.message : "error de carga"}` : "Empleado guardado correctamente.");
    } finally {
      setSaving(false);
    }
  }

  async function saveContractAction(kind: "otrosi" | "rehire") {
    if (!selected || mode !== "edit") return;
    const isRehire = kind === "rehire";
    const effectiveDate = isRehire ? contractForm.new_hire_date : contractForm.valid_from;
    if (!effectiveDate || !contractForm.salary_base) {
      window.alert("Completa fecha de vigencia y salario para registrar el movimiento contractual.");
      return;
    }
    if (contractForm.contract_type === "fixed" && !contractForm.end_date) {
      window.alert("La fecha de vencimiento del contrato es obligatoria para termino fijo.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(isRehire ? { new_hire_date: effectiveDate } : { valid_from: effectiveDate }),
        contract_type: contractForm.contract_type,
        end_date: contractForm.contract_type === "fixed" ? (contractForm.end_date || null) : null,
        salary_base: Number(contractForm.salary_base),
        cost_center: contractForm.cost_center,
        cost_center_code: contractForm.cost_center,
        reason: contractForm.reason,
        notes: contractForm.notes
      };
      const endpoint = isRehire
        ? `/api/v1/talento-humano/empleados/${selected.id}/recontratar`
        : `/api/v1/talento-humano/empleados/${selected.id}/contratos/otrosi`;
      await api<EmployeeContract>(endpoint, { method: "POST", body: JSON.stringify(body) });
      await Promise.all([load(), loadContractHistory(selected.id), loadSalaryHistory(selected.id)]);
      setContractForm((current) => ({ ...current, notes: "", reason: isRehire ? "Recontratacion" : "Otrosi contractual" }));
    } finally {
      setSaving(false);
    }
  }

  async function saveAffiliation() {
    if (!selected || mode === "create" || !affiliationForm.entity_id) return;
    setSaving(true);
    try {
      await api<Affiliation>(`/api/v1/talento-humano/empleados/${selected.id}/afiliaciones`, {
        method: "POST",
        body: JSON.stringify({ ...affiliationForm, entity_id: Number(affiliationForm.entity_id), valid_to: affiliationForm.valid_to || null })
      });
      setAffiliationForm(emptyAffiliationForm());
      await loadAffiliations(selected.id);
    } finally {
      setSaving(false);
    }
  }

  async function saveSalaryHistory() {
    if (!selected || mode !== "edit" || !salaryForm.monthly_salary) return;
    setSaving(true);
    try {
      await api<SalaryHistory>(`/api/v1/talento-humano/empleados/${selected.id}/salarios`, {
        method: "POST",
        body: JSON.stringify({ monthly_salary: Number(salaryForm.monthly_salary), valid_from: salaryForm.valid_from, reason: salaryForm.reason, currency: "COP" })
      });
      setSalaryForm({ monthly_salary: "", valid_from: today(), reason: "Cambio salarial" });
      await loadSalaryHistory(selected.id);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function closeAffiliation(row: Affiliation) {
    if (!selected) return;
    const validTo = window.prompt("Fecha final de vigencia (YYYY-MM-DD)", today());
    if (!validTo) return;
    await api<Affiliation>(`/api/v1/talento-humano/afiliaciones/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "inactiva", valid_to: validTo })
    });
    await loadAffiliations(selected.id);
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-2xl font-semibold">Maestro de empleados</h1>
          <p className="mt-1 text-sm text-neutral-600">Datos personales, contrato, centro de costos, salario y entidades afiliadas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => void load()} type="button">
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={openCreateEmployee} type="button">
            <Plus size={16} /> Nuevo empleado
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Kpi label="Activos" value={rows.filter((employee) => employee.active !== false).length} />
        <Kpi label="Con usuario APEX" value={rows.filter((employee) => employee.user && employee.user.active !== false).length} />
        <Kpi label="Con salario mensual" value={rows.filter((employee) => Number(employee.salary_base || 0) > 0).length} />
      </section>

      <section className="rounded-md border border-line bg-white p-3">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar por empleado, documento, cargo, centro de costos o correo" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-3">Empleado</th>
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3">Cargo</th>
                <th className="px-3 py-3">Centro costos</th>
                <th className="px-3 py-3">Contrato</th>
                <th className="px-3 py-3">Ingreso</th>
                <th className="px-3 py-3">Salario mensual</th>
                <th className="px-3 py-3">Usuario APEX</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((employee) => {
                const state = userState(employee);
                const contract = contractTypes.find((item) => item.code === employee.contract_type)?.name || employee.contract_type || "--";
                return (
                  <tr className="border-t border-line" key={employee.id}>
                    <td className="px-3 py-3"><span className="font-semibold">{employeeName(employee)}</span><span className="block text-xs text-neutral-500">{employee.metadata?.document || employee.code || "Sin documento"}</span></td>
                    <td className="px-3 py-3">{employee.metadata?.document_type || "DOC"} {employee.metadata?.document || "--"}</td>
                    <td className="px-3 py-3">{employee.position || "--"}</td>
                    <td className="px-3 py-3">{employee.metadata?.cost_center || "--"}</td>
                    <td className="px-3 py-3">{contract}</td>
                    <td className="px-3 py-3">{displayDate(employee.hire_date) || "--"}</td>
                    <td className="px-3 py-3">{Number(employee.salary_base || 0) ? Number(employee.salary_base).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) : "--"}</td>
                    <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${state.className}`}>{state.icon}{state.label}</span><span className="mt-1 block text-xs text-neutral-500">{employee.user?.email || ""}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-neutral-700 hover:bg-paper" onClick={() => openEmployee(employee, "view")} type="button" title="Ver informacion del empleado" aria-label={`Ver informacion de ${employeeName(employee)}`}><Eye size={16} /></button>
                        <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-apex/30 bg-apex/5 text-apex hover:bg-apex/10" onClick={() => openEmployee(employee, "edit")} type="button" title="Editar empleado" aria-label={`Editar ${employeeName(employee)}`}><Pencil size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? <tr><td className="px-3 py-8 text-center text-neutral-500" colSpan={9}>Sin empleados para mostrar.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {mounted && (selected || mode === "create") ? createPortal((
        <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-neutral-950/45 p-2 pt-3 sm:p-4 sm:pt-6" role="dialog" aria-modal="true">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-line bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <p className="text-xs font-semibold uppercase text-apex">Maestro de empleados</p>
                <h2 className="mt-1 text-xl font-semibold">{mode === "create" ? "Nuevo empleado" : mode === "edit" ? "Editar empleado" : "Informacion del empleado"}</h2>
                <p className="mt-1 text-sm text-neutral-500">{selected?.user?.email || employeeCodeHelp()}</p>
              </div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-neutral-600 hover:bg-paper" onClick={() => { setSelected(null); setMode("view"); }} type="button" aria-label="Cerrar"><X size={17} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {modalMessage ? <p className="mb-4 rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{modalMessage}</p> : null}
              {mode === "create" && organizationLoading ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-neutral-600" role="status">Cargando maestro contable...</p> : null}
              {mode === "create" && organizationError ? <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">{organizationError}</p> : null}
              <div className="grid gap-3 md:grid-cols-2">
                <EmployeeField label="Primer nombre" readOnly={mode === "view"} value={form.first_name} onChange={(value) => updateNamePart("first_name", value)} />
                <EmployeeField label="Segundo nombre" readOnly={mode === "view"} value={form.middle_name} onChange={(value) => updateNamePart("middle_name", value)} />
                <EmployeeField label="Primer apellido" readOnly={mode === "view"} value={form.last_name} onChange={(value) => updateNamePart("last_name", value)} />
                <EmployeeField label="Segundo apellido" readOnly={mode === "view"} value={form.second_last_name} onChange={(value) => updateNamePart("second_last_name", value)} />
                <EmployeeField label="Nombre completo" readOnly value={form.name} onChange={() => undefined} />
                <div className="rounded-md border border-line bg-paper p-3 text-sm text-neutral-700">
                  <p className="font-semibold">Identificador interno</p>
                  <p className="mt-1">{form.document ? `Se generara desde el documento ${form.document}.` : employeeCodeHelp()}</p>
                </div>
                <SelectField label="Tipo documento" disabled={mode === "view"} value={form.document_type} onChange={(value) => setForm((current) => ({ ...current, document_type: value }))} options={documentTypes.map((item) => ({ value: item.code, label: `${item.code} - ${item.name}` }))} />
                <EmployeeField label="Numero documento" readOnly={mode === "view"} value={form.document} onChange={(value) => setForm((current) => ({ ...current, document: value }))} />
                <EmployeeField label="Cargo" readOnly={mode === "view"} value={form.position} onChange={(value) => setForm((current) => ({ ...current, position: value }))} />
                {organization.societies.length ? <SelectField label="Sociedad contable" disabled={mode === "view"} value={form.society_code} onChange={(value) => setForm((current) => ({ ...current, society_code: value, branch_code: "", cost_center: "" }))} options={[{ value: "", label: "Seleccionar sociedad" }, ...activeOrganizationRows(organization.societies).map((item) => ({ value: item.code, label: `${item.code} - ${item.name}` }))]} /> : null}
                {organization.branches.length ? <SelectField label="Sucursal contable" disabled={mode === "view"} value={form.branch_code} onChange={(value) => setForm((current) => ({ ...current, branch_code: value, society_code: current.society_code || organization.branches.find((branch) => branch.code === value)?.society_code || "", cost_center: "" }))} options={[{ value: "", label: mode === "create" ? "Seleccionar sucursal" : "Sin sucursal nueva" }, ...branchesForSociety(organization, form.society_code).map((item) => ({ value: item.code, label: `${item.code} - ${item.name}` }))]} /> : null}
                {organization.cost_centers.length ? <SelectField label="Centro de costos contable" disabled={mode === "view"} value={form.cost_center} onChange={(value) => setForm((current) => ({ ...current, cost_center: value }))} options={[{ value: "", label: mode === "create" ? "Seleccionar centro" : "Sin centro nuevo" }, ...costCentersForBranch(organization, form.society_code, form.branch_code).map((item) => ({ value: item.code, label: `${item.code} - ${item.name}` }))]} /> : mode === "create" ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" role="alert">No hay maestro contable disponible. Configura la estructura contable para habilitar el alta.</p> : <SelectField label="Centro de costos legado" disabled={mode === "view"} value={form.cost_center} onChange={(value) => setForm((current) => ({ ...current, cost_center: value }))} options={[{ value: "", label: "Sin centro" }, ...costCenters.map((item) => ({ value: item.code, label: `${item.code} - ${item.name}` }))]} />}
                {mode === "edit" && !form.branch_code && !form.cost_center ? <p className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" role="status">Este empleado es legado y no tiene asignación contable. Puedes conservarlo así o asignar sucursal y centro antes de guardar.</p> : null}
                <EmployeeField label="Fecha de ingreso" readOnly={mode === "view"} type="date" value={form.hire_date} onChange={(value) => setForm((current) => ({ ...current, hire_date: value }))} />
                <SelectField label="Tipo de contrato" disabled={mode === "view"} value={form.contract_type} onChange={(value) => setForm((current) => ({ ...current, contract_type: value, end_date: value === "fixed" ? current.end_date : "" }))} options={contractTypes.map((item) => ({ value: item.code, label: item.name }))} />
                {form.contract_type === "fixed" ? <EmployeeField label="Fecha de vencimiento del contrato" readOnly={mode === "view"} type="date" value={form.end_date} onChange={(value) => setForm((current) => ({ ...current, end_date: value }))} /> : null}
                <EmployeeField label="Salario mensual" readOnly={mode === "view"} value={form.salary_base} prefix="$" type="number" onChange={(value) => setForm((current) => ({ ...current, salary_base: value }))} />
                <EmployeeField label="Jornada semanal" readOnly={mode === "view"} value={form.weekly_hours} suffix="h" type="number" onChange={(value) => setForm((current) => ({ ...current, weekly_hours: value }))} />
                <SelectField label="Riesgo ARL" disabled={mode === "view"} value={form.arl_risk_class} onChange={(value) => setForm((current) => ({ ...current, arl_risk_class: value }))} options={[
                  { value: "1", label: "Riesgo I - 0.522%" },
                  { value: "2", label: "Riesgo II - 1.044%" },
                  { value: "3", label: "Riesgo III - 2.436%" },
                  { value: "4", label: "Riesgo IV - 4.350%" },
                  { value: "5", label: "Riesgo V - 6.960%" }
                ]} />
                <SelectField label="Régimen laboral" disabled={mode === "view"} value={form.regime} onChange={(value) => setForm((current) => ({ ...current, regime: value }))} options={[{ value: "ordinary", label: "Ordinario privado" }, { value: "public", label: "Público (bloqueado por alcance)" }, { value: "integral", label: "Salario integral (bloqueado por alcance)" }]} />
                <SelectField label="Sector" disabled={mode === "view"} value={form.sector} onChange={(value) => setForm((current) => ({ ...current, sector: value }))} options={[{ value: "private", label: "Privado" }, { value: "public", label: "Público (bloqueado por alcance)" }]} />
                {form.regime !== "ordinary" || form.sector !== "private" ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">Este régimen/sector se conserva en el maestro, pero el cálculo IBC de novedades actual bloqueará la liquidación hasta contar con reglas específicas.</p> : null}
                <EmployeeField label="Pensión patronal SLN (%)" readOnly={mode === "view"} type="number" value={form.sln_pension_employer_percent} onChange={(value) => setForm((current) => ({ ...current, sln_pension_employer_percent: value }))} />
                <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={form.exoneration_eligible} disabled={mode === "view"} onChange={(event) => setForm((current) => ({ ...current, exoneration_eligible: event.target.checked }))} type="checkbox" /> Empresa/trabajador elegible ET 114-1 explícitamente</label>
                <EmployeeField label="Soporte elegibilidad ET 114-1" readOnly={mode === "view"} value={form.exoneration_support} onChange={(value) => setForm((current) => ({ ...current, exoneration_support: value }))} />
                {mode === "create" ? (
                  <section className="md:col-span-2 rounded-md border border-line bg-white p-3">
                    <h3 className="text-base font-semibold">Afiliaciones iniciales</h3>
                    <p className="mt-1 text-sm text-neutral-600">Se crearan con vigencia desde la fecha de ingreso del empleado.</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {initialAffiliationTypes.map(([entityType, label, field]) => (
                        <SelectField
                          key={entityType}
                          label={label}
                          disabled={false}
                          value={form[field]}
                          onChange={(value) => setForm((current) => ({ ...current, [field]: value }))}
                          options={[{ value: "", label: "Sin entidad" }, ...entities.filter((entity) => entity.active && entity.entity_type === entityType).map((entity) => ({ value: String(entity.id), label: entity.legal_name }))]}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                {mode !== "create" ? <div className="rounded-md border border-line bg-paper p-3">
                  <p className="text-sm font-semibold">Usuario APEX</p>
                  <p className="mt-1 text-sm text-neutral-600">{selected?.user?.name || "Sin usuario"} {selected?.user?.email ? `- ${selected.user.email}` : ""}</p>
                </div> : null}
              </div>

              <section className="mt-5 rounded-md border border-line bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Historial salarial</h3>
                    <p className="mt-1 text-sm text-neutral-600">Vigencias usadas para nomina, prima, cesantias y liquidacion de trabajador.</p>
                  </div>
                </div>
                {mode === "edit" ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-[180px_150px_minmax(220px,1fr)_auto]">
                    <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Salario mensual" type="number" value={salaryForm.monthly_salary} onChange={(event) => setSalaryForm((current) => ({ ...current, monthly_salary: event.target.value }))} />
                    <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={salaryForm.valid_from} onChange={(event) => setSalaryForm((current) => ({ ...current, valid_from: event.target.value }))} />
                    <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Motivo" value={salaryForm.reason} onChange={(event) => setSalaryForm((current) => ({ ...current, reason: event.target.value }))} />
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={!salaryForm.monthly_salary || saving} onClick={() => void saveSalaryHistory()} type="button"><Plus size={15} /> Agregar</button>
                  </div>
                ) : null}
                <div className="mt-3 overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Salario</th><th className="px-3 py-3">Vigencia</th><th className="px-3 py-3">Motivo</th></tr></thead>
                    <tbody>
                      {salaryHistory.map((row) => <tr className="border-t border-line" key={row.id}><td className="px-3 py-3 font-semibold">{Number(row.monthly_salary || 0).toLocaleString("es-CO", { style: "currency", currency: row.currency || "COP", maximumFractionDigits: 0 })}</td><td className="px-3 py-3">{displayDate(row.valid_from)} - {row.valid_to ? displayDate(row.valid_to) : "vigente"}</td><td className="px-3 py-3">{row.reason}</td></tr>)}
                      {!salaryHistory.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={3}>Sin historial salarial registrado.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-5 rounded-md border border-line bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Historial contractual y otrosi</h3>
                    <p className="mt-1 text-sm text-neutral-600">Controla cambios de contrato, retiros y recontrataciones sin duplicar la cedula.</p>
                  </div>
                </div>
                {mode === "edit" && selected ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-[145px_150px_160px_160px_minmax(180px,1fr)]">
                    <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={selected.active === false ? contractForm.new_hire_date : contractForm.valid_from} onChange={(event) => setContractForm((current) => selected.active === false ? { ...current, new_hire_date: event.target.value } : { ...current, valid_from: event.target.value })} />
                    <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={contractForm.contract_type} onChange={(event) => setContractForm((current) => ({ ...current, contract_type: event.target.value, end_date: event.target.value === "fixed" ? current.end_date : "" }))}>
                      {contractTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    {contractForm.contract_type === "fixed" ? <input className="h-10 rounded-md border border-line px-3 text-sm" aria-label="Fecha de vencimiento del contrato" type="date" value={contractForm.end_date} onChange={(event) => setContractForm((current) => ({ ...current, end_date: event.target.value }))} /> : null}
                    <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Salario" type="number" value={contractForm.salary_base} onChange={(event) => setContractForm((current) => ({ ...current, salary_base: event.target.value }))} />
                    <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={contractForm.cost_center} onChange={(event) => setContractForm((current) => ({ ...current, cost_center: event.target.value }))}>
                      <option value="">Centro costos</option>
                      {costCenters.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                    </select>
                    <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Motivo o notas" value={contractForm.notes} onChange={(event) => setContractForm((current) => ({ ...current, notes: event.target.value }))} />
                    <div className="md:col-span-5 flex flex-wrap justify-end gap-2">
                      {selected.active === false ? (
                        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={() => void saveContractAction("rehire")} type="button"><UserRoundCheck size={15} /> Recontratar</button>
                      ) : (
                        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={() => void saveContractAction("otrosi")} type="button"><Plus size={15} /> Crear otrosi</button>
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Contrato</th><th className="px-3 py-3">Vigencia</th><th className="px-3 py-3">Salario</th><th className="px-3 py-3">Centro costos</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Motivo</th></tr></thead>
                    <tbody>
                      {contractHistory.map((row) => <tr className="border-t border-line" key={row.id}><td className="px-3 py-3">{contractTypes.find((item) => item.code === row.contract_type)?.name || row.contract_type}</td><td className="px-3 py-3">{displayDate(row.valid_from)} - {row.valid_to ? displayDate(row.valid_to) : "vigente"}</td><td className="px-3 py-3">{Number(row.salary_base || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</td><td className="px-3 py-3">{row.cost_center || "--"}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3">{row.termination_reason || row.reason}</td></tr>)}
                      {!contractHistory.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={6}>Sin historial contractual registrado.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-5 rounded-md border border-line bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Entidades del empleado</h3>
                    <p className="mt-1 text-sm text-neutral-600">EPS, pension, cesantias, ARL, caja, ICBF y SENA se enlazan desde este maestro.</p>
                  </div>
                  <Link2 className="text-apex" size={20} />
                </div>
                {mode === "edit" ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-[150px_minmax(220px,1fr)_145px_145px_120px_auto]">
                    <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={affiliationForm.entity_type} onChange={(event) => setAffiliationForm((current) => ({ ...current, entity_type: event.target.value, entity_id: "" }))}>
                      {entityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={affiliationForm.entity_id} onChange={(event) => setAffiliationForm((current) => ({ ...current, entity_id: event.target.value }))}>
                      <option value="">Entidad</option>
                      {availableEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.legal_name}</option>)}
                    </select>
                    <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={affiliationForm.valid_from} onChange={(event) => setAffiliationForm((current) => ({ ...current, valid_from: event.target.value }))} />
                    <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={affiliationForm.valid_to} onChange={(event) => setAffiliationForm((current) => ({ ...current, valid_to: event.target.value }))} />
                    <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={affiliationForm.status} onChange={(event) => setAffiliationForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="activa">Activa</option>
                      <option value="inactiva">Inactiva</option>
                    </select>
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={!affiliationForm.entity_id || saving} onClick={() => void saveAffiliation()} type="button"><Plus size={15} /> Agregar</button>
                  </div>
                ) : null}
                <div className="mt-3 overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Entidad</th><th className="px-3 py-3">Vigencia</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead>
                    <tbody>
                      {affiliations.map((row) => (
                        <tr className="border-t border-line" key={row.id}>
                          <td className="px-3 py-3">{row.entity_type}</td>
                          <td className="px-3 py-3"><span className="font-semibold">{row.entity_legal_name || row.entity_id}</span><span className="block text-xs text-neutral-500">{row.entity_nit || ""}</span></td>
                          <td className="px-3 py-3">{displayDate(row.valid_from)} - {row.valid_to ? displayDate(row.valid_to) : "vigente"}</td>
                          <td className="px-3 py-3">{row.status}</td>
                          <td className="px-3 py-3 text-right">{mode === "edit" ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={() => void closeAffiliation(row)} type="button">Cerrar vigencia</button> : null}</td>
                        </tr>
                      ))}
                      {!affiliations.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={5}>Sin entidades enlazadas para este empleado.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-white p-4">
              {mode === "view" ? (
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setMode("edit")} type="button"><Pencil size={16} /> Editar</button>
              ) : (
                <>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => selected ? openEmployee(selected, "view") : setMode("view")} type="button">Cancelar</button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={() => void saveEmployee()} type="button"><Save size={16} /> {saving ? "Guardando..." : mode === "create" ? "Crear empleado" : "Guardar cambios"}</button>
                </>
              )}
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </div>
  );
}

function EmployeeField({ label, value, onChange, readOnly, suffix, prefix, type = "text", help }: { label: string; value: string; onChange: (value: string) => void; readOnly: boolean; suffix?: string; prefix?: string; type?: string; help?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>
      <div className="flex items-center gap-2">
        {prefix ? <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-neutral-600">{prefix}</span> : null}
        <input className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm disabled:bg-paper disabled:text-neutral-700" disabled={readOnly} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
        {suffix ? <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-neutral-600">{suffix}</span> : null}
      </div>
      {help ? <span className="mt-1 block text-xs text-neutral-500">{help}</span> : null}
    </label>
  );
}

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>
      <select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm disabled:bg-paper disabled:text-neutral-700" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}


function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-md border border-line bg-white p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase text-neutral-500">{label}</p>
    </article>
  );
}
