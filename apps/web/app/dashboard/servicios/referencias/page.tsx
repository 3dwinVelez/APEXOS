"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { SERVICE_REFERENCE_COLUMNS, SERVICE_REFERENCE_SHEET, ServiceReferenceImportIssue, ServiceReferenceImportRow, rowsFromWorksheet, validateServiceReferenceImport } from "@/lib/serviceReferenceImport";
import { AlertCircle, ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Clock3, Download, Filter, Layers3, Plus, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
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
const categories = ["muebles", "colchones", "electrodomesticos", "cocina", "oficina", "decoracion", "iluminacion", "textiles", "otros"];
const emptyPart = { name: "", quantity: 1, unit: "und", description: "" };
const emptyForm = { code: "", name: "", category: "muebles", description: "", estimated_minutes: 60, brand: "", model: "", active: true, parts: [emptyPart] as Part[], manuals: [] as Manual[] };

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

function downloadTemplate() {
  const link = document.createElement("a");
  link.href = "/plantillas/plantilla-referencias-servicio.xlsx";
  link.download = "plantilla-referencias-servicio.xlsx";
  link.click();
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
  const [importRows, setImportRows] = useState<ServiceReferenceImportRow[]>([]);
  const [importIssues, setImportIssues] = useState<ServiceReferenceImportIssue[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importReferenceCount, setImportReferenceCount] = useState(0);
  const [readingFile, setReadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    try {
      const referenceRows = await api<ServiceReference[]>("/api/v1/services/references");
      setReferences(referenceRows);
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

  async function onExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingFile(true);
    setError("");
    setMessage("");
    try {
      if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) throw new Error("Selecciona un archivo Excel con extension .xlsx.");
      if (file.size > 5 * 1024 * 1024) throw new Error("El archivo supera el limite de 5 MB.");
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.getWorksheet(SERVICE_REFERENCE_SHEET);
      if (!worksheet) throw new Error(`No se encontro la hoja "${SERVICE_REFERENCE_SHEET}". Descarga una plantilla nueva.`);
      const values = Array.from({ length: Math.max(worksheet.actualRowCount, 1) }, (_, rowIndex) => {
        const row = worksheet.getRow(rowIndex + 1);
        return SERVICE_REFERENCE_COLUMNS.map((_, columnIndex) => row.getCell(columnIndex + 1).value);
      });
      const extracted = rowsFromWorksheet(values);
      const validation = extracted.issues.length ? { rows: [], issues: extracted.issues, referenceCount: 0 } : validateServiceReferenceImport(extracted.rows);
      setImportRows(validation.rows);
      setImportIssues(validation.issues);
      setImportReferenceCount(validation.referenceCount);
      setImportFileName(file.name);
      setShowImport(true);
    } catch (err) {
      setImportRows([]);
      setImportIssues([]);
      setImportReferenceCount(0);
      setImportFileName("");
      setError(err instanceof Error ? err.message : "No fue posible leer el archivo Excel.");
    } finally {
      setReadingFile(false);
      event.target.value = "";
    }
  }

  async function importExcel() {
    if (!importRows.length || importIssues.length) return;
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
      setImportIssues([]);
      setImportReferenceCount(0);
      setImportFileName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible importar la plantilla.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4 pb-24 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="min-w-0">
          <Link className="mb-2 inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-medium text-neutral-600 hover:text-apex md:border-0 md:bg-transparent md:px-0" href="/dashboard/servicios"><ArrowLeft size={15} /> Volver a servicios</Link>
          <p className="text-xs font-medium text-apex">Servicios</p>
          <h1 className="text-xl font-semibold md:text-2xl">Referencias de servicio</h1>
          <p className="mt-1 max-w-3xl text-xs text-neutral-600 md:text-sm">Maestro tecnico para modelos, listas de piezas, tiempos, manuales, guias y carga masiva por Excel.</p>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="apex-context-hero">
        <div className="relative z-10 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="apex-eyebrow mb-2">
              <Sparkles size={14} /> Maestro tecnico de servicios
            </div>
            <h2 className="max-w-3xl text-xl font-semibold leading-tight sm:text-2xl">Referencias y listas listas para mantener</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-white/65">Compara fichas tecnicas, listas de piezas, tiempos y documentos sin abrir cada referencia. Edita solo cuando el maestro cambie.</p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button className="apex-hero-action col-span-2 inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold sm:col-span-1" onClick={reset} type="button"><Plus size={17} /> Nueva referencia</button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" onClick={downloadTemplate} type="button"><Download size={16} /> Plantilla</button>
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10">
              <Upload size={16} /> {readingFile ? "Validando..." : "Importar"}
              <input className="hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readingFile} onChange={onExcel} />
            </label>
          </div>
        </div>
        <div className="relative z-10 grid grid-cols-2 border-t border-white/10 text-sm sm:grid-cols-4">
          <Summary label="Referencias" value={stats.total} />
          <Summary label="Activas" value={stats.active} />
          <Summary label="Piezas configuradas" value={stats.parts} />
          <Summary label="Manuales y guias" value={stats.manuals} />
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
        <button aria-label="Descargar plantilla Excel" className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" onClick={downloadTemplate} type="button"><Download size={20} /></button>
        <label aria-label="Importar referencias desde Excel" className="inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-md border border-line bg-white">
          <Upload size={20} />
          <input className="hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readingFile} onChange={onExcel} />
        </label>
      </div>

      {showForm ? (
        <ModalFrame title={selected ? "Editar referencia" : "Nueva referencia"} onClose={() => setShowForm(false)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <section className="grid gap-3 md:grid-cols-4">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Codigo *" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
              <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Marca" value={form.brand} onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))} />
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Modelo" value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm md:col-span-3" placeholder="Nombre *" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="number" min={1} value={form.estimated_minutes} onChange={(event) => setForm((prev) => ({ ...prev, estimated_minutes: Number(event.target.value) }))} />
              <textarea className="min-h-[72px] rounded-md border border-line px-3 py-2 text-sm md:col-span-4" placeholder="Descripcion tecnica o alcance" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </section>

            <section className="rounded-md border border-line p-3">
              <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
              <div><h2 className="text-sm font-semibold">Lista de piezas para inspeccion</h2><p className="text-xs text-neutral-500">Estas piezas aparecen al tecnico durante la validacion y se actualizan en nuevas ordenes.</p></div>
                <button className="h-10 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => setForm((prev) => ({ ...prev, parts: [...prev.parts, { ...emptyPart }] }))} type="button">Agregar pieza</button>
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

            <div className="grid gap-2 border-t border-line pt-3 sm:flex sm:justify-end">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setShowForm(false)} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} onClick={save} type="button"><Save size={16} /> Guardar referencia</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {showImport ? (
        <ModalFrame title="Importar referencias desde Excel" onClose={() => setShowImport(false)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Completa la hoja <strong>Referencias</strong>. Las hojas Instrucciones y Ejemplo explican cada campo. Varias filas con el mismo codigo forman una referencia con varias piezas.</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={downloadTemplate} type="button"><Download size={16} /> Descargar plantilla</button>
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white">
                <Upload size={16} /> Seleccionar Excel
                <input className="hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onExcel} />
              </label>
            </div>
            <div className={`rounded-md border p-3 text-sm ${importIssues.length ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              <div className="flex items-start gap-2">
                {importIssues.length ? <AlertCircle className="mt-0.5 shrink-0" size={17} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={17} />}
                <div>
                  <p className="font-semibold">{importIssues.length ? `Corrige ${importIssues.length} dato(s) antes de importar` : "Archivo validado y listo para importar"}</p>
                  <p className="mt-0.5 text-xs opacity-80">{importFileName} · {importRows.length} fila(s) · {importReferenceCount} referencia(s)</p>
                </div>
              </div>
            </div>
            {importIssues.length ? (
              <div className="max-h-64 overflow-auto rounded-md border border-amber-200" role="alert" aria-label="Errores de la plantilla">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="sticky top-0 bg-amber-50 text-left text-xs text-amber-950"><tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Campo</th><th className="px-3 py-2">Correccion requerida</th></tr></thead>
                  <tbody>{importIssues.slice(0, 100).map((issue, index) => <tr className="border-t border-amber-100" key={`${issue.row}-${issue.field}-${index}`}><td className="px-3 py-2 font-mono">{issue.row}</td><td className="px-3 py-2 font-medium">{issue.field}</td><td className="px-3 py-2">{issue.message}</td></tr>)}</tbody>
                </table>
              </div>
            ) : (
              <div className="max-h-72 overflow-auto rounded-md border border-line">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-paper text-left text-xs text-neutral-600"><tr><th className="px-3 py-2">Codigo</th><th className="px-3 py-2">Referencia</th><th className="px-3 py-2">Pieza</th><th className="px-3 py-2">Manual</th></tr></thead>
                  <tbody>{importRows.slice(0, 20).map((row, index) => <tr className="border-t border-line" key={index}><td className="px-3 py-2 font-mono text-xs">{row.code}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2">{row.part_name}</td><td className="px-3 py-2">{row.manual_title || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-neutral-500">La plataforma no guardara ninguna referencia mientras exista un error en el archivo.</p>
            <button className="h-11 w-full rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-60" disabled={!importRows.length || Boolean(importIssues.length) || saving} onClick={importExcel} type="button">{saving ? "Importando..." : `Importar ${importReferenceCount} referencia(s)`}</button>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-white/10 px-3 py-2 first:border-0 sm:border-l">
      <p className="text-xs text-white/55">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-white">{value}</p>
    </div>
  );
}
