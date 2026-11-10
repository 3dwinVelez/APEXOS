export const LOBBY_BANNER = "/assets/lobby/banner-truck.webp";

const LOBBY_MODULE_IMAGES: Record<string, string> = {
  reportes: "/assets/lobby/module-reportes.webp",
  inventario: "/assets/lobby/module-inventario.webp",
  compras: "/assets/lobby/module-compras.webp",
  ventas: "/assets/lobby/module-ventas.webp",
  facturacion: "/assets/lobby/module-facturacion.webp",
  "punto-de-venta": "/assets/lobby/module-punto-de-venta.webp",
  cxc: "/assets/lobby/module-cxc.webp",
  contabilidad: "/assets/lobby/module-contabilidad.webp",
  tesoreria: "/assets/lobby/module-tesoreria.webp",
  costos: "/assets/lobby/module-costos.webp",
  presupuestos: "/assets/lobby/module-presupuestos.webp",
  produccion: "/assets/lobby/module-produccion.webp",
  recetas: "/assets/lobby/module-recetas.webp",
  calidad: "/assets/lobby/module-calidad.webp",
  transporte: "/assets/lobby/module-transporte.webp",
  devoluciones: "/assets/lobby/module-devoluciones.webp",
  "comercio-exterior": "/assets/lobby/module-comercio-exterior.webp",
  "talento-humano": "/assets/lobby/module-talento-humano.webp",
  activos: "/assets/lobby/module-activos.webp",
  proyectos: "/assets/lobby/module-proyectos.webp",
  crm: "/assets/lobby/module-crm.webp",
  "planeacion-demanda": "/assets/lobby/module-planeacion-demanda.webp",
  administracion: "/assets/lobby/module-administracion.webp",
  "facturacion-electronica": "/assets/lobby/module-facturacion-electronica.webp",
  servicios: "/assets/lobby/module-servicios.webp",
  "apex-ai": "/assets/lobby/module-apex-ai.webp",
  "configuracion-inicial": "/assets/lobby/module-configuracion-inicial.webp",
  suscripciones: "/assets/lobby/module-suscripciones.webp",
  "gestion-comercial": "/assets/lobby/module-gestion-comercial.webp",
  "gastos-menores": "/assets/lobby/module-gastos-menores.webp",
  comercio: "/assets/lobby/module-comercio.webp",
  "apex-control": "/assets/lobby/module-apex-control.webp"
};

export function lobbyModuleImage(slug: string): string | null {
  return LOBBY_MODULE_IMAGES[slug] ?? null;
}
