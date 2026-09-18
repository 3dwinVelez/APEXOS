"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Clock3, Pencil, Percent, Plus, RefreshCw, Save, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

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

const parameterPresets = [
  ["JORNADA_NOCTURNA_INICIO", "Inicio jornada nocturna", "hour"],
  ["JORNADA_NOCTURNA_FIN", "Fin jornada nocturna", "hour"],
  ["MAX_HE_DIARIO", "Maximo diario de horas extra", "hour"],
  ["MAX_HE_SEMANAL", "Maximo semanal de horas extra", "hour"],
  ["JORNADA_ORDINARIA_SEMANAL", "Jornada ordinaria semanal", "hour"],
  ["KILOMETRAJE_INUSUAL", "Umbral kilometraje inusual", "km"]
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyParameter() {
  return { country: "CO", code: "JORNADA_NOCTURNA_INICIO", name: "Inicio jornada nocturna", value: "19", unit: "hour", valid_from: today(), valid_to: "", priority: 100, active: true, source_note: "" };
}

function emptyConcept() {
  return { country: "CO", code: "RECARGO_NOCTURNO", name: "Recargo nocturno ordinario", value_type: "porcentaje_adicional", percent: "35", factor: "1.35", unit: "hour", valid_from: today(), valid_to: "", priority: 100, active: true, source_note: "" };
}

export default function LaborConfigurationPage() {
  const [parameters, setParameters] = useState<LaborParameter[]>([]);
  const [concepts, setConcepts] = useState<SurchargeConcept[]>([]);
  const [country, setCountry] = useState("CO");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parameterModal, setParameterModal] = useState<null | { mode: "create" | "edit"; row?: LaborParameter }>(null);
  const [conceptModal, setConceptModal] = useState<null | { mode: "create" | "edit"; row?: SurchargeConcept }>(null);
  const [parameterForm, setParameterForm] = useState(emptyParameter());
  const [conceptForm, setConceptForm] = useState(emptyConcept());

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ parameters: LaborParameter[]; concepts: SurchargeConcept[] }>(`/api/v1/talento-humano/configuracion-laboral?all=1&country=${country}`, { cache: "no-store" });
      setParameters(Array.isArray(data.parameters) ? data.parameters : []);
      setConcepts(Array.isArray(data.concepts) ? data.concepts : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [country]);

  const activeNightStart = useMemo(() => parameters.find((row) => row.active && row.code === "JORNADA_NOCTURNA_INICIO"), [parameters]);
  const activeNightEnd = useMemo(() => parameters.find((row) => row.active && row.code === "JORNADA_NOCTURNA_FIN"), [parameters]);
  const activeDailyExtra = useMemo(() => parameters.find((row) => row.active && row.code === "MAX_HE_DIARIO"), [parameters]);
  const activeWeeklyExtra = useMemo(() => parameters.find((row) => row.active && row.code === "MAX_HE_SEMANAL"), [parameters]);

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="text-lg font-semibold">Parámetros laborales</h2><p className="mt-1 text-sm text-neutral-600">Aquí se define desde qué hora aplica la jornada nocturna y los límites de alerta.</p></div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => openParameter()} type="button"><Plus size={16} /> Nuevo parámetro</button>
        </div>
        <DataTable rows={parameters} kind="parameter" onEdit={(row) => openParameter(row as LaborParameter)} />
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="text-lg font-semibold">Conceptos de recargo</h2><p className="mt-1 text-sm text-neutral-600">Diferencia porcentaje adicional, factor total e informativo para evitar ambiguedades.</p></div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => openConcept()} type="button"><Plus size={16} /> Nuevo concepto</button>
        </div>
        <DataTable rows={concepts} kind="concept" onEdit={(row) => openConcept(row as SurchargeConcept)} />
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/45 p-4" role="dialog" aria-modal="true">
      <section className="w-full max-w-3xl rounded-md border border-line bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-line p-4"><div><p className="text-xs font-semibold uppercase text-apex">Configuración laboral</p><h2 className="mt-1 text-xl font-semibold">{title}</h2></div><button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-neutral-600 hover:bg-paper" onClick={onClose} type="button" aria-label="Cerrar"><X size={17} /></button></header>
        <div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-line p-4"><button className="h-10 rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={onClose} type="button">Cancelar</button><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:bg-neutral-300" disabled={saving} onClick={onSave} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar"}</button></footer>
      </section>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <article className="rounded-md border border-line bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-apex">{icon}</span><span className="text-xl font-semibold">{value}</span></div><p className="mt-2 text-xs font-semibold uppercase text-neutral-500">{label}</p></article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-neutral-800">{label}</span>{children}</label>;
}
