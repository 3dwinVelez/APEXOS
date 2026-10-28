// Vitrina publica Comercio: /tienda/<codigo-corto>.
// Server component: resuelve el catalogo en el servidor contra el endpoint publico del
// API (sin auth). El carrito y WhatsApp viven en <Storefront/> (client).
import Storefront from "@/components/comercio/storefront";

export const dynamic = "force-dynamic";

export type PublicCatalogItem = {
  code: string;
  name: string;
  category: string | null;
  unit: string;
  // price llega con el descuento ya aplicado; base_price es el precio de lista (se tacha).
  price: number;
  base_price: number;
  discount_percent: number;
  description: string | null;
  featured: boolean;
  available: boolean;
  photo_url: string | null;
};

// Campana de vitrina configurada por el comercio (descuento global vigente).
export type PublicCatalogPromo = {
  label: string | null;
  percent: number;
  start: string | null;
  end: string | null;
  active: boolean;
};

export type PublicCatalog = {
  store_name: string;
  tagline: string | null;
  currency: string;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  promo: PublicCatalogPromo;
  categories: string[];
  items: PublicCatalogItem[];
};

// La vitrina se sirve a clientes: un reinicio breve del API no debe convertirla en una
// pantalla de error. Se guarda el ultimo catalogo bueno y solo se usa cuando la consulta
// falla; pasada la ventana de gracia se prefiere el aviso honesto.
const FALLBACK_TTL_MS = 10 * 60 * 1000;
const catalogFallback = new Map<string, { at: number; data: PublicCatalog }>();

async function fetchCatalog(code: string): Promise<{ status: "ok" | "closed" | "unavailable"; data?: PublicCatalog }> {
  const origin = String(process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "").replace(/\/+$/, "");
  if (!origin) return { status: "unavailable" };
  const cached = catalogFallback.get(code);
  const fallback = cached && Date.now() - cached.at < FALLBACK_TTL_MS ? cached.data : null;
  try {
    const response = await fetch(`${origin}/api/v1/public/comercio/catalog/${encodeURIComponent(code)}`, { cache: "no-store" });
    if (response.status === 404) {
      catalogFallback.delete(code);
      return { status: "closed" };
    }
    if (!response.ok) return fallback ? { status: "ok", data: fallback } : { status: "unavailable" };
    const data = await response.json() as PublicCatalog;
    catalogFallback.set(code, { at: Date.now(), data });
    return { status: "ok", data };
  } catch {
    return fallback ? { status: "ok", data: fallback } : { status: "unavailable" };
  }
}

function ShellMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6">
      <div className="max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center shadow-xl">
        <p className="text-lg font-semibold text-neutral-100">{title}</p>
        <p className="mt-2 text-sm text-neutral-400">{detail}</p>
      </div>
    </main>
  );
}

export default async function TiendaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = String(code || "").toLowerCase();
  if (!/^[a-z0-9]{4,32}$/.test(clean)) {
    return <ShellMessage title="Link no valido" detail="El direccion de la tienda esta incompleta. Pide el link otra vez al comercio." />;
  }
  const result = await fetchCatalog(clean);
  if (result.status === "closed") {
    return <ShellMessage title="Tienda no disponible" detail="Esta tienda desactivó o cambió su link público. Pide el link actualizado al comercio." />;
  }
  if (result.status === "unavailable" || !result.data) {
    return <ShellMessage title="No fue posible cargar la tienda" detail="Intenta de nuevo en unos minutos." />;
  }
  return <Storefront catalog={result.data} />;
}
