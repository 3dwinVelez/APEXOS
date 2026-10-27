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
  price: number;
  available: boolean;
  photo_url: string | null;
};

export type PublicCatalog = {
  store_name: string;
  currency: string;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  categories: string[];
  items: PublicCatalogItem[];
};

async function fetchCatalog(code: string): Promise<{ status: "ok" | "closed" | "unavailable"; data?: PublicCatalog }> {
  const origin = String(process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "").replace(/\/+$/, "");
  if (!origin) return { status: "unavailable" };
  try {
    const response = await fetch(`${origin}/api/v1/public/comercio/catalog/${encodeURIComponent(code)}`, { cache: "no-store" });
    if (response.status === 404) return { status: "closed" };
    if (!response.ok) return { status: "unavailable" };
    return { status: "ok", data: await response.json() as PublicCatalog };
  } catch {
    return { status: "unavailable" };
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
