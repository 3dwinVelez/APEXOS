export const LOBBY_BANNER = "/assets/lobby/banner-truck.webp";

const LOBBY_MODULE_IMAGES: Record<string, string> = {
  inventario: "/assets/lobby/module-inventario.webp",
  compras: "/assets/lobby/module-compras.webp",
  ventas: "/assets/lobby/module-ventas.webp",
  "gestion-comercial": "/assets/lobby/module-ventas.webp",
  crm: "/assets/lobby/module-ventas.webp",
  facturacion: "/assets/lobby/module-facturacion.webp",
  "facturacion-electronica": "/assets/lobby/module-facturacion.webp",
  "talento-humano": "/assets/lobby/module-talento-humano.webp",
  transporte: "/assets/lobby/module-transporte.webp",
  servicios: "/assets/lobby/module-servicios.webp",
  comercio: "/assets/lobby/module-comercio.webp",
  "punto-de-venta": "/assets/lobby/module-comercio.webp",
  reportes: "/assets/lobby/module-heart.webp",
  "apex-ai": "/assets/lobby/module-heart.webp",
  "apex-control": "/assets/lobby/module-heart.webp",
  cxc: "/assets/lobby/module-finanzas.webp",
  contabilidad: "/assets/lobby/module-finanzas.webp",
  tesoreria: "/assets/lobby/module-finanzas.webp",
  costos: "/assets/lobby/module-finanzas.webp",
  presupuestos: "/assets/lobby/module-finanzas.webp",
  "gastos-menores": "/assets/lobby/module-finanzas.webp"
};

export function lobbyModuleImage(slug: string): string | null {
  return LOBBY_MODULE_IMAGES[slug] ?? null;
}
