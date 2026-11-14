/**
 * Ruta, parámetros y selección de la ventana ampliada del PYG por vehículo.
 * Fuente única de verdad: la consumen la página normal (enlace), la ventana ampliada y sus pruebas.
 * Sin dependencias de React ni de Next para poder probarse de forma aislada.
 */
export const PYG_BASE_PATH = "/dashboard/contabilidad/pyg";
export const PYG_EXPANDED_PATH = "/dashboard/contabilidad/pyg/ampliado";
export const PYG_PERIOD_PARAM = "periodo";
export const PYG_PLATE_PARAM = "placa";

// Código de selección del bloque de centros de costo sin placa. No es una URL ni una placa:
// se escribe literalmente en el enlace y sobrevive a recargas (F5).
export const PYG_UNASSIGNED_CODE = "SIN_VEHICULO";

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
// Espejo del normalizePlate del backend (apps/api/src/modules/transport/service.js):
// trim, quitar espacios internos y mayúsculas. Los guiones, puntos y guiones bajos son
// parte del identificador de la placa y se conservan (DEMO_1 es una placa real); no se
// impone una longitud máxima. El sentinel SIN_VEHICULO se reconoce antes de normalizar
// en parsePyVehicleSelection, así que una placa real no se confunde con él.
const PLATE_ALLOWED_CHARS = /^[A-Z0-9._-]+$/;

export function isPygPeriod(value: unknown): value is string {
  return typeof value === "string" && PERIOD_PATTERN.test(value);
}

/**
 * Normaliza una placa de query string igual que el backend: sin espacios, en
 * mayúsculas, conservando guiones, puntos y guiones bajos. Devuelve "" para valores
 * ausentes, vacíos o con caracteres de ruta/URL/inyección.
 */
export function normalizePyPlate(value: unknown): string {
  if (typeof value !== "string") return "";
  const plate = value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  return PLATE_ALLOWED_CHARS.test(plate) ? plate : "";
}

/**
 * Interpreta el parámetro de selección del enlace: el sentinel SIN_VEHICULO o una placa real.
 * Solo el código literal SIN_VEHICULO (case insensitive) es el sentinel; una placa real como
 * SIN-VEHICULO o ABC-123 conserva su identificador exacto. Cualquier otro valor (URLs
 * externas, esquemas, texto libre) se descarta como vacío.
 */
export function parsePyVehicleSelection(value: unknown): string {
  if (typeof value !== "string") return "";
  if (value.trim().toUpperCase() === PYG_UNASSIGNED_CODE) return PYG_UNASSIGNED_CODE;
  return normalizePyPlate(value);
}

export type PygExpandedQuery = { plate: string; period: string };

/**
 * Construye la URL interna de la ventana ampliada. Siempre parte de la ruta fija del módulo,
 * de modo que un valor externo nunca puede convertir el enlace en una URL a otro origen.
 */
export function pygExpandedHref(query: PygExpandedQuery): string {
  const period = isPygPeriod(query.period) ? query.period : "";
  const selection = parsePyVehicleSelection(query.plate);
  const search = new URLSearchParams();
  if (selection) search.set(PYG_PLATE_PARAM, selection);
  if (period) search.set(PYG_PERIOD_PARAM, period);
  const queryString = search.toString();
  return queryString ? `${PYG_EXPANDED_PATH}?${queryString}` : PYG_EXPANDED_PATH;
}

/** Destino de «Volver al PYG»: siempre la página normal, nunca la vista ampliada. */
export function pygBackHref(): string {
  return PYG_BASE_PATH;
}
