"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { GastosMenoresNav } from "@/components/gastos-menores-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

// DTO del maestro de cajas menores. custodian_name, ready_for_advances y warnings
// son derivados del servidor: solo los campos escribibles viajan en el POST/PUT
// porque el esquema Fastify declara additionalProperties false.
type Box = {
  id: number;
  code: string;
  name: string;
  account_code: string;
  advance_account_code: string;
  custodian_party_id: number | null;
  custodian_name: string | null;
  branch_code: string | null;
  cost_center_code: string | null;
  monthly_limit: number | null;
  require_advance: boolean;
  block_unliquidated_advance: boolean;
  active: boolean;
  ready_for_advances: boolean;
  warnings: string[];
  notes?: string | null;
};

type Account = { code: string; name: string; type: string; allows_tx: boolean; active: boolean };
type Party = { id: number; code: string; name: string };
type OrgBranch = { code: string; name: string; society_code: string; active: boolean };
type OrgCostCenter = { code: string; name: string; society_code: string; branch_code: string; active: boolean };
type OrgTree = { societies: { code: string; name: string }[]; branches: OrgBranch[]; cost_centers: OrgCostCenter[] };

type BoxForm = {
  code: string;
  name: string;
  account_code: string;
  advance_account_code: string;
  custodian_party_id: string;
  branch_code: string;
  cost_center_code: string;
  monthly_limit: string;
  require_advance: boolean;
  block_unliquidated_advance: boolean;
  active: boolean;
  notes: string;
};

const emptyForm: BoxForm = {
  code: "",
  name: "",
  account_code: "",
  advance_account_code: "",
  custodian_party_id: "",
  branch_code: "",
  cost_center_code: "",
  monthly_limit: "",
  require_advance: false,
  block_unliquidated_advance: false,
  active: true,
  notes: ""
};

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

