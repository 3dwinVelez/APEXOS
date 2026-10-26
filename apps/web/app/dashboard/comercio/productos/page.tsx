"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Camera, PackageSearch, Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioNav } from "@/components/comercio-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AccessDenied, Check, Field, ModuleHeader, StatusPill, describeError, money, useComercioAccess } from "@/components/comercio/shared";

// Maestro de productos del Comercio (GET /api/v1/comercio/products). El stock nunca se
// edita por el formulario: solo por ajustes, compras o ventas, todo trazado en movimientos.
type Product = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  active: boolean;
  notes: string | null;
  has_photo: boolean;
  low_stock: boolean;
};

type ProductForm = {
  name: string;
  category: string;
  unit: string;
  price: string;
  cost: string;
  stock: string;
  min_stock: string;
  notes: string;
  active: boolean;
};

const emptyForm: ProductForm = { name: "", category: "", unit: "unidad", price: "", cost: "", stock: "", min_stock: "0", notes: "", active: true };

export default function ComercioProductosPage() {
  const access = useComercioAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState({ new_stock: "", reason: "Conteo fisico" });

  const [photoTarget, setPhotoTarget] = useState<Product | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Product[]; total: number }>("/api/v1/comercio/products?include_inactive=true&limit=500", { cache: "no-store" });
      setProducts(result.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los productos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((row) => {
      if (!showInactive && !row.active) return false;
      if (lowOnly && !row.low_stock) return false;
      if (needle && !`${row.name} ${row.code} ${row.category || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, query, lowOnly, showInactive]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        unit: form.unit.trim() || "unidad",
        price: Number(form.price || 0),
        cost: Number(form.cost || 0),
        min_stock: Number(form.min_stock || 0),
        notes: form.notes.trim() || undefined,
        active: form.active
      };
      if (!editing) body.stock = Number(form.stock || 0);
      if (editing) {
        await api(`/api/v1/comercio/products/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        setMessage(`Producto ${editing.code} actualizado.`);
      } else {
        const created = await api<Product>("/api/v1/comercio/products", { method: "POST", body: JSON.stringify(body) });
        setMessage(`Producto creado: ${created.code} · ${created.name}`);
      }
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar el producto."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setError("");
    try {
      await api(`/api/v1/comercio/products/${product.id}/${product.active ? "deactivate" : "activate"}`, { method: "POST" });
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible cambiar el estado del producto."));
    }
  }

  async function saveStock(event: FormEvent) {
    event.preventDefault();
    if (!stockTarget) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ product: Product; movement: unknown }>(`/api/v1/comercio/products/${stockTarget.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({ new_stock: Number(stockForm.new_stock), reason: stockForm.reason.trim() || "Conteo fisico" })
      });
      setMessage(`${stockTarget.name}: stock ${stockTarget.stock} -> ${result.product.stock}.`);
      setStockTarget(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible ajustar el stock."));
    } finally {
      setSaving(false);
    }
  }

  async function openPhoto(product: Product) {
    setPhotoTarget(product);
    setPhotoFile(null);
    setPhotoUrl(null);
    setError("");
    if (product.has_photo) {
      try {
        const result = await api<{ photo_url: string | null }>(`/api/v1/comercio/products/${product.id}/photo-url`);
        setPhotoUrl(result.photo_url);
      } catch {
        /* la vista previa es opcional */
      }
    }
  }

  async function uploadPhoto(event: FormEvent) {
    event.preventDefault();
    if (!photoTarget || !photoFile) return;
    setPhotoBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", photoFile);
      const result = await api<Product & { photo_url: string | null }>(`/api/v1/comercio/products/${photoTarget.id}/photo`, { method: "POST", body });
      setPhotoUrl(result.photo_url);
      setMessage(`Foto actualizada para ${photoTarget.name}.`);
      await load();
      setPhotoTarget(null);
    } catch (caught) {
      setError(describeError(caught, "No fue posible subir la fotografia."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!photoTarget) return;
    setPhotoBusy(true);
    try {
      await api(`/api/v1/comercio/products/${photoTarget.id}/photo`, { method: "DELETE" });
      setMessage(`Foto eliminada de ${photoTarget.name}.`);
      setPhotoTarget(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible eliminar la fotografia."));
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Productos con precio de venta, costo promedio y stock propio del comercio. La foto se guarda en el bucket aislamiento por tenant." title="Productos" />
      <ComercioNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block max-w-md flex-1">
              <PackageSearch className="absolute left-3 top-3 text-neutral-400" size={16} />
              <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por codigo, nombre o categoria" value={query} />
            </label>
            <div className="flex items-center gap-3 text-sm">
              <Check checked={lowOnly} label="Solo por reponer" onChange={setLowOnly} />
              <Check checked={showInactive} label="Ver inactivos" onChange={setShowInactive} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={() => void load()} type="button"><RefreshCw size={14} /> Actualizar</button>
            {access.canWrite ? (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setEditing(null); setForm(emptyForm); setEditorOpen(true); }} type="button">
                <Plus size={14} /> Nuevo producto
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando productos...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">Sin productos que mostrar. Crea el primero con el boton &quot;Nuevo producto&quot;.</p>
        ) : (
          <>
            {/* Movil: tarjetas tactiles. Escritorio: tabla densa. */}
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
              {filtered.map((product) => (
                <li className="rounded-md border border-line p-3" key={product.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-neutral-500">{product.code}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill tone={product.low_stock ? "warn" : "ok"}>{product.stock} {product.unit}</StatusPill>
                      {!product.active ? <StatusPill tone="muted">Inactivo</StatusPill> : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{money(product.price)}</p>
                  <p className="text-xs text-neutral-500">Costo: {money(product.cost)} · Min: {product.min_stock}</p>
                  {access.canWrite ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn-secondary flex items-center gap-1 px-2 py-1 text-xs" onClick={() => { setEditing(product); setForm({ name: product.name, category: product.category || "", unit: product.unit, price: String(product.price), cost: String(product.cost), stock: "", min_stock: String(product.min_stock), notes: product.notes || "", active: product.active }); setEditorOpen(true); }} type="button"><Pencil size={12} /> Editar</button>
                      <button className="btn-secondary flex items-center gap-1 px-2 py-1 text-xs" onClick={() => { setStockTarget(product); setStockForm({ new_stock: String(product.stock), reason: "Conteo fisico" }); }} type="button"><SlidersHorizontal size={12} /> Stock</button>
                      <button className="btn-secondary flex items-center gap-1 px-2 py-1 text-xs" onClick={() => void openPhoto(product)} type="button"><Camera size={12} /> Foto</button>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void toggleActive(product)} type="button">{product.active ? "Desactivar" : "Activar"}</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="p-3">Codigo</th>
                    <th>Producto</th>
                    <th>Categoria</th>
                    <th className="text-right">Precio</th>
                    <th className="text-right">Costo</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Minimo</th>
                    <th>Foto</th>
                    <th>Estado</th>
                    {access.canWrite ? <th className="pr-3 text-right">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr className="border-b" key={product.id}>
                      <td className="p-3 font-mono">{product.code}</td>
                      <td className="p-3 font-medium">{product.name}</td>
                      <td className="p-3">{product.category || "--"}</td>
                      <td className="p-3 text-right font-semibold">{money(product.price)}</td>
                      <td className="p-3 text-right">{money(product.cost)}</td>
                      <td className="p-3 text-right">
                        <span className={product.low_stock ? "font-semibold text-amber-700" : ""}>{product.stock}</span>
                      </td>
                      <td className="p-3 text-right text-neutral-500">{product.min_stock}</td>
                      <td className="p-3">{product.has_photo ? "Si" : "--"}</td>
                      <td className="p-3">{product.active ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="muted">Inactivo</StatusPill>}</td>
                      {access.canWrite ? (
                        <td className="p-3 pr-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setEditing(product); setForm({ name: product.name, category: product.category || "", unit: product.unit, price: String(product.price), cost: String(product.cost), stock: "", min_stock: String(product.min_stock), notes: product.notes || "", active: product.active }); setEditorOpen(true); }} type="button">Editar</button>
                            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setStockTarget(product); setStockForm({ new_stock: String(product.stock), reason: "Conteo fisico" }); }} type="button">Stock</button>
                            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void openPhoto(product)} type="button">Foto</button>
                            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void toggleActive(product)} type="button">{product.active ? "Desactivar" : "Activar"}</button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {editorOpen ? (
        <ModalFrame maxWidth="md:max-w-3xl" onClose={() => setEditorOpen(false)} title={editing ? `Editar producto ${editing.code}` : "Nuevo producto"}>
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Nombre">
                  <input className="control" maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
                </Field>
              </div>
              <Field label="Categoria (opcional)">
                <input className="control" maxLength={80} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Lacteos, Aseo..." value={form.category} />
              </Field>
              <Field label="Unidad">
                <input className="control" maxLength={20} onChange={(event) => setForm({ ...form, unit: event.target.value })} value={form.unit} />
              </Field>
              <Field label="Precio de venta">
                <input className="control" min={0} onChange={(event) => setForm({ ...form, price: event.target.value })} required step="1" type="number" value={form.price} />
              </Field>
              <Field label="Costo unitario">
                <input className="control" min={0} onChange={(event) => setForm({ ...form, cost: event.target.value })} required step="1" type="number" value={form.cost} />
              </Field>
              {editing ? (
                <Field label="Stock (solo se ajusta con la accion Stock)">
                  <input className="control" disabled type="number" value={editing.stock} />
                </Field>
              ) : (
                <Field label="Stock inicial">
                  <input className="control" min={0} onChange={(event) => setForm({ ...form, stock: event.target.value })} type="number" value={form.stock} />
                </Field>
              )}
              <Field label="Stock minimo (alerta de reposicion)">
                <input className="control" min={0} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} type="number" value={form.min_stock} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Notas">
                  <textarea className="control" maxLength={500} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} value={form.notes} />
                </Field>
              </div>
              <Check checked={form.active} label="Producto activo" onChange={(checked) => setForm({ ...form, active: checked })} />
            </div>
            <p className="text-xs text-neutral-500">El codigo lo asigna el servidor (P-0001, P-0002...). El costo se recalcula solo con cada compra de mercancia.</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar producto"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {stockTarget ? (
        <ModalFrame onClose={() => setStockTarget(null)} title={`Ajustar stock · ${stockTarget.name}`}>
          <form className="space-y-4" onSubmit={saveStock}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Cantidad contejada (actual: ${stockTarget.stock})`}>
                <input className="control" min={0} onChange={(event) => setStockForm({ ...stockForm, new_stock: event.target.value })} required type="number" value={stockForm.new_stock} />
              </Field>
              <Field label="Motivo del ajuste">
                <input className="control" maxLength={60} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })} value={stockForm.reason} />
              </Field>
            </div>
            <p className="text-xs text-neutral-500">El ajuste queda trazado como movimiento de inventario. Si otro usuario modifico el stock mientras tanto, el guardado se rechaza y se debe repetir el conteo.</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setStockTarget(null)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Aplicando..." : "Aplicar ajuste"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {photoTarget ? (
        <ModalFrame onClose={() => setPhotoTarget(null)} title={`Fotografia · ${photoTarget.name}`}>
          <form className="space-y-4" onSubmit={uploadPhoto}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`Foto de ${photoTarget.name}`} className="mx-auto max-h-64 rounded-md border border-line object-contain" src={photoUrl} />
            ) : (
              <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-neutral-500">Sin fotografia. PNG, JPEG o WEBP de maximo 5 MB.</p>
            )}
            <Field label="Nueva foto (PNG, JPEG o WEBP, max 5 MB)">
              <input
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                className="control"
                onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                type="file"
              />
            </Field>
            <p className="text-xs text-neutral-500">En moviles la camara queda disponible gracias al capture del campo. La imagen se almacena en el bucket comercio-assets con ruta aislada por tenant.</p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              {photoTarget.has_photo ? (
                <button className="btn-secondary flex items-center gap-1" disabled={photoBusy} onClick={() => void removePhoto()} type="button"><Trash2 size={14} /> Quitar foto</button>
              ) : null}
              <button className="btn-secondary" onClick={() => setPhotoTarget(null)} type="button">Cerrar</button>
              <button className="btn-primary flex items-center gap-1" disabled={photoBusy || !photoFile} type="submit"><Camera size={14} /> {photoBusy ? "Subiendo..." : "Subir foto"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}
