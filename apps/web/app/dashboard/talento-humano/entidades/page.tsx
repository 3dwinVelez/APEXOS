"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Link2, Pencil, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type LaborEntity = {
  id: number;
  entity_type: string;
  internal_code: string;
  nit: string;
  verification_digit?: string | null;
  legal_name: string;
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
type Party = { id: number; name?: string; legal_name?: string; tax_id?: string };

const entityTypes = [
  ["EPS", "EPS"],
  ["PENSION", "Fondo de pensiones"],
  ["FONDO_CESANTIAS", "Fondo de cesantias"],
  ["ARL", "ARL"],
  ["CAJA_COMPENSACION", "Caja de compensacion"],
  ["ICBF", "ICBF"],
  ["SENA", "SENA"]
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyEntity() {
  return { entity_type: "EPS", nit: "", verification_digit: "", legal_name: "", official_code: "", active: true, valid_from: today(), valid_to: "", accounting_party_id: "", notes: "" };
}

export default function LaborEntitiesPage() {
  const [mounted, setMounted] = useState(false);
  const [entities, setEntities] = useState<LaborEntity[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [entityModal, setEntityModal] = useState<null | { mode: "create" | "edit"; entity?: LaborEntity }>(null);
  const [entityForm, setEntityForm] = useState(emptyEntity());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [entityData, partyData] = await Promise.all([
        api<LaborEntity[]>("/api/v1/talento-humano/entidades?limit=500", { cache: "no-store" }).catch(() => []),
        api<Party[]>("/api/v1/accounting/third-parties?limit=300", { cache: "no-store" }).catch(() => [])
      ]);
      setEntities(Array.isArray(entityData) ? entityData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { void load(); }, []);

  const filteredEntities = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entities.filter((entity) => {
      if (typeFilter && entity.entity_type !== typeFilter) return false;
      if (!term) return true;
      return [entity.nit, entity.legal_name, entity.accounting_party_name, entity.accounting_party_tax_id]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [entities, query, typeFilter]);

  function openEntity(entity?: LaborEntity) {
    if (entity) {
      setEntityModal({ mode: "edit", entity });
      setEntityForm({
        entity_type: entity.entity_type,
        nit: entity.nit || "",
        verification_digit: entity.verification_digit || "",
        legal_name: entity.legal_name || "",
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

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-2xl font-semibold">Entidades y afiliaciones</h1>
          <p className="mt-1 text-sm text-neutral-600">Maestro de EPS, pension, cesantias, ARL, caja, ICBF, SENA y vigencias por empleado.</p>
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
                  <td className="px-3 py-3"><span className="font-semibold">{entity.legal_name}</span><span className="block text-xs text-neutral-500">{entity.official_code || entity.entity_type}</span></td>
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

      {mounted && entityModal ? createPortal((
        <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-neutral-950/45 p-2 pt-3 sm:p-4 sm:pt-6" role="dialog" aria-modal="true">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-line bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4">
              <div><p className="text-xs font-semibold uppercase text-apex">Entidad laboral</p><h2 className="mt-1 text-xl font-semibold">{entityModal.mode === "edit" ? "Editar entidad" : "Nueva entidad"}</h2></div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-neutral-600 hover:bg-paper" onClick={() => setEntityModal(null)} type="button" aria-label="Cerrar"><X size={17} /></button>
            </header>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">
              <Field label="Tipo"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={entityForm.entity_type} onChange={(event) => setEntityForm((current) => ({ ...current, entity_type: event.target.value }))}>{entityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="NIT"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.nit} onChange={(event) => setEntityForm((current) => ({ ...current, nit: event.target.value }))} /></Field>
              <Field label="Digito verificacion"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.verification_digit} onChange={(event) => setEntityForm((current) => ({ ...current, verification_digit: event.target.value }))} /></Field>
              <Field label="Razon social"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.legal_name} onChange={(event) => setEntityForm((current) => ({ ...current, legal_name: event.target.value }))} /></Field>
              <Field label="Codigo oficial"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.official_code} onChange={(event) => setEntityForm((current) => ({ ...current, official_code: event.target.value }))} /></Field>
              <Field label="Tercero contable"><select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" value={entityForm.accounting_party_id} onChange={(event) => setEntityForm((current) => ({ ...current, accounting_party_id: event.target.value }))}><option value="">Pendiente de enlace</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name || party.name} - {party.tax_id || "sin NIT"}</option>)}</select></Field>
              <Field label="Vigencia desde"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={entityForm.valid_from} onChange={(event) => setEntityForm((current) => ({ ...current, valid_from: event.target.value }))} /></Field>
              <Field label="Vigencia hasta"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={entityForm.valid_to} onChange={(event) => setEntityForm((current) => ({ ...current, valid_to: event.target.value }))} /></Field>
              <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm font-semibold"><input checked={entityForm.active} onChange={(event) => setEntityForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /> Entidad activa</label>
              <Field label="Observaciones"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={entityForm.notes} onChange={(event) => setEntityForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-white p-4">
              <button className="h-10 rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => setEntityModal(null)} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={() => void saveEntity()} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar"}</button>
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <article className="rounded-md border border-line bg-white p-4"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs font-semibold uppercase text-neutral-500">{label}</p></article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>{children}</label>;
}
