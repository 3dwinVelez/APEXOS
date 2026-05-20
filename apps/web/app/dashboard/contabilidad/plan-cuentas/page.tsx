"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Power, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Account = {
  id: number;
  code: string;
  name: string;
  type: string;
  nature: "debit" | "credit";
  level: number;
  allows_tx: boolean;
  active: boolean;
  requires_third_party?: boolean;
  requires_cost_center?: boolean;
  handles_tax?: boolean;
};

const EMPTY = { code: "", name: "", type: "asset", level: 1, allows_tx: true, active: true };
const TYPES = [
  ["asset", "Activo"],
  ["liability", "Pasivo"],
  ["equity", "Patrimonio"],
  ["income", "Ingreso"],
  ["expense", "Gasto"],
  ["cost", "Costo"],
  ["order", "Orden"]
];

export default function PlanCuentasPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Account | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [country, setCountry] = useState("CO");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (type) params.set("type", type);
      const rows = await api<Account[]>(`/api/v1/accounting/accounts${params.size ? `?${params.toString()}` : ""}`);
      setAccounts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el plan de cuentas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [search, type]);

  const stats = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((account) => account.active).length,
    tax: accounts.filter((account) => account.handles_tax).length,
    thirdParty: accounts.filter((account) => account.requires_third_party).length
  }), [accounts]);

  async function initChart() {
    setError("");
    setOk("");
    try {
      const rows = await api<Account[]>("/api/v1/accounting/chart/init", {
        method: "POST",
        body: JSON.stringify({ country })
      });
      setAccounts(rows);
      setOk(`Plan disponible con ${rows.length} cuentas`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo inicializar");
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({
      code: account.code,
      name: account.name,
      type: account.type,
      level: account.level,
      allows_tx: account.allows_tx,
      active: account.active
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      await api<Account>(editing ? `/api/v1/accounting/accounts/${editing.id}` : "/api/v1/accounting/accounts", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form)
      });
      setModalOpen(false);
      setOk(editing ? "Cuenta actualizada" : "Cuenta creada");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la cuenta");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccount(account: Account) {
    setError("");
    try {
      await api<Account>(`/api/v1/accounting/accounts/${account.id}`, {
        method: "PUT",
        body: JSON.stringify({ code: account.code, name: account.name, type: account.type, active: !account.active })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Plan de cuentas</h1>
          <p className="mt-1 text-sm text-neutral-600">Mantenedor PUCC con estructura Colombia, naturaleza, estado y reglas contables visibles.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={openCreate} type="button">
          <Plus size={16} /> Nueva cuenta
        </button>
      </header>
      <ContabilidadNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-line bg-white p-3">
          <p className="text-xs text-neutral-500">Cuentas</p>
          <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-3">
          <p className="text-xs text-neutral-500">Activas</p>
          <p className="mt-1 text-2xl font-semibold">{stats.active}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-3">
          <p className="text-xs text-neutral-500">Manejan impuesto</p>
          <p className="mt-1 text-2xl font-semibold">{stats.tax}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-3">
          <p className="text-xs text-neutral-500">Requieren tercero</p>
          <p className="mt-1 text-2xl font-semibold">{stats.thirdParty}</p>
        </div>
      </section>

      <section className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[1fr_180px_120px_240px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
          <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por codigo o nombre" />
        </label>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">Todos los tipos</option>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className="h-10 rounded-md border border-line px-3 text-sm" value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} />
        <button className="h-10 rounded-md border border-apex px-4 text-sm font-medium text-apex hover:bg-[#146C6312]" onClick={initChart} type="button">Inicializar PUCC</button>
      </section>

      <section className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-neutral-500">
              <th className="px-4 py-3">Codigo</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Naturaleza</th>
              <th className="px-4 py-3">Reglas</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={7}>Cargando...</td></tr> : null}
            {!loading && accounts.length === 0 ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={7}>No hay cuentas para mostrar.</td></tr> : null}
            {accounts.map((account) => (
              <tr className="border-b border-line/70 last:border-0" key={account.id}>
                <td className="px-4 py-3 font-mono text-xs">{account.code}</td>
                <td className="px-4 py-3 font-medium">{account.name}</td>
                <td className="px-4 py-3">{TYPES.find(([value]) => value === account.type)?.[1] || account.type}</td>
                <td className="px-4 py-3">{account.nature === "debit" ? "Debito" : "Credito"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {account.requires_third_party ? <span className="rounded-md bg-paper px-2 py-1 text-xs">Tercero</span> : null}
                    {account.requires_cost_center ? <span className="rounded-md bg-paper px-2 py-1 text-xs">Centro costo</span> : null}
                    {account.handles_tax ? <span className="rounded-md bg-paper px-2 py-1 text-xs">Impuesto</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${account.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                    {account.active ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => openEdit(account)} type="button" aria-label="Editar cuenta">
                      <Edit3 size={15} />
                    </button>
                    <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => toggleAccount(account)} type="button" aria-label="Cambiar estado">
                      <Power size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modalOpen ? (
        <ModalFrame title={editing ? "Editar cuenta" : "Nueva cuenta"} onClose={() => setModalOpen(false)} maxWidth="max-w-3xl">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
            <label className="text-sm">
              Codigo contable
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} disabled={Boolean(editing)} required />
            </label>
            <label className="text-sm">
              Tipo
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              Nombre
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
            </label>
            <label className="text-sm">
              Nivel
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="number" min={1} value={form.level} onChange={(event) => setForm((prev) => ({ ...prev, level: Number(event.target.value) }))} />
            </label>
            <div className="grid gap-2 text-sm">
              <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <input type="checkbox" checked={form.allows_tx} onChange={(event) => setForm((prev) => ({ ...prev, allows_tx: event.target.checked }))} />
                Permite movimientos
              </label>
              <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <input type="checkbox" checked={form.active} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))} />
                Cuenta activa
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4 md:col-span-2">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
              <button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
