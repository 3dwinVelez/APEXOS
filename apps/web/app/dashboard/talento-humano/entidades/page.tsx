"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Building2, Link2, Pencil, Plus, RefreshCw, Save, Search, UserRoundCheck, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type LaborEntity = {
  id: number;
  entity_type: string;
  internal_code: string;
  nit: string;
  verification_digit?: string | null;
  legal_name: string;
  trade_name?: string | null;
  official_code?: string | null;
  active: boolean;
  valid_from: string;
  valid_to?: string | null;
  accounting_party_id?: number | null;
  accounting_party_name?: string | null;
  accounting_party_legal_name?: string | null;
  accounting_party_tax_id?: string | null;
  accounting_link_status?: string;
  nit_mismatch?: boolean;
  notes?: string | null;
};
type Employee = { id: number | string; code?: string; position?: string; department?: string; metadata?: { name?: string; document?: string }; user?: { name?: string; email?: string } };
type Affiliation = { id: number; employee_id: number; entity_type: string; entity_id: number; valid_from: string; valid_to?: string | null; status: string; entity_legal_name?: string; entity_nit?: string };
type Party = { id: number; name?: string; legal_name?: string; tax_id?: string };

const entityTypes = [
  ["EPS", "EPS"],
  ["PENSION", "Fondo de pensiones"],
  ["ARL", "ARL"],
  ["CAJA_COMPENSACION", "Caja de compensacion"],
  ["ICBF", "ICBF"]
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyEntity() {
  return { entity_type: "EPS", internal_code: "", nit: "", verification_digit: "", legal_name: "", trade_name: "", official_code: "", active: true, valid_from: today(), valid_to: "", accounting_party_id: "", notes: "" };
}

function employeeName(employee?: Employee) {
  return employee?.metadata?.name || employee?.user?.name || employee?.code || (employee ? `Empleado ${employee.id}` : "");
}

export default function LaborEntitiesPage() {
  const [entities, setEntities] = useState<LaborEntity[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [entityModal, setEntityModal] = useState<null | { mode: "create" | "edit"; entity?: LaborEntity }>(null);
  const [entityForm, setEntityForm] = useState(emptyEntity());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [affiliationForm, setAffiliationForm] = useState({ entity_type: "EPS", entity_id: "", valid_from: today(), valid_to: "", status: "activa" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [entityData, employeeData, partyData] = await Promise.all([
        api<LaborEntity[]>("/api/v1/talento-humano/entidades?limit=500", { cache: "no-store" }).catch(() => []),
        api<Employee[]>("/api/v1/talento-humano/empleados?active=true", { cache: "no-store" }).catch(() => []),
        api<Party[]>("/api/v1/accounting/third-parties?limit=300", { cache: "no-store" }).catch(() => [])
      ]);
      setEntities(Array.isArray(entityData) ? entityData : []);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
    } finally {
      setLoading(false);
    }
  }

  async function loadAffiliations(employeeId = selectedEmployeeId) {
    if (!employeeId) {
      setAffiliations([]);
      return;
    }
    const data = await api<Affiliation[]>(`/api/v1/talento-humano/empleados/${employeeId}/afiliaciones`, { cache: "no-store" }).catch(() => []);
    setAffiliations(Array.isArray(data) ? data : []);
  }

  useEffect(() => { void load(); }, []);

  const filteredEntities = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entities.filter((entity) => {
      if (typeFilter && entity.entity_type !== typeFilter) return false;
      if (!term) return true;
      return [entity.internal_code, entity.nit, entity.legal_name, entity.trade_name, entity.accounting_party_name, entity.accounting_party_tax_id]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [entities, query, typeFilter]);

  const availableEntities = useMemo(() => entities.filter((entity) => entity.active && entity.entity_type === affiliationForm.entity_type), [affiliationForm.entity_type, entities]);

  function openEntity(entity?: LaborEntity) {
    if (entity) {
      setEntityModal({ mode: "edit", entity });
      setEntityForm({
        entity_type: entity.entity_type,
        internal_code: entity.internal_code || "",
        nit: entity.nit || "",
        verification_digit: entity.verification_digit || "",
        legal_name: entity.legal_name || "",
        trade_name: entity.trade_name || "",
        official_code: entity.official_code || "",
        active: entity.active !== false,
        valid_from: String(entity.valid_from || "").slice(0, 10),
        valid_to: entity.valid_to ? String(entity.valid_to).slice(0, 10) : "",
        accounting_party_id: entity.accounting_party_id ? String(entity.accounting_party_id) : "",
        notes: entity.notes || ""
      });
    } else {
      setEntityModal({ mode: "create" });
      setEntityForm(emptyEntity());
    }
  }

  async function saveEntity() {
    if (!entityModal) return;
    setSaving(true);
    try {
      const payload = {
        ...entityForm,
        valid_to: entityForm.valid_to || null,
        accounting_party_id: entityForm.accounting_party_id ? Number(entityForm.accounting_party_id) : null
      };
      const saved = entityModal.mode === "edit" && entityModal.entity
        ? await api<LaborEntity>(`/api/v1/talento-humano/entidades/${entityModal.entity.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<LaborEntity>("/api/v1/talento-humano/entidades", { method: "POST", body: JSON.stringify(payload) });
      setEntities((current) => entityModal.mode === "edit" ? current.map((entity) => entity.id === saved.id ? saved : entity) : [saved, ...current]);
      setEntityModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveAffiliation() {
    if (!selectedEmployeeId) return;
    setSaving(true);
    try {
      await api<Affiliation>(`/api/v1/talento-humano/empleados/${selectedEmployeeId}/afiliaciones`, {
        method: "POST",
        body: JSON.stringify({ ...affiliationForm, entity_id: Number(affiliationForm.entity_id), valid_to: affiliationForm.valid_to || null })
      });
      setAffiliationForm({ entity_type: "EPS", entity_id: "", valid_from: today(), valid_to: "", status: "activa" });
      await loadAffiliations(selectedEmployeeId);
    } finally {
      setSaving(false);
    }
  }

  async function closeAffiliation(row: Affiliation) {
    const validTo = window.prompt("Fecha final de vigencia (YYYY-MM-DD)", today());
    if (!validTo) return;
    await api<Affiliation>(`/api/v1/talento-humano/afiliaciones/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "inactiva", valid_to: validTo })
    });
    await loadAffiliations(selectedEmployeeId);
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-2xl font-semibold">Entidades y afiliaciones</h1>
          <p className="mt-1 text-sm text-neutral-600">Maestro de EPS, pension, ARL, caja, ICBF y vigencias por empleado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => openEntity()} type="button"><Plus size={16} /> Nueva entidad</button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        {entityTypes.map(([value, label]) => <Kpi key={value} label={label} value={entities.filter((entity) => entity.entity_type === value).length} />)}
      </section>

      <section className="rounded-md border border-line bg-white p-3">
        <div className="grid gap-2 md:grid-cols-[220px_1fr]">
          <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Todos los tipos</option>
            {entityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar por codigo, NIT, razon social o tercero" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-3">Entidad</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">NIT</th>
                <th className="px-3 py-3">Vigencia</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Tercero contable</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntities.map((entity) => (
                <tr className="border-t border-line" key={entity.id}>
                  <td className="px-3 py-3"><span className="font-semibold">{entity.legal_name}</span><span className="block text-xs text-neutral-500">{entity.internal_code} {entity.trade_name ? `- ${entity.trade_name}` : ""}</span></td>
                  <td className="px-3 py-3">{entity.entity_type}</td>
                  <td className="px-3 py-3">{entity.nit}{entity.verification_digit ? `-${entity.verification_digit}` : ""}</td>
                  <td className="px-3 py-3">{String(entity.valid_from).slice(0, 10)} - {entity.valid_to ? String(entity.valid_to).slice(0, 10) : "sin fin"}</td>
                  <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${entity.active ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{entity.active ? "Activa" : "Inactiva"}</span></td>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${entity.accounting_party_id ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}><Link2 size={13} /> {entity.accounting_party_id ? "Enlazada" : "Pendiente"}</span>{entity.nit_mismatch ? <span className="ml-2 rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">NIT difiere</span> : null}<span className="mt-1 block text-xs text-neutral-500">{entity.accounting_party_legal_name || entity.accounting_party_name || ""}</span></td>
                  <td className="px-3 py-3 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={() => openEntity(entity)} type="button"><Pencil size={14} /> Editar</button></td>
                </tr>
              ))}
              {!filteredEntities.length ? <tr><td className="px-3 py-8 text-center text-neutral-500" colSpan={7}>Sin entidades para mostrar.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Afiliaciones por empleado</h2>
            <p className="mt-1 text-sm text-neutral-600">Registra historial por tipo de entidad, sin sobrescribir vigencias anteriores.</p>
          </div>
          <UserRoundCheck className="text-apex" size={22} />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1.2fr)_160px_minmax(220px,1fr)_150px_150px_120px_auto]">
          <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={selectedEmployeeId} onChange={(event) => { setSelectedEmployeeId(event.target.value); void loadAffiliations(event.target.value); }}>
            <option value="">Seleccionar empleado</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.code || "sin codigo"}</option>)}
          </select>
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
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={!selectedEmployeeId || !affiliationForm.entity_id || saving} onClick={() => void saveAffiliation()} type="button"><Save size={15} /> Guardar</button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Entidad</th><th className="px-3 py-3">Vigencia</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead>
            <tbody>
              {affiliations.map((row) => (
                <tr className="border-t border-line" key={row.id}>
                  <td className="px-3 py-3">{row.entity_type}</td>
                  <td className="px-3 py-3"><span className="font-semibold">{row.entity_legal_name || row.entity_id}</span><span className="block text-xs text-neutral-500">{row.entity_nit || ""}</span></td>
                  <td className="px-3 py-3">{String(row.valid_from).slice(0, 10)} - {row.valid_to ? String(row.valid_to).slice(0, 10) : "vigente"}</td>
                  <td className="px-3 py-3">{row.status}</td>
                  <td className="px-3 py-3 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={() => void closeAffiliation(row)} type="button">Cerrar vigencia</button></td>
                </tr>
              ))}
              {!affiliations.length ? <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={5}>Selecciona un empleado para ver su historial.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {entityModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/45 p-4" role="dialog" aria-modal="true">
          <section className="w-full max-w-3xl rounded-md border border-line bg-white shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div><p className="text-xs font-semibold uppercase text-apex">Entidad laboral</p><h2 className="mt-1 text-xl font-semibold">{entityModal.mode === "edit" ? "Editar entidad" : "Nueva entidad"}</h2></div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-neutral-600 hover:bg-paper" onClick={() => setEntityModal(null)} type="button" aria-label="Cerrar"><X size={17} /></button>
            </header>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Field label="Tipo"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={entityForm.entity_type} onChange={(event) => setEntityForm((current) => ({ ...current, entity_type: event.target.value }))}>{entityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Codigo interno"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.internal_code} onChange={(event) => setEntityForm((current) => ({ ...current, internal_code: event.target.value }))} /></Field>
              <Field label="NIT"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.nit} onChange={(event) => setEntityForm((current) => ({ ...current, nit: event.target.value }))} /></Field>
              <Field label="Digito verificacion"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.verification_digit} onChange={(event) => setEntityForm((current) => ({ ...current, verification_digit: event.target.value }))} /></Field>
              <Field label="Razon social"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.legal_name} onChange={(event) => setEntityForm((current) => ({ ...current, legal_name: event.target.value }))} /></Field>
              <Field label="Nombre comercial"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.trade_name} onChange={(event) => setEntityForm((current) => ({ ...current, trade_name: event.target.value }))} /></Field>
              <Field label="Codigo oficial"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.official_code} onChange={(event) => setEntityForm((current) => ({ ...current, official_code: event.target.value }))} /></Field>
              <Field label="Tercero contable"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={entityForm.accounting_party_id} onChange={(event) => setEntityForm((current) => ({ ...current, accounting_party_id: event.target.value }))}><option value="">Pendiente de enlace</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name || party.name} - {party.tax_id || "sin NIT"}</option>)}</select></Field>
              <Field label="Vigencia desde"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={entityForm.valid_from} onChange={(event) => setEntityForm((current) => ({ ...current, valid_from: event.target.value }))} /></Field>
              <Field label="Vigencia hasta"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={entityForm.valid_to} onChange={(event) => setEntityForm((current) => ({ ...current, valid_to: event.target.value }))} /></Field>
              <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={entityForm.active} onChange={(event) => setEntityForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /> Entidad activa</label>
              <Field label="Observaciones"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.notes} onChange={(event) => setEntityForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            </div>
            <footer className="flex justify-end gap-2 border-t border-line p-4">
              <button className="h-10 rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => setEntityModal(null)} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={() => void saveEntity()} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <article className="rounded-md border border-line bg-white p-4"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs font-semibold uppercase text-neutral-500">{label}</p></article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>{children}</label>;
}
