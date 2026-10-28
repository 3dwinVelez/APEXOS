"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight, PackageSearch, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioNav } from "@/components/comercio-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AccessDenied, Check, Field, ModuleHeader, StatusPill, describeError, money, useComercioAccess } from "@/components/comercio/shared";

// Maestro de productos del Comercio (GET /api/v1/comercio/products). El stock nunca se
// edita por el formulario: solo por ajustes, compras o ventas, todo trazado en movimientos.
// El descuento tampoco reescribe el precio: price es el precio de lista y price_final es
// el que cobra la vitrina y el mostrador.
type Product = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  price: number;
  discount_percent: number;
  price_final: number;
  cost: number;
  stock: number;
  min_stock: number;
  active: boolean;
  notes: string | null;
  has_photo: boolean;
  catalog_featured: boolean;
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
  discount_percent: string;
  notes: string;
  active: boolean;
  catalog_featured: boolean;
};

const emptyForm: ProductForm = { name: "", category: "", unit: "unidad", price: "", cost: "", stock: "", min_stock: "0", discount_percent: "0", notes: "", active: true, catalog_featured: false };

const MAX_DISCOUNT = 90;

// Espejo del calculo del servidor (apps/api .../comercio/service.js: discountedPrice).
function finalPriceOf(price: number, percent: number) {
  const pct = Math.min(MAX_DISCOUNT, Math.max(0, percent));
  return Math.round((price * (1 - pct / 100) + Number.EPSILON) * 100) / 100;
}