export default function CajasGastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false });
  const [rows, setRows] = useState<Box[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [custodians, setCustodians] = useState<Party[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTree>({ societies: [], branches: [], cost_centers: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Box | null>(null);
  const [form, setForm] = useState<BoxForm>({ ...emptyForm });

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
      // Custodios: el backend exige tercero activo con rol proveedor o empleado.
      const [boxRows, accountRows, supplierRows, employeeRows, tree] = await Promise.all([
        api<Box[]>("/api/v1/petty-cash/boxes?include_inactive=true"),
        api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000"),
        api<Party[]>("/api/v1/accounting/third-parties?type=supplier&active=true&limit=500"),
        api<Party[]>("/api/v1/accounting/third-parties?type=employee&active=true&limit=500"),
        api<OrgTree>("/api/v1/accounting/organization-tree")
      ]);
      setRows(boxRows);
      setAccounts(accountRows);
      // Union de proveedores y empleados: cualquiera de los dos roles sirve de custodio.
      const seen = new Set<number>();
      const parties: Party[] = [];
      for (const party of [...supplierRows, ...employeeRows]) {
        if (!seen.has(party.id)) {
          seen.add(party.id);
          parties.push(party);
        }
      }
      parties.sort((left, right) => left.name.localeCompare(right.name, "es"));
      setCustodians(parties);
      setOrgTree(tree);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar las cajas menores."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  // Cuenta de efectivo de la caja: activo que inicia por 11 (PUC 1105 y afines).
  const cashAccounts = useMemo(
    () => accounts.filter((row) => row.active !== false && row.allows_tx !== false && row.type === "asset" && row.code.startsWith("11")),
    [accounts]
  );
  // Cuenta de anticipo del custodio: activo que inicia por 13 (PUC 1330). Es obligatoria.
  const advanceAccounts = useMemo(
    () => accounts.filter((row) => row.active !== false && row.allows_tx !== false && row.type === "asset" && row.code.startsWith("13")),
    [accounts]
  );
  const activeBranches = useMemo(() => orgTree.branches.filter((row) => row.active !== false), [orgTree.branches]);
  const activeCostCenters = useMemo(() => orgTree.cost_centers.filter((row) => row.active !== false), [orgTree.cost_centers]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.code, row.name, row.account_code, row.advance_account_code, row.custodian_name, row.branch_code, row.cost_center_code]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Cajas menores no disponibles para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          Este maestro comparte los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultar las cajas.
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

  function openEdit(row: Box) {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      account_code: row.account_code || "",
      advance_account_code: row.advance_account_code || "",
      custodian_party_id: row.custodian_party_id ? String(row.custodian_party_id) : "",
      branch_code: row.branch_code || "",
      cost_center_code: row.cost_center_code || "",
      monthly_limit: row.monthly_limit != null ? String(row.monthly_limit) : "",
      require_advance: row.require_advance === true,
      block_unliquidated_advance: row.block_unliquidated_advance === true,
      active: row.active !== false,
      notes: row.notes || ""
    });
    setMessage("");
    setError("");
    setEditorOpen(true);
  }

  // Cuerpo cerrado: unicamente las propiedades que declara el esquema del backend.
  function boxPayload() {
    return {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      account_code: form.account_code.trim(),
      advance_account_code: form.advance_account_code.trim(),
      custodian_party_id: form.custodian_party_id ? Number(form.custodian_party_id) : null,
      branch_code: form.branch_code || null,
      cost_center_code: form.cost_center_code || null,
      monthly_limit: form.monthly_limit.trim() ? Number(form.monthly_limit.trim()) : null,
      require_advance: form.require_advance,
      block_unliquidated_advance: form.block_unliquidated_advance,
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
        await api(`/api/v1/petty-cash/boxes/${editing.id}`, { method: "PUT", body: JSON.stringify(boxPayload()) });
        setMessage(`Caja ${form.code.trim().toUpperCase()} actualizada.`);
      } else {
        await api("/api/v1/petty-cash/boxes", { method: "POST", body: JSON.stringify(boxPayload()) });
        setMessage(`Caja ${form.code.trim().toUpperCase()} creada.`);
      }
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar la caja menor."));
    } finally {
      setSaving(false);
    }
  }

  // activate/deactivate viajan SIN cuerpo: el backend no declara body en esas rutas
  // y Fastify responde FST_ERR_CTP_EMPTY_JSON_BODY si se envia Content-Type vacio.
  async function toggleActive(row: Box) {
    setError("");
    try {
      const action = row.active === false ? "activate" : "deactivate";
      await api(`/api/v1/petty-cash/boxes/${row.id}/${action}`, { method: "POST" });
      setMessage(`Caja ${row.code} ${row.active === false ? "activada" : "desactivada"}.`);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible cambiar el estado de la caja."));
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">Gastos Menores</p>
            <h1 className="text-3xl font-semibold">Cajas menores</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Fondos de efectivo con custodio, cuenta contable, límite mensual y reglas de anticipos.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void load()} type="button">
              <RefreshCw size={16} /> Actualizar
            </button>
            {access.canWrite ? (
              <button className="btn-primary" onClick={openCreate} type="button">
                <Plus size={16} /> Nueva caja
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
              placeholder="Buscar por código, nombre, cuenta o custodio"
              value={query}
            />
          </label>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando cajas menores...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="p-3">Código</th>
                  <th>Nombre</th>
                  <th>Cuenta caja</th>
                  <th>Cuenta anticipo</th>
                  <th>Custodio</th>
                  <th>Límite mensual</th>
                  <th>Anticipo obligatorio</th>
                  <th>Bloqueo sin liquidar</th>
                  <th>Activo</th>
                  <th>Anticipos</th>
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
                    <td className="p-3">{row.custodian_name || "Sin custodio"}</td>
                    <td className="p-3">{row.monthly_limit != null ? money(row.monthly_limit) : "Sin límite"}</td>
                    <td className="p-3">{row.require_advance ? "Sí" : "No"}</td>
                    <td className="p-3">{row.block_unliquidated_advance ? "Sí" : "No"}</td>
                    <td className="p-3">{row.active !== false ? "Activo" : "Inactivo"}</td>
                    <td className="p-3">
                      {row.ready_for_advances ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Lista</span>
                      ) : row.warnings && row.warnings.length ? (
                        <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800" title={row.warnings.join(" ")}>
                          <AlertTriangle size={12} /> Pendiente
                        </span>
                      ) : (
                        <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-neutral-600">Pendiente</span>
                      )}
                      {row.warnings && row.warnings.length ? (
                        <ul className="mt-1 max-w-[220px] space-y-1 text-xs text-neutral-500">
                          {row.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
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
                    <td className="p-8 text-center text-neutral-500" colSpan={access.canWrite ? 11 : 10}>
                      {rows.length
                        ? "No hay cajas que coincidan con la búsqueda."
                        : "Aún no hay cajas menores. Crea la primera con su custodio y cuentas del PUC."}
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
          title={editing ? `Editar caja ${editing.code}` : "Nueva caja menor"}
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
              <Field label="Cuenta de caja (efectivo)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, account_code: event.target.value })}
                  required
                  value={form.account_code}
                >
                  <option value="">Seleccione una cuenta de efectivo (activo 11)</option>
                  {cashAccounts.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cuenta de anticipo (requerida)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, advance_account_code: event.target.value })}
                  required
                  value={form.advance_account_code}
                >
                  <option value="">Seleccione la cuenta de anticipos (activo 13)</option>
                  {advanceAccounts.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Custodio (opcional)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, custodian_party_id: event.target.value })}
                  value={form.custodian_party_id}
                >
                  <option value="">Sin custodio asignado</option>
                  {custodians.map((row) => (
                    <option key={row.id} value={String(row.id)}>{row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Límite mensual (opcional)">
                <input
                  className="control"
                  min="0"
                  onChange={(event) => setForm({ ...form, monthly_limit: event.target.value })}
                  placeholder="Sin límite"
                  type="number"
                  value={form.monthly_limit}
                />
              </Field>
              <Field label="Sucursal (opcional)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, branch_code: event.target.value })}
                  value={form.branch_code}
                >
                  <option value="">Sin sucursal</option>
                  {activeBranches.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Centro de costo (opcional)">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, cost_center_code: event.target.value })}
                  value={form.cost_center_code}
                >
                  <option value="">Sin centro de costo</option>
                  {activeCostCenters.map((row) => (
                    <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-2">
                <Check
                  checked={form.require_advance}
                  label="Anticipo obligatorio"
                  onChange={(checked) => setForm({ ...form, require_advance: checked })}
                />
                <Check
                  checked={form.block_unliquidated_advance}
                  label="Bloquear con anticipos sin liquidar"
                  onChange={(checked) => setForm({ ...form, block_unliquidated_advance: checked })}
                />
                <Check
                  checked={form.active}
                  label="Caja activa"
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
              La cuenta de caja debe ser un activo que inicie por 11 y la de anticipo un activo 13; el backend valida ambas contra el PUC. Sin custodio la caja queda lista solo para consultas: no podrá girar anticipos.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar caja"}</button>
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
