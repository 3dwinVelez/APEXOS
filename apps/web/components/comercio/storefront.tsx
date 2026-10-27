"use client";

// Vitrina publica Comercio (client): grid de productos, chips de categoria, busqueda,
// carrito de pedido y envio por WhatsApp. Diseno autocontenido (paleta neutra oscura +
// acento esmeralda) para no depender del tema del visitante ni del shell del dashboard.
import { MessageCircle, Minus, Plus, ShoppingBag, Store, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { PublicCatalog, PublicCatalogItem } from "@/app/tienda/[code]/page";

type CartLine = { item: PublicCatalogItem; quantity: number };

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString("es-CO")}`;
  }
}

function whatsappDigits(value: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function buildWhatsAppUrl(catalog: PublicCatalog, lines: CartLine[]) {
  const digits = whatsappDigits(catalog.whatsapp);
  const rows = lines.map((line) => `• ${line.quantity}x ${line.item.name} (${line.item.code}) — ${money(line.item.price * line.quantity, catalog.currency)}`);
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const message = `¡Hola, ${catalog.store_name}! Quiero hacer este pedido:\n\n${rows.join("\n")}\n\nTotal estimado: ${money(total, catalog.currency)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function Storefront({ catalog }: { catalog: PublicCatalog }) {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle) || (item.category || "").toLowerCase().includes(needle);
    });
  }, [catalog.items, category, query]);

  const lines: CartLine[] = useMemo(() => Object.entries(cart)
    .map(([code, quantity]) => {
      const item = catalog.items.find((row) => row.code === code);
      return item ? { item, quantity } : null;
    })
    .filter((line): line is CartLine => line !== null), [cart, catalog.items]);

  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const hasWhatsApp = whatsappDigits(catalog.whatsapp).length >= 7;

  function setQuantity(item: PublicCatalogItem, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[item.code];
      else next[item.code] = quantity;
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-neutral-950 pb-28 text-neutral-100 md:pb-10">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-neutral-800 bg-gradient-to-br from-emerald-600/25 via-neutral-950 to-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 md:flex-row md:items-end md:justify-between md:py-14">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
              <Store className="h-4 w-4" /> Tienda abierta
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">{catalog.store_name}</h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">
              Escoge tus productos, arma el pedido y envialo por WhatsApp. Precios y disponibilidad al momento.
            </p>
          </div>
          <div className="w-full md:w-72">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto o referencia..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-500 focus:border-emerald-500"
            />
          </div>
        </div>
      </header>

      {/* Chips de categoria */}
      {catalog.categories.length > 0 ? (
        <div className="mx-auto max-w-6xl px-5 pt-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip label="Todos" active={category === null} onClick={() => setCategory(null)} />
            {catalog.categories.map((name) => (
              <Chip key={name} label={name} active={category === name} onClick={() => setCategory(category === name ? null : name)} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Grid */}
      <section className="mx-auto max-w-6xl px-5 py-6">
        {items.length === 0 ? (
          <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
            {catalog.items.length === 0 ? "Esta tienda aun no tiene productos publicados." : "Ningun producto coincide con la busqueda."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {items.map((item) => (
              <ProductCard
                key={item.code}
                item={item}
                currency={catalog.currency}
                quantity={cart[item.code] || 0}
                onQuantity={(quantity) => setQuantity(item, quantity)}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="mx-auto max-w-6xl px-5 pb-6 text-center text-xs text-neutral-600">
        Tienda publicada con APEXOS Comercio
      </footer>

      {/* Barra fija de carrito (movil) / boton flotante (escritorio) */}
      {totalUnits > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-900/95 px-5 py-3 backdrop-blur md:hidden">
          <button type="button" onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
            <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> {totalUnits} producto{totalUnits === 1 ? "" : "s"}</span>
            <span>{money(totalAmount, catalog.currency)}</span>
          </button>
        </div>
      ) : null}
      {totalUnits > 0 ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500 md:flex"
        >
          <ShoppingBag className="h-4 w-4" /> Pedido ({totalUnits}) · {money(totalAmount, catalog.currency)}
        </button>
      ) : null}

      {/* Panel del carrito */}
      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/60" onClick={() => setCartOpen(false)} role="dialog" aria-modal="true">
          <div
            className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-neutral-800 bg-neutral-900 md:h-full md:max-h-none md:w-96 md:rounded-none md:rounded-l-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <p className="text-sm font-semibold">Tu pedido</p>
              <button type="button" aria-label="Cerrar pedido" onClick={() => setCartOpen(false)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {lines.length === 0 ? <p className="py-6 text-center text-sm text-neutral-500">Aun no agregas productos.</p> : null}
              {lines.map((line) => (
                <div key={line.item.code} className="flex items-center gap-3 border-b border-neutral-800/60 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.item.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{line.item.code} · {money(line.item.price, catalog.currency)} c/u</p>
                  </div>
                  <Stepper quantity={line.quantity} onChange={(quantity) => setQuantity(line.item, quantity)} />
                  <button type="button" aria-label={`Quitar ${line.item.name}`} onClick={() => setQuantity(line.item, 0)} className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-800 px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-neutral-400">Total estimado</span>
                <span className="text-lg font-bold">{money(totalAmount, catalog.currency)}</span>
              </div>
              {hasWhatsApp ? (
                <a
                  href={buildWhatsAppUrl(catalog, lines)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  <MessageCircle className="h-4 w-4" /> Enviar pedido por WhatsApp
                </a>
              ) : (
                <p className="rounded-xl border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-center text-xs text-neutral-400">
                  Esta tienda aun no publico un numero de WhatsApp para pedidos.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
        active ? "border-emerald-500 bg-emerald-600 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
      }`}
    >
      {label}
    </button>
  );
}

function Stepper({ quantity, onChange }: { quantity: number; onChange: (quantity: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-1 py-0.5">
      <button type="button" aria-label="Restar" onClick={() => onChange(quantity - 1)} className="p-1 text-neutral-300 hover:text-white"><Minus className="h-3.5 w-3.5" /></button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
      <button type="button" aria-label="Sumar" onClick={() => onChange(quantity + 1)} className="p-1 text-neutral-300 hover:text-white"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ProductCard({ item, currency, quantity, onQuantity }: {
  item: PublicCatalogItem;
  currency: string;
  quantity: number;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 transition hover:border-neutral-600">
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-neutral-800 to-neutral-900">
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-neutral-700">{item.name.slice(0, 1).toUpperCase()}</div>
        )}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.available ? "bg-emerald-600/90 text-white" : "bg-neutral-700/90 text-neutral-200"}`}>
          {item.available ? "Disponible" : "Agotado"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {item.category ? <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">{item.category}</p> : null}
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        <p className="text-xs text-neutral-500">Ref. {item.code}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <p className="text-sm font-bold">{money(item.price, currency)} <span className="text-[10px] font-normal text-neutral-500">/{item.unit}</span></p>
          {item.available ? (
            quantity > 0 ? (
              <Stepper quantity={quantity} onChange={onQuantity} />
            ) : (
              <button type="button" onClick={() => onQuantity(1)} className="rounded-lg bg-emerald-600 p-1.5 text-white transition hover:bg-emerald-500" aria-label={`Agregar ${item.name}`}>
                <Plus className="h-4 w-4" />
              </button>
            )
          ) : null}
        </div>
      </div>
    </article>
  );
}
