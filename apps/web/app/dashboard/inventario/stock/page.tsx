"use client";
import { InventorySearchSelect } from "@/components/inventory-ui";

import { useEffect, useMemo, useState } from "react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";
import { InventoryPagination } from "@/components/inventory-ui";

type Item = { id: number; code: string; legacy_code?: string | null; name: string; stock_current: number; stock_min: number; stock_max: number; unit: string; abc_class: string };
type StockStatus = "todos" | "critico" | "ok" | "agotado";

export default function StockPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0), [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StockStatus>("todos");
  const [abc, setAbc] = useState("todos");
  const [sort, setSort] = useState("criticidad");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ data: Item[]; total: number }>("/api/v1/inventory/items?all=true")
      .then((res) => { setItems(res.data || []); setTotal(res.total); })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar stock"))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const itemStatus = item.stock_current <= 0 ? "agotado" : item.stock_current <= item.stock_min ? "critico" : "ok";
        const matchQuery = [item.code, item.legacy_code || "", item.name, item.unit || ""].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()));
        const matchStatus = status === "todos" || itemStatus === status;
        const matchAbc = abc === "todos" || (item.abc_class || "C") === abc;
        return matchQuery && matchStatus && matchAbc;
      })
      .sort((a, b) => {
        if (sort === "nombre") return a.name.localeCompare(b.name);
        if (sort === "stock") return b.stock_current - a.stock_current;
        const aGap = a.stock_current - a.stock_min;
        const bGap = b.stock_current - b.stock_min;
        return aGap - bGap;
      });
  }, [abc, items, query, sort, status]);

  const criticalCount = items.filter((item) => item.stock_current > 0 && item.stock_current <= item.stock_min).length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredItems.length / 25)));
  const pageItems = filteredItems.slice((currentPage - 1) * 25, currentPage * 25);
  useEffect(() => { setPage(1); }, [query, status, abc, sort]);
  const outCount = items.filter((item) => item.stock_current <= 0).length;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · Stock</p>
        <h1 className="text-3xl font-semibold">Stock actual</h1>
      </header>
      <InventoryNav />
      {loading ? <p role="status" className="text-sm text-content-muted">Cargando existencias…</p> : null}
      {total > items.length ? <p role="status" className="text-sm text-content-muted">Consulta parcial: {items.length} de {total} referencias cargadas. Los filtros y conteos corresponden al conjunto cargado.</p> : null}
      {error ? <p aria-live="assertive" className="text-sm text-red-700" role="alert">{error}</p> : null}
      <section className="rounded-md border border-line bg-surface p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_auto_auto_auto]">
          <input
            aria-label="Buscar existencias"
            className="h-10 rounded-md border border-line px-3 text-sm"
            placeholder="Buscar SKU, código anterior, producto o unidad..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <InventorySearchSelect aria-label="Filtrar por estado de stock" className="h-10 rounded-md border border-line px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as StockStatus)}>
            <option value="todos">Todos los estados</option>
            <option value="critico">Stock crítico</option>
            <option value="agotado">Agotados</option>
            <option value="ok">Con cobertura</option>
          </InventorySearchSelect>
          <InventorySearchSelect aria-label="Filtrar por clasificación ABC" className="h-10 rounded-md border border-line px-3 text-sm" value={abc} onChange={(event) => setAbc(event.target.value)}>
            <option value="todos">Todas ABC</option>
            <option value="A">ABC A</option>
            <option value="B">ABC B</option>
            <option value="C">ABC C</option>
          </InventorySearchSelect>
          <InventorySearchSelect aria-label="Ordenar existencias" className="h-10 rounded-md border border-line px-3 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="criticidad">Más crítico</option>
            <option value="nombre">Nombre</option>
            <option value="stock">Mayor stock</option>
          </InventorySearchSelect>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div aria-atomic="true" aria-live="polite" className="rounded-md border border-line bg-paper p-3 text-sm" role="status"><span className="block text-content-muted">Referencias</span><strong className="text-xl">{filteredItems.length}</strong></div>
          <div className="rounded-md border border-line bg-paper p-3 text-sm"><span className="block text-content-muted">Críticas</span><strong className="text-xl">{criticalCount}</strong></div>
          <div className="rounded-md border border-line bg-paper p-3 text-sm"><span className="block text-content-muted">Agotadas</span><strong className="text-xl">{outCount}</strong></div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Resumen por estado de existencias">{[{ value: "todos", label: "Todas", count: items.length }, { value: "critico", label: "Críticas", count: criticalCount }, { value: "agotado", label: "Agotadas", count: outCount }].map(row => <button type="button" key={row.value} aria-pressed={status === row.value} className={`min-h-10 rounded-full border px-3 text-sm ${status === row.value ? "border-apex bg-apex text-white" : "border-line bg-surface"}`} onClick={() => setStatus(row.value as StockStatus)}>{row.label} ({row.count})</button>)}</div>
        <div className="grid gap-3 lg:hidden">
          {pageItems.map((item) => {
            const itemStatus = item.stock_current <= 0 ? "Agotado" : item.stock_current <= item.stock_min ? "Crítico" : "OK";
            const coverage = item.stock_max ? Math.round((item.stock_current / item.stock_max) * 100) : null;
            return (
              <article className="rounded-md border border-line bg-paper/40 p-4" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-mono text-sm font-semibold">{item.code}</p><h2 className="truncate font-medium">{item.name}</h2></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${itemStatus === "Crítico" ? "bg-amber-50 text-amber-700" : itemStatus === "Agotado" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{itemStatus}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-content-muted">Clasificación ABC</dt><dd>{item.abc_class || "C"}</dd></div>
                  <div><dt className="text-content-muted">Stock actual</dt><dd className="font-semibold">{item.stock_current}</dd></div>
                  <div><dt className="text-content-muted">Stock mínimo</dt><dd>{item.stock_min}</dd></div>
                  <div><dt className="text-content-muted">Cobertura</dt><dd>{coverage === null ? "-" : `${coverage}%`}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
        <div className="hidden max-h-[62vh] overflow-auto rounded-md border border-line lg:block" role="region" aria-label="Tabla de existencias" tabIndex={0}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line text-left text-xs uppercase text-content-muted">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">ABC</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">Mínimo</th>
                <th className="py-2 pr-3">Cobertura</th>
                <th className="py-2 pr-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => {
                const itemStatus = item.stock_current <= 0 ? "Agotado" : item.stock_current <= item.stock_min ? "Crítico" : "OK";
                const coverage = item.stock_max ? Math.round((item.stock_current / item.stock_max) * 100) : null;
                return (
                  <tr className="border-b border-line/60 hover:bg-paper/70" key={item.id}>
                    <td className="py-2 pr-3 font-medium"><span className="font-mono">{item.code}</span>{item.legacy_code ? <span className="block text-xs font-normal text-content-muted">Anterior: {item.legacy_code}</span> : null}</td>
                    <td className="py-2 pr-3">{item.name}</td>
                    <td className="py-2 pr-3">{item.abc_class || "C"}</td>
                    <td className="py-2 pr-3">{item.stock_current}</td>
                    <td className="py-2 pr-3">{item.stock_min}</td>
                    <td className="py-2 pr-3">{coverage === null ? "-" : `${coverage}%`}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${itemStatus === "Crítico" ? "bg-amber-50 text-amber-700" : itemStatus === "Agotado" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {itemStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <InventoryPagination page={currentPage} total={filteredItems.length} onChange={setPage} label="Páginas de existencias" />
        {!loading && !filteredItems.length ? <p role="status" className="p-3 text-sm text-content-muted">No hay existencias que coincidan con los filtros.</p> : null}
      </section>
    </div>
  );
}
