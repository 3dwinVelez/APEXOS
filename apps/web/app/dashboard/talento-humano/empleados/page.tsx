"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Eye, Link2, Pencil, RefreshCw, Save, Search, UserRoundCheck, UserRoundX, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = {
  id: number | string;
  code?: string;
  position?: string;
  department?: string;
  active?: boolean;
  metadata?: {
    name?: string;
    document?: string;
    document_type?: string;
    site?: string;
    area?: string;
    cost_center?: string;
    labor_status?: string;
    weekly_hours?: number;
    social_security?: Record<string, unknown>;
  };
  user?: { id?: number | string; name?: string; email?: string; active?: boolean };
};

function employeeName(employee: Employee) {
  return employee.metadata?.name || employee.user?.name || employee.code || `Empleado ${employee.id}`;
}

function userState(employee: Employee) {
  if (!employee.user) return { label: "Sin usuario", className: "bg-amber-50 text-amber-800", icon: <UserRoundX size={15} /> };
  if (employee.user.active === false) return { label: "Usuario inactivo", className: "bg-rose-50 text-rose-700", icon: <UserRoundX size={15} /> };
  return { label: "Usuario asociado", className: "bg-emerald-50 text-emerald-700", icon: <UserRoundCheck size={15} /> };
}

export default function EmployeesMasterPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", document_type: "DOC", document: "", code: "", position: "", area: "", site: "", weekly_hours: "" });

  async function load() {
    setLoading(true);
    try {
      const data = await api<Employee[]>("/api/v1/talento-humano/empleados?active=true", { cache: "no-store" });
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
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
      employee.department,
      employee.metadata?.site,
      employee.user?.email
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [query, rows]);

  function openEmployee(employee: Employee, nextMode: "view" | "edit") {
    setSelected(employee);
    setMode(nextMode);
    setForm({
      name: employeeName(employee),
      document_type: employee.metadata?.document_type || "DOC",
      document: employee.metadata?.document || "",
      code: employee.code || "",
      position: employee.position || "",
      area: employee.metadata?.area || employee.department || "",
      site: employee.metadata?.site || "",
      weekly_hours: employee.metadata?.weekly_hours ? String(employee.metadata.weekly_hours) : ""
    });
  }

  async function saveEmployee() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api<Employee>(`/api/v1/talento-humano/empleados/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          document_type: form.document_type,
          document: form.document,
          code: form.code,
          position: form.position,
          area: form.area,
          department: form.area,
          site: form.site,
          weekly_hours: form.weekly_hours ? Number(form.weekly_hours) : null
        })
      });
      setRows((current) => current.map((employee) => String(employee.id) === String(updated.id) ? updated : employee));
      setSelected(updated);
      setMode("view");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-2xl font-semibold">Maestro de empleados</h1>
          <p className="mt-1 text-sm text-neutral-600">Datos laborales, estado operativo y asociacion con usuarios APEX.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => void load()} type="button">
          <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Kpi label="Activos" value={rows.filter((employee) => employee.active !== false).length} />
        <Kpi label="Con usuario APEX" value={rows.filter((employee) => employee.user && employee.user.active !== false).length} />
        <Kpi label="Sin usuario" value={rows.filter((employee) => !employee.user).length} />
      </section>

      <section className="rounded-md border border-line bg-white p-3">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar por empleado, documento, cargo, area, sede o correo" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-3">Empleado</th>
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3">Cargo</th>
                <th className="px-3 py-3">Area</th>
                <th className="px-3 py-3">Sede</th>
                <th className="px-3 py-3">Jornada semanal</th>
                <th className="px-3 py-3">Usuario APEX</th>
                <th className="px-3 py-3">Afiliaciones</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((employee) => {
                const state = userState(employee);
                const socialSecurity = employee.metadata?.social_security || {};
                const affiliationCount = Object.values(socialSecurity).filter(Boolean).length;
                return (
                  <tr className="border-t border-line" key={employee.id}>
                    <td className="px-3 py-3"><span className="font-semibold">{employeeName(employee)}</span><span className="block text-xs text-neutral-500">{employee.code || "Sin codigo"}</span></td>
                    <td className="px-3 py-3">{employee.metadata?.document_type || "DOC"} {employee.metadata?.document || "--"}</td>
                    <td className="px-3 py-3">{employee.position || "--"}</td>
                    <td className="px-3 py-3">{employee.metadata?.area || employee.department || "--"}</td>
                    <td className="px-3 py-3">{employee.metadata?.site || "--"}</td>
                    <td className="px-3 py-3">{employee.metadata?.weekly_hours ? `${employee.metadata.weekly_hours} h` : "--"}</td>
                    <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${state.className}`}>{state.icon}{state.label}</span><span className="mt-1 block text-xs text-neutral-500">{employee.user?.email || ""}</span></td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-1 text-xs font-semibold text-neutral-700"><Link2 size={13} /> {affiliationCount} registradas</span></td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-neutral-700 hover:bg-paper" onClick={() => openEmployee(employee, "view")} type="button" title="Ver informacion del empleado" aria-label={`Ver informacion de ${employeeName(employee)}`}>
                          <Eye size={16} />
                        </button>
                        <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-apex/30 bg-apex/5 text-apex hover:bg-apex/10" onClick={() => openEmployee(employee, "edit")} type="button" title="Editar empleado" aria-label={`Editar ${employeeName(employee)}`}>
                          <Pencil size={16} />
                        </button>
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

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/45 p-4" role="dialog" aria-modal="true">
          <section className="w-full max-w-2xl rounded-md border border-line bg-white shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <p className="text-xs font-semibold uppercase text-apex">Maestro de empleados</p>
                <h2 className="mt-1 text-xl font-semibold">{mode === "edit" ? "Editar empleado" : "Informacion del empleado"}</h2>
                <p className="mt-1 text-sm text-neutral-500">{selected.user?.email || "Empleado sin usuario APEX asociado"}</p>
              </div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-neutral-600 hover:bg-paper" onClick={() => setSelected(null)} type="button" aria-label="Cerrar"><X size={17} /></button>
            </header>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <EmployeeField label="Nombre completo" readOnly={mode === "view"} value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
              <EmployeeField label="Codigo empleado" readOnly={mode === "view"} value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} />
              <EmployeeField label="Tipo documento" readOnly={mode === "view"} value={form.document_type} onChange={(value) => setForm((current) => ({ ...current, document_type: value }))} />
              <EmployeeField label="Numero documento" readOnly={mode === "view"} value={form.document} onChange={(value) => setForm((current) => ({ ...current, document: value }))} />
              <EmployeeField label="Cargo" readOnly={mode === "view"} value={form.position} onChange={(value) => setForm((current) => ({ ...current, position: value }))} />
              <EmployeeField label="Area" readOnly={mode === "view"} value={form.area} onChange={(value) => setForm((current) => ({ ...current, area: value }))} />
              <EmployeeField label="Sede" readOnly={mode === "view"} value={form.site} onChange={(value) => setForm((current) => ({ ...current, site: value }))} />
              <EmployeeField label="Jornada semanal" readOnly={mode === "view"} value={form.weekly_hours} suffix="h" type="number" onChange={(value) => setForm((current) => ({ ...current, weekly_hours: value }))} />
              <div className="rounded-md border border-line bg-paper p-3 md:col-span-2">
                <p className="text-sm font-semibold">Usuario APEX</p>
                <p className="mt-1 text-sm text-neutral-600">{selected.user?.name || "Sin usuario"} {selected.user?.email ? `- ${selected.user.email}` : ""}</p>
              </div>
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
              {mode === "view" ? (
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setMode("edit")} type="button"><Pencil size={16} /> Editar</button>
              ) : (
                <>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => openEmployee(selected, "view")} type="button">Cancelar</button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={() => void saveEmployee()} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar cambios"}</button>
                </>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function EmployeeField({ label, value, onChange, readOnly, suffix, type = "text" }: { label: string; value: string; onChange: (value: string) => void; readOnly: boolean; suffix?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>
      <div className="flex items-center gap-2">
        <input className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm disabled:bg-paper disabled:text-neutral-700" disabled={readOnly} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
        {suffix ? <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-neutral-600">{suffix}</span> : null}
      </div>
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
