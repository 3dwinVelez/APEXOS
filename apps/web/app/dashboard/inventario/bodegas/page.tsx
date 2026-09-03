"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { LATAM_COUNTRIES } from "@/lib/latam";

type Society = { code: string; name: string; active: boolean };
type Branch = { code: string; name: string; society_code: string; active: boolean };
type CostCenter = { code: string; name: string; society_code: string; branch_code: string; active: boolean };
type OrganizationTree = { societies: Society[]; branches: Branch[]; cost_centers: CostCenter[] };
type WarehouseType = "owned" | "consignment";
type Customer = { id: number; name: string; legal_name?: string; tax_id?: string };
type LocationMaster={dane_code:string;city:string;department:string;active?:boolean};
type WarehouseRow = {
  id: number;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  warehouse_type_label: string;
  address: string;
  city: string;
  country: string;
  society_code: string;
  branch_code: string;
  cost_center_code: string;
  active: boolean;
  locations_count: number;
  stock_total: number;
  consignment_customer_id?: number | null;
  consignment_customer_name?: string;
};

const EMPTY_TREE: OrganizationTree = { societies: [], branches: [], cost_centers: [] };
const EMPTY_FORM = {
  id: 0,
  code: "",
  name: "",
  warehouse_type: "owned" as WarehouseType,
  consignment_customer_id: 0,
  address: "",
  city: "",
  country: "CO",
  society_code: "",
  branch_code: "",
  cost_center_code: "",
  active: true
};

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [tree, setTree] = useState<OrganizationTree>(EMPTY_TREE);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations,setLocations]=useState<LocationMaster[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [warehouseRows, orgTree, customerRows, masters] = await Promise.all([
        api<WarehouseRow[]>("/api/v1/inventory/warehouses?active=all"),
        api<OrganizationTree>("/api/v1/accounting/organization-tree"),
        api<Customer[]>("/api/v1/sales/customers"),
        api<{locations:LocationMaster[]}>("/api/v1/accounting/third-party-masters")
      ]);
      setWarehouses(warehouseRows || []);
      setTree(orgTree || EMPTY_TREE);
      setCustomers(customerRows || []);
      setLocations((masters.locations||[]).filter(row=>row.active!==false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el maestro de bodegas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeSocieties = tree.societies.filter((item) => item.active !== false);
  const activeBranches = tree.branches.filter((item) => item.active !== false && (!form.society_code || item.society_code === form.society_code));
  const activeCostCenters = tree.cost_centers.filter((item) => item.active !== false && item.society_code === form.society_code && item.branch_code === form.branch_code);
  const stats = useMemo(() => ({
    total: warehouses.length,
    owned: warehouses.filter((item) => item.warehouse_type === "owned").length,
    consignment: warehouses.filter((item) => item.warehouse_type === "consignment").length
  }), [warehouses]);
  const filtered = warehouses.filter((item) => {
    const text = query.trim().toLowerCase();
    if (!text) return true;
    return [item.code, item.name, item.city, item.society_code, item.branch_code, item.cost_center_code, item.warehouse_type_label]
      .some((value) => String(value || "").toLowerCase().includes(text));
  });

  function openCreate() {
    const society = activeSocieties[0]?.code || "";
    const branch = tree.branches.find((item) => item.active !== false && item.society_code === society)?.code || "";
    const costCenter = tree.cost_centers.find((item) => item.active !== false && item.society_code === society && item.branch_code === branch)?.code || "";
    setForm({ ...EMPTY_FORM, society_code: society, branch_code: branch, cost_center_code: costCenter });
    setModalOpen(true);
  }

  function openEdit(row: WarehouseRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      warehouse_type: row.warehouse_type || "owned",
      consignment_customer_id: row.consignment_customer_id || 0,
      address: row.address || "",
      city: row.city || "",
      country: row.country || "CO",
      society_code: row.society_code || "",
      branch_code: row.branch_code || "",
      cost_center_code: row.cost_center_code || "",
      active: row.active !== false
    });
    setModalOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const payload = { ...form, code: form.code.toUpperCase(), country: form.country.toUpperCase() };
      const rows = await api<WarehouseRow[]>(form.id ? `/api/v1/inventory/warehouses/${form.id}` : "/api/v1/inventory/warehouses", {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      setWarehouses(rows);
      setModalOpen(false);
      setOk(form.id ? "Bodega actualizada" : "Bodega creada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la bodega");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: WarehouseRow) {
    if (!window.confirm(`Confirma borrar la bodega ${row.code}.`)) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      setWarehouses(await api<WarehouseRow[]>(`/api/v1/inventory/warehouses/${row.id}`, { method: "DELETE" }));
      setOk("Bodega eliminada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la bodega");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-apex">Inventario</p>
          <h1 className="text-3xl font-semibold">Maestro de bodegas</h1>
          <p className="mt-1 text-sm text-neutral-600">Administra bodegas propias o en consignacion enlazadas a sociedad, sucursal y centro de costo.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={openCreate} type="button">
          <Plus size={16} /> Nueva bodega
        </button>
      </header>
      <InventoryNav />

      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={Warehouse} label="Bodegas" value={stats.total} />
        <Metric icon={Building2} label="Propias" value={stats.owned} />
        <Metric icon={Building2} label="Consignacion" value={stats.consignment} />
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">Bodegas registradas</h2>
          <label className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar codigo, sociedad, ciudad..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-neutral-500">
                <th className="px-4 py-3">Codigo</th>
                <th className="px-4 py-3">Bodega</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Cliente consignacion</th>
                <th className="px-4 py-3">Sociedad</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Centro costo</th>
                <th className="px-4 py-3">Ubicaciones</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td className="px-4 py-6 text-neutral-500" colSpan={10}>Cargando...</td></tr> : null}
              {!loading && !filtered.length ? <tr><td className="px-4 py-6 text-neutral-500" colSpan={10}>No hay bodegas registradas.</td></tr> : null}
              {filtered.map((row) => (
                <tr className="border-b border-line/70 last:border-0" key={row.id}>
                  <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-neutral-500">{[row.city, row.address].filter(Boolean).join(" · ") || "Sin direccion"}</p>
                  </td>
                  <td className="px-4 py-3">{row.warehouse_type_label}</td>
                  <td className="px-4 py-3">{row.consignment_customer_name || "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.society_code}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.branch_code}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.cost_center_code}</td>
                  <td className="px-4 py-3">{row.locations_count}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                      {row.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white hover:bg-paper" onClick={() => openEdit(row)} type="button" aria-label="Editar bodega">
                        <Pencil size={14} />
                      </button>
                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={saving} onClick={() => remove(row)} type="button" aria-label="Borrar bodega">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <ModalFrame title={form.id ? "Editar bodega" : "Nueva bodega"} onClose={() => setModalOpen(false)} maxWidth="md:max-w-3xl">
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Codigo
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required />
              </label>
              <label className="text-sm">Nombre
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label className="text-sm">Tipo de bodega
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.warehouse_type} onChange={(event) => setForm((current) => ({ ...current, warehouse_type: event.target.value as WarehouseType }))} required>
                  <option value="owned">Propia</option>
                  <option value="consignment">Consignacion</option>
                </select>
              </label>
              <label className="text-sm">Pais
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value,city:"" }))}>{LATAM_COUNTRIES.map(row=><option key={row.code} value={row.code}>{row.name}</option>)}</select>
              </label>
              {form.warehouse_type === "consignment" ? (
                <label className="text-sm">Cliente propietario
                  <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.consignment_customer_id} onChange={(event) => setForm((current) => ({ ...current, consignment_customer_id: Number(event.target.value) }))} required>
                    <option value={0}>Seleccionar cliente</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legal_name || customer.name}{customer.tax_id ? ` (${customer.tax_id})` : ""}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="text-sm">Ciudad
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}><option value="">Seleccionar</option>{locations.map(row=><option key={row.dane_code} value={row.city}>{row.city} - {row.department}</option>)}</select>
              </label>
              <label className="text-sm">Direccion
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm">Sociedad
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.society_code} onChange={(event) => setForm((current) => ({ ...current, society_code: event.target.value, branch_code: "", cost_center_code: "" }))} required>
                  <option value="">Seleccionar</option>
                  {activeSocieties.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Sucursal
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.branch_code} onChange={(event) => setForm((current) => ({ ...current, branch_code: event.target.value, cost_center_code: "" }))} required>
                  <option value="">Seleccionar</option>
                  {activeBranches.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Centro de costo
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.cost_center_code} onChange={(event) => setForm((current) => ({ ...current, cost_center_code: event.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {activeCostCenters.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-sm">Estado
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.active ? "true" : "false"} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === "true" }))}>
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
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

function Metric({ icon: Icon, label, value }: { icon: typeof Warehouse; label: string; value: number }) {
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
