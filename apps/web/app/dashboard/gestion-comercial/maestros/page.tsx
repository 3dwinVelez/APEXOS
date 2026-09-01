"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/lib/api";
import { ArrowLeft, Pencil, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { VisitSettingsCard } from "./VisitSettingsCard";
import { ProductImportPanel } from "./ProductImportPanel";

type Row = Record<string, any>;
type Master = "advisors" | "customers" | "products" | "zones" | "categories" | "visit-reasons" | "visit-results";
const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";

export default function CommercialMastersPage() {
  const [master, setMaster] = useState<Master>(() => {
    if (typeof window === "undefined") return "advisors";
    const requested = new URLSearchParams(window.location.search).get("seccion");
    return (["advisors", "customers", "products", "zones", "categories", "visit-reasons", "visit-results"] as Master[]).includes(requested as Master)
      ? requested as Master
      : "advisors";
  });
  const [advisors, setAdvisors] = useState<Row[]>([]);
  const [zones, setZones] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [visitReasons, setVisitReasons] = useState<Row[]>([]);
  const [visitResults, setVisitResults] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [access, setAccess] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try {
      const [advisorData, customerData, productData, zoneData, categoryData, reasonData, resultData, accessData] = await Promise.all([
        api<Row[]>("/api/v1/commercial-management/advisors"),
        api<Row[]>("/api/v1/commercial-management/customers"),
        api<Row[]>("/api/v1/commercial-management/products"),
        api<Row[]>("/api/v1/commercial-management/zones"),
        api<Row[]>("/api/v1/commercial-management/customer-categories"),
        api<Row[]>("/api/v1/commercial-management/visit-reasons"),
        api<Row[]>("/api/v1/commercial-management/visit-results"),
        api<Row>("/api/v1/commercial-management/access-context", { cache: "no-store" })
      ]);
      setAdvisors(advisorData); setCustomers(customerData); setProducts(productData); setZones(zoneData); setCategories(categoryData); setVisitReasons(reasonData); setVisitResults(resultData);
      setAccess(accessData);
      if (!accessData.can_manage_masters) setMaster("customers");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible cargar los maestros."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = master === "advisors" ? advisors : master === "customers" ? customers : master === "products" ? products : master === "zones" ? zones : master === "categories" ? categories : master === "visit-reasons" ? visitReasons : visitResults;
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const title = master === "advisors" ? "Asesores" : master === "customers" ? "Clientes" : master === "products" ? "Productos" : master === "zones" ? "Zonas" : master === "categories" ? "Categorías de clientes" : master === "visit-reasons" ? "Motivos de visita" : "Resultados de visita";

  async function toggleActive(row: Row) {
    const path = master === "categories" ? "customer-categories" : master;
    const isActive = master === "customers" ? row.status !== "INACTIVE" : row.active;
    const body = master === "customers" ? { ...editableBody(master, row), status: isActive ? "INACTIVE" : "ACTIVE" } : { ...editableBody(master, row), active: !isActive };
    await api(`/api/v1/commercial-management/${path}/${row.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setMessage(isActive ? "Registro inactivado sin eliminar su historial." : "Registro activado."); await load();
  }

  return <div className="apex-workspace-shell space-y-4">
    <header className="apex-section-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-apex" href="/dashboard/gestion-comercial"><ArrowLeft size={15}/>Volver a Gestión Comercial</Link><h1 className="text-2xl font-semibold">{access?.can_manage_masters ? "Asesores y maestros comerciales" : "Mis clientes"}</h1><p className="mt-1 text-sm text-neutral-600">{access?.can_manage_masters ? "Administra datos configurables sin eliminar registros con trazabilidad." : "Consulta y administra únicamente los clientes asignados a tu usuario asesor."}</p></div><button className="apex-primary-action inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold" onClick={() => { setEditing(null); setCreating(true); }} type="button"><Plus size={16}/>Crear {title.toLowerCase()}</button></div></header>
    {message ? <div className="rounded-md border border-line bg-white px-4 py-3 text-sm">{message}</div> : null}
    {access?.can_manage_masters ? <VisitSettingsCard /> : null}
    <section className="apex-section-card p-4 [&>div:last-child]:hidden md:[&>div:last-child]:block">
      {access?.can_manage_masters && master === "products" ? <div className="mb-4"><ProductImportPanel onImported={load}/></div> : null}
      {access?.can_manage_masters ? <div className="mb-4 flex flex-wrap gap-2">{(["advisors", "customers", "products", "zones", "categories", "visit-reasons", "visit-results"] as Master[]).map((item) => <button className={`rounded-md px-4 py-2 text-sm font-semibold ${master === item ? "bg-apex text-white" : "border border-line"}`} key={item} onClick={() => { setMaster(item); setQuery(""); }} type="button">{item === "advisors" ? "Asesores" : item === "customers" ? "Clientes" : item === "products" ? "Productos" : item === "zones" ? "Zonas" : item === "categories" ? "Categorías" : item === "visit-reasons" ? "Motivos de visita" : "Resultados de visita"}</button>)}</div> : null}
      <label className="relative block max-w-md"><Search className="absolute left-3 top-3 text-neutral-400" size={16}/><input className={`${inputClass} pl-9`} placeholder={`Buscar en ${title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <div className="mt-4 space-y-3 md:hidden">{filtered.map(row => { const active = master === "customers" ? row.status !== "INACTIVE" : row.active; return <article className="rounded-lg border border-line p-4" key={row.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-neutral-500">{row.code || "Sin código"}</p><h3 className="font-semibold">{row.name || row.legal_name}</h3></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{active ? (master === "customers" ? row.status : "Activo") : "Inactivo"}</span></div><p className="mt-3 text-sm text-neutral-600">{rowDetail(master, row)}</p><div className="mt-4 grid grid-cols-2 gap-2"><button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line text-sm font-semibold" onClick={() => setEditing(row)} type="button"><Pencil size={16}/>Editar</button><button className="h-11 rounded-md border border-line text-sm font-semibold" onClick={() => void toggleActive(row)} type="button">{active ? "Inactivar" : "Activar"}</button></div></article>; })}{!filtered.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay registros para mostrar.</p> : null}</div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase text-neutral-500"><th className="px-3 py-2">Código</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Detalle</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead><tbody>{filtered.map((row) => { const active = master === "customers" ? row.status !== "INACTIVE" : row.active; return <tr className="border-b border-line/70" key={row.id}><td className="px-3 py-3 font-semibold">{row.code}</td><td className="px-3 py-3">{row.name || row.legal_name}</td><td className="px-3 py-3 text-neutral-600">{rowDetail(master, row)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{active ? (master === "customers" ? row.status : "Activo") : "Inactivo"}</span></td><td className="px-3 py-3"><div className="flex justify-end gap-2"><button className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-xs font-semibold" onClick={() => setEditing(row)} type="button"><Pencil size={14}/>Editar</button><button className="rounded-md border border-line px-3 py-2 text-xs font-semibold" onClick={() => void toggleActive(row)} type="button">{active ? "Inactivar" : "Activar"}</button></div></td></tr>; })}</tbody></table>{!filtered.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay registros para mostrar.</p> : null}</div>
    </section>
    {(creating || editing) ? <MasterModal master={master} record={editing} zones={zones.filter((zone) => zone.active)} categories={categories.filter((category) => category.active)} advisors={advisors.filter((advisor) => advisor.active)} onClose={() => { setCreating(false); setEditing(null); }} onSaved={async () => { setCreating(false); setEditing(null); setMessage("Registro guardado correctamente."); await load(); }}/>: null}
  </div>;
}

function editableBody(master: Master, row: Row) {
  if (master === "advisors") return { code: row.code, name: row.name, email: row.email || undefined, phone: row.phone || undefined, zone_id: row.zone_id || undefined, user_id: row.user_id || undefined, supervisor_user_id: row.supervisor_user_id || undefined };
  if (master === "customers") return { code: row.code, legal_name: row.legal_name, trade_name: row.trade_name || undefined, identification_type: row.identification_type || undefined, identification: row.identification || undefined, contact_name: row.contact_name || undefined, contact_position: row.contact_position || undefined, phone: row.phone || undefined, whatsapp: row.whatsapp || undefined, email: row.email || undefined, address: row.address || undefined, city: row.city || undefined, department: row.department || undefined, notes: row.notes || undefined, advisor_id: row.advisor_id, category_id: row.category_id, status: row.status, visit_frequency_days: row.visit_frequency_days, credit_capacity: Number(row.credit_capacity || 0) };
  if (master === "products") return { code: row.code, name: row.name, category: row.category || undefined, subcategory: row.subcategory || undefined, line: row.line || undefined, unit: row.unit || "UND", unit_price: Number(row.unit_price) };
  if (master === "zones") return { code: row.code, name: row.name, description: row.description || undefined, city: row.city || undefined, department: row.department || undefined };
  if (master === "visit-results") return { code: row.code, name: row.name, description: row.description || undefined, counts_as_effective: row.counts_as_effective, requires_observation: row.requires_observation };
  return { code: row.code, name: row.name, description: row.description || undefined };
}

function rowDetail(master: Master, row: Row) {
  if (master === "advisors") return `${row.email || "Sin correo"} · ${row.zone_master?.name || "Sin zona"}`;
  if (master === "customers") return `${row.advisor?.name || "Sin asesor"} · Cupo ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(row.credit_capacity || 0))} · Última compra ${row.last_purchase_at ? new Date(row.last_purchase_at).toLocaleDateString("es-CO") : "Sin compras"} · Última visita ${row.last_visit_at ? new Date(row.last_visit_at).toLocaleDateString("es-CO") : "Sin visitas"} · ${row._count?.commitments || 0} compromisos pendientes`;
  if (master === "products") return `${[row.category, row.subcategory, row.line].filter(Boolean).join(" › ") || "Sin clasificación"} · ${row.unit || "UND"} · ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(Number(row.unit_price))} · ${row.price_source === "INVENTORY" ? "Precio de Inventarios" : "Precio comercial"}`;
  if (master === "zones") return [row.city, row.department].filter(Boolean).join(" · ") || row.description || "—";
  if (master === "visit-results") return `${row.counts_as_effective ? "Cuenta como efectiva" : "No efectiva"} · ${row.requires_observation ? "Exige observación" : "Observación opcional"}`;
  return row.description || "—";
}

function MasterModal({ master, record, zones, categories, advisors, onClose, onSaved }: { master: Master; record: Row | null; zones: Row[]; categories: Row[]; advisors: Row[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Row>(record ? editableBody(master, record) : { active: true, status: "ACTIVE", advisor_id: advisors[0]?.id || "", category_id: categories[0]?.id || "", visit_frequency_days: 30, unit: "UND" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", escape); return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); }; }, [busy, onClose]);
  const field = (name: string) => ({ value: form[name] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [name]: event.target.value }) });
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (master === "advisors" && form.user_id) { const assigned = advisors.find((item) => item.id !== record?.id && Number(item.user_id) === Number(form.user_id)); if (assigned) throw new Error(`El usuario APEX ya pertenece a ${assigned.code} · ${assigned.name}.`); }
      const path = master === "categories" ? "customer-categories" : master;
      const body = master === "advisors" ? { ...form, zone_id: form.zone_id ? Number(form.zone_id) : undefined, user_id: form.user_id ? Number(form.user_id) : undefined, supervisor_user_id: form.supervisor_user_id ? Number(form.supervisor_user_id) : undefined, active: record?.active ?? true } : master === "customers" ? { ...form, advisor_id: Number(form.advisor_id), category_id: Number(form.category_id), visit_frequency_days: Number(form.visit_frequency_days || 30), status: record?.status || form.status || "ACTIVE" } : master === "products" ? { ...form, unit_price: Number(form.unit_price), active: record?.active ?? true } : { ...form, active: record?.active ?? true };
      await api(`/api/v1/commercial-management/${path}${record ? `/${record.id}` : ""}`, { method: record ? "PATCH" : "POST", body: JSON.stringify(body) }); await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible guardar."); } finally { setBusy(false); }
  }
  const entityLabel = master === "advisors" ? "asesor" : master === "customers" ? "cliente" : master === "products" ? "producto" : master === "zones" ? "zona" : master === "categories" ? "categoría" : master === "visit-reasons" ? "motivo de visita" : "resultado de visita";
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{record ? "Editar" : "Crear"} {entityLabel}</h2><button onClick={onClose} type="button"><X size={19}/></button></div><form className="grid gap-3 sm:grid-cols-2" onSubmit={save}><Field label={master === "products" ? "Código (vacío = automático)" : "Código"}><input required={master !== "products"} className={inputClass} {...field("code")}/></Field>{master === "customers" ? <><Field label="Razón social"><input required className={inputClass} {...field("legal_name")}/></Field><Field label="Nombre comercial"><input className={inputClass} {...field("trade_name")}/></Field><Field label="Tipo de identificación"><select className={inputClass} {...field("identification_type")}><option value="">Seleccionar</option><option>NIT</option><option>CC</option><option>CE</option><option>Pasaporte</option><option>Otro</option></select></Field><Field label="Número de identificación"><input className={inputClass} {...field("identification")}/></Field><Field label="Asesor"><select required className={inputClass} {...field("advisor_id")}>{advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.code} · {advisor.name}</option>)}</select></Field><Field label="Categoría"><select required className={inputClass} {...field("category_id")}>{categories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select></Field><Field label="Contacto principal"><input className={inputClass} {...field("contact_name")}/></Field><Field label="Cargo del contacto"><input className={inputClass} {...field("contact_position")}/></Field><Field label="Teléfono"><input className={inputClass} {...field("phone")}/></Field><Field label="WhatsApp"><input className={inputClass} {...field("whatsapp")}/></Field><Field label="Correo"><input className={inputClass} type="email" {...field("email")}/></Field><Field label="Dirección"><input className={inputClass} {...field("address")}/></Field><Field label="Ciudad"><input className={inputClass} {...field("city")}/></Field><Field label="Departamento"><input className={inputClass} {...field("department")}/></Field><Field label="Frecuencia de visita (días)"><input className={inputClass} min="1" type="number" {...field("visit_frequency_days")}/></Field><Field label="Cupo comercial disponible"><input className={inputClass} min="0" step="0.01" type="number" {...field("credit_capacity")}/></Field><Field label="Observaciones"><textarea className={`${inputClass} h-20 py-2`} {...field("notes")}/></Field></> : master === "products" ? <><Field label="Nombre"><input required className={inputClass} {...field("name")}/></Field><Field label="Categoría"><input className={inputClass} {...field("category")}/></Field><Field label="Subcategoría"><input className={inputClass} {...field("subcategory")}/></Field><Field label="Línea"><input className={inputClass} {...field("line")}/></Field><Field label="Unidad"><input required className={inputClass} {...field("unit")}/></Field><Field label="Precio unitario COP"><input required className={inputClass} min="0" step="0.01" type="number" {...field("unit_price")}/></Field>{record?.inventory_item_id ? <p className="sm:col-span-2 rounded-md bg-sky-50 p-3 text-xs text-sky-800">Este artículo proviene de Inventarios. El precio se actualiza también en Inventarios para que nunca existan diferencias.</p> : null}</> : <><Field label="Nombre"><input required className={inputClass} {...field("name")}/></Field>{master === "advisors" ? <><Field label="Correo"><input className={inputClass} type="email" {...field("email")}/></Field><Field label="Teléfono"><input className={inputClass} {...field("phone")}/></Field><Field label="Zona"><select className={inputClass} {...field("zone_id")}><option value="">Sin zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.code} · {zone.name}</option>)}</select></Field><Field label="ID usuario APEX"><input className={inputClass} min="1" type="number" {...field("user_id")}/></Field><Field label="ID supervisor APEX"><input className={inputClass} min="1" type="number" {...field("supervisor_user_id")}/></Field></> : <><Field label="Descripción"><textarea className={`${inputClass} h-20 py-2`} {...field("description")}/></Field>{master === "zones" ? <><Field label="Ciudad / municipio"><input className={inputClass} {...field("city")}/></Field><Field label="Departamento"><input className={inputClass} {...field("department")}/></Field></> : null}</>}</>}{error ? <div className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<button className="apex-primary-action h-10 px-4 text-sm font-semibold sm:col-span-2" disabled={busy} type="submit">{busy ? "Guardando..." : "Guardar"}</button></form></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium"><span className="mb-1 block">{label}</span>{children}</label>; }
