"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { Check, ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, matchesQuery, useComercioAccess } from "@/components/comercio/shared";

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

  const filtered = useMemo(() => customers.filter((row) => {
    if (!showInactive && !row.active) return false;
    return matchesQuery(query, row.code, row.name, row.document || "", row.phone || "", row.email || "", row.address || "");
  }), [customers, query, showInactive]);

  const hasFilters = Boolean(query.trim() || showInactive);

  function clearFilters() {
    setQuery("");
    setShowInactive(false);
  }

  function exportCustomers(rows: Customer[]) {
    downloadExcelWorkbook("comercio-clientes.xls", [{
      name: "Clientes",
      columns: [
        { key: "code", label: "Codigo" },
        { key: "name", label: "Nombre", width: 220 },
        { key: "document", label: "Documento" },
        { key: "phone", label: "Telefono" },
        { key: "email", label: "Correo" },
        { key: "address", label: "Direccion", width: 200 },
        { key: "state", label: "Estado" }
      ],
      rows: rows.map((row) => ({
        code: row.code,
        name: row.name,
        document: row.document || "",
        phone: row.phone || "",
        email: row.email || "",
        address: row.address || "",
        state: row.active ? "Activo" : "Inactivo"
      }))
    }]);
  }

  function openEditor(customer: Customer | null) {
    setEditing(customer);
    setForm(customer
      ? { name: customer.name, document: customer.document || "", phone: customer.phone || "", email: customer.email || "", address: customer.address || "", notes: customer.notes || "" }
      : emptyForm);
    setEditorOpen(true);
  }

  const columns: DataColumn<Customer>[] = [
    { className: "font-mono", cell: (row) => row.code, header: "Codigo", hideable: false, id: "code", sortValue: (row) => row.code },
    {
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          {row.address ? <p className="truncate text-xs text-content-muted">{row.address}</p> : null}
        </div>
      ),
      header: "Nombre",
      hideable: false,
      id: "name",
      sortValue: (row) => row.name
    },
    { cell: (row) => row.document || "--", header: "Documento", id: "document", sortValue: (row) => row.document || "" },
    { cell: (row) => row.phone || "--", header: "Telefono", id: "phone", sortValue: (row) => row.phone || "" },
    { cell: (row) => row.email || "--", header: "Correo", id: "email", sortValue: (row) => row.email || "" },
    { cell: (row) => (row.active ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="muted">Inactivo</StatusPill>), header: "Estado", id: "state", sortValue: (row) => (row.active ? 1 : 0) },
    {
      className: "text-right",
      cell: (row) => (access.canWrite ? <Button onClick={() => openEditor(row)} size="compact" variant="secondary"><Users size={12} /> Ficha</Button> : null),
      header: "Acciones",
      hideable: false,
      id: "action"
    }
  ];

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
      setMessage(`Cliente ${customer.code} ${customer.active ? "desactivado" : "reactivado"}.`);
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible cambiar el estado del cliente."));
    }
  }
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Maestros" subtitle="Directorio propio del comercio para ventas a credito y seguimiento de cartera." title="Clientes" />
      <ComercioMessages error={error} message={message} />

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto] lg:items-end">
          <Field label="Buscar">
            <span className="relative block">
              <Users className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar clientes por codigo, nombre, documento, telefono o correo" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, codigo, documento o telefono" value={query} />
            </span>
          </Field>
          <div className="flex items-center gap-3 pb-2 text-sm lg:pb-0">
            <Check checked={showInactive} label="Ver inactivos" onChange={setShowInactive} />
          </div>
          <div className="flex items-center gap-2 lg:justify-end">
            <Button disabled={!filtered.length} onClick={() => exportCustomers(filtered)} size="compact" variant="secondary"><Download size={14} /> Excel</Button>
            <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
          </div>
          {access.canWrite ? <Button onClick={() => openEditor(null)} size="compact"><Plus size={14} /> Nuevo cliente</Button> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-content-muted">
          {hasFilters ? <Button onClick={clearFilters} size="compact" variant="ghost">Limpiar filtros</Button> : <span>Un cliente con creditos vigentes no se puede desactivar; el servidor lo bloquea.</span>}
          <span aria-live="polite" className="font-semibold text-content-body">{filtered.length} de {customers.length} clientes</span>
        </div>

        {!loading && filtered.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
            {filtered.map((customer) => {
              const cardBody = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{customer.name}</p>
                      <p className="font-mono text-xs text-content-muted">{customer.code}</p>
                    </div>
                    <StatusPill tone={customer.active ? "ok" : "muted"}>{customer.active ? "Activo" : "Inactivo"}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-content-body">{customer.document || "Sin documento"} · {customer.phone || "Sin telefono"}</p>
                  {customer.email ? <p className="truncate text-xs text-content-muted">{customer.email}</p> : null}
                  {access.canWrite ? <p className="mt-2 text-xs font-medium text-apex">Abrir ficha</p> : null}
                </>
              );
              return (
                <li className="rounded-md border border-line p-3" key={customer.id}>
                  {access.canWrite ? (
                    <button className="block w-full text-left" onClick={() => openEditor(customer)} type="button">{cardBody}</button>
                  ) : cardBody}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="hidden p-4 lg:block">
          <SmartDataTable
            bulkActions={(selected, clear) => (
              <>
                <Button onClick={() => exportCustomers(selected)} size="compact" variant="secondary"><Download size={14} /> Exportar {selected.length}</Button>
                <Button onClick={clear} size="compact" variant="ghost">Limpiar seleccion</Button>
              </>
            )}
            columns={columns}
            emptyDetail={customers.length ? "Ajusta o limpia los filtros para volver a ver clientes." : "Crea el primer cliente para poder vender a credito."}
            emptyTitle={customers.length ? "Ningun cliente con estos filtros" : "Aun no tienes clientes"}
            loading={loading}
            pageSize={12}
            rowKey={(row) => row.id}
            rows={filtered}
            storageKey="comercio-clientes"
          />
        </div>
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
            <p className="text-xs text-content-muted">El codigo (C-0001...) lo asigna el servidor. Desactivar deja el cliente fuera de ventas y de la vitrina, pero conserva su historial; un cliente con creditos vigentes no se desactiva.</p>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              {editing && access.canWrite ? (
                <Button disabled={saving} onClick={() => void toggleActive(editing)} type="button" variant="secondary">
                  {editing.active ? "Desactivar cliente" : "Reactivar cliente"}
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
                <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar cliente"}</button>
              </div>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
