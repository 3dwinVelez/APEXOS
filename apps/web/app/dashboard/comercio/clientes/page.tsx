"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioNav } from "@/components/comercio-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AccessDenied, Check, Field, ModuleHeader, StatusPill, describeError, useComercioAccess } from "@/components/comercio/shared";

// Maestro de clientes del Comercio (GET /api/v1/comercio/customers). Es un cliente propio
// del modulo: no se mezcla con los Parties del ERP. Desactivar esta bloqueado si tiene
// creditos vigentes (lo decide el servidor por el endpoint activate/deactivate, no por el PUT).
type Customer = {
  id: number;
  code: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  notes: string | null;
};

type CustomerForm = { name: string; document: string; phone: string; email: string; address: string; notes: string };

const emptyForm: CustomerForm = { name: "", document: "", phone: "", email: "", address: "", notes: "" };

export default function ComercioClientesPage() {
  const access = useComercioAccess();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Customer[]; total: number }>("/api/v1/comercio/customers?include_inactive=true&limit=500", { cache: "no-store" });
      setCustomers(result.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los clientes."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers.filter((row) => {
      if (!showInactive && !row.active) return false;
      if (needle && !`${row.name} ${row.code} ${row.document || ""} ${row.phone || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [customers, query, showInactive]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        document: form.document.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined
      };
      if (editing) {
        await api(`/api/v1/comercio/customers/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        setMessage(`Cliente ${editing.code} actualizado.`);
      } else {
        const created = await api<Customer>("/api/v1/comercio/customers", { method: "POST", body: JSON.stringify(body) });
        setMessage(`Cliente creado: ${created.code} · ${created.name}`);
      }
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar el cliente."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(customer: Customer) {
    setError("");
    try {
      await api(`/api/v1/comercio/customers/${customer.id}/${customer.active ? "deactivate" : "activate"}`, { method: "POST" });
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible cambiar el estado del cliente."));
    }
  }

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Directorio propio del comercio para ventas a credito y seguimiento de cartera." title="Clientes" />
      <ComercioNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block max-w-md flex-1">
              <Users className="absolute left-3 top-3 text-neutral-400" size={16} />
              <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, codigo, documento o telefono" value={query} />
            </label>
            <Check checked={showInactive} label="Ver inactivos" onChange={setShowInactive} />
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={() => void load()} type="button"><RefreshCw size={14} /> Actualizar</button>
            {access.canWrite ? (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setEditing(null); setForm(emptyForm); setEditorOpen(true); }} type="button"><Plus size={14} /> Nuevo cliente</button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando clientes...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">Sin clientes. Crea el primero para poder vender a credito.</p>
        ) : (
          <>
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
              {filtered.map((customer) => (
                <li className="rounded-md border border-line p-3" key={customer.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{customer.name}</p>
                      <p className="font-mono text-xs text-neutral-500">{customer.code}</p>
                    </div>
                    <StatusPill tone={customer.active ? "ok" : "muted"}>{customer.active ? "Activo" : "Inactivo"}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">{customer.document || "Sin documento"} · {customer.phone || "Sin telefono"}</p>
                  {access.canWrite ? (
                    <div className="mt-3 flex gap-2">
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setEditing(customer); setForm({ name: customer.name, document: customer.document || "", phone: customer.phone || "", email: customer.email || "", address: customer.address || "", notes: customer.notes || "" }); setEditorOpen(true); }} type="button">Editar</button>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void toggleActive(customer)} type="button">{customer.active ? "Desactivar" : "Activar"}</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="p-3">Codigo</th>
                    <th>Nombre</th>
                    <th>Documento</th>
                    <th>Telefono</th>
                    <th>Correo</th>
                    <th>Estado</th>
                    {access.canWrite ? <th className="pr-3 text-right">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => (
                    <tr className="border-b" key={customer.id}>
                      <td className="p-3 font-mono">{customer.code}</td>
                      <td className="p-3 font-medium">{customer.name}</td>
                      <td className="p-3">{customer.document || "--"}</td>
                      <td className="p-3">{customer.phone || "--"}</td>
                      <td className="p-3">{customer.email || "--"}</td>
                      <td className="p-3">{customer.active ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="muted">Inactivo</StatusPill>}</td>
                      {access.canWrite ? (
                        <td className="p-3 pr-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setEditing(customer); setForm({ name: customer.name, document: customer.document || "", phone: customer.phone || "", email: customer.email || "", address: customer.address || "", notes: customer.notes || "" }); setEditorOpen(true); }} type="button">Editar</button>
                            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void toggleActive(customer)} type="button">{customer.active ? "Desactivar" : "Activar"}</button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {editorOpen ? (
        <ModalFrame maxWidth="md:max-w-2xl" onClose={() => setEditorOpen(false)} title={editing ? `Editar cliente ${editing.code}` : "Nuevo cliente"}>
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Nombre">
                  <input className="control" maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
                </Field>
              </div>
              <Field label="Documento (opcional)">
                <input className="control" maxLength={30} onChange={(event) => setForm({ ...form, document: event.target.value })} value={form.document} />
              </Field>
              <Field label="Telefono (opcional)">
                <input className="control" maxLength={30} onChange={(event) => setForm({ ...form, phone: event.target.value })} value={form.phone} />
              </Field>
              <Field label="Correo (opcional)">
                <input className="control" maxLength={160} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" value={form.email} />
              </Field>
              <Field label="Direccion (opcional)">
                <input className="control" maxLength={300} onChange={(event) => setForm({ ...form, address: event.target.value })} value={form.address} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Notas">
                  <textarea className="control" maxLength={500} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} value={form.notes} />
                </Field>
              </div>
            </div>
            <p className="text-xs text-neutral-500">El codigo (C-0001...) lo asigna el servidor. Para activar o desactivar usa el boton de la fila: un cliente con creditos vigentes no puede desactivarse.</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar cliente"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
