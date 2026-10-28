"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioNav } from "@/components/comercio-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AccessDenied, Field, ModuleHeader, describeError, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

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

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Registro de compras por producto: sube el stock y ajusta el costo promedio con el que se calcula el margen de cada venta." title="Compras de mercancia" />
      <ComercioNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4">
          <p className="text-sm text-neutral-600">{purchases.length} compra(s) registradas</p>
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={() => void load()} type="button"><RefreshCw size={14} /> Actualizar</button>
            {access.canWrite ? (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setForm({ ...emptyForm, date: todayISO() }); setEditorOpen(true); }} type="button"><Plus size={14} /> Nueva compra</button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando compras...</p>
        ) : purchases.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">Sin compras. Registra la primera para surtir tu inventario.</p>
        ) : (
          <>
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
              {purchases.map((purchase) => (
                <li className="rounded-md border border-line p-3" key={purchase.id}>
                  <div className="flex justify-between">
                    <span className="font-mono text-sm font-semibold">{purchase.full_number}</span>
                    <span className="text-xs text-neutral-500">{purchase.date}</span>
                  </div>
                  <p className="mt-1 text-sm">{purchase.quantity} x {purchase.product_name}</p>
                  <p className="text-xs text-neutral-500">{purchase.supplier} · {money(purchase.unit_cost)} c/u</p>
                  <p className="mt-1 text-base font-semibold">{money(purchase.total)}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="p-3">Numero</th>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Proveedor</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Costo unit.</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr className="border-b" key={purchase.id}>
                      <td className="p-3 font-mono font-semibold">{purchase.full_number}</td>
                      <td className="p-3">{purchase.date}</td>
                      <td className="p-3">{purchase.product_name}</td>
                      <td className="p-3">{purchase.supplier}</td>
                      <td className="p-3 text-right">{purchase.quantity}</td>
                      <td className="p-3 text-right">{money(purchase.unit_cost)}</td>
                      <td className="p-3 text-right font-semibold">{money(purchase.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {editorOpen ? (
        <ModalFrame onClose={() => setEditorOpen(false)} title="Registrar compra de mercancia">
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Producto">
                  <select className="control apex-select" onChange={(event) => setForm({ ...form, product_id: event.target.value })} required value={form.product_id}>
                    <option value="">Seleccione el producto comprado</option>
                    {products.map((product) => (
                      <option key={product.id} value={String(product.id)}>{product.code} - {product.name} (stock {product.stock}, costo {money(product.cost)})</option>
                    ))}
                  </select>
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
              <p className="rounded-md bg-paper p-3 text-sm">
                Costo promedio: {money(selectedProduct.cost)} → <span className="font-semibold">{money(previewCost)}</span> · nuevo stock: {selectedProduct.stock + quantity}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">El costo promedio ponderado se recalcula en el servidor con (stock x costo actual + cantidad x costo nuevo) / (stock + cantidad).</p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Registrar compra"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
