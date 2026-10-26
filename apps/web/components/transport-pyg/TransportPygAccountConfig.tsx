"use client";

import {
  getTransportPygAccountConfiguration,
  saveTransportPygAccountConfiguration,
  type TransportPygAccountConcept,
  type TransportPygAccountConfiguration
} from "@/lib/api";
import {
  ACCOUNT_LENGTH_HINT, KIND_LABELS, KIND_SECTIONS, KINDS, LEDGER_PRODUCT_LABEL, PENDING_MESSAGE, SECTION_LABELS, SUBTOTAL_KINDS,
  conceptRowKey, validateAccountConcepts, validationErrorLabel,
  type AccountConceptDraft, type ConceptKind, type ConceptSection, type ConceptValidationError, type PucRange
} from "@/lib/transport-pyg-account-config";
import { AlertTriangle, FileSpreadsheet, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type RemoteState = TransportPygAccountConfiguration | null;

function toDraft(concept: TransportPygAccountConcept): AccountConceptDraft {
  return {
    code: concept.code,
    name: concept.name,
    section: concept.section,
    kind: concept.kind,
    order: concept.order,
    ranges: (concept.ranges || []).map((range) => ({ ...range })),
    exclusions: (concept.exclusions || []).map((range) => ({ ...range }))
  };
}

function toPayload(concepts: AccountConceptDraft[]) {
  return concepts.map((item) => ({
    code: item.code, name: item.name, section: item.section, kind: item.kind, order: item.order,
    ranges: item.ranges.map((range) => ({ ...range })), exclusions: item.exclusions.map((range) => ({ ...range }))
  }));
}

function SectionOf({ concept, onChange, canWrite }: { concept: AccountConceptDraft; onChange: (next: AccountConceptDraft) => void; canWrite: boolean }) {
  const allowed = KIND_SECTIONS[concept.kind];
  return (
    <label className="text-xs text-content-muted">
      Sección
      <select
        className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-xs text-content-strong disabled:opacity-60"
        disabled={!canWrite || allowed.length < 2}
        onChange={(event) => onChange({ ...concept, section: event.target.value as ConceptSection })}
        value={concept.section}
      >
        {allowed.map((section) => <option key={section} value={section}>{SECTION_LABELS[section]}</option>)}
      </select>
    </label>
  );
}

export default function TransportPygAccountConfig({ canWrite, onSaved }: { canWrite: boolean; onSaved: () => void }) {
  const [remote, setRemote] = useState<RemoteState>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"accounting" | "operational">("operational");
  const [concepts, setConcepts] = useState<AccountConceptDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getTransportPygAccountConfiguration();
      setRemote(next);
      setSource(next.source);
      const stored = next.config && next.config.concepts?.length ? next.config.concepts.map(toDraft) : next.proposal.concepts.map(toDraft);
      setConcepts(stored);
      setDirty(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible leer la configuración de rangos PUC.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const validation = useMemo(() => validateAccountConcepts(concepts), [concepts]);
  const errorsByConcept = useMemo(() => {
    const map = new Map<string, ConceptValidationError[]>();
    for (const item of validation) {
      const key = item.concept_code || "";
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [validation]);

  const activeSource = remote?.source || "operational";

  function useExcelProposal() {
    if (!window.confirm("¿Reemplazar el borrador actual con la estructura del Excel (hoja Resumen de presupuesto.xlsx)? No se guarda hasta que confirmes.")) return;
    if (!remote?.proposal) return;
    setConcepts(remote.proposal.concepts.map(toDraft));
    setSource("accounting");
    setDirty(true);
    setNotice("Propuesta del Excel cargada en el borrador. Revisa y guarda para activarla.");
    setError("");
  }

  function updateConcept(index: number, next: AccountConceptDraft) {
    setConcepts((current) => current.map((item, itemIndex) => itemIndex === index ? next : item));
    setDirty(true);
  }

  function setRange(index: number, list: "ranges" | "exclusions", rangeIndex: number, patch: Partial<PucRange>) {
    setConcepts((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const rows = item[list].map((row, rowIndex) => rowIndex === rangeIndex ? { ...row, ...patch } : row);
      return { ...item, [list]: rows };
    }));
    setDirty(true);
  }

  function addRange(index: number, list: "ranges" | "exclusions") {
    setConcepts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [list]: [...item[list], { start: "", end: "" }] } : item));
    setDirty(true);
  }

  function removeRange(index: number, list: "ranges" | "exclusions", rangeIndex: number) {
    setConcepts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [list]: item[list].filter((_, rowIndex) => rowIndex !== rangeIndex) } : item));
    setDirty(true);
  }

  function createConcept() {
    const maxOrder = concepts.reduce((max, item) => Math.max(max, item.order || 0), 0);
    const next: AccountConceptDraft = {
      code: `NUEVO_CONCEPTO_${concepts.length + 1}`,
      name: "Nuevo concepto",
      section: "gastos_operativos",
      kind: "expense",
      order: maxOrder + 1,
      ranges: [],
      exclusions: []
    };
    setConcepts((current) => [...current, next]);
    setDirty(true);
  }

  function deleteConcept(code: string) {
    if (!window.confirm(`¿Eliminar el concepto ${code}? Se quitará al guardar; el reporte mostrará sus cuentas sin clasificar si existían.`)) return;
    setConcepts((current) => current.filter((item) => item.code !== code));
    setDirty(true);
  }

  async function save() {
    if (validation.length) {
      setError(`Corrige ${validation.length} error(es) de validación antes de guardar.`);
      setNotice("");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      await saveTransportPygAccountConfiguration({ source, concepts: toPayload(concepts) });
      setNotice(source === "accounting" ? "Estructura contable guardada: el reporte por vehículo ahora lee el libro con estos rangos PUC." : "Fuente operativa histórica restaurada.");
      setDirty(false);
      onSaved();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible guardar la configuración de rangos PUC.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreOperational() {
    if (dirty) {
      setError("Tienes cambios sin guardar en el borrador. Guárdalos antes de volver a la fuente operativa para no perderlos.");
      setNotice("");
      return;
    }
    if (!window.confirm("¿Volver a la fuente operativa histórica (liquidaciones, caja menor, nómina)? Los rangos guardados dejarán de aplicarse pero se conservan en la configuración de rangos PUC.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await saveTransportPygAccountConfiguration({ source: "operational", concepts: toPayload(concepts) });
      setNotice("Fuente operativa histórica restaurada; los rangos PUC guardados se conservan para cuando vuelvas a usar la estructura contable.");
      setDirty(false);
      onSaved();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible restaurar la fuente operativa.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="apex-section-card p-6 text-center text-sm text-content-muted">Leyendo la configuración de rangos PUC…</section>;

  return (
    <section className="apex-section-card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-content-strong">Rangos PUC · Estructura contable del PYG por vehículo</h2>
          <p className="text-xs text-content-muted">
            {activeSource === "accounting"
              ? `Fuente activa: ${LEDGER_PRODUCT_LABEL}. El reporte agrupa cada cuenta por los rangos configurados aquí; los subtotales se calculan con fórmulas conocidas por sección.`
              : `Fuente activa: operativa histórica (liquidaciones, caja menor, nómina). Usa «Usar estructura del Excel» para pasar al ${LEDGER_PRODUCT_LABEL}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${activeSource === "accounting" ? "border-apex/40 bg-apex/10 text-apex" : "border-line bg-surface-muted text-content-muted"}`}>
            {activeSource === "accounting" ? "FUENTE: ESTRUCTURA CONTABLE" : "FUENTE: OPERATIVA HISTÓRICA"}
          </span>
          {canWrite ? (
            <>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-apex px-3 text-sm font-semibold text-apex disabled:opacity-50" disabled={saving || !remote} onClick={useExcelProposal} type="button"><FileSpreadsheet size={16} /> Usar estructura del Excel</button>
              {activeSource === "accounting" ? (
                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-content-muted disabled:opacity-50" disabled={saving} onClick={() => void restoreOperational()} type="button"><RotateCcw size={16} /> Volver a fuente operativa</button>
              ) : null}
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || !canWrite} onClick={() => void save()} type="button"><Save size={16} /> {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Guardar"}</button>
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-muted/60 p-3 text-xs text-content-muted">
        <p>{ACCOUNT_LENGTH_HINT}</p>
        <p className="mt-1">Un rango es inclusivo (inicio y fin incluidos) y solo compara cuentas de su misma longitud. Las exclusiones deben caer dentro de algún rango del mismo concepto. No se admite solape entre conceptos: desambigua con exclusiones. Los conceptos sin rangos aparecen como “{PENDING_MESSAGE}”.</p>
        {activeSource === "accounting" ? <p className="mt-1 font-semibold text-content-strong">Los presupuestos de esta vista provienen de Presupuesto PUC (PYG Contable), por cuenta/sucursal/centro; el presupuesto operativo por placa no se usa.</p> : null}
      </div>

      {error ? <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><span>{error}</span></div> : null}
      {notice ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</p> : null}
      {validation.length ? <p className="text-xs font-semibold text-amber-400">El borrador tiene {validation.length} error(es); se detallan bajo cada concepto.</p> : null}

      <div className="space-y-3">
        {concepts.map((concept, index) => {
          const isSubtotal = SUBTOTAL_KINDS.includes(concept.kind);
          const errors = errorsByConcept.get(concept.code) || [];
          const pending = !isSubtotal && !concept.ranges.length;
          return (
            <article className="rounded-xl border border-line bg-surface p-3" data-concept-key={conceptRowKey(index)} data-slot="concept-card" key={conceptRowKey(index)}>
              <div className="grid gap-2 md:grid-cols-[90px_180px_1fr_170px_150px_40px]">
                <label className="text-xs text-content-muted">Orden
                  <input className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} min={1} onChange={(event) => updateConcept(index, { ...concept, order: Number(event.target.value) || 0 })} type="number" value={concept.order} />
                </label>
                <label className="text-xs text-content-muted">Código
                  <input className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 font-mono text-xs uppercase text-content-strong disabled:opacity-60" disabled={!canWrite} maxLength={60} onChange={(event) => updateConcept(index, { ...concept, code: event.target.value.toUpperCase() })} value={concept.code} />
                </label>
                <label className="text-xs text-content-muted">Nombre
                  <input aria-label={`Nombre del concepto ${index + 1}`} className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} maxLength={120} onChange={(event) => updateConcept(index, { ...concept, name: event.target.value })} value={concept.name} />
                </label>
                <label className="text-xs text-content-muted">Tipo
                  <select className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} onChange={(event) => {
                    const kind = event.target.value as ConceptKind;
                    updateConcept(index, { ...concept, kind, section: KIND_SECTIONS[kind][0] });
                  }} value={concept.kind}>
                    {KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
                  </select>
                </label>
                <SectionOf canWrite={canWrite} concept={concept} onChange={(next) => updateConcept(index, next)} />
                <div className="flex items-end justify-end pb-1">
                  {canWrite ? <button aria-label={`Eliminar ${concept.code}`} className="rounded-md border border-line p-2 text-content-muted hover:border-red-500/50 hover:text-red-400" onClick={() => deleteConcept(concept.code)} title="Eliminar concepto" type="button"><Trash2 size={15} /></button> : null}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {isSubtotal ? <span className="rounded-full bg-surface-muted px-2 py-0.5 font-bold text-content-muted">SUBTOTAL PROTEGIDO · SIN CUENTAS</span> : null}
                {pending ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-400">{PENDING_MESSAGE.toUpperCase()}</span> : null}
                {concept.kind === "informational" ? <span className="rounded-full bg-surface-muted px-2 py-0.5 font-bold text-content-muted">INFORMATIVA · NO SE RESTA DE LA NETA</span> : null}
              </div>

              {!isSubtotal ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-content-muted">Rangos PUC</p>
                    {concept.ranges.map((range, rangeIndex) => (
                      <div className="mt-1 flex items-center gap-2" key={`range-${rangeIndex}`}>
                        <input aria-label={`Inicio del rango ${rangeIndex + 1}`} className="h-8 w-28 rounded-md border border-line bg-surface px-2 font-mono text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} inputMode="numeric" maxLength={8} onChange={(event) => setRange(index, "ranges", rangeIndex, { start: event.target.value })} placeholder="41450101" value={range.start} />
                        <span className="text-content-subtle">–</span>
                        <input aria-label={`Fin del rango ${rangeIndex + 1}`} className="h-8 w-28 rounded-md border border-line bg-surface px-2 font-mono text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} inputMode="numeric" maxLength={8} onChange={(event) => setRange(index, "ranges", rangeIndex, { end: event.target.value })} placeholder="41999999" value={range.end} />
                        {canWrite ? <button aria-label="Quitar rango" className="rounded-md p-1 text-content-subtle hover:text-red-400" onClick={() => removeRange(index, "ranges", rangeIndex)} type="button"><Trash2 size={13} /></button> : null}
                      </div>
                    ))}
                    {canWrite ? <button className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-apex" onClick={() => addRange(index, "ranges")} type="button"><Plus size={13} /> Añadir rango</button> : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-content-muted">Exclusiones puntuales</p>
                    {concept.exclusions.map((range, exclusionIndex) => (
                      <div className="mt-1 flex items-center gap-2" key={`exclusion-${exclusionIndex}`}>
                        <input aria-label={`Inicio de la exclusión ${exclusionIndex + 1}`} className="h-8 w-28 rounded-md border border-line bg-surface px-2 font-mono text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} inputMode="numeric" maxLength={8} onChange={(event) => setRange(index, "exclusions", exclusionIndex, { start: event.target.value })} placeholder="41450501" value={range.start} />
                        <span className="text-content-subtle">–</span>
                        <input aria-label={`Fin de la exclusión ${exclusionIndex + 1}`} className="h-8 w-28 rounded-md border border-line bg-surface px-2 font-mono text-xs text-content-strong disabled:opacity-60" disabled={!canWrite} inputMode="numeric" maxLength={8} onChange={(event) => setRange(index, "exclusions", exclusionIndex, { end: event.target.value })} placeholder="41450501" value={range.end} />
                        {canWrite ? <button aria-label="Quitar exclusión" className="rounded-md p-1 text-content-subtle hover:text-red-400" onClick={() => removeRange(index, "exclusions", exclusionIndex)} type="button"><Trash2 size={13} /></button> : null}
                      </div>
                    ))}
                    {canWrite ? <button className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-apex" onClick={() => addRange(index, "exclusions")} type="button"><Plus size={13} /> Añadir exclusión</button> : null}
                  </div>
                </div>
              ) : null}

              {errors.length ? (
                <ul className="mt-2 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                  {errors.map((item) => <li key={`${item.code}-${item.message}`}><span className="font-semibold">{validationErrorLabel(item.code)}:</span> {item.message}</li>)}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>

      {canWrite ? <button className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-content-muted hover:text-content-strong" onClick={createConcept} type="button"><Plus size={16} /> Crear concepto</button> : <p className="text-xs text-content-muted">Consulta de solo lectura: requieres permiso de escritura en Contabilidad para editar.</p>}
    </section>
  );
}
