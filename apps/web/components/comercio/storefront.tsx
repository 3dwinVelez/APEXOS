"use client";

// Vitrina publica Comercio (client): navigation tipo retail (barra fija con departamentos,
// rieles horizontales con scroll-snap, hero editorial y tarjetas imagen-first) mas vista
// rapida, carrito con datos del comprador y envio por WhatsApp. Se reutilizan patrones
// genericos de comercio electronico, nunca marcas, nombres ni assets de tiendas ajenas.
// Diseno autocontenido (paleta neutra oscura + acento esmeralda, ofertas en rosa) para no
// depender del tema del visitante ni del shell del dashboard.
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  Facebook,
  Instagram,
  MessageCircle,
  Minus,
  Percent,
  Plus,
  Search,
  Smartphone,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  Trash2,
  Truck,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PublicCatalog, PublicCatalogItem, PublicCatalogPromo } from "@/app/tienda/[code]/page";
import { buildStorefrontVars } from "./storefront-theme";
import { useOverlayA11y } from "@/components/ui/useOverlayA11y";

// El tema viaja en el catalogo publico; aqui se expande a variables CSS sobre el nodo
// raiz. Sin tema (tenants antiguos) buildStorefrontVars produce los colores de siempre.
function storefrontStyleVars(catalog: PublicCatalog): CSSProperties {
  return buildStorefrontVars(catalog.theme) as CSSProperties;
}

type CartLine = { item: PublicCatalogItem; quantity: number };

// Filtro activo de la barra de departamentos. "category" usa OTHER_LABEL para sin categoria.
type FilterKind = "all" | "featured" | "offers" | "category";
type Filter = { kind: FilterKind; name: string | null };
type SortKind = "destacado" | "precio_asc" | "precio_desc" | "nombre";

type Department = {
  name: string;
  count: number;
  available: number;
  bestDiscount: number;
  from: number;
  cover: PublicCatalogItem | null;
};

const OTHER_LABEL = "Otros productos";
const EMPTY_PROMO: PublicCatalogPromo = { label: null, percent: 0, start: null, end: null, active: false };

const SORTS: { id: SortKind; label: string }[] = [
  { id: "destacado", label: "Recomendados" },
  { id: "precio_asc", label: "Precio: menor a mayor" },
  { id: "precio_desc", label: "Precio: mayor a menor" },
  { id: "nombre", label: "Nombre A-Z" }
];

// Datos del comprador. Este es el unico formulario que estructura el mensaje de WhatsApp:
// el comercio lee nombre, contacto, pago, financiacion, entrega y factura sin tener que
// preguntar nada. Todo es opcional salvo que el visitante quiera una respuesta rapida.
type Buyer = {
  name: string;
  phone: string;
  payment: string;
  financing: "no" | "cuotas";
  installments: string;
  delivery: "tienda" | "envio";
  city: string;
  address: string;
  invoice: boolean;
  document: string;
  note: string;
};

const PAYMENT_OPTIONS: { id: string; icon: typeof Banknote }[] = [
  { id: "Efectivo", icon: Banknote },
  { id: "Nequi", icon: Smartphone },
  { id: "Tarjeta", icon: CreditCard },
  { id: "Transferencia", icon: ArrowLeftRight },
  { id: "Contra entrega", icon: Truck }
];

const INSTALLMENT_OPTIONS = ["2", "3", "6", "12"];

const emptyBuyer: Buyer = {
  name: "",
  phone: "",
  payment: "",
  financing: "no",
  installments: "3",
  delivery: "tienda",
  city: "",
  address: "",
  invoice: false,
  document: "",
  note: ""
};

const fieldClass = "w-full rounded-lg border sf-border-line-2 sf-bg-surface px-3 py-2 text-sm outline-none transition sf-placeholder-text-muted focus:sf-focus-border-accent";

function orderStorageKey() {
  return `apex-comercio-pedido:${window.location.pathname}`;
}

// Datos clave para que el pedido llegue accionable: quien es, como responderle, como paga
// y donde entrega. La direccion solo cuenta si pidio envio a domicilio.
function buyerChecks(buyer: Buyer) {
  return [
    { label: "nombre", ok: buyer.name.trim().length >= 3 },
    { label: "WhatsApp", ok: whatsappDigits(buyer.phone).length >= 7 },
    { label: "medio de pago", ok: Boolean(buyer.payment) },
    {
      label: "dirección",
      ok: buyer.delivery === "tienda" || Boolean(buyer.city.trim() || buyer.address.trim())
    }
  ];
}

// Resumen corto que el visitante ve antes de enviar, para confirmar que envio lo que creyo.
function describeOrder(buyer: Buyer) {
  const parts = [buyer.delivery === "envio" ? "Envío a domicilio" : "Retiro en la tienda"];
  parts.push(buyer.payment ? `Pago: ${buyer.payment}` : "Pago por definir");
  if (buyer.financing === "cuotas") parts.push(`Financiado en ${buyer.installments || "-"} cuotas`);
  if (buyer.invoice) parts.push("Con factura");
  return parts.join(" · ");
}

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

