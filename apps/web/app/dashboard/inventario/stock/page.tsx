"use client";

import { useEffect, useMemo, useState } from "react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";

type Item = { id: number; code: string; legacy_code?: string | null; name: string; stock_current: number; stock_min: number; stock_max: number; unit: string; abc_class: string };
type StockStatus = "todos" | "critico" | "ok" | "agotado";

export default function StockPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StockStatus>("todos");
  const [abc, setAbc] = useState("todos");
  const [sort, setSort] = useState("criticidad");

  useEffect(() => {
    api<{ data: Item[] }>("/api/v1/inventory/items")
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar stock"));
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
  const outCount = items.filter((item) => item.stock_current <= 0).length;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · Stock</p>
        <h1 className="text-3xl font-semibold">Stock actual</h1>
      </header>
      <InventoryNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            className="h-10 rounded-md border border-line px-3 text-sm"
            placeholder="Buscar SKU, código anterior, producto o unidad..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as StockStatus)}>
            <option value="todos">Todos los estados</option>
            <option value="critico">Stock crítico</option>
            <option value="agotado">Agotados</option>
            <option value="ok">Con cobertura</option>
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={abc} onChange={(event) => setAbc(event.target.value)}>
            <option value="todos">Todas ABC</option>
            <option value="A">ABC A</option>
            <option value="B">ABC B</option>
            <option value="C">ABC C</option>
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="criticidad">Más crítico</option>
            <option value="nombre">Nombre</option>
            <option value="stock">Mayor stock</option>
          </select>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-line bg-paper p-3 text-sm"><span className="block text-neutral-500">Referencias</span><strong className="text-xl">{filteredItems.length}</strong></div>
          <div className="rounded-md border border-line bg-paper p-3 text-sm"><span className="block text-neutral-500">Críticas</span><strong className="text-xl">{criticalCount}</strong></div>
          <div className="rounded-md border border-line bg-paper p-3 text-sm"><span className="block text-neutral-500">Agotadas</span><strong className="text-xl">{outCount}</strong></div>
        </div>
        <div className="max-h-[62vh] overflow-auto rounded-md border border-line">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-line text-left text-xs uppercase text-neutral-500">
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
              {filteredItems.map((item) => {
                const itemStatus = item.stock_current <= 0 ? "Agotado" : item.stock_current <= item.stock_min ? "Crítico" : "OK";
                const coverage = item.stock_max ? Math.round((item.stock_current / item.stock_max) * 100) : null;
                return (
                  <tr className="border-b border-line/60 hover:bg-paper/70" key={item.id}>
                    <td className="py-2 pr-3 font-medium"><span className="font-mono">{item.code}</span>{item.legacy_code ? <span className="block text-xs font-normal text-neutral-500">Anterior: {item.legacy_code}</span> : null}</td>
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
      </section>
    </div>
  );
}
