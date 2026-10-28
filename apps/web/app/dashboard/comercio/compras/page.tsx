"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { TransportSearchSelect } from "@/components/transport/TransportSearchSelect";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { ComercioMessages, Field, ModuleHeader, comercioGate, describeError, matchesQuery, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Compras de mercancia (POST /api/v1/comercio/purchases). Cada compra recalcula el costo
// promedio ponderado del producto y suma stock con su movimiento trazado.
type Purchase = {
  id: number;
  full_number: string;
  date: string;
  product_id: number | null;
  product_code: string | null;
  product_name: string;
  supplier: string;
  quantity: number;
  unit_cost: number;
  total: number;
  note: string | null;
};

type Product = { id: number; code: string; name: string; cost: number; stock: number; active: boolean };

const emptyForm = { product_id: "", quantity: "", unit_cost: "", supplier: "", date: todayISO(), note: "" };

export default function ComercioComprasPage() {
  const access = useComercioAccess();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [purchaseRows, productRows] = await Promise.all([
        api<{ items: Purchase[]; total: number }>("/api/v1/comercio/purchases?limit=200", { cache: "no-store" }),
        api<{ items: Product[] }>("/api/v1/comercio/products?limit=500")
      ]);
      setPurchases(purchaseRows.items);
      setProducts(productRows.items.filter((row) => row.active));
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar las compras."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const filtered = useMemo(() => purchases.filter((row) => {
    if (productId && String(row.product_id) !== productId) return false;
    return matchesQuery(query, row.full_number, row.product_code || "", row.product_name, row.supplier, row.note || "");
  }), [purchases, query, productId]);

  const hasFilters = Boolean(query.trim() || productId);

  function clearFilters() {
    setQuery("");
    setProductId("");
  }

  const purchasedUnits = useMemo(() => filtered.reduce((sum, row) => sum + Number(row.quantity || 0), 0), [filtered]);
  const purchasedTotal = useMemo(() => filtered.reduce((sum, row) => sum + Number(row.total || 0), 0), [filtered]);

  function exportPurchases(rows: Purchase[]) {
    downloadExcelWorkbook("comercio-compras.xls", [{
      name: "Compras",
      columns: [
        { key: "number", label: "Numero" },
        { key: "date", label: "Fecha" },
        { key: "product", label: "Producto", width: 220 },
        { key: "supplier", label: "Proveedor", width: 180 },
        { key: "quantity", label: "Cantidad" },
        { key: "unit_cost", label: "Costo unitario" },
        { key: "total", label: "Total" },
        { key: "note", label: "Nota", width: 200 }
      ],
      rows: rows.map((row) => ({
        number: row.full_number,
        date: row.date,
        product: `${row.product_code ? `${row.product_code} - ` : ""}${row.product_name}`,
        supplier: row.supplier,
        quantity: Number(row.quantity),
        unit_cost: Number(row.unit_cost),
        total: Number(row.total),
        note: row.note || ""
      }))
    }]);
  }

  const columns: DataColumn<Purchase>[] = [
    { className: "font-mono font-semibold", cell: (row) => row.full_number, header: "Numero", hideable: false, id: "number", sortValue: (row) => row.id },
    { cell: (row) => row.date, header: "Fecha", id: "date", sortValue: (row) => row.date },
    {
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.product_name}</p>
          {row.product_code ? <p className="font-mono text-xs text-content-muted">{row.product_code}</p> : null}
        </div>
      ),
      header: "Producto",
      hideable: false,
      id: "product",
      sortValue: (row) => row.product_name
    },
    { cell: (row) => <span className="truncate">{row.supplier}</span>, header: "Proveedor", id: "supplier", sortValue: (row) => row.supplier },
    { className: "text-right", cell: (row) => row.quantity, header: "Cantidad", id: "quantity", sortValue: (row) => Number(row.quantity) },
    { className: "text-right", cell: (row) => money(row.unit_cost), header: "Costo unit.", id: "unit_cost", sortValue: (row) => Number(row.unit_cost) },
    { className: "text-right", cell: (row) => <span className="font-semibold">{money(row.total)}</span>, header: "Total", id: "total", sortValue: (row) => Number(row.total) }
  ];

  const selectedProduct = products.find((row) => String(row.id) === form.product_id) || null;
  const quantity = Number(form.quantity || 0);
  const unitCost = Number(form.unit_cost || 0);
  const previewCost = selectedProduct && quantity > 0
    ? Math.round(((selectedProduct.stock * selectedProduct.cost + quantity * unitCost) / (selectedProduct.stock + quantity)) * 100) / 100
    : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api<Purchase>("/api/v1/comercio/purchases", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(form.product_id),
          quantity: Number(form.quantity),
          unit_cost: Number(form.unit_cost),
          supplier: form.supplier.trim(),
          date: form.date,
          note: form.note.trim() || undefined
        })
      });
      setMessage(`Compra ${created.full_number}: ${created.quantity} x ${created.product_name} por ${money(created.total)}.`);
      setEditorOpen(false);
      setForm(emptyForm);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible registrar la compra."));
    } finally {
      setSaving(false);
    }
  }
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Inventario" subtitle="Registro de compras por producto: sube el stock y ajusta el costo promedio con el que se calcula el margen de cada venta." title="Compras de mercancia" />
      <ComercioMessages error={error} message={message} />

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(240px,1fr)_minmax(16rem,20rem)] lg:items-end">
          <Field label="Buscar">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar compras por numero, producto o proveedor" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Numero, producto o proveedor" value={query} />
            </span>
          </Field>
          <Field hint={products.length ? `${products.length} productos activos en el catalogo` : undefined} label="Producto">
            <select className="control apex-select" onChange={(event) => setProductId(event.target.value)} value={productId}>
              <option value="">Todos los productos</option>
              {products.map((product) => <option key={product.id} value={String(product.id)}>{product.code} - {product.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-content-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {hasFilters ? <Button onClick={clearFilters} size="compact" variant="ghost"><X size={12} /> Limpiar filtros</Button> : null}
            <span aria-live="polite" className="font-semibold text-content-body">{filtered.length} de {purchases.length} compras · {purchasedUnits} unidades · {money(purchasedTotal)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!filtered.length} onClick={() => exportPurchases(filtered)} size="compact" variant="secondary"><Download size={14} /> Excel</Button>
            <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
            {access.canWrite ? <Button onClick={() => { setForm({ ...emptyForm, date: todayISO() }); setEditorOpen(true); }} size="compact"><Plus size={14} /> Nueva compra</Button> : null}
          </div>
        </div>

        {!loading && filtered.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
            {filtered.map((purchase) => (
              <li className="rounded-md border border-line p-3" key={purchase.id}>
                <div className="flex justify-between">
                  <span className="font-mono text-sm font-semibold">{purchase.full_number}</span>
                  <span className="text-xs text-content-muted">{purchase.date}</span>
                </div>
                <p className="mt-1 text-sm">{purchase.quantity} x {purchase.product_name}</p>
                <p className="text-xs text-content-muted">{purchase.supplier} · {money(purchase.unit_cost)} c/u</p>
                <p className="mt-1 text-base font-semibold">{money(purchase.total)}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="hidden p-4 lg:block">
          <SmartDataTable
            bulkActions={(selected, clear) => (
              <>
                <Button onClick={() => exportPurchases(selected)} size="compact" variant="secondary"><Download size={14} /> Exportar {selected.length}</Button>
                <Button onClick={clear} size="compact" variant="ghost">Limpiar seleccion</Button>
              </>
            )}
            columns={columns}
            emptyDetail={purchases.length ? "Ajusta el buscador o cambia el producto para volver a ver compras." : "Registra la primera compra para surtir el inventario y fijar el costo promedio."}
            emptyTitle={purchases.length ? "Ninguna compra con estos filtros" : "Aun no hay compras"}
            loading={loading}
            pageSize={12}
            rowKey={(row) => row.id}
            rows={filtered}
            storageKey="comercio-compras"
          />
        </div>
      </section>

      {editorOpen ? (
        <ModalFrame onClose={() => setEditorOpen(false)} title="Registrar compra de mercancia">
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Producto">
                  <TransportSearchSelect aria-label="Buscar el producto comprado por codigo o nombre" className="control w-full" onChange={(event) => setForm({ ...form, product_id: event.target.value })} required value={form.product_id}>
                    <option value="">Seleccione el producto comprado</option>
                    {products.map((product) => (
                      <option key={product.id} value={String(product.id)}>{product.code} - {product.name} (stock {product.stock}, costo {money(product.cost)})</option>
                    ))}
                  </TransportSearchSelect>
                </Field>
              </div>
              <Field label="Cantidad">
                <input className="control" min={1} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required type="number" value={form.quantity} />
              </Field>
              <Field label="Costo unitario de la compra">
                <input className="control" min={0} onChange={(event) => setForm({ ...form, unit_cost: event.target.value })} required step="0.01" type="number" value={form.unit_cost} />
              </Field>
              <Field label="Proveedor">
                <input className="control" maxLength={160} onChange={(event) => setForm({ ...form, supplier: event.target.value })} required value={form.supplier} />
              </Field>
              <Field label="Fecha">
                <input className="control" max={todayISO()} onChange={(event) => setForm({ ...form, date: event.target.value })} type="date" value={form.date} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nota (opcional)">
                  <input className="control" maxLength={500} onChange={(event) => setForm({ ...form, note: event.target.value })} value={form.note} />
                </Field>
              </div>
            </div>
            {previewCost !== null && selectedProduct ? (
              <p className="rounded-md bg-surface-muted p-3 text-sm">
                Costo promedio: {money(selectedProduct.cost)} → <span className="font-semibold">{money(previewCost)}</span> · nuevo stock: {selectedProduct.stock + quantity}
              </p>
            ) : (
              <p className="text-xs text-content-muted">El costo promedio ponderado se recalcula en el servidor con (stock x costo actual + cantidad x costo nuevo) / (stock + cantidad).</p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" disabled={saving} type="submit">{saving ? "Guardando..." : "Registrar compra"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
