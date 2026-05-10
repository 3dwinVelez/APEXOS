"use client";

import { useEffect, useState } from "react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";

type Item = { id: number; code: string; name: string; stock_current: number; stock_min: number };

export default function StockPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: Item[] }>("/api/v1/inventory/items")
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar stock"));
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · Stock</p>
        <h1 className="text-3xl font-semibold">Stock actual</h1>
      </header>
      <InventoryNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-b border-line/60" key={item.id}>
                  <td className="py-2 pr-3">{item.code}</td>
                  <td className="py-2 pr-3">{item.name}</td>
                  <td className="py-2 pr-3">{item.stock_current}</td>
                  <td className="py-2 pr-3">{item.stock_min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