function cleanPercent(value: string) {
  return Math.min(MAX_DISCOUNT, Math.max(0, Number(value || 0) || 0));
}

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

  // La ficha del producto concentra stock, foto y estado: un solo punto de entrada
  // por fila evita la tanda de botones repetidos en el listado.
  const [adjustForm, setAdjustForm] = useState({ new_stock: "", reason: "Conteo fisico" });
  const [adjustBusy, setAdjustBusy] = useState(false);

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
        discount_percent: cleanPercent(form.discount_percent),
        catalog_featured: form.catalog_featured,
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

  function openEditor(product: Product | null) {
    setEditing(product);
    setForm(product
      ? { name: product.name, category: product.category || "", unit: product.unit, price: String(product.price), cost: String(product.cost), stock: "", min_stock: String(product.min_stock), discount_percent: String(product.discount_percent), notes: product.notes || "", active: product.active, catalog_featured: product.catalog_featured }
      : emptyForm);
    setAdjustForm({ new_stock: product ? String(product.stock) : "", reason: "Conteo fisico" });
    setPhotoFile(null);
    setPhotoUrl(null);
    setError("");
    setEditorOpen(true);
    if (product?.has_photo) {
      void (async () => {
        try {
          const result = await api<{ photo_url: string | null }>(`/api/v1/comercio/products/${product.id}/photo-url`);
          setPhotoUrl(result.photo_url);
        } catch {
          /* la vista previa es opcional */
        }
      })();
    }
  }

  async function applyAdjust(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setAdjustBusy(true);
    setError("");
    try {
      const result = await api<{ product: Product; movement: unknown }>(`/api/v1/comercio/products/${editing.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({ new_stock: Number(adjustForm.new_stock), reason: adjustForm.reason.trim() || "Conteo fisico" })
      });
      setMessage(`${editing.name}: stock ${editing.stock} -> ${result.product.stock}.`);
      setEditing(result.product);
      setAdjustForm({ new_stock: String(result.product.stock), reason: adjustForm.reason });
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible ajustar el stock."));
    } finally {
      setAdjustBusy(false);
    }
  }

  async function uploadPhoto(event: FormEvent) {
    event.preventDefault();
    if (!editing || !photoFile) return;
    setPhotoBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", photoFile);
      const result = await api<Product & { photo_url: string | null }>(`/api/v1/comercio/products/${editing.id}/photo`, { method: "POST", body });
      setPhotoUrl(result.photo_url);
      setPhotoFile(null);
      setMessage(`Foto actualizada para ${editing.name}.`);
      setEditing({ ...editing, has_photo: true });
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible subir la fotografia."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!editing) return;
    setPhotoBusy(true);
    try {
      await api(`/api/v1/comercio/products/${editing.id}/photo`, { method: "DELETE" });
      setMessage(`Foto eliminada de ${editing.name}.`);
      setPhotoUrl(null);
      setPhotoFile(null);
      setEditing({ ...editing, has_photo: false });
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
      <ModuleHeader subtitle="Productos con precio de lista, descuento, costo promedio y stock propio del comercio. El mismo precio final se usa en la vitrina publica y en el mostrador." title="Productos" />
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
              <button className="btn-primary flex items-center gap-2" onClick={() => openEditor(null)} type="button">
                <Plus size={14} /> Nuevo producto
              </button>
            ) : null}
          </div>
        </div>
        <p className="border-b border-line px-4 py-2 text-xs text-neutral-500">
          El precio final lista solo el descuento del producto. Si hay campana de vitrina (Configuracion), la vitrina y el mostrador usan el porcentaje mayor entre los dos.
        </p>

        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando productos...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">Sin productos que mostrar. Crea el primero con el boton &quot;Nuevo producto&quot;.</p>
        ) : (
          <>
            {/* Movil: toda la tarjeta es el acceso a la ficha. Escritorio: una sola accion por fila. */}
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
              {filtered.map((product) => {
                const cardBody = (
                  <>
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
                    <p className="mt-2 flex flex-wrap items-baseline gap-2 text-sm font-semibold">
                      <span>{money(product.price_final)}</span>
                      {product.discount_percent > 0 ? (
                        <>
                          <span className="text-xs font-normal text-neutral-500 line-through">{money(product.price)}</span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">-{product.discount_percent}%</span>
                        </>
                      ) : null}
                      {product.catalog_featured ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Vitrina</span> : null}
                    </p>
                    <p className="text-xs text-neutral-500">Costo: {money(product.cost)} · Min: {product.min_stock}</p>
                    {access.canWrite ? <p className="mt-2 flex items-center gap-1 text-xs font-medium text-apex"><ChevronRight size={12} /> Abrir ficha</p> : null}
                  </>
                );
                return (
                  <li className="rounded-md border border-line p-3" key={product.id}>
                    {access.canWrite ? (
                      <button className="block w-full text-left" onClick={() => openEditor(product)} type="button">{cardBody}</button>
                    ) : (
                      cardBody
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="p-3">Codigo</th>
                    <th>Producto</th>
                    <th>Categoria</th>
                    <th className="text-right">Precio final</th>
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
                      <td className="p-3 font-medium">
                        {product.name}
                        {product.catalog_featured ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Vitrina</span> : null}
                      </td>
                      <td className="p-3">{product.category || "--"}</td>
                      <td className="p-3 text-right">
                        <span className="font-semibold">{money(product.price_final)}</span>
                        {product.discount_percent > 0 ? (
                          <span className="mt-0.5 block text-xs leading-tight text-neutral-500">
                            <span className="line-through">{money(product.price)}</span> <span className="font-semibold text-rose-600">-{product.discount_percent}%</span>
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-right">{money(product.cost)}</td>
                      <td className="p-3 text-right">
                        <span className={product.low_stock ? "font-semibold text-amber-700" : ""}>{product.stock}</span>
                      </td>
                      <td className="p-3 text-right text-neutral-500">{product.min_stock}</td>
                      <td className="p-3">{product.has_photo ? "Si" : "--"}</td>
                      <td className="p-3">{product.active ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="muted">Inactivo</StatusPill>}</td>
                      {access.canWrite ? (
                        <td className="p-3 pr-3 text-right">
                          <button className="btn-secondary flex items-center gap-1 px-2 py-1 text-xs" onClick={() => openEditor(product)} type="button"><Pencil size={12} /> Ficha</button>
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
        <ModalFrame maxWidth="md:max-w-3xl" onClose={() => setEditorOpen(false)} title={editing ? `Ficha del producto ${editing.code}` : "Nuevo producto"}>
          <div className="space-y-5">
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
                  <input className="control" min={0} onChange={(event) => setForm({ ...form, price: event.target.value })} required step="0.01" type="number" value={form.price} />
                </Field>
                <Field label="Costo unitario">
                  {/* El costo promedio sale de las compras y si tiene centavos: step=1
                      bloqueaba el guardado de cualquier producto con costo decimal. */}
                  <input className="control" min={0} onChange={(event) => setForm({ ...form, cost: event.target.value })} required step="0.01" type="number" value={form.cost} />
                </Field>
                {/* Descuento y destacado: el precio de lista nunca se reescribe, la vitrina
                    y el mostrador derivan el precio final del porcentaje. */}
                <div className="rounded-md border border-line bg-paper/50 p-4 md:col-span-2">
                  <h3 className="text-sm font-semibold">Descuento y vitrina</h3>
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <div className="w-40">
                      <Field label={`Descuento (0 a ${MAX_DISCOUNT}%)`}>
                        <input className="control" max={MAX_DISCOUNT} min={0} onChange={(event) => setForm({ ...form, discount_percent: event.target.value })} step="0.5" type="number" value={form.discount_percent} />
                      </Field>
                    </div>
                    <p className="text-sm">
                      <span className="text-neutral-500">Precio final: </span>
                      <span className="font-semibold">{money(finalPriceOf(Number(form.price || 0), cleanPercent(form.discount_percent)))}</span>
                      {cleanPercent(form.discount_percent) > 0 ? (
                        <>
                          <span className="ml-2 text-xs text-neutral-500 line-through">{money(Number(form.price || 0))}</span>
                          <span className="ml-2 text-xs font-semibold text-rose-600">-{cleanPercent(form.discount_percent)}%</span>
                        </>
                      ) : null}
                    </p>
                    <Check checked={form.catalog_featured} label="Destacar en la vitrina" onChange={(checked) => setForm({ ...form, catalog_featured: checked })} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    El descuento se aplica sobre el precio de lista y rige en la vitrina y en el mostrador. Si la campana de la configuracion tiene un porcentaje mayor, se usa ese: los descuentos nunca se suman.
                  </p>
                </div>
                {editing ? (
                  <Field label="Stock actual (se ajusta abajo)">
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
                  <Field label="Notas (descripcion en la vitrina)">
                    <textarea className="control" maxLength={500} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} value={form.notes} />
                  </Field>
                </div>
                <Check checked={form.active} label="Producto activo" onChange={(checked) => setForm({ ...form, active: checked })} />
              </div>
              <p className="text-xs text-neutral-500">El codigo lo asigna el servidor (P-0001, P-0002...). El costo se recalcula solo con cada compra de mercancia y la nota se muestra como descripcion en la ficha publica.</p>
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
                <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar producto"}</button>
              </div>
            </form>

            {editing ? (
              <section className="rounded-md border border-line bg-paper/50 p-4">
                <h3 className="text-sm font-semibold">Ajustar stock ({editing.stock} {editing.unit})</h3>
                <form className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end" onSubmit={applyAdjust}>
                  <Field label="Cantidad contejada">
                    <input className="control" min={0} onChange={(event) => setAdjustForm({ ...adjustForm, new_stock: event.target.value })} required type="number" value={adjustForm.new_stock} />
                  </Field>
                  <Field label="Motivo del ajuste">
                    <input className="control" maxLength={60} onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })} value={adjustForm.reason} />
                  </Field>
                  <button className="btn-secondary flex items-center gap-1" disabled={adjustBusy} type="submit">{adjustBusy ? "Aplicando..." : "Aplicar ajuste"}</button>
                </form>
                <p className="mt-2 text-xs text-neutral-500">El ajuste queda trazado como movimiento de inventario. Si otro usuario modifico el stock mientras tanto, el guardado se rechaza y se debe repetir el conteo.</p>
              </section>
            ) : null}

            {editing ? (
              <section className="rounded-md border border-line bg-paper/50 p-4">
                <h3 className="text-sm font-semibold">Fotografia del producto</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={`Foto de ${editing.name}`} className="max-h-56 w-full rounded-md border border-line object-contain" src={photoUrl} />
                  ) : (
                    <p className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-line p-4 text-center text-sm text-neutral-500">Sin fotografia.</p>
                  )}
                  <form className="space-y-3" onSubmit={uploadPhoto}>
                    <Field label="Nueva foto (PNG, JPEG o WEBP, max 5 MB)">
                      <input accept="image/png,image/jpeg,image/webp" capture="environment" className="control" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} type="file" />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary flex items-center gap-1" disabled={photoBusy || !photoFile} type="submit"><Camera size={14} /> {photoBusy ? "Subiendo..." : "Subir foto"}</button>
                      {editing.has_photo ? (
                        <button className="btn-secondary flex items-center gap-1" disabled={photoBusy} onClick={() => void removePhoto()} type="button"><Trash2 size={14} /> Quitar foto</button>
                      ) : null}
                    </div>
                    <p className="text-xs text-neutral-500">En moviles la camara queda disponible gracias al capture del campo. La imagen se almacena en el bucket comercio-assets con ruta aislada por tenant.</p>
                  </form>
                </div>
              </section>
            ) : null}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
