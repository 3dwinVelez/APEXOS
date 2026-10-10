"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Download, Edit3, Power, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; name?: string; display_name?: string; full_name?: string; metadata?: { name?: string; document?: string } };
type LaborEntity = { id: number; legal_name: string; entity_type: string; nit: string };
type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean };
type Concept = { id: number; code: string; name: string; description?: string; entity_id?: number | null; entity_name?: string | null; debit_account_code?: string; credit_account_code?: string; active: boolean };
type EmployeeLibranza = {
  id: number; employee_id: number; employee_name?: string; employee_code?: string; employee_document?: string; concept_id?: number; concept_code: string; concept_name: string;
  description?: string; frequency: string; mode: string; original_amount?: number | string | null; installment_amount: number | string;
  installments_total?: number | null; installments_paid: number; deducted_amount: number | string; balance_amount?: number | string | null;
  start_date?: string; end_date?: string | null; inactive_at?: string | null; status: string;
};

const inputClass = "mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm";
const tabClass = "inline-flex h-11 items-center rounded-md px-4 text-sm font-semibold";

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function employeeName(row: Employee) {
  return row.display_name || row.full_name || row.metadata?.name || row.name || row.code;
}

function employeeDocument(row: Employee) {
  return row.metadata?.document || row.code;
}

function searchableEmployee(row: Employee) {
  return [row.code, row.metadata?.document, employeeName(row)].join(" ").toLowerCase();
}

