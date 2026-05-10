"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type InventoryItem = {
  id: number;
  code: string;
  name: string;
  type: string;
  unit: string;
  unit_cost: number;
  unit_price: number;
  stock_current: number;
  stock_min: number;
};

type InventoryListResponse = {
  data: InventoryItem[];
  total: number;
  page: number;
  pages: number;
};

const INITIAL_FORM = {
  code: "",
  name: "",
  type: "product",
  unit: "UND",
  unit_cost: 0,
  unit_price: 0,
  stock_min: 0,
  stock_max: 0
};

export function InventoryPanel() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const response = await api<InventoryListResponse>("/api/v1/inventory/items");
      setItems(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cargar inventario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      await api("/api/v1/inventory/items", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setOk("Producto creado correctamente");
      setForm(INITIAL_FORM);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible crear el producto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-line bg-white p-5">
      <h2 className="text-base font-semibold">Crear producto</h2>
      <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
        <label className="text-sm">
          Código interno
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: SKU-001" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} required />
        </label>
        <label className="text-sm">
          Nombre del producto
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: Café molido 500g" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
        </label>
        <label className="text-sm">
          Tipo
          <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
            <option value="product">Producto</option>
            <option value="service">Servicio</option>
            <option value="component">Componente</option>
            <option value="raw_material">Materia prima</option>
          </select>
        </label>
        <label className="text-sm">
          Unidad de medida
          <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}>
            <option value="UND">UND (unidad)</option>
            <option value="KG">KG (kilogramo)</option>
            <option value="LT">LT (litro)</option>
            <option value="MT">MT (metro)</option>
          </select>
        </label>
        <label className="text-sm">
          Costo unitario (lo que te cuesta)
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: 12000" type="number" min={0} value={form.unit_cost} onChange={(e) => setForm((prev) => ({ ...prev, unit_cost: Number(e.target.value) }))} required />
        </label>
        <label className="text-sm">
          Precio de venta unitario (lo que cobras)
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: 18000" type="number" min={0} value={form.unit_price} onChange={(e) => setForm((prev) => ({ ...prev, unit_price: Number(e.target.value) }))} required />
        </label>
        <label className="text-sm">
          Stock mínimo (alerta)
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: 5" type="number" min={0} value={form.stock_min} onChange={(e) => setForm((prev) => ({ ...prev, stock_min: Number(e.target.value) }))} />
        </label>
        <label className="text-sm">
          Stock máximo (meta, opcional)
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: 50" type="number" min={0} value={form.stock_max} onChange={(e) => setForm((prev) => ({ ...prev, stock_max: Number(e.target.value) }))} />
        </label>
        <button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white md:col-span-4" disabled={saving} type="submit">
          {saving ? "Guardando..." : "Crear producto"}
        </button>
      </form>
      <p className="text-xs text-neutral-500">
        Referencia rápida: `Costo` = compra, `Precio` = venta, `Stock mínimo` = dispara alerta, `Stock máximo` = nivel objetivo.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

      <div className="pt-2">
        <h3 className="mb-2 text-sm font-semibold">Productos registrados</h3>
        {loading ? <p className="text-sm text-neutral-600">Cargando...</p> : null}
        {!loading && items.length === 0 ? <p className="text-sm text-neutral-600">Aún no hay productos.</p> : null}
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Costo</th>
                  <th className="py-2 pr-3">Precio</th>
                  <th className="py-2 pr-3">Stock</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr className="border-b border-line/60" key={item.id}>
                    <td className="py-2 pr-3">{item.code}</td>
                    <td className="py-2 pr-3">{item.name}</td>
                    <td className="py-2 pr-3">{item.type}</td>
                    <td className="py-2 pr-3">{item.unit_cost}</td>
                    <td className="py-2 pr-3">{item.unit_price}</td>
                    <td className="py-2 pr-3">{item.stock_current}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
