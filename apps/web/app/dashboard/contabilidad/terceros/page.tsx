"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, ListPlus, Plus, Search, Settings2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type ThirdParty = {
  id: number;
  type: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  tax_type?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  active: boolean;
  metadata?: {
    person_type?: string;
    first_name?: string | null;
    middle_name?: string | null;
    first_last_name?: string | null;
    second_last_name?: string | null;
    document_type?: string | null;
    verification_digit?: number | null;
    tax_responsibilities?: string[];
    dane_code?: string | null;
    department?: string | null;
  };
};
type DocumentTypeMaster = { code: string; description: string; active: boolean; source?: string };
type DaneLocationMaster = { dane_code: string; city: string; department: string; active: boolean; source?: string };
type ThirdPartyMasters = {
  document_types: DocumentTypeMaster[];
  locations: DaneLocationMaster[];
};

const EMPTY = {
  type: "customer",
  name: "",
  legal_name: "",
  person_type: "juridica",
  first_name: "",
  middle_name: "",
  first_last_name: "",
  second_last_name: "",
  document_type: "31",
  tax_id: "",
  verification_digit: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  department: "",
  dane_code: "",
  tax_responsibilities: "",
  active: true
};
const EMPTY_MASTERS: ThirdPartyMasters = { document_types: [], locations: [] };

const TYPES = [
  ["customer", "Cliente"],
  ["supplier", "Proveedor"],
  ["employee", "Empleado"]
];
const LEGACY_DOCUMENT_TYPES: Record<string, string> = {
  NIT: "31",
  CC: "13",
  CEDULA: "13",
  CE: "22",
  PAS: "41",
  PASAPORTE: "41",
  TI: "12",
  RC: "11"
};

function normalizeDocumentType(value?: string | null) {
  const text = String(value || "31").trim().toUpperCase();
  return LEGACY_DOCUMENT_TYPES[text] || text || "31";
}

function calculateVerificationDigit(taxId: string) {
  const digits = String(taxId || "").replace(/\D/g, "");
  if (!digits) return "";
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const padded = digits.padStart(15, "0");
  const sum = padded.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const mod = sum % 11;
  return String(mod > 1 ? 11 - mod : mod);
}

function naturalLegalName(form: typeof EMPTY) {
  return [form.first_name, form.middle_name, form.first_last_name, form.second_last_name].map((value) => value.trim()).filter(Boolean).join(" ");
}

