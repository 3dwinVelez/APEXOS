"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, PackagePlus, Search } from "lucide-react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";

type Product = {
  id: number;
  code: string;
  legacy_code?: string | null;
  name: string;
  type: string;
  unit: string;
  society_code?: string | null;
  family_code?: string | null;
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

  const families = useMemo(() => [...new Set(items.map((item) => item.family_code || "Sin familia"))].sort((a, b) => a.localeCompare(b, "es")), [items]);
  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !needle || [item.code, item.legacy_code || "", item.name, item.category?.name || "", item.society_code || ""].some((value) => value.toLowerCase().includes(needle));
      const matchesFamily = !family || (item.family_code || "Sin familia") === family;
      const matchesStatus = status === "all" || (status === "active" ? item.active : !item.active);
      return matchesSearch && matchesFamily && matchesStatus;
    });
  }, [family, items, search, status]);

  function exportProducts(rows: Product[]) {
    downloadExcelWorkbook("lista-productos.xls", [{
      name: "Productos",
      columns: [
        { key: "sku", label: "SKU" }, { key: "codigo_anterior", label: "Código anterior" }, { key: "nombre", label: "Nombre", width: 220 }, { key: "familia", label: "Familia" },
        { key: "tipo", label: "Tipo" }, { key: "unidad", label: "Unidad" }, { key: "sociedad", label: "Sociedad" },
        { key: "estado", label: "Estado" }, { key: "stock", label: "Stock actual" }, { key: "stock_min", label: "Stock mínimo" },
        { key: "stock_max", label: "Stock máximo" },
        { key: "iva", label: "IVA %" }, { key: "abc", label: "ABC" }
      ],
      rows: rows.map((item) => ({ sku: item.code, codigo_anterior: item.legacy_code || "", nombre: item.name, familia: item.family_code || "Sin familia", tipo: TYPE_LABELS[item.type] || item.type, unidad: item.unit, sociedad: item.society_code || "--", estado: item.active ? "Activo" : "Inactivo", stock: Number(item.stock_current || 0), stock_min: Number(item.stock_min || 0), stock_max: item.stock_max == null ? "" : Number(item.stock_max), iva: Number(item.tax_rate || 0), abc: item.abc_class || "--" }))
    }]);
  }

  function exportExcel() { exportProducts(visibleItems); }

  const columns: DataColumn<Product>[] = [
    { id: "sku", header: "SKU", sortValue: (item) => item.code, cell: (item) => <span className="font-mono font-medium">{item.code}{item.legacy_code ? <small className="block text-content-muted">Anterior: {item.legacy_code}</small> : null}</span>, hideable: false },
    { id: "name", header: "Nombre", sortValue: (item) => item.name, cell: (item) => item.name, hideable: false },
    { id: "family", header: "Familia", sortValue: (item) => item.family_code || "", cell: (item) => item.family_code || "Sin familia" },
    { id: "type", header: "Tipo", sortValue: (item) => TYPE_LABELS[item.type] || item.type, cell: (item) => TYPE_LABELS[item.type] || item.type },
    { id: "unit", header: "Unidad", cell: (item) => item.unit },
    { id: "society", header: "Sociedad", cell: (item) => item.society_code || "--" },
    { id: "status", header: "Estado", sortValue: (item) => item.active ? 1 : 0, cell: (item) => <span className={`rounded-full px-2 py-1 text-xs ${item.active ? "bg-success/10 text-content-strong" : "bg-surface-muted text-content-muted"}`}>{item.active ? "Activo" : "Inactivo"}</span> },
    { id: "action", header: "Acción", className: "text-right", cell: (item) => <Link className="rounded-control border border-line px-3 py-2 text-apex" href={`/dashboard/inventario/productos/${item.id}`}>Editar</Link>, hideable: false }
  ];

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-apex">Inventario - Maestro</p><h1 className="text-3xl font-semibold">Lista de productos</h1><p className="mt-1 text-sm text-neutral-600">Consulta los SKU registrados, sus datos operativos, existencias y valores de referencia.</p></div><div className="flex gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm" disabled={!visibleItems.length} onClick={exportExcel} type="button"><Download size={16} /> Excel</button><Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/inventario/productos/nuevo"><PackagePlus size={16} /> Nuevo producto</Link></div></header>
    <InventoryNav />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <section className="rounded-md border border-line bg-white">
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_220px_180px_auto] lg:items-end">
        <label className="text-sm">Buscar<div className="relative mt-1"><Search className="absolute left-3 top-3 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-10 pr-3" placeholder="SKU, código anterior, nombre, familia o sociedad" value={search} onChange={(event) => setSearch(event.target.value)} /></div></label>
        <label className="text-sm">Familia<select className="mt-1 h-10 w-full rounded-md border border-line px-2" value={family} onChange={(event) => setFamily(event.target.value)}><option value="">Todas</option>{families.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="text-sm">Estado<select className="mt-1 h-10 w-full rounded-md border border-line px-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
        <span className="self-end pb-2 text-sm text-neutral-500" aria-live="polite">{visibleItems.length} productos</span>
      </div>
      {!loading && visibleItems.length ? <div className="grid gap-3 p-4 lg:hidden">
        {visibleItems.map((item) => <article className="rounded-md border border-line bg-paper/40 p-4" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-mono text-sm font-semibold">{item.code}</p><h2 className="truncate font-medium">{item.name}</h2></div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{item.active ? "Activo" : "Inactivo"}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-neutral-500">Familia</dt><dd>{item.family_code || "Sin familia"}</dd></div>
            <div><dt className="text-neutral-500">Tipo</dt><dd>{TYPE_LABELS[item.type] || item.type}</dd></div>
            <div><dt className="text-neutral-500">Unidad</dt><dd>{item.unit}</dd></div>
            <div><dt className="text-neutral-500">Sociedad</dt><dd>{item.society_code || "--"}</dd></div>
          </dl>
          <Link className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-line bg-white px-3 text-sm font-medium text-apex" href={`/dashboard/inventario/productos/${item.id}`}>Editar producto</Link>
        </article>)}
      </div> : null}
      <div className="hidden p-4 lg:block"><SmartDataTable bulkActions={(selected, clear) => <><Button onClick={() => exportProducts(selected)} size="compact">Exportar {selected.length}</Button><Button onClick={clear} size="compact" variant="ghost">Limpiar selección</Button></>} columns={columns} emptyDetail={items.length ? "Ajusta o limpia los filtros para volver a ver productos." : "Crea el primer SKU para controlar existencias, costos y disponibilidad."} emptyTitle={items.length ? "No hay productos con estos filtros" : "Aún no tienes productos"} loading={loading} pageSize={10} rowKey={(item) => item.id} rows={visibleItems} storageKey="inventory-products" /></div>
    </section>
  </div>;
}
