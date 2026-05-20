"use client";

import { api } from "@/lib/api";
import { ActionCard } from "@/components/ui/ActionCard";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ArrowLeft, Download, Edit3, FileText, Plus, Save, Search, Upload } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Part = { id?: number; name: string; quantity: number; unit: string; description: string };
type Manual = { id?: string; title: string; file_name: string; mime_type?: string; size_bytes?: number; file_url?: string; base64_data?: string; notes?: string };
type ServiceReference = {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string;
  estimated_minutes: number;
  brand: string;
  model: string;
  active: boolean;
  parts: Part[];
  manuals?: Manual[];
  total_pieces: number;
};

const categories = ["muebles", "colchones", "electrodomesticos", "cocina", "oficina", "decoracion", "iluminacion", "textiles", "otros"];
const emptyPart = { name: "", quantity: 1, unit: "und", description: "" };
const emptyForm = { code: "", name: "", category: "muebles", description: "", estimated_minutes: 60, brand: "", model: "", active: true, parts: [emptyPart] as Part[], manuals: [] as Manual[] };
const csvHeaders = "code,name,category,description,estimated_minutes,brand,model,part_name,part_quantity,part_unit,part_description,manual_title,manual_url,manual_notes";

function readFile(file: File): Promise<Manual> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      title: file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      base64_data: String(reader.result || ""),
      notes: ""
    });
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function downloadTemplate() {
  const example = [
    csvHeaders,
    "REF-001,Sofa modular,muebles,Montaje sofa modular,90,APEX,SM-2026,Estructura,1,und,Verificar tornilleria,Manual montaje,https://ejemplo.com/manual.pdf,Usar antes de inspeccion",
    "REF-001,Sofa modular,muebles,Montaje sofa modular,90,APEX,SM-2026,Cojineria,3,und,Validar costuras,,,"
  ].join("\n");
  const blob = new Blob([example], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plantilla-referencias-servicio.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function manualHref(manual: Manual) {
  return manual.base64_data || manual.file_url || "";
}

export default function ServiceReferencesPage() {
  const [references, setReferences] = useState<ServiceReference[]>([]);
  const [selected, setSelected] = useState<ServiceReference | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    setReferences(await api<ServiceReference[]>(`/api/v1/services/references${params.size ? `?${params.toString()}` : ""}`));
  }

  useEffect(() => {
    const timeout = setTimeout(() => load().catch(() => undefined), 250);
    return () => clearTimeout(timeout);
  }, [category, search]);

  const stats = useMemo(() => ({
    total: references.length,
    parts: references.reduce((sum, item) => sum + item.parts.length, 0),
    manuals: references.reduce((sum, item) => sum + (item.manuals?.length || 0), 0),
    active: references.filter((item) => item.active).length
  }), [references]);

  function reset() {
    setSelected(null);
    setForm({ ...emptyForm, parts: [{ ...emptyPart }], manuals: [] });
    setShowForm(true);
  }

  function edit(reference: ServiceReference) {
    setSelected(reference);
    setForm({
      code: reference.code,
      name: reference.name,
      category: reference.category,
      description: reference.description || "",
      estimated_minutes: reference.estimated_minutes,
      brand: reference.brand || "",
      model: reference.model || "",
      active: reference.active,
      parts: reference.parts.length ? reference.parts.map((part) => ({ name: part.name, quantity: part.quantity, unit: part.unit, description: part.description || "" })) : [{ ...emptyPart }],
      manuals: reference.manuals || []
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.code || !form.name || form.parts.some((part) => !part.name)) {
      setError("Codigo, nombre y piezas son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const path = selected ? `/api/v1/services/references/${selected.id}` : "/api/v1/services/references";
      await api<ServiceReference>(path, { method: selected ? "PUT" : "POST", body: JSON.stringify(form) });
      setMessage(selected ? "Referencia actualizada." : "Referencia creada.");
      setShowForm(false);
      setSelected(null);
      setForm({ ...emptyForm, parts: [{ ...emptyPart }], manuals: [] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar la referencia.");
    } finally {
      setSaving(false);
    }
  }

  async function addManuals(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const manuals = await Promise.all(files.map(readFile));
      setForm((prev) => ({ ...prev, manuals: [...prev.manuals, ...manuals] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron adjuntar documentos.");
    } finally {
      event.target.value = "";
    }
  }

  async function onCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    setImportRows(rows);
    setShowImport(true);
    event.target.value = "";
  }

  async function importCsv() {
    if (!importRows.length) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ created: number; updated: number; skipped: number }>("/api/v1/services/references/import", {
        method: "POST",
        body: JSON.stringify({ rows: importRows })
      });
      setMessage(`Carga masiva lista: ${result.created} creadas, ${result.updated} actualizadas, ${result.skipped} omitidas.`);
      setShowImport(false);
      setImportRows([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible importar la plantilla.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={16} /> Volver a servicios</Link>
          <p className="text-sm font-medium text-apex">Servicios</p>
          <h1 className="text-3xl font-semibold">Referencias de servicio</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Maestro tecnico para modelos, piezas, tiempos, manuales, guias y carga masiva por CSV.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-paper" onClick={downloadTemplate} type="button"><Download size={16} /> Plantilla CSV</button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-paper">
            <Upload size={16} /> Cargar CSV
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={onCsv} />
          </label>
          <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={reset} type="button"><Plus size={16} /> Nueva referencia</button>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Referencias" value={stats.total} />
        <Metric label="Activas" value={stats.active} />
        <Metric label="Piezas" value={stats.parts} />
        <Metric label="Manuales/guias" value={stats.manuals} />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <ActionCard title="Nueva referencia" detail="Crear ficha tecnica, piezas y documentos." icon={Plus} onClick={reset} primary />
        <ActionCard title="Carga masiva" detail="Sube referencias y piezas desde una plantilla CSV." icon={Upload} onClick={() => setShowImport(true)} />
        <ActionCard title="Documentos tecnicos" detail="Manuales visibles para el tecnico durante la inspeccion." icon={FileText} onClick={() => undefined} />
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por codigo, nombre, marca o modelo" />
          </label>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todas las categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {references.map((reference) => (
            <button className={`rounded-md border p-4 text-left transition hover:bg-paper ${selected?.id === reference.id ? "border-apex" : "border-line"}`} key={reference.id} onClick={() => edit(reference)} type="button">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase text-apex">{reference.category}</span>
                <span className="rounded-md bg-paper px-2 py-1 font-mono text-xs">{reference.code}</span>
              </div>
              <h3 className="font-semibold">{reference.name}</h3>
              <p className="mt-1 text-sm text-neutral-500">{[reference.brand, reference.model].filter(Boolean).join(" / ") || "Sin marca/modelo"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                <span className="rounded-md bg-paper px-2 py-1">{reference.parts.length} pieza(s)</span>
                <span className="rounded-md bg-paper px-2 py-1">{reference.estimated_minutes} min</span>
                <span className="rounded-md bg-paper px-2 py-1">{reference.manuals?.length || 0} doc.</span>
              </div>
            </button>
          ))}
          {!references.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-600 md:col-span-2 xl:col-span-3">No hay referencias para mostrar.</p> : null}
        </div>
      </section>

      {showForm ? (
        <ModalFrame title={selected ? "Editar referencia" : "Nueva referencia"} onClose={() => setShowForm(false)} maxWidth="max-w-5xl">
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-4">
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo *" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
              <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Marca" value={form.brand} onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Modelo" value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm md:col-span-3" placeholder="Nombre *" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={1} value={form.estimated_minutes} onChange={(event) => setForm((prev) => ({ ...prev, estimated_minutes: Number(event.target.value) }))} />
              <textarea className="min-h-20 rounded-md border border-line px-3 py-2 text-sm md:col-span-4" placeholder="Descripcion tecnica o alcance" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </section>

            <section className="rounded-md border border-line p-3">
              <div className="mb-3 flex items-center justify-between">
                <div><h2 className="text-sm font-semibold">Piezas para inspeccion</h2><p className="text-xs text-neutral-500">Estas piezas aparecen al tecnico durante la validacion.</p></div>
                <button className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-paper" onClick={() => setForm((prev) => ({ ...prev, parts: [...prev.parts, { ...emptyPart }] }))} type="button">Agregar pieza</button>
              </div>
              <div className="space-y-2">
                {form.parts.map((part, index) => (
                  <div className="grid gap-2 md:grid-cols-[1fr_80px_90px_1fr_40px]" key={index}>
                    <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Pieza *" value={part.name} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} />
                    <input className="h-10 rounded-md border border-line px-2 text-sm" type="number" min={0.01} value={part.quantity} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) }))} />
                    <input className="h-10 rounded-md border border-line px-2 text-sm" value={part.unit} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item) }))} />
                    <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Nota de revision" value={part.description} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} />
                    <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => setForm((prev) => ({ ...prev, parts: prev.parts.filter((_, itemIndex) => itemIndex !== index) }))} type="button">-</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-line p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="text-sm font-semibold">Manuales y guias</h2><p className="text-xs text-neutral-500">PDF o imagenes que el tecnico podra abrir durante la inspeccion.</p></div>
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper">
                  <Upload size={14} /> Adjuntar
                  <input className="hidden" type="file" multiple accept="application/pdf,image/*" onChange={addManuals} />
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {form.manuals.map((manual, index) => (
                  <div className="rounded-md border border-line p-3" key={`${manual.file_name}-${index}`}>
                    <input className="h-9 w-full rounded-md border border-line px-2 text-sm font-medium" value={manual.title} onChange={(event) => setForm((prev) => ({ ...prev, manuals: prev.manuals.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} />
                    <p className="mt-1 truncate text-xs text-neutral-500">{manual.file_name || manual.file_url}</p>
                    <textarea className="mt-2 min-h-16 w-full rounded-md border border-line px-2 py-1 text-sm" placeholder="Notas de uso" value={manual.notes || ""} onChange={(event) => setForm((prev) => ({ ...prev, manuals: prev.manuals.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item) }))} />
                    <div className="mt-2 flex gap-2">
                      {manualHref(manual) ? <a className="inline-flex h-9 items-center rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" href={manualHref(manual)} target="_blank" rel="noreferrer">Abrir</a> : null}
                      <button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => setForm((prev) => ({ ...prev, manuals: prev.manuals.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Quitar</button>
                    </div>
                  </div>
                ))}
                {!form.manuals.length ? <p className="rounded-md bg-paper p-3 text-sm text-neutral-600">Sin manuales adjuntos.</p> : null}
              </div>
            </section>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setShowForm(false)} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} onClick={save} type="button"><Save size={16} /> Guardar referencia</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {showImport ? (
        <ModalFrame title="Carga masiva de referencias" onClose={() => setShowImport(false)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Usa la plantilla CSV. Varias filas con el mismo codigo se agrupan como una referencia con varias piezas.</p>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={downloadTemplate} type="button"><Download size={16} /> Descargar plantilla</button>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white">
                <Upload size={16} /> Seleccionar CSV
                <input className="hidden" type="file" accept=".csv,text/csv" onChange={onCsv} />
              </label>
            </div>
            <div className="rounded-md border border-line bg-paper p-3 text-sm text-neutral-700">{importRows.length} fila(s) listas para importar.</div>
            <div className="max-h-72 overflow-auto rounded-md border border-line">
              <table className="w-full min-w-[720px] text-sm">
                <tbody>
                  {importRows.slice(0, 8).map((row, index) => (
                    <tr className="border-b border-line" key={index}>
                      <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.part_name}</td>
                      <td className="px-3 py-2">{row.manual_title || row.manual_url}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="h-10 w-full rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-60" disabled={!importRows.length || saving} onClick={importCsv} type="button">Importar referencias</button>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
