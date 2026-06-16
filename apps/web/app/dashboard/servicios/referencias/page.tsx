"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ArrowLeft, BookOpen, ChevronRight, Clock3, Download, Filter, Layers3, Plus, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
type ServiceType = { code: string; label: string; active: boolean };

const categories = ["muebles", "colchones", "electrodomesticos", "cocina", "oficina", "decoracion", "iluminacion", "textiles", "otros"];
const emptyPart = { name: "", quantity: 1, unit: "und", description: "" };
const emptyForm = { code: "", name: "", category: "muebles", description: "", estimated_minutes: 60, brand: "", model: "", active: true, parts: [emptyPart] as Part[], manuals: [] as Manual[] };
const defaultServiceTypes: ServiceType[] = [
  { code: "montaje", label: "Montaje", active: true },
  { code: "desmontaje", label: "Desmontaje", active: true },
  { code: "ambos", label: "Montaje y desmontaje", active: true }
];
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
  const router = useRouter();
  const [references, setReferences] = useState<ServiceReference[]>([]);
  const [selected, setSelected] = useState<ServiceReference | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [activeScope, setActiveScope] = useState("");
  const [documentationScope, setDocumentationScope] = useState("");
  const [sortBy, setSortBy] = useState("code");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(defaultServiceTypes);
  const [savingTypes, setSavingTypes] = useState(false);

  async function load() {
    try {
      const [referenceRows, typeRows] = await Promise.all([
        api<ServiceReference[]>("/api/v1/services/references"),
        api<ServiceType[]>("/api/v1/services/service-types").catch(() => defaultServiceTypes)
      ]);
      setReferences(referenceRows);
      setServiceTypes(typeRows.length ? typeRows : defaultServiceTypes);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cargar las referencias.");
      throw err;
    }
  }

  useEffect(() => {
    if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico") {
      router.replace("/dashboard/servicios");
      return;
    }
    load().catch(() => undefined);
  }, [router]);

  const stats = useMemo(() => ({
    total: references.length,
    parts: references.reduce((sum, item) => sum + item.parts.length, 0),
    manuals: references.reduce((sum, item) => sum + (item.manuals?.length || 0), 0),
    active: references.filter((item) => item.active).length
  }), [references]);
  const categoryCounts = useMemo(() => references.reduce<Record<string, number>>((counts, reference) => {
    counts[reference.category || "otros"] = (counts[reference.category || "otros"] || 0) + 1;
    return counts;
  }, {}), [references]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return references.filter((reference) => {
      const matchesTerm = !term || [reference.code, reference.name, reference.category, reference.brand, reference.model, reference.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(term));
      const matchesActive =
        !activeScope ||
        (activeScope === "active" && reference.active) ||
        (activeScope === "inactive" && !reference.active);
      const manuals = reference.manuals?.length || 0;
      const matchesDocuments =
        !documentationScope ||
        (documentationScope === "with_manuals" && manuals > 0) ||
        (documentationScope === "without_manuals" && manuals === 0) ||
        (documentationScope === "multi_part" && reference.parts.length > 1);
      return matchesTerm && (!category || reference.category === category) && matchesActive && matchesDocuments;
    }).sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "parts_desc") return b.parts.length - a.parts.length || a.code.localeCompare(b.code);
      if (sortBy === "manuals_desc") return (b.manuals?.length || 0) - (a.manuals?.length || 0) || a.code.localeCompare(b.code);
      if (sortBy === "time_asc") return a.estimated_minutes - b.estimated_minutes || a.code.localeCompare(b.code);
      return a.code.localeCompare(b.code);
    });
  }, [activeScope, category, documentationScope, references, search, sortBy]);
  const activeFilters = [category, activeScope, documentationScope].filter(Boolean).length + (search.trim() ? 1 : 0);

  function clearFilters() {
    setSearch("");
    setCategory("");
    setActiveScope("");
    setDocumentationScope("");
    setSortBy("code");
  }

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
    const partNames = form.parts.map((part) => part.name.trim().toLocaleLowerCase());
    if (new Set(partNames).size !== partNames.length) {
      setError("No puedes registrar dos piezas con el mismo nombre.");
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

  function updateServiceType(index: number, patch: Partial<ServiceType>) {
    setServiceTypes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function addServiceType() {
    setServiceTypes((current) => [...current, { code: "", label: "", active: true }]);
  }

  function removeServiceType(index: number) {
    setServiceTypes((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveServiceTypes() {
    const normalized = serviceTypes.map((item) => ({
      code: item.code.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_"),
      label: item.label.trim(),
      active: item.active !== false
    })).filter((item) => item.code && item.label);
    if (!normalized.length || !normalized.some((item) => item.active)) {
      setError("Registra al menos un tipo de servicio activo.");
      return;
    }
    if (new Set(normalized.map((item) => item.code)).size !== normalized.length) {
      setError("No puedes repetir codigos de tipos de servicio.");
      return;
    }
    setSavingTypes(true);
    setError("");
    try {
      const saved = await api<ServiceType[]>("/api/v1/services/service-types", {
        method: "PUT",
        body: JSON.stringify({ types: normalized })
      });
      setServiceTypes(saved);
      setMessage("Tipos de servicio actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar los tipos de servicio.");
    } finally {
      setSavingTypes(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-24 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="min-w-0">
          <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex md:border-0 md:bg-transparent md:px-0" href="/dashboard/servicios"><ArrowLeft size={16} /> Volver a servicios</Link>
          <p className="text-sm font-medium text-apex">Servicios</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Referencias de servicio</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Maestro tecnico para modelos, listas de piezas, tiempos, manuales, guias y carga masiva por CSV.</p>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="overflow-hidden rounded-md bg-[#081411] text-white shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-teal-100">
              <Sparkles size={14} /> Maestro tecnico de servicios
            </div>
            <h2 className="max-w-3xl text-2xl font-semibold leading-tight sm:text-3xl">Referencias y listas listas para mantener</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Compara fichas tecnicas, listas de piezas, tiempos y documentos sin abrir cada referencia. Edita solo cuando el maestro cambie.</p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button className="dark-primary-action col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#081411] sm:col-span-1" onClick={reset} type="button"><Plus size={17} /> Nueva referencia</button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" onClick={downloadTemplate} type="button"><Download size={16} /> Plantilla</button>
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10">
              <Upload size={16} /> Importar
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={onCsv} />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 text-sm sm:grid-cols-4">
          <Summary label="Referencias" value={stats.total} />
          <Summary label="Activas" value={stats.active} />
          <Summary label="Piezas configuradas" value={stats.parts} />
          <Summary label="Manuales y guias" value={stats.manuals} />
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 grid gap-2 sm:flex sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">Tipos de servicio</h2>
            <p className="mt-1 text-sm text-neutral-500">Controla las opciones disponibles al crear o editar una orden. Inactiva un tipo para ocultarlo sin perder historial.</p>
          </div>
          <div className="grid gap-2 sm:flex">
            <button className="h-10 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={addServiceType} type="button">Agregar tipo</button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={savingTypes} onClick={saveServiceTypes} type="button"><Save size={15} /> {savingTypes ? "Guardando..." : "Guardar tipos"}</button>
          </div>
        </div>
        <div className="space-y-2">
          {serviceTypes.map((item, index) => (
            <div className="grid gap-2 rounded-md border border-line p-2 md:grid-cols-[160px_1fr_110px_44px]" key={`${item.code}-${index}`}>
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="codigo" value={item.code} onChange={(event) => updateServiceType(index, { code: event.target.value })} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Nombre visible" value={item.label} onChange={(event) => updateServiceType(index, { label: event.target.value })} />
              <label className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold">
                <input checked={item.active !== false} onChange={(event) => updateServiceType(index, { active: event.target.checked })} type="checkbox" />
                Activo
              </label>
              <button className="h-10 rounded-md border border-line text-sm font-semibold hover:bg-paper" onClick={() => removeServiceType(index)} type="button">-</button>
            </div>
          ))}
        </div>
      </section>

      <section className="min-w-0 rounded-md border border-line bg-white shadow-sm">
        <div className="border-b border-line p-3 sm:p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-apex/10 text-apex"><SlidersHorizontal size={17} /></span>
              <div>
                <h2 className="font-semibold">Consulta de referencias</h2>
                <p className="text-sm text-neutral-500">Filtra y ordena el maestro tecnico sin recargar la pantalla.</p>
              </div>
            </div>
            {activeFilters ? <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600 hover:border-apex hover:text-apex" onClick={clearFilters} type="button"><RotateCcw size={15} /> Limpiar {activeFilters} filtro(s)</button> : null}
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={17} />
            <input className="h-12 w-full rounded-md border border-line bg-paper pl-10 pr-3 text-base outline-none transition focus:border-apex focus:bg-white md:text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por codigo, nombre, categoria, marca, modelo o descripcion" />
          </label>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition ${!category ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-600 hover:border-apex"}`} onClick={() => setCategory("")} type="button">Todas <span className="ml-1 opacity-70">{references.length}</span></button>
            {categories.filter((item) => categoryCounts[item]).map((item) => (
              <button className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold capitalize transition ${category === item ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-600 hover:border-apex"}`} key={item} onClick={() => setCategory(item)} type="button">{item} <span className="ml-1 opacity-70">{categoryCounts[item]}</span></button>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select className="h-11 rounded-md border border-line bg-white px-3 text-sm" value={activeScope} onChange={(event) => setActiveScope(event.target.value)}>
              <option value="">Cualquier estado</option>
              <option value="active">Solo activas</option>
              <option value="inactive">Solo inactivas</option>
            </select>
            <select className="h-11 rounded-md border border-line bg-white px-3 text-sm" value={documentationScope} onChange={(event) => setDocumentationScope(event.target.value)}>
              <option value="">Piezas y documentos</option>
              <option value="with_manuals">Con manuales</option>
              <option value="without_manuals">Sin manuales</option>
              <option value="multi_part">Con varias piezas</option>
            </select>
            <select className="h-11 rounded-md border border-line bg-white px-3 text-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="code">Codigo</option>
              <option value="name">Nombre</option>
              <option value="parts_desc">Mas piezas</option>
              <option value="manuals_desc">Mas documentos</option>
              <option value="time_asc">Menor tiempo estimado</option>
            </select>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Maestro de referencias</h2>
              <p className="text-sm text-neutral-500">{filtered.length} de {references.length} referencia(s) visibles</p>
            </div>
            <p className="hidden text-xs font-medium text-neutral-500 md:block">Selecciona una referencia para editar su ficha y listas de servicio.</p>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((reference) => (
              <button className="rounded-md border border-line p-3 text-left transition active:scale-[0.99] hover:border-apex hover:bg-paper" key={reference.id} onClick={() => edit(reference)} type="button">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-paper px-2 py-1 font-mono text-xs font-semibold text-apex">{reference.code}</span>
                      <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${reference.active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>{reference.active ? "Activa" : "Inactiva"}</span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold">{reference.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{[reference.brand, reference.model].filter(Boolean).join(" / ") || "Sin marca o modelo"}</p>
                  </div>
                  <ChevronRight className="shrink-0 text-apex" size={18} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-neutral-600">
                  <span className="rounded-md bg-paper px-2 py-2 text-center">{reference.parts.length} pieza(s)</span>
                  <span className="rounded-md bg-paper px-2 py-2 text-center">{reference.manuals?.length || 0} doc.</span>
                  <span className="rounded-md bg-paper px-2 py-2 text-center">{reference.estimated_minutes} min</span>
                </div>
              </button>
            ))}
          </div>

          {filtered.length ? (
            <div className="hidden overflow-x-auto rounded-md border border-line md:block">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead className="bg-paper text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Codigo y estado</th>
                    <th className="px-4 py-3">Referencia</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3 text-center">Configuracion tecnica</th>
                    <th className="px-4 py-3">Tiempo</th>
                    <th className="px-4 py-3 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((reference) => (
                    <tr className="group transition hover:bg-paper" key={reference.id}>
                      <td className="px-4 py-3 align-top">
                        <button className="font-mono text-sm font-semibold text-apex" onClick={() => edit(reference)} type="button">{reference.code}</button>
                        <div className="mt-2"><span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${reference.active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>{reference.active ? "Activa" : "Inactiva"}</span></div>
                      </td>
                      <td className="max-w-[320px] px-4 py-3 align-top">
                        <p className="truncate font-semibold text-neutral-900">{reference.name}</p>
                        <p className="mt-1 truncate text-xs text-neutral-500">{[reference.brand, reference.model].filter(Boolean).join(" / ") || "Sin marca o modelo registrado"}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{reference.description || "Sin descripcion tecnica"}</p>
                      </td>
                      <td className="px-4 py-3 align-top"><span className="rounded-md bg-paper px-3 py-2 text-xs font-semibold capitalize text-neutral-700">{reference.category || "otros"}</span></td>
                      <td className="px-4 py-3 text-center align-top">
                        <div className="inline-flex items-center gap-3 rounded-md bg-paper px-3 py-2 text-xs font-medium text-neutral-600">
                          <span className="inline-flex items-center gap-1.5"><Layers3 size={14} /> {reference.parts.length} pieza(s)</span>
                          <span className="h-3 w-px bg-line" />
                          <span className={`inline-flex items-center gap-1.5 ${(reference.manuals?.length || 0) ? "" : "text-amber-700"}`}><BookOpen size={14} /> {reference.manuals?.length || 0} doc.</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top"><p className="inline-flex items-center gap-2 font-medium text-neutral-800"><Clock3 size={15} className="text-neutral-400" /> {reference.estimated_minutes} min</p></td>
                      <td className="px-4 py-3 text-right align-middle">
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-apex shadow-sm transition group-hover:border-apex" onClick={() => edit(reference)} type="button">Editar listas <ChevronRight size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-line p-8 text-center sm:p-10">
              <Filter className="mx-auto mb-3 text-neutral-300" size={34} />
              <p className="font-semibold">No encontramos referencias con estos filtros</p>
              <p className="mt-1 text-sm text-neutral-500">Ajusta la busqueda o limpia los filtros activos.</p>
              {activeFilters ? <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={clearFilters} type="button"><RotateCcw size={15} /> Limpiar filtros</button> : null}
            </div>
          )}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-[1fr_56px_56px] gap-2 border-t border-line bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur md:hidden">
        <button className="inline-flex h-14 min-w-0 items-center justify-center gap-2 rounded-md bg-apex px-3 text-base font-semibold text-white shadow-sm" onClick={reset} type="button"><Plus className="shrink-0" size={18} /> <span className="truncate">Nueva referencia</span></button>
        <button aria-label="Descargar plantilla CSV" className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" onClick={downloadTemplate} type="button"><Download size={20} /></button>
        <label aria-label="Importar referencias CSV" className="inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-md border border-line bg-white">
          <Upload size={20} />
          <input className="hidden" type="file" accept=".csv,text/csv" onChange={onCsv} />
        </label>
      </div>

      {showForm ? (
        <ModalFrame title={selected ? "Editar referencia" : "Nueva referencia"} onClose={() => setShowForm(false)} maxWidth="max-w-5xl">
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-4">
              <input className="h-11 w-full rounded-md border border-line px-3 text-base md:text-sm" placeholder="Codigo *" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
              <select className="h-11 w-full rounded-md border border-line px-3 text-base md:text-sm" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input className="h-11 w-full rounded-md border border-line px-3 text-base md:text-sm" placeholder="Marca" value={form.brand} onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))} />
              <input className="h-11 w-full rounded-md border border-line px-3 text-base md:text-sm" placeholder="Modelo" value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
              <input className="h-11 w-full rounded-md border border-line px-3 text-base md:col-span-3 md:text-sm" placeholder="Nombre *" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input className="h-11 w-full rounded-md border border-line px-3 text-base md:text-sm" type="number" min={1} value={form.estimated_minutes} onChange={(event) => setForm((prev) => ({ ...prev, estimated_minutes: Number(event.target.value) }))} />
              <textarea className="min-h-24 rounded-md border border-line px-3 py-2 text-base md:col-span-4 md:text-sm" placeholder="Descripcion tecnica o alcance" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </section>

            <section className="rounded-md border border-line p-3">
              <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
              <div><h2 className="text-sm font-semibold">Lista de piezas para inspeccion</h2><p className="text-xs text-neutral-500">Estas piezas aparecen al tecnico durante la validacion y se actualizan en nuevas ordenes.</p></div>
                <button className="h-11 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => setForm((prev) => ({ ...prev, parts: [...prev.parts, { ...emptyPart }] }))} type="button">Agregar pieza</button>
              </div>
              <div className="space-y-2">
                {form.parts.map((part, index) => (
                  <div className="grid gap-2 md:grid-cols-[1fr_80px_90px_1fr_40px]" key={index}>
                    <input className="h-11 rounded-md border border-line px-3 text-base md:text-sm" placeholder="Pieza *" value={part.name} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} />
                    <input className="h-11 rounded-md border border-line px-2 text-base md:text-sm" type="number" min={0.01} value={part.quantity} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) }))} />
                    <input className="h-11 rounded-md border border-line px-2 text-base md:text-sm" value={part.unit} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item) }))} />
                    <input className="h-11 rounded-md border border-line px-3 text-base md:text-sm" placeholder="Nota de revision" value={part.description} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} />
                    <button className="h-11 rounded-md border border-line text-base hover:bg-paper md:text-sm" onClick={() => setForm((prev) => ({ ...prev, parts: prev.parts.filter((_, itemIndex) => itemIndex !== index) }))} type="button">-</button>
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
                    <input className="h-11 w-full rounded-md border border-line px-2 text-base font-medium md:text-sm" value={manual.title} onChange={(event) => setForm((prev) => ({ ...prev, manuals: prev.manuals.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} />
                    <p className="mt-1 truncate text-xs text-neutral-500">{manual.file_name || manual.file_url}</p>
                    <textarea className="mt-2 min-h-20 w-full rounded-md border border-line px-2 py-2 text-base md:text-sm" placeholder="Notas de uso" value={manual.notes || ""} onChange={(event) => setForm((prev) => ({ ...prev, manuals: prev.manuals.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item) }))} />
                    <div className="mt-2 grid gap-2 sm:flex">
                      {manualHref(manual) ? <a className="inline-flex h-10 items-center justify-center rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" href={manualHref(manual)} target="_blank" rel="noreferrer">Abrir</a> : null}
                      <button className="h-10 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => setForm((prev) => ({ ...prev, manuals: prev.manuals.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Quitar</button>
                    </div>
                  </div>
                ))}
                {!form.manuals.length ? <p className="rounded-md bg-paper p-3 text-sm text-neutral-600">Sin manuales adjuntos.</p> : null}
              </div>
            </section>

            <div className="grid gap-2 border-t border-line pt-4 sm:flex sm:justify-end">
              <button className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => setShowForm(false)} type="button">Cancelar</button>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} onClick={save} type="button"><Save size={16} /> Guardar referencia</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {showImport ? (
        <ModalFrame title="Carga masiva de referencias" onClose={() => setShowImport(false)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Usa la plantilla CSV. Varias filas con el mismo codigo se agrupan como una referencia con varias piezas.</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={downloadTemplate} type="button"><Download size={16} /> Descargar plantilla</button>
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white">
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
            <button className="h-11 w-full rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-60" disabled={!importRows.length || saving} onClick={importCsv} type="button">Importar referencias</button>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-white/10 px-4 py-3 first:border-0 sm:border-l">
      <p className="text-xs text-white/55">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