export default function LibranzasPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entities, setEntities] = useState<LaborEntity[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [libranzas, setLibranzas] = useState<EmployeeLibranza[]>([]);
  const [activeTab, setActiveTab] = useState<"configuracion" | "asignacion" | "reporte">("configuracion");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeFinderOpen, setEmployeeFinderOpen] = useState(false);
  const [editingConceptId, setEditingConceptId] = useState<number | null>(null);
  const [reportFilters, setReportFilters] = useState({ employee: "", concept_id: "", mode: "", status: "" });
  const [conceptForm, setConceptForm] = useState({ code: "PERDIDA_INVENTARIO", name: "Perdida de inventario", description: "", entity_id: "", debit_account_code: "", credit_account_code: "", active: true });
  const [assignmentForm, setAssignmentForm] = useState({ employee_id: "", concept_id: "", description: "", frequency: "quincena", mode: "cuotas", original_amount: "", installments_total: "8", installment_amount: "", start_date: new Date().toISOString().slice(0, 10), end_date: "" });

  const calculatedInstallment = useMemo(() => {
    const total = Number(assignmentForm.original_amount || 0);
    const installments = Number(assignmentForm.installments_total || 0);
    return assignmentForm.mode === "cuotas" && total > 0 && installments > 0 ? Math.round((total / installments) * 100) / 100 : Number(assignmentForm.installment_amount || 0);
  }, [assignmentForm.installment_amount, assignmentForm.installments_total, assignmentForm.mode, assignmentForm.original_amount]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) => searchableEmployee(employee).includes(query));
  }, [employeeSearch, employees]);

  const selectedEmployee = employees.find((employee) => String(employee.id) === String(assignmentForm.employee_id));
  const filteredLibranzas = useMemo(() => {
    const employeeQuery = reportFilters.employee.trim().toLowerCase();
    return libranzas.filter((row) => {
      const document = String(row.employee_document || row.employee_code || row.employee_id || "").toLowerCase();
      const name = String(row.employee_name || "").toLowerCase();
      const employeeMatches = !employeeQuery || document.includes(employeeQuery) || name.includes(employeeQuery);
      const conceptMatches = !reportFilters.concept_id || String(row.concept_id) === reportFilters.concept_id || row.concept_code === reportFilters.concept_id;
      const typeMatches = !reportFilters.mode || row.mode === reportFilters.mode;
      const statusMatches = !reportFilters.status || row.status === reportFilters.status;
      return employeeMatches && conceptMatches && typeMatches && statusMatches;
    });
  }, [libranzas, reportFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeRows, entityRows, accountRows, conceptRows, libranzaRows] = await Promise.all([
        api<Employee[]>("/api/v1/talento-humano/empleados?active=true", { cache: "no-store" }),
        api<LaborEntity[]>("/api/v1/talento-humano/entidades?active=true", { cache: "no-store" }).catch(() => []),
        api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000", { cache: "no-store" }).catch(() => []),
        api<Concept[]>("/api/v1/talento-humano/libranzas/conceptos", { cache: "no-store" }),
        api<EmployeeLibranza[]>("/api/v1/talento-humano/libranzas/empleados", { cache: "no-store" })
      ]);
      setEmployees(employeeRows);
      setEntities(entityRows);
      setAccounts(accountRows.filter((row) => row.active !== false && row.allows_tx !== false));
      setConcepts(conceptRows);
      setLibranzas(libranzaRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar libranzas")); }, [load]);

  function chooseEmployee(employee: Employee) {
    setAssignmentForm((current) => ({ ...current, employee_id: String(employee.id) }));
    setEmployeeSearch(`${employeeDocument(employee)} - ${employeeName(employee)}`);
    setEmployeeFinderOpen(false);
  }

  function handleEmployeeSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = employeeSearch.trim().toLowerCase();
    if (!query) {
      setEmployeeFinderOpen(true);
      return;
    }
    const exact = employees.find((employee) => employeeDocument(employee).toLowerCase() === query || employee.code.toLowerCase() === query);
    const candidate = exact || filteredEmployees[0];
    if (candidate) chooseEmployee(candidate);
    else setEmployeeFinderOpen(true);
  }

  async function saveConcept() {
    setMessage("");
    try {
      const payload = { ...conceptForm, entity_id: conceptForm.entity_id || null };
      if (editingConceptId) {
        await api(`/api/v1/talento-humano/libranzas/conceptos/${editingConceptId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/v1/talento-humano/libranzas/conceptos", { method: "POST", body: JSON.stringify(payload) });
      }
      setMessage(editingConceptId ? "Concepto de libranza actualizado." : "Concepto de libranza guardado.");
      setEditingConceptId(null);
      setConceptForm({ code: "PERDIDA_INVENTARIO", name: "Perdida de inventario", description: "", entity_id: "", debit_account_code: "", credit_account_code: "", active: true });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el concepto");
    }
  }

  function editConcept(concept: Concept) {
    setEditingConceptId(concept.id);
    setConceptForm({
      code: concept.code,
      name: concept.name,
      description: concept.description || "",
      entity_id: concept.entity_id ? String(concept.entity_id) : "",
      debit_account_code: concept.debit_account_code || "",
      credit_account_code: concept.credit_account_code || "",
      active: concept.active !== false
    });
  }

  async function toggleConcept(concept: Concept) {
    setMessage("");
    try {
      await api(`/api/v1/talento-humano/libranzas/conceptos/${concept.id}`, { method: "PATCH", body: JSON.stringify({ ...concept, active: concept.active === false }) });
      setMessage(concept.active === false ? "Concepto reactivado." : "Concepto inactivado.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado del concepto");
    }
  }

  async function deleteConcept(concept: Concept) {
    setMessage("");
    try {
      await api(`/api/v1/talento-humano/libranzas/conceptos/${concept.id}`, { method: "DELETE" });
      setMessage("Concepto borrado.");
      if (editingConceptId === concept.id) setEditingConceptId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo borrar el concepto");
    }
  }

  async function saveAssignment() {
    setMessage("");
    try {
      const total = Number(assignmentForm.original_amount || 0);
      const cuotas = Number(assignmentForm.installments_total || 0);
      const installment = assignmentForm.mode === "cuotas" ? calculatedInstallment : Number(assignmentForm.installment_amount || 0);
      await api("/api/v1/talento-humano/libranzas/empleados", {
        method: "POST",
        body: JSON.stringify({
          ...assignmentForm,
          original_amount: assignmentForm.mode === "perpetua" ? null : total,
          installments_total: assignmentForm.mode === "perpetua" ? null : cuotas,
          installment_amount: installment,
          end_date: assignmentForm.end_date || null
        })
      });
      setMessage("Libranza asociada al trabajador.");
      setActiveTab("reporte");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo asociar la libranza");
    }
  }

  async function inactivateLibranza(row: EmployeeLibranza) {
    setMessage("");
    const inactiveAt = new Date().toISOString();
    try {
      await api(`/api/v1/talento-humano/libranzas/empleados/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "inactiva", inactive_at: inactiveAt, end_date: inactiveAt.slice(0, 10) })
      });
      setMessage("Libranza inactivada con fecha de trazabilidad.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo inactivar la libranza");
    }
  }

  function reportEmployeeCode(row: EmployeeLibranza) {
    return row.employee_document || row.employee_code || String(row.employee_id || "");
  }

  async function exportLibranzas() {
    setMessage("");
    if (!filteredLibranzas.length) {
      setMessage("No hay libranzas para exportar con los filtros actuales.");
      return;
    }
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Libranzas");
    sheet.addRow(["Cedula empleado", "Nombre empleado", "Concepto", "Nombre concepto", "Frecuencia", "Tipo", "Deuda total", "Valor periodo", "Valor pagado", "Saldo restante", "Estado", "Inactivada"]);
    filteredLibranzas.forEach((row) => {
      sheet.addRow([
        reportEmployeeCode(row),
        row.employee_name || "",
        row.concept_code,
        row.concept_name,
        row.frequency,
        row.mode,
        row.mode === "perpetua" ? "" : Number(row.original_amount || 0),
        Number(row.installment_amount || 0),
        Number(row.deducted_amount || 0),
        row.mode === "perpetua" ? "" : Number(row.balance_amount || 0),
        row.status,
        row.inactive_at ? new Date(row.inactive_at).toLocaleDateString("es-CO") : ""
      ]);
    });
    sheet.columns.forEach((column) => { column.width = 22; });
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reporte-libranzas.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-3xl font-semibold">Libranzas y deducciones recurrentes</h1>
          <p className="mt-1 text-sm text-neutral-600">Configura conceptos, asocialos al trabajador y controla saldos por cuotas o deducciones permanentes.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold" disabled={loading} onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar</button>
      </header>

      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{message}</p> : null}

      <nav className="rounded-md border border-line bg-white p-2">
        <button className={`${tabClass} ${activeTab === "configuracion" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setActiveTab("configuracion")} type="button">Configuración</button>
        <button className={`${tabClass} ${activeTab === "asignacion" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setActiveTab("asignacion")} type="button">Asignación</button>
        <button className={`${tabClass} ${activeTab === "reporte" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setActiveTab("reporte")} type="button">Reporte</button>
      </nav>

      {activeTab === "configuracion" ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Configuración de conceptos</h2>
          <p className="mt-1 text-sm text-neutral-600">Aquí puedes ver los conceptos configurados para libranzas, editarlos, inactivarlos o borrarlos si todavía no tienen asociaciones.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">Código<input className={inputClass} value={conceptForm.code} onChange={(event) => setConceptForm((current) => ({ ...current, code: event.target.value }))} /></label>
            <label className="text-sm">Nombre<input className={inputClass} value={conceptForm.name} onChange={(event) => setConceptForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="text-sm md:col-span-2">Descripción<input className={inputClass} value={conceptForm.description} onChange={(event) => setConceptForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="text-sm">Entidad si aplica<select className={inputClass} value={conceptForm.entity_id} onChange={(event) => setConceptForm((current) => ({ ...current, entity_id: event.target.value }))}><option value="">Sin entidad</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entity_type} - {entity.legal_name}</option>)}</select></label>
            <label className="text-sm">Cuenta débito<select className={inputClass} value={conceptForm.debit_account_code} onChange={(event) => setConceptForm((current) => ({ ...current, debit_account_code: event.target.value }))}><option value="">Seleccionar</option>{accounts.map((account) => <option key={account.id} value={account.code}>{account.code} - {account.name}</option>)}</select></label>
            <label className="text-sm">Cuenta crédito<select className={inputClass} value={conceptForm.credit_account_code} onChange={(event) => setConceptForm((current) => ({ ...current, credit_account_code: event.target.value }))}><option value="">Seleccionar</option>{accounts.map((account) => <option key={account.id} value={account.code}>{account.code} - {account.name}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={saveConcept} type="button"><Save size={16} /> {editingConceptId ? "Actualizar concepto" : "Guardar concepto"}</button>
            {editingConceptId ? <button className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold" onClick={() => { setEditingConceptId(null); setConceptForm({ code: "PERDIDA_INVENTARIO", name: "Perdida de inventario", description: "", entity_id: "", debit_account_code: "", credit_account_code: "", active: true }); }} type="button">Cancelar edición</button> : null}
          </div>

          <div className="mt-6 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[920px] text-sm">
              <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Código</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Entidad</th><th className="px-3 py-2">Cuenta débito</th><th className="px-3 py-2">Cuenta crédito</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Acciones</th></tr></thead>
              <tbody>
                {concepts.map((concept) => <tr className="border-b border-line/70" key={concept.id}>
                  <td className="px-3 py-2 font-mono text-xs">{concept.code}</td>
                  <td className="px-3 py-2 font-medium">{concept.name}<p className="text-xs text-neutral-500">{concept.description || "--"}</p></td>
                  <td className="px-3 py-2">{concept.entity_name || "Sin entidad"}</td>
                  <td className="px-3 py-2">{concept.debit_account_code || "--"}</td>
                  <td className="px-3 py-2">{concept.credit_account_code || "--"}</td>
                  <td className="px-3 py-2"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${concept.active === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{concept.active === false ? "Inactivo" : "Activo"}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold" onClick={() => editConcept(concept)} type="button"><Edit3 size={14} /> Editar</button>
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold" onClick={() => void toggleConcept(concept)} type="button"><Power size={14} /> {concept.active === false ? "Activar" : "Inactivar"}</button>
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-red-700" onClick={() => void deleteConcept(concept)} type="button"><Trash2 size={14} /> Borrar</button>
                    </div>
                  </td>
                </tr>)}
                {!concepts.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={7}>No hay conceptos configurados.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "asignacion" ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Asignación al trabajador</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">Empleado por cédula o nombre
              <div className="mt-1 flex gap-2">
                <input className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" placeholder="Digita cédula o nombre; Enter vacío abre buscador" value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setAssignmentForm((current) => ({ ...current, employee_id: "" })); }} onKeyDown={handleEmployeeSearchKeyDown} />
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold" onClick={() => setEmployeeFinderOpen(true)} type="button"><Search size={16} /> Buscar</button>
              </div>
              {selectedEmployee ? <span className="mt-1 block text-xs text-neutral-500">Seleccionado: {employeeDocument(selectedEmployee)} - {employeeName(selectedEmployee)}</span> : null}
            </label>
            <label className="text-sm">Concepto<select className={inputClass} value={assignmentForm.concept_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, concept_id: event.target.value }))}><option value="">Seleccionar</option>{concepts.filter((concept) => concept.active !== false).map((concept) => <option key={concept.id} value={concept.id}>{concept.code} - {concept.name}</option>)}</select></label>
            <label className="text-sm">Frecuencia<select className={inputClass} value={assignmentForm.frequency} onChange={(event) => setAssignmentForm((current) => ({ ...current, frequency: event.target.value }))}><option value="quincena">Quincenal</option><option value="mes">Mensual</option></select></label>
            <label className="text-sm">Tipo<select className={inputClass} value={assignmentForm.mode} onChange={(event) => setAssignmentForm((current) => ({ ...current, mode: event.target.value }))}><option value="cuotas">Por cuotas</option><option value="perpetua">Perpetua</option></select></label>
            {assignmentForm.mode === "cuotas" ? <label className="text-sm">Deuda total<input className={inputClass} type="number" value={assignmentForm.original_amount} onChange={(event) => setAssignmentForm((current) => ({ ...current, original_amount: event.target.value }))} /></label> : null}
            {assignmentForm.mode === "cuotas" ? <label className="text-sm">Número de cuotas<input className={inputClass} type="number" value={assignmentForm.installments_total} onChange={(event) => setAssignmentForm((current) => ({ ...current, installments_total: event.target.value }))} /></label> : null}
            <label className="text-sm">Valor por periodo<input className={inputClass} readOnly={assignmentForm.mode === "cuotas"} type="number" value={assignmentForm.mode === "cuotas" ? String(calculatedInstallment || "") : assignmentForm.installment_amount} onChange={(event) => setAssignmentForm((current) => ({ ...current, installment_amount: event.target.value }))} /></label>
            <label className="text-sm">Fecha inicio<input className={inputClass} type="date" value={assignmentForm.start_date} onChange={(event) => setAssignmentForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
            <label className="text-sm md:col-span-2">Detalle<input className={inputClass} value={assignmentForm.description} onChange={(event) => setAssignmentForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={saveAssignment} type="button"><Save size={16} /> Asociar libranza</button>
        </section>
      ) : null}

      {activeTab === "reporte" ? (
        <section className="rounded-md border border-line bg-white">
          <div className="border-b border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Reporte de libranzas</h2>
                <p className="mt-1 text-sm text-neutral-600">{filteredLibranzas.length} registro(s) filtrados.</p>
              </div>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => void exportLibranzas()} type="button"><Download size={16} /> Excel</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <label className="text-sm">Empleado
                <input className={inputClass} placeholder="Cédula o nombre" value={reportFilters.employee} onChange={(event) => setReportFilters((current) => ({ ...current, employee: event.target.value }))} />
              </label>
              <label className="text-sm">Concepto
                <select className={inputClass} value={reportFilters.concept_id} onChange={(event) => setReportFilters((current) => ({ ...current, concept_id: event.target.value }))}>
                  <option value="">Todos</option>
                  {concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.code} - {concept.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Tipo
                <select className={inputClass} value={reportFilters.mode} onChange={(event) => setReportFilters((current) => ({ ...current, mode: event.target.value }))}>
                  <option value="">Todos</option>
                  <option value="cuotas">Por cuotas</option>
                  <option value="perpetua">Perpetua</option>
                </select>
              </label>
              <label className="text-sm">Estado
                <select className={inputClass} value={reportFilters.status} onChange={(event) => setReportFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">Todos</option>
                  <option value="activa">Activas</option>
                  <option value="inactiva">Inactivas</option>
                  <option value="finalizada">Finalizadas</option>
                </select>
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Cédula empleado</th><th className="px-3 py-2">Nombre empleado</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Frecuencia</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Deuda total</th><th className="px-3 py-2">Valor periodo</th><th className="px-3 py-2">Valor pagado</th><th className="px-3 py-2">Saldo restante</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Inactivada</th><th className="px-3 py-2">Acciones</th></tr></thead>
              <tbody>{filteredLibranzas.map((row) => <tr className="border-b border-line/70" key={row.id}><td className="px-3 py-2">{reportEmployeeCode(row)}</td><td className="px-3 py-2 font-medium">{row.employee_name || reportEmployeeCode(row)}</td><td className="px-3 py-2">{row.concept_code}<p className="text-xs text-neutral-500">{row.concept_name}</p></td><td className="px-3 py-2">{row.frequency}</td><td className="px-3 py-2">{row.mode}</td><td className="px-3 py-2">{row.mode === "perpetua" ? "Permanente" : money(row.original_amount)}</td><td className="px-3 py-2">{money(row.installment_amount)}</td><td className="px-3 py-2">{money(row.deducted_amount)}</td><td className="px-3 py-2">{row.mode === "perpetua" ? "Permanente" : money(row.balance_amount)}</td><td className="px-3 py-2">{row.status}</td><td className="px-3 py-2">{row.inactive_at ? new Date(row.inactive_at).toLocaleDateString("es-CO") : "--"}</td><td className="px-3 py-2">{row.mode === "perpetua" && row.status === "activa" ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-red-700" onClick={() => void inactivateLibranza(row)} type="button"><Power size={14} /> Inactivar</button> : "--"}</td></tr>)}
              {!filteredLibranzas.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={12}>No hay libranzas con los filtros actuales.</td></tr> : null}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {employeeFinderOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-16">
          <div className="max-h-[78vh] w-full max-w-3xl overflow-hidden rounded-md border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-base font-semibold">Buscar empleado</h2>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line" onClick={() => setEmployeeFinderOpen(false)} type="button"><X size={16} /></button>
            </div>
            <div className="p-4">
              <input className={inputClass} autoFocus placeholder="Busca por nombre, cédula o código" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} />
            </div>
            <div className="max-h-[52vh] overflow-auto">
              {filteredEmployees.map((employee) => <button className="flex w-full items-center justify-between border-t border-line px-4 py-3 text-left text-sm hover:bg-paper" key={employee.id} onClick={() => chooseEmployee(employee)} type="button"><span className="font-medium">{employeeName(employee)}</span><span className="text-neutral-500">{employeeDocument(employee)}</span></button>)}
              {!filteredEmployees.length ? <p className="border-t border-line p-4 text-sm text-neutral-500">No hay empleados con ese criterio.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
