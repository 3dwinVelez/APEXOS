"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { GastosMenoresNav } from "@/components/gastos-menores-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

// DTO del maestro de conceptos de caja menor. Solo los campos escribibles viajan en
// el POST/PUT: el esquema Fastify declara additionalProperties false.
type Concept = {
  id: number;
  code: string;
  name: string;
  account_code: string;
  advance_account_code: string | null;
  default_vat_code: string | null;
  requires_supplier: boolean;
  requires_invoice_reference: boolean;
  active: boolean;
  notes?: string | null;
};

type Account = { code: string; name: string; type: string; allows_tx: boolean; active: boolean };
type VatMaster = { code: string; concept: string; percent: number; active: boolean };

type ConceptForm = {
  code: string;
  name: string;
  account_code: string;
  advance_account_code: string;
  default_vat_code: string;
  requires_supplier: boolean;
  requires_invoice_reference: boolean;
  active: boolean;
  notes: string;
};

const emptyForm: ConceptForm = {
  code: "",
  name: "",
  account_code: "",
  advance_account_code: "",
  default_vat_code: "",
  requires_supplier: false,
  requires_invoice_reference: false,
  active: true,
  notes: ""
};

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

export default function ConceptosGastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false });
  const [rows, setRows] = useState<Concept[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vats, setVats] = useState<VatMaster[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Concept | null>(null);
  const [form, setForm] = useState<ConceptForm>({ ...emptyForm });

  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("accounting", "read"),
      canWrite: hasStoredRolePermission("accounting", "write")
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // include_inactive: el maestro administra todo el catalogo, activo e inactivo.
      const [conceptRows, accountRows, vatRows] = await Promise.all([
        api<Concept[]>("/api/v1/petty-cash/concepts?include_inactive=true"),
        api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000"),
        api<VatMaster[]>("/api/v1/accounting/vat-masters?scope=purchases")
      ]);
      setRows(conceptRows);
      setAccounts(accountRows);
      setVats(vatRows);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los conceptos de gasto menor."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  // El concepto apunta a una cuenta de gasto (mismo criterio del backend: type "expense").
  const expenseAccounts = useMemo(
    () => accounts.filter((row) => row.active !== false && row.allows_tx !== false && row.type === "expense"),
    [accounts]
  );
  // La cuenta de anticipo del concepto es opcional: activo que inicia por 13 (PUC 1330).
  const advanceAccounts = useMemo(
    () => accounts.filter((row) => row.active !== false && row.allows_tx !== false && row.type === "asset" && row.code.startsWith("13")),
    [accounts]
  );
  const activeVats = useMemo(() => vats.filter((row) => row.active !== false), [vats]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.code, row.name, row.account_code, row.advance_account_code, row.default_vat_code]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Conceptos de gasto no disponibles para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          Este maestro comparte los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultar los conceptos.
        </p>
      </section>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setMessage("");
    setError("");
    setEditorOpen(true);
  }

  function openEdit(row: Concept) {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      account_code: row.account_code,
      advance_account_code: row.advance_account_code || "",
      default_vat_code: row.default_vat_code || "",
      requires_supplier: row.requires_supplier === true,
      requires_invoice_reference: row.requires_invoice_reference === true,
      active: row.active !== false,
      notes: row.notes || ""
    });
    setMessage("");
    setError("");
    setEditorOpen(true);
  }

  // Cuerpo cerrado: unicamente las propiedades que declara el esquema del backend.
  function conceptPayload() {
    return {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      account_code: form.account_code.trim(),
      advance_account_code: form.advance_account_code.trim() || null,
      default_vat_code: form.default_vat_code || null,
      requires_supplier: form.requires_supplier,
      requires_invoice_reference: form.requires_invoice_reference,
      active: form.active,
      notes: form.notes.trim() || null
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api(`/api/v1/petty-cash/concepts/${editing.id}`, { method: "PUT", body: JSON.stringify(conceptPayload()) });
        setMessage(`Concepto ${form.code.trim().toUpperCase()} actualizado.`);
      } else {
        await api("/api/v1/petty-cash/concepts", { method: "POST", body: JSON.stringify(conceptPayload()) });
        setMessage(`Concepto ${form.code.trim().toUpperCase()} creado.`);
      }
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar el concepto de gasto menor."));
    } finally {
      setSaving(false);
    }
  }

  // activate/deactivate viajan SIN cuerpo: el backend no declara body en esas rutas
  // y Fastify responde FST_ERR_CTP_EMPTY_JSON_BODY si se envia Content-Type vacio.
  async function toggleActive(row: Concept) {
    setError("");
    try {
      const action = row.active === false ? "activate" : "deactivate";
      await api(`/api/v1/petty-cash/concepts/${row.id}/${action}`, { method: "POST" });
      setMessage(`Concepto ${row.code} ${row.active === false ? "activado" : "desactivado"}.`);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible cambiar el estado del concepto."));
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">Gastos Menores</p>
            <h1 className="text-3xl font-semibold">Conceptos de gasto</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Catálogo de egresos de caja menor con cuenta contable, IVA sugerido y requisitos de soporte.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void load()} type="button">
              <RefreshCw size={16} /> Actualizar
            </button>
            {access.canWrite ? (
              <button className="btn-primary" onClick={openCreate} type="button">
                <Plus size={16} /> Nuevo concepto
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <GastosMenoresNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <label className="relative block max-w-xl">
            <Search className="absolute left-3 top-3 text-neutral-400" size={16} />
            <input
              className="control pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por código, nombre, cuenta o IVA"
              value={query}
            />
          </label>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando conceptos de gasto menor...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="p-3">Código</th>
                  <th>Nombre</th>
                  <th>Cuenta contable</th>
                  <th>Cuenta de anticipo</th>
                  <th>IVA sugerido</th>
                  <th>Requiere proveedor</th>
                  <th>Requiere ref. factura</th>
                  <th>Activo</th>
                  {access.canWrite ? <th className="pr-3 text-right">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-3 font-mono">{row.code}</td>
                    <td className="p-3 font-medium">{row.name}</td>
                    <td className="p-3 font-mono">{row.account_code}</td>
                    <td className="p-3 font-mono">{row.advance_account_code || "--"}</td>
                    <td className="p-3">{row.default_vat_code || "Sin IVA sugerido"}</td>
                    <td className="p-3">{row.requires_supplier ? "Sí" : "No"}</td>
                    <td className="p-3">{row.requires_invoice_reference ? "Sí" : "No"}</td>
                    <td className="p-3">{row.active !== false ? "Activo" : "Inactivo"}</td>
                    {access.canWrite ? (
                      <td className="p-3 pr-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary" onClick={() => openEdit(row)} type="button">Editar</button>
                          <button className="btn-secondary" onClick={() => void toggleActive(row)} type="button">
                            {row.active === false ? "Activar" : "Desactivar"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td className="p-8 text-center text-neutral-500" colSpan={access.canWrite ? 9 : 8}>
                      {rows.length
                        ? "No hay conceptos que coincidan con la búsqueda."
                        : "Aún no hay conceptos de gasto menor. Crea el primero para poder emitir comprobantes GM."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editorOpen && access.canWrite ? (
        <ModalFrame
          maxWidth="md:max-w-3xl"
          onClose={() => setEditorOpen(false)}
          title={editing ? `Editar concepto ${editing.code}` : "Nuevo concepto de gasto menor"}
        >
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Código">
                <input
                  className="control uppercase"
                  maxLength={30}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  required
                  value={form.code}
                />
              </Field>
              <Field label="Nombre">
                <input
                  className="control"
                  maxLength={120}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                  value={form.name}
                />
              </Field>
              <Field label="Cuenta contable (gasto)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, account_code: event.target.value })}
                  required
                  value={form.account_code}
                >
                  <option value="">Seleccione una cuenta de gastos del PUC</option>
                  {expenseAccounts.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cuenta de anticipo (opcional)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, advance_account_code: event.target.value })}
                  value={form.advance_account_code}
                >
                  <option value="">Usar la cuenta de la caja</option>
                  {advanceAccounts.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="IVA sugerido (opcional)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, default_vat_code: event.target.value })}
                  value={form.default_vat_code}
                >
                  <option value="">Sin IVA sugerido</option>
                  {activeVats.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.concept} ({row.percent}%)</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-2">
                <Check
                  checked={form.requires_supplier}
                  label="Requiere proveedor"
                  onChange={(checked) => setForm({ ...form, requires_supplier: checked })}
                />
                <Check
                  checked={form.requires_invoice_reference}
                  label="Requiere referencia de factura"
                  onChange={(checked) => setForm({ ...form, requires_invoice_reference: checked })}
                />
                <Check
                  checked={form.active}
                  label="Concepto activo"
                  onChange={(checked) => setForm({ ...form, active: checked })}
                />
              </div>
              <div className="md:col-span-2">
                <Field label="Notas">
                  <textarea
                    className="control"
                    maxLength={500}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    rows={3}
                    value={form.notes}
                  />
                </Field>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              La cuenta contable debe ser de tipo gasto y la de anticipo un activo que inicie por 13; el backend valida ambos contra el PUC.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar concepto"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}
