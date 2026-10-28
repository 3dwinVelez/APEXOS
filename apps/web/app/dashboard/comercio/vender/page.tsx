"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { TransportSearchSelect } from "@/components/transport/TransportSearchSelect";
import { Check, ComercioMessages, Field, ModuleHeader, comercioGate, describeError, matchesQuery, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Punto de venta del Comercio. El precio y el costo los fija el servidor desde el producto;
// aqui solo se arma el carrito (producto + cantidad). La venta a credito genera el cronograma
// de cuotas sin interes en el backend.
type Product = { id: number; code: string; name: string; category: string | null; unit: string; price: number; sale_price: number; sale_discount_percent: number; stock: number; active: boolean; low_stock: boolean };
type Customer = { id: number; code: string; name: string; phone: string | null; active: boolean };
type Sale = {
  id: number; full_number: string; date: string; subtotal: number; discount: number; total: number;
  payment_type: string; method: string | null; customer_name: string | null; note: string | null;
  items: { line_number: number; product_name: string; quantity: number; unit_price: number; line_total: number }[];
  credit_full_number?: string | null;
};

type CartLine = { product_id: number; name: string; code: string; unit: string; price: number; stock: number; quantity: number };

const METHODS = ["Efectivo", "Nequi", "Tarjeta", "Transferencia"];

export default function ComercioVenderPage() {
  const access = useComercioAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [isCredit, setIsCredit] = useState(false);
  const [method, setMethod] = useState("Efectivo");
  const [customerId, setCustomerId] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [installmentCount, setInstallmentCount] = useState("4");
  const [frequency, setFrequency] = useState("biweekly");
  const [firstDue, setFirstDue] = useState(todayISO());
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    try {
      const [productRows, customerRows] = await Promise.all([
        api<{ items: Product[] }>("/api/v1/comercio/products?limit=500"),
        api<{ items: Customer[] }>("/api/v1/comercio/customers?limit=500")
      ]);
      setProducts(productRows.items.filter((row) => row.active));
      setCustomers(customerRows.items.filter((row) => row.active));
      setReady(true);
    } catch (caught) {
      setLoadError(describeError(caught, "No fue posible cargar el catalogo del comercio."));
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead && !ready) void load();
  }, [access.ready, access.canRead, ready, load]);

  const categories = useMemo(() => [...new Set(products.map((row) => row.category || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [products]);

  const matchingProducts = useMemo(() => products.filter((row) => {
    if (category && (row.category || "") !== category) return false;
    return matchesQuery(query, row.name, row.code, row.category || "", row.unit);
  }), [products, query, category]);

  // El mostrador no necesita el catalogo completo en DOM: 24 tarjetas alcanza para elegir;
  // "Ver todo el catalogo" sube el techo a 120 cuando el cajero lo pide.
  const visibleProducts = showAll ? matchingProducts.slice(0, 120) : matchingProducts.slice(0, 24);

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discountValue = Math.max(0, Number(discount || 0));
  const total = Math.max(0, subtotal - discountValue);

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product_id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stock) return current;
        return current.map((line) => (line.product_id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      if (product.stock < 1) return current;
      // El precio del carrito es el que el servidor va a facturar (sale_price): incluye el
      // descuento del producto y la campana vigente, asi el ticket preview cierra igual.
      return [...current, { product_id: product.id, name: product.name, code: product.code, unit: product.unit, price: product.sale_price, stock: product.stock, quantity: 1 }];
    });
  }

  function changeQuantity(productId: number, delta: number) {
    setCart((current) => current
      .map((line) => {
        if (line.product_id !== productId) return line;
        const next = line.quantity + delta;
        if (next > line.stock) return line;
        return { ...line, quantity: next };
      })
      .filter((line) => line.quantity > 0));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cart.length) { setError("Agrega al menos un producto al carrito."); return; }
    if (isCredit && !customerId) { setError("Las ventas a credito exigen un cliente."); return; }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        date,
        items: cart.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
        discount: discountValue || 0,
        payment_type: isCredit ? "credit" : "cash",
        note: note.trim() || undefined
      };
      if (customerId) body.customer_id = Number(customerId);
      if (isCredit) {
        body.credit = {
          down_payment: Number(downPayment || 0),
          installment_count: Number(installmentCount),
          frequency,
          first_due_date: firstDue
        };
      } else {
        body.method = method;
      }
      const created = await api<Sale>("/api/v1/comercio/sales", { method: "POST", body: JSON.stringify(body) });
      setReceipt(created);
      setCart([]);
      setDiscount("");
      setNote("");
      setIsCredit(false);
      setCustomerId("");
      setDownPayment("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible registrar la venta."));
    } finally {
      setSaving(false);
    }
  }
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Ventas" subtitle="Venta rapida en Mostrador o a credito con cuotas sin interes. Los precios los fija el servidor: la pantalla es solo el carrito." title="Vender" />
      <ComercioMessages error={loadError || error} />

      {!ready ? (
        <div className="apex-section-card p-6 text-sm text-content-body">Cargando catalogo...</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section aria-label="Catalogo" className="apex-section-card p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
              <Field label="Buscar">
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
                  <input aria-label="Buscar producto por nombre, codigo, categoria o unidad" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, codigo o categoria" value={query} />
                </span>
              </Field>
              <Field hint={categories.length ? `${categories.length} categorias disponibles` : undefined} label="Categoria">
                <select className="control apex-select" onChange={(event) => setCategory(event.target.value)} value={category}>
                  <option value="">Todas</option>
                  {categories.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-content-muted">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Check checked={showAll} label="Ver todo el catalogo" onChange={setShowAll} />
                <span aria-live="polite" className="font-semibold text-content-body">{visibleProducts.length} de {matchingProducts.length} productos</span>
              </div>
              <span>Toca una tarjeta para agregarla al carrito. El precio lo fija el servidor.</span>
            </div>
            {visibleProducts.length === 0 ? (
              <p className="mt-4 text-sm text-content-muted">
                No hay productos que coincidan con la busqueda.{" "}
                <button className="font-semibold text-apex underline underline-offset-2" onClick={() => { setQuery(""); setCategory(""); }} type="button">Limpiar la busqueda</button>
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {visibleProducts.map((product) => (
                  <li key={product.id}>
                    <button
                      className="w-full rounded-control border border-line p-3 text-left transition-colors hover:border-apex disabled:opacity-40"
                      disabled={product.stock < 1 || !access.canWrite}
                      onClick={() => addToCart(product)}
                      type="button"
                    >
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-content-muted">{product.code} · {product.category || "Sin categoria"} · stock {product.stock}</p>
                      <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm font-semibold">
                        <span>{money(product.sale_price)}</span>
                        {product.sale_discount_percent > 0 ? (
                          <>
                            <span className="text-xs font-normal text-content-muted line-through">{money(product.price)}</span>
                            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success">-{product.sale_discount_percent}%</span>
                          </>
                        ) : null}
                      </p>
                      {product.low_stock ? <p className="mt-1 text-[11px] font-semibold text-warning">Stock bajo: queda(n) {product.stock}</p> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form aria-label="Carrito y pago" className="apex-section-card space-y-4 p-4" onSubmit={submit}>
            <h2 className="text-sm font-semibold">Carrito ({cart.length})</h2>
            {cart.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-content-muted">Toca un producto para agregarlo.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {cart.map((line) => (
                  <li className="flex items-center gap-2 py-2" key={line.product_id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{line.name}</p>
                      <p className="text-xs text-content-muted">{money(line.price)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="rounded border border-line p-1" onClick={() => changeQuantity(line.product_id, -1)} type="button" aria-label={`Quitar una unidad de ${line.name}`}><Minus size={12} /></button>
                      <span className="w-8 text-center font-semibold">{line.quantity}</span>
                      <button className="rounded border border-line p-1" disabled={line.quantity >= line.stock} onClick={() => changeQuantity(line.product_id, 1)} type="button" aria-label={`Agregar una unidad de ${line.name}`}><Plus size={12} /></button>
                    </div>
                    <span className="w-24 text-right font-semibold">{money(line.price * line.quantity)}</span>
                    <button className="text-content-muted hover:text-error" onClick={() => setCart((current) => current.filter((item) => item.product_id !== line.product_id))} type="button" aria-label={`Eliminar ${line.name} del carrito`}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha de la venta">
                <input className="control" max={todayISO()} onChange={(event) => setDate(event.target.value)} type="date" value={date} />
              </Field>
              <Field label="Descuento">
                <input className="control" min={0} onChange={(event) => setDiscount(event.target.value)} step="0.01" type="number" value={discount} />
              </Field>
            </div>

            <div className="rounded-md border border-line p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Forma de pago</p>
                <Check checked={isCredit} label="Venta a credito" onChange={setIsCredit} />
              </div>
              {!isCredit ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {METHODS.map((option) => (
                    <button
                      className={`rounded-md border px-2 py-2 text-sm ${method === option && !isCredit ? "border-apex bg-apex/10 font-semibold text-apex" : "border-line"}`}
                      disabled={isCredit}
                      key={option}
                      onClick={() => setMethod(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Cliente">
                    <TransportSearchSelect aria-label="Buscar el cliente por codigo o nombre" className="control w-full" onChange={(event) => setCustomerId(event.target.value)} required value={customerId}>
                      <option value="">Seleccione un cliente</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={String(customer.id)}>{customer.code} - {customer.name}</option>
                      ))}
                    </TransportSearchSelect>
                  </Field>
                  <Field label="Pago inicial">
                    <input className="control" min={0} onChange={(event) => setDownPayment(event.target.value)} step="0.01" type="number" value={downPayment} />
                  </Field>
                  <Field label="Numero de cuotas">
                    <input className="control" max={60} min={1} onChange={(event) => setInstallmentCount(event.target.value)} type="number" value={installmentCount} />
                  </Field>
                  <Field label="Frecuencia">
                    <select className="control apex-select" onChange={(event) => setFrequency(event.target.value)} value={frequency}>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </Field>
                  <Field label="Primer vencimiento">
                    <input className="control" onChange={(event) => setFirstDue(event.target.value)} type="date" value={firstDue} />
                  </Field>
                  <p className="text-xs text-content-muted self-end">
                    Financiado: {money(Math.max(0, total - Number(downPayment || 0)))} en {installmentCount} cuota(s).
                  </p>
                </div>
              )}
            </div>

            <Field label="Nota (opcional)">
              <input className="control" maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} />
            </Field>

            <div className="rounded-md bg-surface-muted p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="flex justify-between"><span>Descuento</span><span>-{money(discountValue)}</span></div>
              <div className="mt-1 flex justify-between border-t border-line pt-1 text-base font-semibold"><span>Total</span><span>{money(total)}</span></div>
            </div>

            <button className="inline-flex items-center apex-primary-action w-full px-4 text-sm font-semibold gap-2" disabled={saving || !cart.length || !access.canWrite} type="submit">
              {saving ? "Registrando..." : isCredit ? "Vender a credito" : "Vender ahora"}
            </button>
          </form>
        </div>
      )}

      {receipt ? (
        <ModalFrame onClose={() => setReceipt(null)} title={`Comprobante ${receipt.full_number}`}>
          <div className="space-y-3 text-sm">
            <div className="text-center">
              <p className="text-lg font-semibold">{receipt.full_number}</p>
              <p className="text-xs text-content-muted">{receipt.date} · {receipt.payment_type === "credit" ? "Credito" : `Pago: ${receipt.method}`}</p>
              {receipt.customer_name ? <p className="text-xs text-content-muted">Cliente: {receipt.customer_name}</p> : null}
            </div>
            <ul className="divide-y divide-line">
              {receipt.items.map((item) => (
                <li className="flex justify-between gap-2 py-1" key={item.line_number}>
                  <span className="min-w-0 flex-1 truncate">{item.quantity} x {item.product_name}</span>
                  <span>{money(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-md bg-surface-muted p-3">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(receipt.subtotal)}</span></div>
              <div className="flex justify-between"><span>Descuento</span><span>-{money(receipt.discount)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{money(receipt.total)}</span></div>
            </div>
            {receipt.credit_full_number ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                Se abrio el credito {receipt.credit_full_number}. Consulta el plan de cuotas y registra abonos en la pestaña Cartera.
              </p>
            ) : null}
            {receipt.note ? <p className="text-xs text-content-muted">Nota: {receipt.note}</p> : null}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => window.print()} type="button">Imprimir</button>
              <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" onClick={() => setReceipt(null)} type="button">Cerrar</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