function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function TercerosContablesPage() {
  const [items, setItems] = useState<ThirdParty[]>([]);
  const [masters, setMasters] = useState<ThirdPartyMasters>(EMPTY_MASTERS);
  const [form, setForm] = useState(EMPTY);
  const [docDraft, setDocDraft] = useState({ code: "", description: "" });
  const [locationDraft, setLocationDraft] = useState({ dane_code: "", city: "", department: "" });
  const [editing, setEditing] = useState<ThirdParty | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mastersOpen, setMastersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (type) params.set("type", type);
      const rows = await api<ThirdParty[]>(`/api/v1/accounting/third-parties${params.size ? `?${params.toString()}` : ""}`);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar terceros");
    } finally {
      setLoading(false);
    }
  }, [search, type]);

  const loadMasters = useCallback(async () => {
    try {
      const data = await api<ThirdPartyMasters>("/api/v1/accounting/third-party-masters");
      setMasters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar maestros contables");
    }
  }, []);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.active).length,
    suppliers: items.filter((item) => item.type === "supplier").length,
    customers: items.filter((item) => item.type === "customer").length
  }), [items]);
  const documentLabels = useMemo(() => Object.fromEntries(masters.document_types.map((item) => [item.code, item.description])), [masters.document_types]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(item: ThirdParty) {
    setEditing(item);
    setForm({
      type: item.type || "customer",
      name: item.name || "",
      legal_name: item.legal_name || "",
      person_type: item.metadata?.person_type || "juridica",
      first_name: item.metadata?.first_name || "",
      middle_name: item.metadata?.middle_name || "",
      first_last_name: item.metadata?.first_last_name || "",
      second_last_name: item.metadata?.second_last_name || "",
      document_type: normalizeDocumentType(item.tax_type || item.metadata?.document_type),
      tax_id: item.tax_id || "",
      verification_digit: item.metadata?.verification_digit === null || item.metadata?.verification_digit === undefined ? "" : String(item.metadata.verification_digit),
      email: item.email || "",
      phone: item.phone || "",
      address: item.address || "",
      city: item.city || "",
      department: item.metadata?.department || "",
      dane_code: item.metadata?.dane_code || "",
      tax_responsibilities: item.metadata?.tax_responsibilities?.join(", ") || "",
      active: item.active
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      if (!isValidEmail(form.email)) {
        setError("El correo ingresado no tiene un formato valido");
        return;
      }
      const computedLegalName = form.person_type === "natural" ? naturalLegalName(form) : form.legal_name || form.name;
      const payload = {
        ...form,
        name: form.person_type === "natural" ? computedLegalName : form.name,
        legal_name: computedLegalName,
        tax_type: form.document_type,
        verification_digit: calculateVerificationDigit(form.tax_id),
        tax_responsibilities: form.tax_responsibilities.split(",").map((value) => value.trim()).filter(Boolean)
      };
      await api<ThirdParty>(editing ? `/api/v1/accounting/third-parties/${editing.id}` : "/api/v1/accounting/third-parties", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      setModalOpen(false);
      setOk(editing ? "Tercero actualizado" : "Tercero creado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tercero");
    } finally {
      setSaving(false);
    }
  }

  async function saveDocumentType() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const data = await api<ThirdPartyMasters>("/api/v1/accounting/third-party-masters/document-types", {
        method: "POST",
        body: JSON.stringify(docDraft)
      });
      setMasters(data);
      setDocDraft({ code: "", description: "" });
      setOk("Tipo de documento guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tipo de documento");
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const data = await api<ThirdPartyMasters>("/api/v1/accounting/third-party-masters/locations", {
        method: "POST",
        body: JSON.stringify(locationDraft)
      });
      setMasters(data);
      setLocationDraft({ dane_code: "", city: "", department: "" });
      setOk("Ciudad DANE guardada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la ciudad DANE");
    } finally {
      setSaving(false);
    }
  }

  function applyLocation(daneCode: string) {
    const location = masters.locations.find((item) => item.dane_code === daneCode);
    setForm((prev) => ({
      ...prev,
      dane_code: daneCode,
      city: location?.city || prev.city,
      department: location?.department || prev.department
    }));
  }

  const computedVerificationDigit = calculateVerificationDigit(form.tax_id);
  const computedLegalName = form.person_type === "natural" ? naturalLegalName(form) : form.legal_name;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Terceros contables</h1>
          <p className="mt-1 text-sm text-neutral-600">Maestro para clientes, proveedores, empleados, transportadores, bancos y obligaciones tributarias Colombia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-neutral-700" onClick={() => setMastersOpen((value) => !value)} type="button">
            <Settings2 size={16} /> Maestros
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={openCreate} type="button">
            <Plus size={16} /> Nuevo tercero
          </button>
        </div>
      </header>
      <ContabilidadNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Terceros" value={stats.total} />
        <Metric label="Activos" value={stats.active} />
        <Metric label="Clientes" value={stats.customers} />
        <Metric label="Proveedores" value={stats.suppliers} />
      </section>

      {mastersOpen ? (
        <section className="grid gap-4 rounded-md border border-line bg-white p-4 xl:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Tipos de documento</h2>
                <p className="text-sm text-neutral-500">Codigos DIAN para identificacion de terceros.</p>
              </div>
              <ListPlus className="text-apex" size={18} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[90px_1fr_120px]">
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo" value={docDraft.code} onChange={(event) => setDocDraft((prev) => ({ ...prev, code: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Descripcion" value={docDraft.description} onChange={(event) => setDocDraft((prev) => ({ ...prev, description: event.target.value }))} />
              <button className="h-10 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !docDraft.code || !docDraft.description} onClick={saveDocumentType} type="button">Guardar</button>
            </div>
            <div className="mt-3 max-h-44 overflow-auto rounded-md border border-line">
              {masters.document_types.map((item) => (
                <div className="grid grid-cols-[70px_1fr] gap-2 border-b border-line px-3 py-2 text-sm last:border-0" key={item.code}>
                  <span className="font-mono text-xs font-semibold">{item.code}</span>
                  <span>{item.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Ciudades y codigos DANE</h2>
                <p className="text-sm text-neutral-500">Ubicaciones autorizadas para terceros.</p>
              </div>
              <ListPlus className="text-apex" size={18} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[110px_1fr_1fr_120px]">
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="DANE" value={locationDraft.dane_code} onChange={(event) => setLocationDraft((prev) => ({ ...prev, dane_code: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Ciudad" value={locationDraft.city} onChange={(event) => setLocationDraft((prev) => ({ ...prev, city: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Departamento" value={locationDraft.department} onChange={(event) => setLocationDraft((prev) => ({ ...prev, department: event.target.value }))} />
              <button className="h-10 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !locationDraft.dane_code || !locationDraft.city || !locationDraft.department} onClick={saveLocation} type="button">Guardar</button>
            </div>
            <div className="mt-3 max-h-44 overflow-auto rounded-md border border-line">
              {masters.locations.map((item) => (
                <div className="grid grid-cols-[80px_1fr_1fr] gap-2 border-b border-line px-3 py-2 text-sm last:border-0" key={item.dane_code}>
                  <span className="font-mono text-xs font-semibold">{item.dane_code}</span>
                  <span>{item.city}</span>
                  <span className="text-neutral-500">{item.department}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
          <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, razon social o NIT" />
        </label>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">Todos los tipos</option>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </section>

      <section className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-neutral-500">
              <th className="px-4 py-3">Tercero</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Ubicacion</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={7}>Cargando...</td></tr> : null}
            {!loading && items.length === 0 ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={7}>No hay terceros para mostrar.</td></tr> : null}
            {items.map((item) => (
              <tr className="border-b border-line/70 last:border-0" key={item.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{item.legal_name || item.name}</p>
                  <p className="text-xs text-neutral-500">{item.name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-xs">{normalizeDocumentType(item.tax_type || item.metadata?.document_type)} {item.tax_id || "-"}{item.metadata?.verification_digit !== null && item.metadata?.verification_digit !== undefined ? `-${item.metadata.verification_digit}` : ""}</p>
                  <p className="text-xs text-neutral-500">{documentLabels[normalizeDocumentType(item.tax_type || item.metadata?.document_type)] || item.tax_type || "Documento"}</p>
                </td>
                <td className="px-4 py-3">{TYPES.find(([value]) => value === item.type)?.[1] || item.type}</td>
                <td className="px-4 py-3">{[item.city, item.metadata?.department].filter(Boolean).join(", ") || "-"}</td>
                <td className="px-4 py-3">
                  <p>{item.email || "-"}</p>
                  <p className="text-xs text-neutral-500">{item.phone || ""}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                    {item.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => openEdit(item)} type="button" aria-label="Editar tercero">
                    <Edit3 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modalOpen ? (
        <ModalFrame title={editing ? "Editar tercero" : "Nuevo tercero"} onClose={() => setModalOpen(false)} maxWidth="max-w-5xl">
          <form className="space-y-5" onSubmit={save}>
            <section className="grid gap-4 md:grid-cols-4">
              <label className="text-sm">
                Tipo
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                  {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Persona
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.person_type} onChange={(event) => setForm((prev) => ({ ...prev, person_type: event.target.value }))}>
                  <option value="juridica">Juridica</option>
                  <option value="natural">Natural</option>
                </select>
              </label>
              <label className="text-sm">
                Tipo documento
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.document_type} onChange={(event) => setForm((prev) => ({ ...prev, document_type: event.target.value }))}>
                  {masters.document_types.filter((item) => item.active !== false).map((item) => <option key={item.code} value={item.code}>{item.code} - {item.description}</option>)}
                </select>
              </label>
              <label className="text-sm">
                NIT / Documento
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.tax_id} onChange={(event) => setForm((prev) => ({ ...prev, tax_id: event.target.value }))} />
              </label>
              <label className="text-sm">
                Digito verificacion
                <input className="mt-1 h-10 w-full rounded-md border border-line bg-neutral-50 px-3 text-sm text-neutral-600" value={computedVerificationDigit} readOnly />
              </label>
              {form.person_type === "natural" ? (
                <>
                  <label className="text-sm">
                    Primer nombre
                    <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.first_name} onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))} required />
                  </label>
                  <label className="text-sm">
                    Segundo nombre
                    <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.middle_name} onChange={(event) => setForm((prev) => ({ ...prev, middle_name: event.target.value }))} />
                  </label>
                  <label className="text-sm">
                    Primer apellido
                    <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.first_last_name} onChange={(event) => setForm((prev) => ({ ...prev, first_last_name: event.target.value }))} required />
                  </label>
                  <label className="text-sm">
                    Segundo apellido
                    <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.second_last_name} onChange={(event) => setForm((prev) => ({ ...prev, second_last_name: event.target.value }))} />
                  </label>
                  <label className="text-sm md:col-span-4">
                    Razon social
                    <input className="mt-1 h-10 w-full rounded-md border border-line bg-neutral-50 px-3 text-sm text-neutral-600" value={computedLegalName} readOnly />
                  </label>
                </>
              ) : (
                <>
                  <label className="text-sm md:col-span-2">
                    Nombre comercial
                    <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
                  </label>
                  <label className="text-sm">
                    Razon social
                    <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.legal_name} onChange={(event) => setForm((prev) => ({ ...prev, legal_name: event.target.value }))} />
                  </label>
                </>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <label className="text-sm">
                Ciudad
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" list="accounting-dane-locations" value={form.city} onChange={(event) => {
                  const location = masters.locations.find((item) => item.city.toLowerCase() === event.target.value.toLowerCase());
                  setForm((prev) => ({ ...prev, city: event.target.value, department: location?.department || prev.department, dane_code: location?.dane_code || prev.dane_code }));
                }} />
              </label>
              <label className="text-sm">
                Departamento
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.department} onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))} readOnly />
              </label>
              <label className="text-sm">
                Codigo DANE
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.dane_code} onChange={(event) => applyLocation(event.target.value)}>
                  <option value="">Seleccionar</option>
                  {masters.locations.filter((item) => item.active !== false).map((item) => <option key={item.dane_code} value={item.dane_code}>{item.dane_code} - {item.city}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Activo
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.active ? "true" : "false"} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.value === "true" }))}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                Correo
                <input className={`mt-1 h-10 w-full rounded-md border px-3 text-sm ${form.email && !isValidEmail(form.email) ? "border-red-300 bg-red-50" : "border-line"}`} type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
              </label>
              <label className="text-sm">
                Telefono
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </label>
              <label className="text-sm">
                Responsabilidades
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="R-99-PN, O-13..." value={form.tax_responsibilities} onChange={(event) => setForm((prev) => ({ ...prev, tax_responsibilities: event.target.value }))} />
              </label>
              <label className="text-sm md:col-span-4">
                Direccion
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
              </label>
            </section>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
              <button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
          <datalist id="accounting-dane-locations">
            {masters.locations.filter((item) => item.active !== false).map((item) => <option key={item.dane_code} value={item.city}>{item.department} - {item.dane_code}</option>)}
          </datalist>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">{label}</p>
        <Users size={15} className="text-apex" />
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
