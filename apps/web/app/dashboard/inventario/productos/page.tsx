"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, PackagePlus, Search } from "lucide-react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";
import { downloadExcelWorkbook } from "@/lib/reportExports";

type Product = {
  id: number;
  code: string;
  name: string;
  type: string;
  unit: string;
  society_code?: string | null;
  active: boolean;
  stock_current: number;
  stock_min: number;
  stock_max?: number | null;
  unit_cost: number;
  unit_price: number;
  tax_rate: number;
  abc_class?: string | null;
  category?: { id: number; name: string } | null;
};

type ProductResponse = { data: Product[]; total: number };

const TYPE_LABELS: Record<string, string> = { product: "Producto", service: "Servicio", raw_material: "Materia prima", finished_good: "Producto terminado" };

export default function ProductListPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    api<ProductResponse>("/api/v1/inventory/items?all=true&active=all&sort_by=code")
      .then((response) => setItems(response.data || []))
      .catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar la lista de productos"))
      .finally(() => setLoading(false));
  }, []);

  const families = useMemo(() => [...new Set(items.map((item) => item.category?.name || "Sin familia"))].sort((a, b) => a.localeCompare(b, "es")), [items]);
  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !needle || [item.code, item.name, item.category?.name || "", item.society_code || ""].some((value) => value.toLowerCase().includes(needle));
      const matchesFamily = !family || (item.category?.name || "Sin familia") === family;
      const matchesStatus = status === "all" || (status === "active" ? item.active : !item.active);
      return matchesSearch && matchesFamily && matchesStatus;
    });
  }, [family, items, search, status]);

  function exportExcel() {
    downloadExcelWorkbook("lista-productos.xls", [{
      name: "Productos",
      columns: [
        { key: "sku", label: "SKU" }, { key: "nombre", label: "Nombre", width: 220 }, { key: "familia", label: "Familia" },
        { key: "tipo", label: "Tipo" }, { key: "unidad", label: "Unidad" }, { key: "sociedad", label: "Sociedad" },
        { key: "estado", label: "Estado" }, { key: "stock", label: "Stock actual" }, { key: "stock_min", label: "Stock mínimo" },
        { key: "stock_max", label: "Stock máximo" }, { key: "costo", label: "Costo unitario" }, { key: "precio", label: "Precio venta" },
        { key: "iva", label: "IVA %" }, { key: "abc", label: "ABC" }
      ],
      rows: visibleItems.map((item) => ({ sku: item.code, nombre: item.name, familia: item.category?.name || "Sin familia", tipo: TYPE_LABELS[item.type] || item.type, unidad: item.unit, sociedad: item.society_code || "--", estado: item.active ? "Activo" : "Inactivo", stock: Number(item.stock_current || 0), stock_min: Number(item.stock_min || 0), stock_max: item.stock_max == null ? "" : Number(item.stock_max), costo: Number(item.unit_cost || 0), precio: Number(item.unit_price || 0), iva: Number(item.tax_rate || 0), abc: item.abc_class || "--" }))
    }]);
  }

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-apex">Inventario - Maestro</p><h1 className="text-3xl font-semibold">Lista de productos</h1><p className="mt-1 text-sm text-neutral-600">Consulta los SKU registrados, sus datos operativos, existencias y valores de referencia.</p></div><div className="flex gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm" disabled={!visibleItems.length} onClick={exportExcel} type="button"><Download size={16} /> Excel</button><Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/inventario/productos/nuevo"><PackagePlus size={16} /> Nuevo producto</Link></div></header>
    <InventoryNav />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <section className="rounded-md border border-line bg-white">
      <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[minmax(240px,1fr)_220px_180px_auto] md:items-end">
        <label className="text-sm">Buscar<div className="relative mt-1"><Search className="absolute left-3 top-3 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-10 pr-3" placeholder="SKU, nombre, familia o sociedad" value={search} onChange={(event) => setSearch(event.target.value)} /></div></label>
        <label className="text-sm">Familia<select className="mt-1 h-10 w-full rounded-md border border-line px-2" value={family} onChange={(event) => setFamily(event.target.value)}><option value="">Todas</option>{families.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="text-sm">Estado<select className="mt-1 h-10 w-full rounded-md border border-line px-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
        <span className="pb-2 text-sm text-neutral-500">{visibleItems.length} productos</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Familia</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Sociedad</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Costo</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">IVA</th></tr></thead><tbody>
        {visibleItems.map((item) => <tr className="border-b border-line/70" key={item.id}><td className="px-3 py-2 font-mono font-medium">{item.code}</td><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{item.category?.name || "Sin familia"}</td><td className="px-3 py-2">{TYPE_LABELS[item.type] || item.type}</td><td className="px-3 py-2">{item.unit}</td><td className="px-3 py-2">{item.society_code || "--"}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{item.active ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-2 text-right">{Number(item.stock_current || 0).toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">${Number(item.unit_cost || 0).toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">${Number(item.unit_price || 0).toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">{Number(item.tax_rate || 0)}%</td></tr>)}
        {!loading && !visibleItems.length ? <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={11}>No hay productos que coincidan con los filtros.</td></tr> : null}
        {loading ? <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={11}>Cargando productos...</td></tr> : null}
      </tbody></table></div>
    </section>
  </div>;
}
