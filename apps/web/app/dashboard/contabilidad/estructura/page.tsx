"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, GitBranch, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Society = { code: string; name: string; active: boolean };
type Branch = { code: string; name: string; society_code: string; active: boolean };
type CostCenter = { code: string; name: string; society_code: string; branch_code: string; active: boolean };
type OrganizationTree = { societies: Society[]; branches: Branch[]; cost_centers: CostCenter[] };
type OrgType = "society" | "branch" | "cost_center";

const EMPTY_TREE: OrganizationTree = { societies: [], branches: [], cost_centers: [] };
const EMPTY_FORM = { type: "society" as OrgType, code: "", name: "", society_code: "", branch_code: "", active: true };

export default function EstructuraContablePage() {
  const [tree, setTree] = useState<OrganizationTree>(EMPTY_TREE);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setTree(await api<OrganizationTree>("/api/v1/accounting/organization-tree"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la estructura");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeSocieties = tree.societies.filter((item) => item.active !== false);
  const activeBranches = tree.branches.filter((item) => item.active !== false && (!form.society_code || item.society_code === form.society_code));
  const stats = useMemo(() => ({
    societies: tree.societies.length,
    branches: tree.branches.length,
    costCenters: tree.cost_centers.length
  }), [tree]);

  function setType(type: OrgType) {
    setForm((current) => ({ ...EMPTY_FORM, type, society_code: current.society_code }));
  }

  function openCreate(type: OrgType) {
    setForm({ ...EMPTY_FORM, type });
    setModalOpen(true);
  }

  function openEdit(type: OrgType, item: Society | Branch | CostCenter) {
    setForm({
      type,
      code: item.code,
      name: item.name,
      society_code: "society_code" in item ? item.society_code : "",
      branch_code: "branch_code" in item ? item.branch_code : "",
      active: item.active !== false
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const next = await api<OrganizationTree>("/api/v1/accounting/organization-tree", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setTree(next);
      setForm((current) => ({ ...EMPTY_FORM, type: current.type }));
      setModalOpen(false);
      setOk("Estructura actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la estructura");
    } finally {
      setSaving(false);
    }
  }

  async function remove(type: OrgType, code: string) {
    if (!window.confirm("Confirma borrar este registro de la estructura contable.")) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      setTree(await api<OrganizationTree>(`/api/v1/accounting/organization-tree/${type}/${encodeURIComponent(code)}`, { method: "DELETE" }));
      setOk("Registro eliminado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el registro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Estructura contable</h1>
          <p className="mt-1 text-sm text-neutral-600">Relacion jerarquica sociedad, sucursal y centro de costo para mantener la imputacion enlazada.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={() => openCreate("society")} type="button">
          <Plus size={16} /> Nuevo registro
        </button>
      </header>
      <ContabilidadNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={Landmark} label="Sociedades" value={stats.societies} />
        <Metric icon={Building2} label="Sucursales" value={stats.branches} />
        <Metric icon={GitBranch} label="Centros de costo" value={stats.costCenters} />
      </section>

      <section>
        <section className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Arbol enlazado</h2>
            <div className="flex flex-wrap gap-2">
              <button className="h-9 rounded-md border border-line px-3 text-sm" onClick={() => openCreate("branch")} type="button">Nueva sucursal</button>
              <button className="h-9 rounded-md border border-line px-3 text-sm" onClick={() => openCreate("cost_center")} type="button">Nuevo centro</button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-neutral-500">Cargando...</p> : null}
            {!loading && !tree.societies.length ? <p className="text-sm text-neutral-500">No hay sociedades registradas.</p> : null}
            {tree.societies.map((society) => (
              <article className="rounded-md border border-line p-3" key={society.code}>
                <Header code={society.code} name={society.name} active={society.active} onEdit={() => openEdit("society", society)} onDelete={() => remove("society", society.code)} />
                <div className="mt-3 space-y-2 border-l border-line pl-4">
                  {tree.branches.filter((branch) => branch.society_code === society.code).map((branch) => (
                    <div className="rounded-md bg-paper p-3" key={branch.code}>
                      <Header code={branch.code} name={branch.name} active={branch.active} onEdit={() => openEdit("branch", branch)} onDelete={() => remove("branch", branch.code)} small />
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {tree.cost_centers.filter((center) => center.branch_code === branch.code).map((center) => (
                          <div className="rounded-md border border-line bg-white px-3 py-2 text-sm" key={center.code}>
                            <Header code={center.code} name={center.name} active={center.active} onEdit={() => openEdit("cost_center", center)} onDelete={() => remove("cost_center", center.code)} small />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {modalOpen ? (
        <ModalFrame title="Estructura contable" onClose={() => setModalOpen(false)} maxWidth="md:max-w-xl">
          <form className="space-y-3" onSubmit={save}>
            <label className="block text-sm">
              Nivel
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.type} onChange={(event) => setType(event.target.value as OrgType)}>
                <option value="society">Sociedad</option>
                <option value="branch">Sucursal</option>
                <option value="cost_center">Centro de costo</option>
              </select>
            </label>
            {form.type !== "society" ? (
              <label className="block text-sm">
                Sociedad
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.society_code} onChange={(event) => setForm((current) => ({ ...current, society_code: event.target.value, branch_code: "" }))} required>
                  <option value="">Seleccionar sociedad</option>
                  {activeSocieties.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </label>
            ) : null}
            {form.type === "cost_center" ? (
              <label className="block text-sm">
                Sucursal
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.branch_code} onChange={(event) => setForm((current) => ({ ...current, branch_code: event.target.value }))} required>
                  <option value="">Seleccionar sucursal</option>
                  {activeBranches.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              Codigo
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} required />
            </label>
            <label className="block text-sm">
              Nombre
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label className="block text-sm">
              Estado
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.active ? "true" : "false"} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === "true" }))}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
              <button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={saving} type="submit">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Landmark; label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">{label}</p>
        <Icon size={15} className="text-apex" />
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Header({ code, name, active, onEdit, onDelete, small = false }: { code: string; name: string; active: boolean; onEdit: () => void; onDelete: () => void; small?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className={small ? "text-sm font-semibold" : "font-semibold"}>{name}</p>
        <p className="font-mono text-xs text-neutral-500">{code}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
          {active ? "Activo" : "Inactivo"}
        </span>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white hover:bg-paper" onClick={onEdit} type="button" aria-label="Editar">
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50" onClick={onDelete} type="button" aria-label="Borrar">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
