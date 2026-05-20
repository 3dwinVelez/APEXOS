"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Search, Users } from "lucide-react";
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
    verification_digit?: number | null;
    tax_responsibilities?: string[];
    dane_code?: string | null;
    department?: string | null;
  };
};

const EMPTY = {
  type: "customer",
  name: "",
  legal_name: "",
  person_type: "juridica",
  document_type: "NIT",
  tax_id: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  department: "",
  dane_code: "",
  tax_responsibilities: "",
  active: true
};

const TYPES = [
  ["customer", "Cliente"],
  ["supplier", "Proveedor"],
  ["employee", "Empleado"],
  ["carrier", "Transportador"],
  ["creditor", "Acreedor"],
  ["debtor", "Deudor"],
  ["bank", "Entidad financiera"]
];

export default function TercerosContablesPage() {
  const [items, setItems] = useState<ThirdParty[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<ThirdParty | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
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
  }

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [search, type]);

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.active).length,
    suppliers: items.filter((item) => item.type === "supplier").length,
    customers: items.filter((item) => item.type === "customer").length
  }), [items]);

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
      document_type: item.tax_type || "NIT",
      tax_id: item.tax_id || "",
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
      const payload = {
        ...form,
        legal_name: form.legal_name || form.name,
        tax_type: form.document_type,
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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Terceros contables</h1>
          <p className="mt-1 text-sm text-neutral-600">Maestro para clientes, proveedores, empleados, transportadores, bancos y obligaciones tributarias Colombia.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={openCreate} type="button">
          <Plus size={16} /> Nuevo tercero
        </button>
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
                <td className="px-4 py-3 font-mono text-xs">{item.tax_type || "NIT"} {item.tax_id || "-"}{item.metadata?.verification_digit !== null && item.metadata?.verification_digit !== undefined ? `-${item.metadata.verification_digit}` : ""}</td>
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
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.document_type} onChange={(event) => setForm((prev) => ({ ...prev, document_type: event.target.value }))} />
              </label>
              <label className="text-sm">
                NIT / Documento
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.tax_id} onChange={(event) => setForm((prev) => ({ ...prev, tax_id: event.target.value }))} />
              </label>
              <label className="text-sm md:col-span-2">
                Nombre comercial
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label className="text-sm md:col-span-2">
                Razon social
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.legal_name} onChange={(event) => setForm((prev) => ({ ...prev, legal_name: event.target.value }))} />
              </label>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <label className="text-sm">
                Ciudad
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} />
              </label>
              <label className="text-sm">
                Departamento
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.department} onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))} />
              </label>
              <label className="text-sm">
                Codigo DANE
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.dane_code} onChange={(event) => setForm((prev) => ({ ...prev, dane_code: event.target.value }))} />
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
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
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