// Etiqueta del descuento: enteros sin decimales (-25%) y el resto con uno (-12.5%).
function discountLabel(percent: number) {
  const rounded = Math.round(percent * 10) / 10;
  return `-${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function hasDiscount(item: PublicCatalogItem) {
  return item.discount_percent > 0 && item.base_price > item.price;
}

// Fila de enlaces sociales: solo muestra lo que el comercio configuro. WhatsApp usa el
// numero de pedidos (wa.me directo); Facebook/Instagram son URLs ya normalizadas por el
// servidor (https). target _blank + rel noopener por seguridad.
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
            className="flex h-9 w-9 items-center justify-center rounded-full border sf-border-line-2 sf-bg-surface sf-text-body transition hover:sf-hover-border-accent hover:sf-hover-text-accent"
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}

// Mensaje del pedido: renglon por linea (cantidad, producto, referencia, categoria, precio
// pagado y subtotal), el total con el ahorro, y el bloque "Datos del pedido" que arma el
// formulario del carrito. El comercio recibe todo listo para atender sin repreguntar.
function buildOrderUrl(catalog: PublicCatalog, lines: CartLine[], buyer: Buyer) {
  const digits = whatsappDigits(catalog.whatsapp);
  const currency = catalog.currency;
  const rows = lines.map((line) => {
    const cat = line.item.category ? ` · ${line.item.category}` : "";
    const before = hasDiscount(line.item) ? ` (antes ${money(line.item.base_price, currency)})` : "";
    return `• ${line.quantity}x ${line.item.name} (${line.item.code}${cat}) — ${money(line.item.price, currency)} c/u${before} = ${money(line.item.price * line.quantity, currency)}`;
  });
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const saved = lines.reduce((sum, line) => sum + (line.item.base_price - line.item.price) * line.quantity, 0);
  const name = buyer.name.trim();
  const head = name
    ? `¡Hola, ${catalog.store_name}! Soy ${name}. Quiero confirmar este pedido:`
    : `¡Hola, ${catalog.store_name}! Quiero hacer este pedido:`;

  const totals = [`Total estimado: ${money(total, currency)}`];
  if (saved > 0.5) totals.push(`Ahorro con descuentos: ${money(saved, currency)}`);

  const data: string[] = [];
  if (name) data.push(`Nombre: ${name}`);
  if (buyer.phone.trim()) data.push(`WhatsApp de contacto: ${buyer.phone.trim()}`);
  if (buyer.payment) data.push(`Medio de pago: ${buyer.payment}`);
  if (buyer.financing === "cuotas") {
    const count = Number(buyer.installments) || 0;
    data.push(count > 0
      ? `Financiación: sí, ${count} cuotas de aprox. ${money(total / count, currency)}`
      : "Financiación: sí, quiero cuotas");
  }
  if (buyer.delivery === "envio") {
    const where = [buyer.city.trim(), buyer.address.trim()].filter(Boolean).join(" - ");
    data.push(`Entrega: envío a domicilio${where ? ` (${where})` : ", me confirmas cobertura"}`);
  } else {
    data.push("Entrega: retiro en la tienda");
  }
  if (buyer.invoice) data.push(`Factura: sí${buyer.document.trim() ? `, documento ${buyer.document.trim()}` : ""}`);
  if (buyer.note.trim()) data.push(`Notas: ${buyer.note.trim()}`);

  const message = [
    `${head}\n\n${rows.join("\n")}`,
    totals.join("\n"),
    `Datos del pedido\n${data.join("\n")}`
  ].join("\n\n");
  return waHref(digits, message);
}

// Mensaje de interes/reserva de un producto individual (aprovecha los datos ya escritos
// en el carrito para que el comercio sepa con quien hablar desde el primer mensaje).
function buildInterestUrl(catalog: PublicCatalog, item: PublicCatalogItem, buyer?: Buyer) {
  const digits = whatsappDigits(catalog.whatsapp);
  const cat = item.category ? ` · ${item.category}` : "";
  const price = hasDiscount(item)
    ? `${money(item.price, catalog.currency)} (antes ${money(item.base_price, catalog.currency)}, ${discountLabel(item.discount_percent)} de descuento)`
    : `${money(item.price, catalog.currency)}`;
  const state = item.available ? "Disponible" : "Agotado";
  const who = buyer?.name.trim() ? ` Soy ${buyer.name.trim()}.` : "";
  const contact = buyer && whatsappDigits(buyer.phone).length >= 7 ? ` Mi WhatsApp: ${buyer.phone.trim()}.` : "";
  const message = `¡Hola, ${catalog.store_name}!${who} Estoy interesado en ${item.name} (Ref. ${item.code}${cat}) — ${price}/${item.unit}. Estado: ${state}.${contact} ¿Me confirmas disponibilidad y me ayudas a reservarlo?`;
  return waHref(digits, message);
}

// Franja superior: la campana de vitrina manda el mensaje mientras este vigente.
function PromoStrip({ catalog }: { catalog: PublicCatalog }) {
  const promo = catalog.promo || EMPTY_PROMO;
  if (promo.active && promo.percent > 0) {
    return (
      <div className="sf-btn-promo px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] sm:text-xs">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Tags className="h-3.5 w-3.5 shrink-0" />
          {promo.label || "Ofertas de temporada"} · {discountLabel(promo.percent)} en toda la tienda
          {promo.end ? <span className="hidden font-semibold normal-case tracking-normal opacity-90 sm:inline">· vigencia hasta {promo.end}</span> : null}
        </span>
      </div>
    );
  }
  if (catalog.tagline) {
    return (
      <div className="border-b sf-border-line sf-bg-surface px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] sf-text-body sm:text-xs">
        {catalog.tagline}
      </div>
    );
  }
  return null;
}

export default function Storefront({ catalog }: { catalog: PublicCatalog }) {
  const [filter, setFilter] = useState<Filter>({ kind: "all", name: null });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKind>("destacado");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [quick, setQuick] = useState<PublicCatalogItem | null>(null);
  const [buyer, setBuyer] = useState<Buyer>(emptyBuyer);

  const promo: PublicCatalogPromo = catalog.promo || EMPTY_PROMO;
  const hasWhatsApp = whatsappDigits(catalog.whatsapp).length >= 7;

  // El carrito y la vista rapida son capas propias de la vitrina (van con la tinta del
  // tenant, no con ModalFrame), asi que comparten el aro de accesibilidad: Escape cierra,
  // Tab no se escapa, el fondo no se desplaza y el foco vuelve al boton que abrio la capa.
  // La vista rapida va primero: con las dos abiertas, Escape cierra la de arriba.
  const capaCarrito = useOverlayA11y<HTMLDivElement>(cartOpen, () => { if (!quick) setCartOpen(false); });

  // Los datos del comprador quedan en el dispositivo: el visitante que vuelve a la vitrina
  // solo toca los productos y envia, sin reescribir su nombre ni su celular. El guardado esta
  // condicionado a que la restauracion ya termino: si escribe en el mismo montaje, pisa el
  // pedido guardado con el estado vacio y la siguiente recarga no encuentra nada.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(orderStorageKey());
      if (raw) setBuyer({ ...emptyBuyer, ...(JSON.parse(raw) as Partial<Buyer>) });
    } catch {
      /* sin almacenamiento disponible: se llena el formulario en memoria */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(orderStorageKey(), JSON.stringify(buyer));
    } catch {
      /* almacenamiento bloqueado: el pedido igual se puede enviar */
    }
  }, [buyer, restored]);

  function setField<K extends keyof Buyer>(key: K, value: Buyer[K]) {
    setBuyer((current) => ({ ...current, [key]: value }));
  }

  const offers = useMemo(() => catalog.items.filter(hasDiscount), [catalog.items]);

  const featuredPool = useMemo(() => {
    const marked = catalog.items.filter((item) => item.featured);
    if (marked.length >= 4) return marked.slice(0, 12);
    // Sin destacados marcados el riel se llena con las mejores ofertas, para que la
    // vitrina nunca muestre un bloque vacio en una tienda recien publicada.
    const extra = [...catalog.items]
      .filter((item) => !marked.includes(item))
      .sort((a, b) => b.discount_percent - a.discount_percent || a.name.localeCompare(b.name))
      .slice(0, 12 - marked.length);
    return [...marked, ...extra];
  }, [catalog.items]);

  const departments = useMemo<Department[]>(() => {
    const map = new Map<string, PublicCatalogItem[]>();
    for (const item of catalog.items) {
      const key = item.category || OTHER_LABEL;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        count: items.length,
        available: items.filter((item) => item.available).length,
        bestDiscount: items.reduce((max, item) => Math.max(max, item.discount_percent), 0),
        from: items.reduce((min, item) => Math.min(min, item.price), Number.POSITIVE_INFINITY),
        cover: items.find((item) => item.photo_url) || items[0] || null
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog.items]);

  const matchesFilter = useCallback((item: PublicCatalogItem) => {
    if (filter.kind === "featured") return featuredPool.includes(item);
    if (filter.kind === "offers") return hasDiscount(item);
    if (filter.kind === "category") return (item.category || OTHER_LABEL) === filter.name;
    return true;
  }, [filter, featuredPool]);

  // La busqueda es global: ignora el filtro de departamento para no ocultar coincidencias.
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return catalog.items.filter((item) => item.name.toLowerCase().includes(needle)
      || item.code.toLowerCase().includes(needle)
      || (item.category || "").toLowerCase().includes(needle)
      || (item.description || "").toLowerCase().includes(needle));
  }, [catalog.items, query]);

  const visible = useMemo(() => {
    const base = searchResults || catalog.items.filter(matchesFilter);
    const sorted = [...base];
    if (sort === "precio_asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "precio_desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "nombre") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => Number(b.featured) - Number(a.featured)
      || b.discount_percent - a.discount_percent
      || a.name.localeCompare(b.name));
    return sorted;
  }, [catalog.items, matchesFilter, searchResults, sort]);

  const lines: CartLine[] = useMemo(() => Object.entries(cart)
    .map(([code, quantity]) => {
      const item = catalog.items.find((row) => row.code === code);
      return item ? { item, quantity } : null;
    })
    .filter((line): line is CartLine => line !== null), [cart, catalog.items]);

  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const totalSaved = lines.reduce((sum, line) => sum + (line.item.base_price - line.item.price) * line.quantity, 0);

  // Barra de progreso y etiqueta "Falta ..." del formulario del carrito.
  const checks = useMemo(() => buyerChecks(buyer), [buyer]);
  const missing = checks.filter((check) => !check.ok).map((check) => check.label);

  // Con busqueda activa se retira el escaparate editorial y todo el alto va al listado.
  const browsing = !searchResults;

  function setQuantity(item: PublicCatalogItem, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[item.code];
      else next[item.code] = quantity;
      return next;
    });
  }

  function scrollToCatalog() {
    // El header del grid es el ancla: el visitante siempre aterriza en los resultados.
    requestAnimationFrame(() => {
      document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function applyFilter(next: Filter) {
    setFilter(next);
    setQuery("");
    if (next.kind !== "all") scrollToCatalog();
  }

  const availableVisible = visible.filter((item) => item.available).length;
  const activeTitle = filter.kind === "featured"
    ? "Destacados de la tienda"
    : filter.kind === "offers"
      ? (promo.active && promo.percent > 0 ? `Ofertas · ${promo.label || "temporada"}` : "Todo con descuento")
      : filter.kind === "category"
        ? String(filter.name)
        : "Todos los productos";

  return (
    <div id="inicio" style={storefrontStyleVars(catalog)} className="sf-root min-h-screen sf-bg-base sf-pattern pb-28 sf-text-strong md:pb-10">
      <PromoStrip catalog={catalog} />

      {/* Barra fija: marca, buscador, carrito y departamentos siempre disponibles. */}
      <header className="sticky top-0 z-40 border-b sf-border-line sf-bg-base-a85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-5 md:px-6">
          <a href="#inicio" className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sf-btn-accent-solid text-sm font-black">
              {catalog.store_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold uppercase tracking-wide">{catalog.store_name}</span>
              <span className="hidden text-[11px] sf-text-secondary sm:block">
                {catalog.items.length} productos · {catalog.categories.length} categorías
              </span>
            </span>
          </a>
          <div className="relative ml-auto w-full max-w-xs md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 sf-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Busca producto, referencia o rubro..."
              aria-label="Buscar en la tienda"
              className="w-full rounded-full border sf-border-line-2 sf-bg-surface py-2 pl-9 pr-8 text-sm outline-none sf-placeholder-text-muted focus:sf-focus-border-accent"
            />
            {query ? (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full sf-text-muted hover:sf-hover-bg-surface-2 hover:sf-hover-text-body">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex h-9 shrink-0 items-center gap-2 rounded-full border sf-border-line-2 sf-bg-surface px-3 text-sm font-semibold transition hover:sf-hover-border-accent"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Pedido</span>
            {totalUnits > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full sf-btn-promo px-1 text-[11px] font-bold">{totalUnits}</span>
            ) : null}
          </button>
        </div>

        <nav aria-label="Departamentos" className="mx-auto max-w-7xl px-2 pb-2 md:px-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <DepartChip label="Todo" active={filter.kind === "all"} onClick={() => applyFilter({ kind: "all", name: null })} />
            {featuredPool.length > 0 ? <DepartChip label="Destacados" active={filter.kind === "featured"} onClick={() => applyFilter({ kind: "featured", name: null })} /> : null}
            {offers.length > 0 ? (
              <DepartChip
                label={`Ofertas${promo.active && promo.percent > 0 ? ` ${discountLabel(promo.percent)}` : ""}`}
                accent
                active={filter.kind === "offers"}
                onClick={() => applyFilter({ kind: "offers", name: null })}
              />
            ) : null}
            {departments.map((dept) => (
              <DepartChip
                key={dept.name}
                label={dept.name}
                count={dept.count}
                active={filter.kind === "category" && filter.name === dept.name}
                onClick={() => applyFilter({ kind: "category", name: dept.name })}
              />
            ))}
          </div>
        </nav>
      </header>

      {browsing ? (
        <Hero
          catalog={catalog}
          promo={promo}
          featured={featuredPool}
          offersCount={offers.length}
          hasWhatsApp={hasWhatsApp}
          onQuickView={setQuick}
          onSeeOffers={() => applyFilter({ kind: "offers", name: null })}
        />
      ) : null}

      {browsing && featuredPool.length > 0 ? (
        <Rail
          title="Destacados"
          subtitle="Lo que la tienda quiere mostrar hoy"
          icon={<Sparkles className="h-4 w-4 sf-text-accent" />}
          items={featuredPool}
          catalog={catalog}
          hasWhatsApp={hasWhatsApp}
          quantityOf={(item) => cart[item.code] || 0}
          onQuantity={setQuantity}
          onQuickView={setQuick}
          onBrowseAll={() => applyFilter({ kind: "featured", name: null })}
        />
      ) : null}

      {browsing && offers.length > 0 ? (
        <Rail
          title="En descuento"
          subtitle={`Ahorra hasta ${discountLabel(offers.reduce((max, item) => Math.max(max, item.discount_percent), 0))}`}
          icon={<Tags className="h-4 w-4 sf-text-promo" />}
          accent
          items={[...offers].sort((a, b) => b.discount_percent - a.discount_percent).slice(0, 16)}
          catalog={catalog}
          hasWhatsApp={hasWhatsApp}
          quantityOf={(item) => cart[item.code] || 0}
          onQuantity={setQuantity}
          onQuickView={setQuick}
          onBrowseAll={() => applyFilter({ kind: "offers", name: null })}
        />
      ) : null}

      {browsing && departments.length > 1 ? (
        <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
          <SectionTitle kicker="Categorías" title="Explora por rubro" detail="Cada rubro agrupa sus productos y muestra el mayor descuento vigente." />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {departments.map((dept) => (
              <DepartmentCard key={dept.name} dept={dept} currency={catalog.currency} onOpen={() => applyFilter({ kind: "category", name: dept.name })} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Listado filtrado y ordenado: el nucleo de la vitrina. */}
      <section id="catalogo" className="mx-auto max-w-7xl scroll-mt-32 px-4 pt-12 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b sf-border-line pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] sf-text-accent">
              {searchResults ? "Resultados de búsqueda" : "Catálogo"}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
              {searchResults ? `“${query.trim()}”` : activeTitle}
            </h2>
            <p className="mt-1 text-xs sf-text-secondary">
              {visible.length} producto{visible.length === 1 ? "" : "s"} · {availableVisible} disponible{availableVisible === 1 ? "" : "s"}
              {searchResults ? " · limpia la búsqueda para volver a los rubros" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {offers.length > 0 && !searchResults ? (
              <button
                type="button"
                onClick={() => applyFilter(filter.kind === "offers" ? { kind: "all", name: null } : { kind: "offers", name: null })}
                className={`min-h-11 rounded-full border px-4 py-2.5 text-xs font-semibold transition sm:min-h-0 sm:px-3 sm:py-1.5 ${filter.kind === "offers" ? "sf-border-promo sf-btn-promo" : "sf-border-line-2 sf-bg-surface sf-text-body hover:sf-hover-border-promo hover:sf-hover-text-promo-soft"}`}
              >
                {filter.kind === "offers" ? "Ver todo" : "Solo ofertas"}
              </button>
            ) : null}
            <label className="flex items-center gap-2 text-xs sf-text-secondary">
              <span className="hidden sm:inline">Ordenar</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKind)}
                aria-label="Ordenar productos"
                className="rounded-lg border sf-border-line-2 sf-bg-surface px-2.5 py-1.5 text-xs font-semibold sf-text-body outline-none focus:sf-focus-border-accent"
              >
                {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="mt-8 rounded-xl border sf-border-line sf-bg-surface p-8 text-center text-sm sf-text-secondary">
            {catalog.items.length === 0 ? "Esta tienda aún no tiene productos publicados." : "Ningún producto coincide con la búsqueda o el filtro."}
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((item) => (
              <ProductCard
                key={item.code}
                item={item}
                catalog={catalog}
                hasWhatsApp={hasWhatsApp}
                quantity={cart[item.code] || 0}
                onQuantity={(quantity) => setQuantity(item, quantity)}
                onQuickView={() => setQuick(item)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Contacto: la vitrina tambien cierra ventas por chat sin pasar por el carrito. */}
      <section aria-label="Contacto" className="mx-auto max-w-7xl px-4 pt-14 md:px-6">
        <div className="overflow-hidden rounded-3xl border sf-border-line sf-grad-contact p-6 md:p-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] sf-text-accent">Contacto directo</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">¿Dudas, reservas o facturación?</h2>
              <p className="mt-2 text-sm sf-text-body">
                Escríbenos y confirmamos disponibilidad, apartados y entrega. Si necesitas factura, dilo en el mismo mensaje del pedido.
              </p>
              <SocialLinks catalog={catalog} className="mt-4" />
            </div>
            {hasWhatsApp ? (
              <a
                href={waHref(whatsappDigits(catalog.whatsapp), `¡Hola, ${catalog.store_name}! Quiero información sobre un producto de su tienda.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl sf-btn-accent px-5 py-3 text-sm font-bold sf-text-on-accent transition hover:sf-btn-accent hover:sf-hover-btn-accent"
              >
                <MessageCircle className="h-4 w-4" /> Escríbenos por WhatsApp
              </a>
            ) : (
              <p className="rounded-xl border sf-border-line-2 sf-bg-surface-a70 px-4 py-3 text-center text-xs sf-text-secondary">
                Esta tienda aún no publicó un número de WhatsApp para pedidos.
              </p>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-14 border-t sf-border-line sf-bg-surface-a40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4 md:px-6">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <Store className="h-4 w-4 sf-text-accent" /> {catalog.store_name}
            </p>
            {catalog.tagline ? <p className="mt-2 text-xs leading-relaxed sf-text-secondary">{catalog.tagline}</p> : null}
            <SocialLinks catalog={catalog} className="mt-4" />
          </div>
          <div className="md:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] sf-text-secondary">Categorías</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
              {departments.map((dept) => (
                <button key={dept.name} type="button" onClick={() => applyFilter({ kind: "category", name: dept.name })} className="flex min-h-6 items-center text-left sf-text-secondary transition hover:sf-hover-text-accent">
                  {dept.name} <span className="sf-text-faint">({dept.count})</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] sf-text-secondary">Ayuda</p>
            <ul className="mt-3 space-y-1.5 text-xs sf-text-secondary">
              <li><button type="button" onClick={() => applyFilter({ kind: "all", name: null })} className="inline-flex min-h-6 items-center transition hover:sf-hover-text-accent">Ver todo el catálogo</button></li>
              {offers.length > 0 ? (
                <li><button type="button" onClick={() => applyFilter({ kind: "offers", name: null })} className="inline-flex min-h-6 items-center transition hover:sf-hover-text-promo">Productos en descuento</button></li>
              ) : null}
              {promo.active && promo.percent > 0 && promo.end ? <li>Campaña vigente hasta {promo.end}</li> : null}
              {hasWhatsApp ? <li>Pagos y apartados coordinados por WhatsApp</li> : null}
            </ul>
          </div>
        </div>
        <p className="border-t sf-border-line-a80 px-4 py-4 text-center text-[11px] sf-text-faint">
          {catalog.store_name} · Tienda publicada con APEXOS Comercio
        </p>
      </footer>

      {/* Barra fija de carrito (movil) / boton flotante (escritorio) */}
      {totalUnits > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t sf-border-line sf-bg-surface-a95 px-4 py-3 backdrop-blur md:hidden">
          <button type="button" onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-xl sf-btn-accent-solid px-4 py-3 text-sm font-bold">
            <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> {totalUnits} producto{totalUnits === 1 ? "" : "s"}</span>
            <span>{money(totalAmount, catalog.currency)}</span>
          </button>
        </div>
      ) : null}
      {totalUnits > 0 ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full sf-btn-accent px-5 py-3 text-sm font-bold transition hover:sf-btn-accent hover:sf-hover-btn-accent shadow-lg sf-shadow-accent md:flex"
        >
          <ShoppingBag className="h-4 w-4" /> Pedido ({totalUnits}) · {money(totalAmount, catalog.currency)}
        </button>
      ) : null}

      {/* Panel del carrito */}
      {cartOpen ? (
        <div ref={capaCarrito} className="apex-backdrop-enter fixed inset-0 z-50 flex items-end justify-end bg-black/70" onClick={() => setCartOpen(false)} role="dialog" aria-modal="true" aria-label="Pedido">
          <div
            className="apex-dialog-enter flex max-h-[88vh] w-full flex-col rounded-t-2xl border sf-border-line sf-bg-surface md:h-full md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b sf-border-line px-5 py-4">
              <p className="text-sm font-bold uppercase tracking-wide">Tu pedido</p>
              <button type="button" aria-label="Cerrar pedido" onClick={() => setCartOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg sf-text-secondary hover:sf-hover-bg-surface-2 hover:sf-hover-text-body">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {lines.length === 0 ? <p className="py-6 text-center text-sm sf-text-muted">Aún no agregas productos.</p> : null}
              {lines.map((line) => (
                <div key={line.item.code} className="flex items-start gap-3 border-b sf-border-line-a60 py-3 last:border-0">
                  <Thumb item={line.item} className="h-14 w-12 shrink-0 rounded-lg" size="text-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.item.name}</p>
                    <p className="mt-0.5 text-xs sf-text-muted">{line.item.code} · {money(line.item.price, catalog.currency)} c/u</p>
                    {hasDiscount(line.item) ? (
                      <p className="mt-0.5 text-[11px] sf-text-promo">
                        Antes {money(line.item.base_price, catalog.currency)} · ahorras {money((line.item.base_price - line.item.price) * line.quantity, catalog.currency)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Stepper quantity={line.quantity} onChange={(quantity) => setQuantity(line.item, quantity)} />
                    <button type="button" aria-label={`Quitar ${line.item.name}`} onClick={() => setQuantity(line.item, 0)} className="flex h-10 w-10 items-center justify-center rounded-lg sf-text-muted hover:sf-hover-bg-surface-2 hover:sf-hover-text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Datos del pedido: este formulario es la estructura del mensaje de WhatsApp. */}
              <div className="mt-4 space-y-4 rounded-xl border sf-border-line sf-bg-base-a60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide sf-text-secondary">Datos del pedido</p>
                    <span className={`text-[11px] font-bold ${missing.length === 0 ? "sf-text-accent" : "sf-text-muted"}`}>
                    {missing.length === 0 ? "Todo listo para enviar" : `Falta: ${missing.join(", ")}`}
                  </span>
                </div>
                <div
                  aria-valuemax={checks.length}
                  aria-valuemin={0}
                  aria-valuenow={checks.filter((check) => check.ok).length}
                  role="progressbar"
                  className="h-1.5 overflow-hidden rounded-full sf-bg-surface-2"
                >
                  <div
                    className="h-full rounded-full sf-grad-progress transition-[width] duration-500"
                    style={{ width: `${(checks.filter((check) => check.ok).length / checks.length) * 100}%` }}
                  />
                </div>

                <FormRow label="Nombre completo">
                  <input
                    aria-label="Nombre completo"
                    autoComplete="name"
                    className={fieldClass}
                    inputMode="text"
                    maxLength={80}
                    onChange={(event) => setField("name", event.target.value)}
                    placeholder="Cómo te llama el comercio"
                    value={buyer.name}
                  />
                </FormRow>

                <FormRow hint={buyer.phone && whatsappDigits(buyer.phone).length < 7 ? "Faltan dígitos" : "Para confirmarte disponibilidad"} label="Tu WhatsApp">
                  <input
                    aria-label="WhatsApp de contacto"
                    autoComplete="tel"
                    className={fieldClass}
                    inputMode="tel"
                    maxLength={20}
                    onChange={(event) => setField("phone", event.target.value)}
                    placeholder="+57 300 111 2233"
                    value={buyer.phone}
                  />
                </FormRow>

                <FormRow label="¿Cómo vas a pagar?">
                  <ChoiceChips
                    options={PAYMENT_OPTIONS.map((option) => ({ id: option.id, icon: option.icon }))}
                    value={buyer.payment}
                    onChange={(id) => setField("payment", id)}
                  />
                </FormRow>

                <FormRow label="¿Requiere financiación?">
                  <ChoiceChips
                    options={[
                      { id: "no", label: "No, pago completo", icon: Check },
                      { id: "cuotas", label: "Si, por cuotas", icon: Percent }
                    ]}
                    value={buyer.financing}
                    onChange={(id) => setField("financing", id === "cuotas" ? "cuotas" : "no")}
                  />
                </FormRow>

                {buyer.financing === "cuotas" ? (
                  <FormRow hint={Number(buyer.installments) > 0 ? `aprox. ${money(totalAmount / Number(buyer.installments), catalog.currency)} c/u` : undefined} label="Número de cuotas">
                    <ChoiceChips options={INSTALLMENT_OPTIONS.map((count) => ({ id: count, label: `${count} cuotas` }))} value={buyer.installments} onChange={(id) => setField("installments", id)} />
                  </FormRow>
                ) : null}

                <FormRow label="¿Retiras o te lo enviamos?">
                  <ChoiceChips
                    options={[
                      { id: "tienda", label: "Retiro en la tienda", icon: Store },
                      { id: "envio", label: "Envío a domicilio", icon: Truck }
                    ]}
                    value={buyer.delivery}
                    onChange={(id) => setField("delivery", id === "envio" ? "envio" : "tienda")}
                  />
                </FormRow>

                {buyer.delivery === "envio" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormRow label="Ciudad">
                      <input
                        aria-label="Ciudad de entrega"
                        autoComplete="address-level2"
                        className={fieldClass}
                        maxLength={60}
                        onChange={(event) => setField("city", event.target.value)}
                        placeholder="Medellin"
                        value={buyer.city}
                      />
                    </FormRow>
                    <FormRow label="Dirección">
                      <input
                        aria-label="Dirección de entrega"
                        autoComplete="street-address"
                        className={fieldClass}
                        maxLength={90}
                        onChange={(event) => setField("address", event.target.value)}
                        placeholder="Cra 70 #42-11"
                        value={buyer.address}
                      />
                    </FormRow>
                  </div>
                ) : null}

                <FormRow label="Facturación">
                  <ChoiceChips
                    options={[
                      { id: "no", label: "No necesito factura", icon: Check },
                      { id: "si", label: "Requiero factura", icon: Tags }
                    ]}
                    value={buyer.invoice ? "si" : "no"}
                    onChange={(id) => setField("invoice", id === "si")}
                  />
                </FormRow>

                {buyer.invoice ? (
                  <FormRow hint="CC, CE o NIT con el que sale la factura">
                    <input
                      aria-label="Documento para facturar"
                      className={fieldClass}
                      inputMode="text"
                      maxLength={25}
                      onChange={(event) => setField("document", event.target.value)}
                      placeholder="Documento 1020304050"
                      value={buyer.document}
                    />
                  </FormRow>
                ) : null}

                <FormRow hint={`${buyer.note.length}/160`} label="Notas para el comercio (opcional)">
                  <textarea
                    aria-label="Notas para el comercio"
                    className={`${fieldClass} resize-none`}
                    maxLength={160}
                    onChange={(event) => setField("note", event.target.value)}
                    placeholder="Horario para entregar, marca que prefieres, color..."
                    rows={2}
                    value={buyer.note}
                  />
                </FormRow>
              </div>
            </div>
            <div className="space-y-2 border-t sf-border-line px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="sf-text-secondary">Total estimado</span>
                <span className="text-lg font-bold">{money(totalAmount, catalog.currency)}</span>
              </div>
              {totalSaved > 0.5 ? (
                <div className="flex items-center justify-between text-xs font-bold sf-text-promo">
                  <span>Ahorro por descuentos</span>
                  <span>-{money(totalSaved, catalog.currency)}</span>
                </div>
              ) : null}
              {lines.length > 0 ? (
                <p className="text-[11px] font-semibold sf-text-secondary">{describeOrder(buyer)}</p>
              ) : null}
              {hasWhatsApp ? (
                <a
                  href={buildOrderUrl(catalog, lines, buyer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl sf-btn-accent px-4 py-3 text-sm font-bold sf-text-on-accent transition hover:sf-btn-accent hover:sf-hover-btn-accent ${lines.length === 0 ? "pointer-events-none opacity-40" : ""}`}
                >
                  <MessageCircle className="h-4 w-4" /> Enviar pedido por WhatsApp
                </a>
              ) : (
                <p className="mt-2 rounded-xl border sf-border-line-2 sf-bg-surface-2-a60 px-4 py-3 text-center text-xs sf-text-secondary">
                  Esta tienda aún no publicó un número de WhatsApp para pedidos.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Vista rapida del producto */}
      {quick ? (
        <QuickView
          item={quick}
          catalog={catalog}
          buyer={buyer}
          hasWhatsApp={hasWhatsApp}
          quantity={cart[quick.code] || 0}
          onQuantity={(quantity) => setQuantity(quick, quantity)}
          onClose={() => setQuick(null)}
        />
      ) : null}
    </div>
  );
}

// Fila del formulario del carrito: etiqueta arriba, ayuda abajo, control en el medio.
function FormRow({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label ? <p className="text-[11px] font-bold uppercase tracking-wide sf-text-secondary">{label}</p> : null}
      {children}
      {hint ? <p className="text-[11px] sf-text-muted">{hint}</p> : null}
    </div>
  );
}

type ChipOption = { id: string; label?: string; icon?: typeof Banknote };

// Opciones de un toque: se tilda la eleccion y el mensaje de WhatsApp se reescribe solo.
function ChoiceChips({ options, value, onChange }: { options: ChipOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition active:scale-95 ${selected ? "sf-border-accent sf-chip-accent" : "sf-border-line-2 sf-bg-surface sf-text-body hover:sf-hover-border-line-3"}`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {option.label || option.id}
          </button>
        );
      })}
    </div>
  );
}

function DepartChip({ label, count, active, accent, onClick }: { label: string; count?: number; active: boolean; accent?: boolean; onClick: () => void }) {
  const on = accent ? "sf-border-promo sf-btn-promo" : "sf-border-accent sf-chip-accent";
  const off = accent
    ? "sf-border-line-2 sf-bg-surface sf-text-body hover:sf-hover-text-promo-soft hover:sf-hover-border-promo"
    : "sf-border-line-2 sf-bg-surface sf-text-body hover:sf-hover-border-line-3";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition sm:min-h-0 sm:px-3.5 sm:py-1.5 ${active ? on : off}`}
    >
      {label}
      {typeof count === "number" ? <span className={`ml-1.5 font-semibold ${active ? "opacity-80" : "sf-text-muted"}`}>{count}</span> : null}
    </button>
  );
}

function SectionTitle({ kicker, title, detail }: { kicker: string; title: string; detail?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] sf-text-accent">{kicker}</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      {detail ? <p className="mt-1.5 text-xs sf-text-secondary">{detail}</p> : null}
    </div>
  );
}

// Miniatura: foto si el comercio la publico; si no, inicial sobre degradado, para que la
// vitrina se sostenga antes de que el bucket de imagenes este publico.
function Thumb({ item, className = "", size = "text-2xl" }: { item: PublicCatalogItem; className?: string; size?: string }) {
  if (item.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.photo_url} alt={item.name} loading="lazy" className={`object-cover ${className}`} />
    );
  }
  return (
    <div className={`flex items-center justify-center sf-grad-thumb ${className}`}>
      <span className={`${size} font-black sf-text-ghost`}>{item.name.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

function Hero({ catalog, promo, featured, offersCount, hasWhatsApp, onQuickView, onSeeOffers }: {
  catalog: PublicCatalog;
  promo: PublicCatalogPromo;
  featured: PublicCatalogItem[];
  offersCount: number;
  hasWhatsApp: boolean;
  onQuickView: (item: PublicCatalogItem) => void;
  onSeeOffers: () => void;
}) {
  // El cartel es el destacado con foto; sin fotos usa el primero para no dejar hueco.
  const spotlight = featured.find((item) => item.photo_url) || featured[0] || null;
  const supporting = featured.filter((item) => item !== spotlight).slice(0, 2);
  const campaign = promo.active && promo.percent > 0;
  // Con cartel subido, el texto vive sobre la foto: la tinta del tema se cambia por la
  // tinta de fotografia (clara). Sin cartel, manda el tema elegido por el comercio.
  const photoClass = catalog.theme.banner_url ? "sf-on-photo" : "";

  return (
    <section className="relative overflow-hidden border-b sf-border-line sf-grad-hero">
      {/* El cartel subido o generado por el comercio cubre el hero; el scrim sostiene la
          legibilidad del titular sobre la imagen. */}
      {catalog.theme.banner_url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={catalog.theme.banner_url} alt="" aria-hidden="true" className="sf-banner-img" />
          <div className="sf-banner-scrim absolute inset-0" />
        </>
      ) : null}
      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:items-center md:px-6 md:py-16">
        <div>
          <p className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] sf-text-accent ${photoClass}`}>
            <Store className="h-4 w-4" /> {catalog.store_name}
          </p>
          <h1 className={`mt-3 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl ${photoClass}`}>
            {campaign ? (promo.label || "Ofertas de temporada") : (catalog.theme.headline || catalog.tagline || "Todo el catálogo, al momento")}
          </h1>
          <p className={`mt-4 max-w-lg text-sm sf-text-body md:text-base ${photoClass}`}>
            {campaign
              ? `${discountLabel(promo.percent)} aplicado en toda la tienda${promo.end ? ` hasta el ${promo.end}` : ""}. Arma el pedido y confírmalo por WhatsApp.`
              : (catalog.theme.subhead || "Escoge por rubro, arma el pedido y envíalo por WhatsApp. Los precios con descuento ya llegan con la rebaja aplicada.")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {offersCount > 0 ? (
              <button type="button" onClick={onSeeOffers} className="inline-flex items-center gap-2 rounded-xl sf-btn-promo px-5 py-3 text-sm font-bold transition hover:sf-btn-promo">
                <Tags className="h-4 w-4" /> Ver {offersCount} ofertas <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
            {hasWhatsApp ? (
              <a
                href={waHref(whatsappDigits(catalog.whatsapp), `¡Hola, ${catalog.store_name}! Quiero información sobre productos disponibles.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border sf-border-line-2 sf-bg-surface-a70 px-5 py-3 text-sm font-bold sf-text-strong transition hover:sf-hover-border-accent hover:sf-hover-text-accent-soft"
              >
                <MessageCircle className="h-4 w-4" /> Escríbenos
              </a>
            ) : null}
          </div>
          <dl className={`mt-8 flex flex-wrap gap-x-8 gap-y-3 text-[11px] uppercase tracking-wide sf-text-muted ${photoClass}`}>
            <div>
              <dt className="sr-only">Productos publicados</dt>
              <dd className="text-2xl font-black tracking-normal sf-text-strong">{catalog.items.length}</dd>
              productos
            </div>
            <div>
              <dt className="sr-only">Categorías</dt>
              <dd className="text-2xl font-black tracking-normal sf-text-strong">{catalog.categories.length}</dd>
              categorías
            </div>
            {offersCount > 0 ? (
              <div>
                <dt className="sr-only">Productos con descuento</dt>
                <dd className="text-2xl font-black tracking-normal sf-text-promo">{offersCount}</dd>
                en oferta
              </div>
            ) : null}
          </dl>
        </div>

        {spotlight ? (
          <div className="space-y-3">
            <FeatureSpotlight item={spotlight} catalog={catalog} onQuickView={onQuickView} />
            {supporting.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {supporting.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => onQuickView(item)}
                    className="flex items-center gap-3 rounded-2xl border sf-border-line sf-bg-surface-a70 p-3 text-left transition hover:sf-hover-border-accent"
                  >
                    <Thumb item={item} className="h-14 w-14 shrink-0 rounded-xl" size="text-lg" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs font-bold sf-text-accent">{money(item.price, catalog.currency)}</p>
                      {hasDiscount(item) ? <p className="text-[11px] sf-text-muted line-through">{money(item.base_price, catalog.currency)}</p> : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FeatureSpotlight({ item, catalog, onQuickView }: { item: PublicCatalogItem; catalog: PublicCatalog; onQuickView: (item: PublicCatalogItem) => void }) {
  const discounted = hasDiscount(item);
  return (
    <button
      type="button"
      onClick={() => onQuickView(item)}
      className="group relative block w-full overflow-hidden rounded-3xl border sf-border-line sf-bg-surface text-left"
    >
      <div className="aspect-[4/3] w-full md:aspect-[16/10]">
        <Thumb item={item} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" size="text-7xl" />
      </div>
      <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${discounted ? "sf-btn-promo" : "sf-bg-base-a80 sf-text-accent"}`}>
        {discounted ? `${discountLabel(item.discount_percent)} off` : "Destacado"}
      </span>
      <div className="absolute inset-x-0 bottom-0 sf-grad-below p-4 pt-14">
        {item.category ? <p className="text-[10px] font-bold uppercase tracking-[0.2em] sf-text-accent">{item.category}</p> : null}
        <p className="mt-1 text-lg font-bold leading-tight md:text-xl">{item.name}</p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-black">{money(item.price, catalog.currency)}</span>
          <span className="text-xs sf-text-secondary">/{item.unit}</span>
          {discounted ? <span className="text-xs sf-text-muted line-through">{money(item.base_price, catalog.currency)}</span> : null}
        </p>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide sf-text-body underline sf-underline-accent underline-offset-4">Ver detalle</p>
      </div>
    </button>
  );
}

// Riel con scroll-snap horizontal; las flechas solo desplazan el contenedor.
function Rail({ title, subtitle, icon, items, catalog, accent, hasWhatsApp, quantityOf, onQuantity, onQuickView, onBrowseAll }: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  items: PublicCatalogItem[];
  catalog: PublicCatalog;
  accent?: boolean;
  hasWhatsApp: boolean;
  quantityOf: (item: PublicCatalogItem) => number;
  onQuantity: (item: PublicCatalogItem, quantity: number) => void;
  onQuickView: (item: PublicCatalogItem) => void;
  onBrowseAll: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  function slide(direction: -1 | 1) {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: "smooth" });
  }
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${accent ? "sf-text-promo" : "sf-text-accent"}`}>
            {icon} {title}
          </p>
          {subtitle ? <p className="mt-1 text-xs sf-text-secondary">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBrowseAll} className="hidden text-[11px] font-bold uppercase tracking-wide sf-text-secondary hover:sf-hover-text-accent sm:block">Ver todos</button>
          <button type="button" aria-label={`Desplazar ${title} hacia la izquierda`} onClick={() => slide(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border sf-border-line-2 sf-bg-surface sf-text-body transition hover:sf-hover-border-accent hover:sf-hover-text-strong">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label={`Desplazar ${title} hacia la derecha`} onClick={() => slide(1)} className="flex h-10 w-10 items-center justify-center rounded-full border sf-border-line-2 sf-bg-surface sf-text-body transition hover:sf-hover-border-accent hover:sf-hover-text-strong">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={track} className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div key={item.code} className="w-[46%] shrink-0 snap-start sm:w-[220px]">
            <ProductCard
              item={item}
              catalog={catalog}
              accent={accent}
              hasWhatsApp={hasWhatsApp}
              quantity={quantityOf(item)}
              onQuantity={(quantity) => onQuantity(item, quantity)}
              onQuickView={() => onQuickView(item)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function DepartmentCard({ dept, currency, onOpen }: { dept: Department; currency: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border sf-border-line sf-bg-surface p-4 text-left transition hover:sf-hover-border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold uppercase tracking-wide">{dept.name}</p>
          <p className="mt-1 text-[11px] sf-text-secondary">
            {dept.count} producto{dept.count === 1 ? "" : "s"} · {dept.available} disponible{dept.available === 1 ? "" : "s"}
          </p>
          <p className="mt-2 text-xs font-bold sf-text-accent">Desde {money(dept.from, currency)}</p>
        </div>
        {dept.bestDiscount > 0 ? (
          <span className="shrink-0 rounded-full sf-btn-promo-a90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
            hasta {discountLabel(dept.bestDiscount)}
          </span>
        ) : null}
      </div>
      {/* La miniatura es decorativa: el mosaico se sostiene igual sin foto. */}
      {dept.cover ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border sf-border-line sf-bg-base-a60 p-2">
          <Thumb item={dept.cover} className="h-9 w-9 shrink-0 rounded-lg" size="text-base" />
          <p className="min-w-0 truncate text-[11px] sf-text-secondary transition sf-group-hover-text-body">{dept.cover.name}</p>
        </div>
      ) : null}
    </button>
  );
}

function ProductCard({ item, catalog, hasWhatsApp, accent, quantity, onQuantity, onQuickView }: {
  item: PublicCatalogItem;
  catalog: PublicCatalog;
  hasWhatsApp?: boolean;
  accent?: boolean;
  quantity: number;
  onQuantity: (quantity: number) => void;
  onQuickView: () => void;
}) {
  const discounted = hasDiscount(item);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border sf-border-line sf-bg-surface transition hover:sf-hover-border-line-3 hover:shadow-lg hover:shadow-black/40">
      <div className="relative aspect-[4/5] w-full overflow-hidden sf-grad-thumb">
        <button type="button" onClick={onQuickView} className="block h-full w-full" aria-label={`Ver detalle de ${item.name}`}>
          <Thumb item={item} className="h-full w-full transition duration-500 hover:scale-[1.04]" />
        </button>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {discounted ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${accent ? "sf-btn-promo" : "sf-btn-promo-a90"}`}>
              {discountLabel(item.discount_percent)} off
            </span>
          ) : null}
          {item.featured ? (
            <span className="rounded-full sf-bg-base-a85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide sf-text-accent">Destacado</span>
          ) : null}
        </div>
        <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.available ? "sf-btn-accent-solid" : "sf-bg-surface-3-a90 sf-text-body"}`}>
          {item.available ? "Disponible" : "Agotado"}
        </span>
        <button
          type="button"
          onClick={onQuickView}
          aria-label={`Vista rápida de ${item.name}`}
          className="absolute bottom-2 right-2 rounded-full border sf-border-line-2 sf-bg-base-a85 p-2 sf-text-body transition hover:sf-hover-border-accent hover:sf-hover-text-accent-soft"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {item.category ? <p className="truncate text-[10px] font-bold uppercase tracking-wide sf-text-accent">{item.category}</p> : null}
        <button type="button" onClick={onQuickView} className="min-h-6 text-left text-sm font-medium leading-snug transition hover:sf-hover-text-accent-soft">
          {item.name}
        </button>
        <p className="text-[11px] sf-text-muted">Ref. {item.code}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="text-sm font-black leading-tight">
              {money(item.price, catalog.currency)} <span className="text-[10px] font-normal sf-text-muted">/{item.unit}</span>
            </p>
            {discounted ? (
              <p className="text-[11px] leading-tight sf-text-muted">
                <span className="line-through">{money(item.base_price, catalog.currency)}</span>
                <span className="ml-1 font-bold sf-text-promo">-{money(item.base_price - item.price, catalog.currency)}</span>
              </p>
            ) : null}
          </div>
          {item.available ? (
            quantity > 0 ? (
              <Stepper quantity={quantity} onChange={onQuantity} />
            ) : (
              <button type="button" onClick={() => onQuantity(1)} className="shrink-0 rounded-lg sf-btn-accent p-2 transition hover:sf-btn-accent hover:sf-hover-btn-accent" aria-label={`Agregar ${item.name}`}>
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
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border sf-border-line-2 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide sf-text-body transition hover:sf-hover-border-accent hover:sf-hover-text-accent-soft"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Consultar
          </a>
        ) : null}
      </div>
    </article>
  );
}

function QuickView({ item, catalog, buyer, hasWhatsApp, quantity, onQuantity, onClose }: {
  item: PublicCatalogItem;
  catalog: PublicCatalog;
  buyer: Buyer;
  hasWhatsApp: boolean;
  quantity: number;
  onQuantity: (quantity: number) => void;
  onClose: () => void;
}) {
  const discounted = hasDiscount(item);
  const capa = useOverlayA11y<HTMLDivElement>(true, onClose);
  return (
    <div
      ref={capa}
      className="apex-backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${item.name}`}
    >
      <div
        className="apex-dialog-enter flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border sf-border-line sf-bg-surface sm:rounded-3xl md:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden sf-grad-thumb md:aspect-auto md:w-1/2">
          <Thumb item={item} className="h-full w-full" size="text-8xl" />
          {discounted ? (
            <span className="absolute left-3 top-3 rounded-full sf-btn-promo px-3 py-1 text-xs font-black uppercase tracking-wide">
              {discountLabel(item.discount_percent)} off
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {item.category ? <p className="text-[10px] font-bold uppercase tracking-[0.2em] sf-text-accent">{item.category}</p> : null}
              <h3 className="mt-1 text-xl font-bold leading-tight tracking-tight">{item.name}</h3>
              <p className="mt-1 text-[11px] sf-text-muted">Ref. {item.code} · venta por {item.unit}</p>
            </div>
            <button type="button" aria-label="Cerrar detalle" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg sf-text-secondary hover:sf-hover-bg-surface-2 hover:sf-hover-text-body">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-black">{money(item.price, catalog.currency)}</span>
            <span className="text-xs sf-text-secondary">/ {item.unit}</span>
            {discounted ? (
              <>
                <span className="text-sm sf-text-muted line-through">{money(item.base_price, catalog.currency)}</span>
                <span className="rounded-full sf-bg-promo-a15 px-2 py-0.5 text-[11px] font-bold sf-text-promo">
                  ahorras {money(item.base_price - item.price, catalog.currency)}
                </span>
              </>
            ) : null}
          </div>

          <p className={`mt-3 inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${item.available ? "sf-bg-accent-a15 sf-text-accent" : "sf-bg-surface-2 sf-text-secondary"}`}>
            {item.available ? "Disponible para pedido inmediato" : "Agotado · consulta la próxima entrada"}
          </p>

          <p className="mt-4 text-sm leading-relaxed sf-text-body">
            {item.description || "Este producto no tiene descripción publicada. Pide el detalle por WhatsApp y el comercio te confirma presentación, peso o modelo."}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t sf-border-line pt-4">
            {item.available ? (
              quantity > 0 ? (
                <>
                  <Stepper quantity={quantity} onChange={onQuantity} large />
                  <span className="text-xs sf-text-secondary">Subtotal {money(item.price * quantity, catalog.currency)}</span>
                </>
              ) : (
                <button type="button" onClick={() => onQuantity(1)} className="inline-flex items-center gap-2 rounded-xl sf-btn-accent px-5 py-3 text-sm font-bold sf-text-on-accent transition hover:sf-btn-accent hover:sf-hover-btn-accent">
                  <Plus className="h-4 w-4" /> Agregar al pedido
                </button>
              )
            ) : null}
            {hasWhatsApp ? (
              <a
                href={buildInterestUrl(catalog, item, buyer)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border sf-border-line-2 px-4 py-3 text-sm font-bold sf-text-strong transition hover:sf-hover-border-accent hover:sf-hover-text-accent-soft"
              >
                <MessageCircle className="h-4 w-4" /> Consultar o apartar
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ quantity, onChange, large }: { quantity: number; onChange: (quantity: number) => void; large?: boolean }) {
  const icon = large ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <div className={`flex items-center rounded-xl border sf-border-line-2 sf-bg-surface-2 ${large ? "px-1.5 py-1" : "px-1 py-0.5"}`}>
      <button type="button" aria-label="Restar" onClick={() => onChange(quantity - 1)} className={`flex items-center justify-center ${large ? "h-11 w-11" : "h-9 w-9"} sf-text-body hover:sf-hover-text-strong`}><Minus className={icon} /></button>
      <span className={`${large ? "w-9" : "w-6"} text-center text-sm font-bold tabular-nums`}>{quantity}</span>
      <button type="button" aria-label="Sumar" onClick={() => onChange(quantity + 1)} className={`flex items-center justify-center ${large ? "h-11 w-11" : "h-9 w-9"} sf-text-body hover:sf-hover-text-strong`}><Plus className={icon} /></button>
    </div>
  );
}
