"use client";

// Vitrina publica Comercio (client): escaparate por categorias, secciones de producto,
// busqueda, consulta/reserva por WhatsApp producto a producto, carrito con datos del
// comprador y bloque de contacto. Diseno autocontenido (paleta neutra oscura + acento
// esmeralda) para no depender del tema del visitante ni del shell del dashboard.
import { Facebook, Instagram, MessageCircle, Minus, Plus, Search, ShoppingBag, Store, Trash2, Users, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { PublicCatalog, PublicCatalogItem } from "@/app/tienda/[code]/page";

type CartLine = { item: PublicCatalogItem; quantity: number };

type CategoryGroup = { name: string; label: string; items: PublicCatalogItem[] };

const OTHER_LABEL = "Otros productos";

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

function waHref(digits: string, message: string) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Fila de enlaces sociales de la vitrina: solo muestra lo que el comercio configuro.
// WhatsApp usa el numero de pedidos (wa.me directo); Facebook/Instagram son URLs ya
// normalizadas por el servidor (https). target _blank + rel noopener por seguridad.
function SocialLinks({ catalog, className = "" }: { catalog: PublicCatalog; className?: string }) {
  const wa = whatsappDigits(catalog.whatsapp);
  const links: { key: string; label: string; href: string; icon: typeof Facebook }[] = [];
  if (wa.length >= 7) links.push({ key: "whatsapp", label: "WhatsApp", href: `https://wa.me/${wa}`, icon: MessageCircle });
  if (catalog.instagram) links.push({ key: "instagram", label: "Instagram", href: catalog.instagram, icon: Instagram });
  if (catalog.facebook) links.push({ key: "facebook", label: "Facebook", href: catalog.facebook, icon: Facebook });
  if (links.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300 transition hover:border-emerald-500 hover:text-emerald-400"
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}

// Mensaje del pedido: renglon por linea (cantidad, producto, referencia, categoria,
// subtotal) mas nombre del comprador y requerimiento de factura si aplica.
function buildOrderUrl(catalog: PublicCatalog, lines: CartLine[], buyerName: string, needsInvoice: boolean) {
  const digits = whatsappDigits(catalog.whatsapp);
  const rows = lines.map((line) => {
    const cat = line.item.category ? ` · ${line.item.category}` : "";
    return `• ${line.quantity}x ${line.item.name} (${line.item.code}${cat}) — ${money(line.item.price * line.quantity, catalog.currency)}`;
  });
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const name = buyerName.trim();
  const head = name ? `¡Hola, ${catalog.store_name}! Soy ${name}. Quiero hacer este pedido:` : `¡Hola, ${catalog.store_name}! Quiero hacer este pedido:`;
  const extras: string[] = [];
  if (name) extras.push(`Nombre: ${name}`);
  if (needsInvoice) extras.push("Requiero factura");
  const footer = `Total estimado: ${money(total, catalog.currency)}${extras.length ? `\n\n${extras.join("\n")}` : ""}`;
  return waHref(digits, `${head}\n\n${rows.join("\n")}\n\n${footer}`);
}

// Mensaje de interes/reserva de un producto individual (boton "Consultar").
function buildInterestUrl(catalog: PublicCatalog, item: PublicCatalogItem) {
  const digits = whatsappDigits(catalog.whatsapp);
  const cat = item.category ? ` · ${item.category}` : "";
  const stock = item.available ? "Disponible" : "Agotado";
  const message = `¡Hola, ${catalog.store_name}! Estoy interesado en ${item.name} (Ref. ${item.code}${cat}) — ${money(item.price, catalog.currency)}/${item.unit}. Estado: ${stock}. ¿Me confirmas disponibilidad y me ayuda a reservarlo?`;
  return waHref(digits, message);
}

export default function Storefront({ catalog }: { catalog: PublicCatalog }) {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [needsInvoice, setNeedsInvoice] = useState(false);

  const matchesFilter = useCallback((item: PublicCatalogItem) => {
    if (category === null) return true;
    if (category === OTHER_LABEL) return !item.category || !catalog.categories.includes(item.category);
    return item.category === category;
  }, [category, catalog.categories]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.items.filter((item) => {
      if (!matchesFilter(item)) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle) || (item.category || "").toLowerCase().includes(needle);
    });
  }, [catalog.items, matchesFilter, query]);

  // Grupos por categoria para el escaparate y las secciones. Las categorias declaradas
  // van primero con su portada; los productos sin categoria forman "Otros productos".
  const groups: CategoryGroup[] = useMemo(() => {
    const result: CategoryGroup[] = catalog.categories.map((name) => ({
      name,
      label: name,
      items: catalog.items.filter((item) => item.category === name),
    }));
    const uncategorized = catalog.items.filter((item) => !item.category || !catalog.categories.includes(item.category));
    if (uncategorized.length > 0) result.push({ name: "", label: OTHER_LABEL, items: uncategorized });
    return result.filter((group) => group.items.length > 0);
  }, [catalog.categories, catalog.items]);

  const lines: CartLine[] = useMemo(() => Object.entries(cart)
    .map(([code, quantity]) => {
      const item = catalog.items.find((row) => row.code === code);
      return item ? { item, quantity } : null;
    })
    .filter((line): line is CartLine => line !== null), [cart, catalog.items]);

  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const hasWhatsApp = whatsappDigits(catalog.whatsapp).length >= 7;
  const isBrowsingAll = category === null && query.trim() === "";

  function setQuantity(item: PublicCatalogItem, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[item.code];
      else next[item.code] = quantity;
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-neutral-950 pb-28 text-neutral-100 md:pb-12">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-neutral-800 bg-gradient-to-br from-emerald-600/25 via-neutral-950 to-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 md:flex-row md:items-end md:justify-between md:py-14">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
              <Store className="h-4 w-4" /> Tienda abierta
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">{catalog.store_name}</h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">
              Escoge tus productos, arma el pedido y envialo por WhatsApp. Precios y disponibilidad al momento.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {hasWhatsApp ? (
                <a
                  href={`https://wa.me/${whatsappDigits(catalog.whatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  <MessageCircle className="h-4 w-4" /> Escríbenos por WhatsApp
                </a>
              ) : null}
              <SocialLinks catalog={catalog} />
            </div>
          </div>
          <div className="w-full md:w-72">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto o referencia..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-neutral-500 focus:border-emerald-500"
              />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500">
              <Users className="h-3.5 w-3.5" /> {catalog.items.length} producto{catalog.items.length === 1 ? "" : "s"} · {groups.filter((g) => g.name).length} categoria{groups.filter((g) => g.name).length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      {/* Escaparate de categorias (solo navegando sin filtros) */}
      {isBrowsingAll && groups.length > 1 ? (
        <section aria-label="Categorias" className="mx-auto max-w-6xl px-5 pt-6">
          <p className="text-sm font-semibold text-neutral-300">Explora por categoria</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {groups.map((group) => (
              <CategoryCard
                key={group.label}
                group={group}
                active={false}
                onSelect={() => setCategory(group.name || OTHER_LABEL)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Chips de categoria (atajo de filtrado) */}
      <div className="mx-auto max-w-6xl px-5 pt-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip label="Todos" active={category === null} onClick={() => setCategory(null)} />
          {catalog.categories.map((name) => (
            <Chip key={name} label={name} active={category === name} onClick={() => setCategory(category === name ? null : name)} />
          ))}
          {groups.some((g) => !g.name) ? (
            <Chip label={OTHER_LABEL} active={category === OTHER_LABEL} onClick={() => setCategory(category === OTHER_LABEL ? null : OTHER_LABEL)} />
          ) : null}
        </div>
      </div>

      {/* Productos */}
      <section className="mx-auto max-w-6xl px-5 py-6">
        {items.length === 0 ? (
          <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
            {catalog.items.length === 0 ? "Esta tienda aun no tiene productos publicados." : "Ningun producto coincide con la busqueda."}
          </p>
        ) : isBrowsingAll && groups.length > 1 ? (
          // Secciones agrupadas por categoria
          <div className="space-y-10">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-neutral-800 pb-2">
                  <p className="flex items-baseline gap-2 text-base font-bold">
                    {group.label}
                    <span className="text-xs font-normal text-neutral-500">{group.items.length} producto{group.items.length === 1 ? "" : "s"}</span>
                  </p>
                  <button type="button" onClick={() => setCategory(group.name || OTHER_LABEL)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Ver solo esta seccion</button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
                  {group.items.map((item) => (
                    <ProductCard
                      key={item.code}
                      item={item}
                      catalog={catalog}
                      hasWhatsApp={hasWhatsApp}
                      quantity={cart[item.code] || 0}
                      onQuantity={(quantity) => setQuantity(item, quantity)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {items.map((item) => (
              <ProductCard
                key={item.code}
                item={item}
                catalog={catalog}
                hasWhatsApp={hasWhatsApp}
                quantity={cart[item.code] || 0}
                onQuantity={(quantity) => setQuantity(item, quantity)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Bloque de contacto */}
      <section aria-label="Contacto" className="mx-auto max-w-6xl px-5 pb-4">
        <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 text-center">
          <p className="text-lg font-bold">¿Dudas, reservas o facturacion?</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-400">
            Escríbenos y te confirmamos disponibilidad, apartamos tu pedido o te facturamos como necesites.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {hasWhatsApp ? (
              <a
                href={waHref(whatsappDigits(catalog.whatsapp), `¡Hola, ${catalog.store_name}! Quiero más información sobre sus productos.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                <MessageCircle className="h-4 w-4" /> {catalog.whatsapp}
              </a>
            ) : null}
            <SocialLinks catalog={catalog} />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 pb-8 text-center text-xs text-neutral-600">
        {catalog.store_name} · Tienda publicada con APEXOS Comercio
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
              {/* Datos del comprador: se anexan al mensaje de WhatsApp */}
              <div className="mt-4 space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Tus datos</p>
                <input
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                  maxLength={80}
                  placeholder="Nombre para el pedido (opcional)"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-emerald-500"
                />
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input checked={needsInvoice} onChange={(event) => setNeedsInvoice(event.target.checked)} type="checkbox" className="h-4 w-4 accent-emerald-600" />
                  Requiero factura
                </label>
              </div>
            </div>
            <div className="border-t border-neutral-800 px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-neutral-400">Total estimado</span>
                <span className="text-lg font-bold">{money(totalAmount, catalog.currency)}</span>
              </div>
              {hasWhatsApp ? (
                <a
                  href={buildOrderUrl(catalog, lines, buyerName, needsInvoice)}
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

// Tarjeta de categoria: portada (foto del primer producto con imagen o inicial),
// nombre y conteo. Al hacer clic filtra la grilla por esa categoria.
function CategoryCard({ group, onSelect }: { group: CategoryGroup; active: boolean; onSelect: () => void }) {
  const cover = group.items.find((item) => item.photo_url)?.photo_url || null;
  const availableCount = group.items.filter((item) => item.available).length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 text-left transition hover:border-emerald-500"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-60 transition group-hover:scale-105 group-hover:opacity-70" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-600/20 via-neutral-900 to-neutral-950">
          <span className="text-4xl font-black text-neutral-700">{group.label.slice(0, 1).toUpperCase()}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/95 via-neutral-950/30 to-transparent" />
      <div className="relative p-3">
        <p className="text-sm font-bold leading-tight">{group.label}</p>
        <p className="mt-0.5 text-[11px] text-neutral-300">
          {group.items.length} producto{group.items.length === 1 ? "" : "s"} · {availableCount} disponible{availableCount === 1 ? "" : "s"}
        </p>
      </div>
    </button>
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

function ProductCard({ item, catalog, hasWhatsApp, quantity, onQuantity }: {
  item: PublicCatalogItem;
  catalog: PublicCatalog;
  hasWhatsApp: boolean;
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
          <p className="text-sm font-bold">{money(item.price, catalog.currency)} <span className="text-[10px] font-normal text-neutral-500">/{item.unit}</span></p>
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
        {hasWhatsApp ? (
          <a
            href={buildInterestUrl(catalog, item)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-1.5 text-[11px] font-semibold text-neutral-300 transition hover:border-emerald-500 hover:text-emerald-400"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Consultar por WhatsApp
          </a>
        ) : null}
      </div>
    </article>
  );
}
