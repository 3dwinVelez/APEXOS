// Contrato de la app movil de APEXOS (repo aparte `AppApexos`, PWA servida en Railway).
// Vive aqui y no en la pantalla para que la prueba de fuente y la certificacion de navegador
// comparen el mismo texto: el copy de los pasos y la URL son contrato, no decoracion del JSX.

export const MOBILE_APP_FALLBACK_URL = "https://appapexos-production.up.railway.app";

export type DeviceSignal = { userAgent: string; maxTouchPoints: number; platform: string };

// El respaldo esta quemado a proposito: si la lectura publica falla, tarda o devuelve un valor
// torcido, el acceso sigue ofreciendo el destino conocido en vez de un boton roto.
// El unico http admitido es localhost: coincide con la regla del API (plataforma-config-service) para
// que lo que un administrador puede guardar sea exactamente lo que el acceso puede usar.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function normalizeMobileAppUrl(candidate: unknown, fallback: string = MOBILE_APP_FALLBACK_URL): string {
  const value = String(candidate ?? "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(value);
    const loopback = LOOPBACK_HOSTS.has(parsed.hostname);
    if (parsed.hostname && (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback))) return value;
  } catch {
    // Configuracion torcida: mejor el destino conocido que un enlace vacio en el lobby.
  }
  const safeFallback = String(fallback || "").trim().replace(/\/+$/, "");
  return safeFallback || MOBILE_APP_FALLBACK_URL;
}

export function mobileAppUrl(env: string | undefined = process.env.NEXT_PUBLIC_MOBILE_APP_URL): string {
  return normalizeMobileAppUrl(env || MOBILE_APP_FALLBACK_URL);
}

// El enlace se administra por ambiente desde Administracion APEX (platform_settings). La lectura es
// publica porque el acceso es previo a la sesion, y el valor viaja por el proxy del portal, que ya
// decide a que API pertenece cada host.
export const MOBILE_APP_PUBLIC_ENDPOINT = "/api/v1/public/platform/mobile-app";
export const MOBILE_APP_ADMIN_ENDPOINT = "/api/v1/admin/platform/mobile-app";
export const MOBILE_APP_FETCH_TIMEOUT_MS = 1500;

export type MobileAppAdminConfig = {
  url: string;
  source?: string;
  environment?: string;
  fallback_url?: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// Se agota en 1,5 s: la pantalla de acceso no puede quedarse esperando a la API para pintar su boton.
export async function fetchConfiguredMobileAppUrl(
  fetcher: FetchLike | undefined = typeof fetch === "function" ? fetch.bind(globalThis) : undefined
): Promise<string> {
  const local = mobileAppUrl();
  if (typeof fetcher !== "function") return local;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MOBILE_APP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(MOBILE_APP_PUBLIC_ENDPOINT, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response?.ok) return local;
    const body = (await response.json()) as { url?: unknown } | null;
    return normalizeMobileAppUrl(body?.url, local);
  } catch {
    return local;
  } finally {
    clearTimeout(timer);
  }
}

// Un portatil con pantalla tactil no es un celular: el discriminador es el agente del navegador,
// y la unica excepcion es iPadOS, que desde la version 13 se anuncia como MacIntel de escritorio.
export function isHandheldDevice(signal: DeviceSignal): boolean {
  if (/android|blackberry|iphone|ipad|ipod|iemobile|opera m(ob|in)i|windows phone|mobile/i.test(String(signal.userAgent || ""))) return true;
  return signal.platform === "MacIntel" && signal.maxTouchPoints > 1;
}

export function handheldSignal(): DeviceSignal {
  if (typeof navigator === "undefined") return { userAgent: "", maxTouchPoints: 0, platform: "" };
  return {
    userAgent: navigator.userAgent || "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform || ""
  };
}

export const APP_INSTALL_LABELS = {
  bandTitle: "APEXOS Web Móvil",
  bandHint: "Marca jornada y registra actividades desde el celular. Se instala con Chrome, sin tiendas.",
  bandAction: "Descarga nuestra app",
  guideTitle: "Instala APEXOS en tu celular",
  guideDescription: "Se instala desde Chrome y queda con su propio icono.",
  openApp: "Abrir la app",
  desktopNotice: "La app es exclusiva para celulares. Si la abres desde el computador, APEXOS no te dejará instalarla y te lo dirá en pantalla.",
  desktopHint: "El botón abre la app en una pestaña nueva, pero instalarla se hace en el celular con Chrome. Estos son los pasos que verás allí.",
  installedHint: "¿Ya la instalaste? Ábrela desde su icono y entra con el mismo correo y la misma contraseña."
} as const;

// Copy del apartado de Administración. Vive aqui, y no en la pantalla, por la misma razon que el
// copy del acceso: la prueba de contrato y la certificacion de navegador exigen estas cadenas.
export const MOBILE_APP_ADMIN_LABELS = {
  itemTitle: "App móvil (enlace del acceso)",
  itemDescription: "Cambia la dirección a la que envía el botón de instalación en este ambiente.",
  modalTitle: "Enlace de la app móvil",
  intro: "Es la dirección que abre la guía «Descarga nuestra app» en la pantalla de acceso. Se guarda en este ambiente, no en la empresa.",
  environment: "Ambiente que respondió",
  field: "Dirección de la app",
  currentSourceBase: "administrado en este ambiente",
  currentSourceFallback: "destino por defecto, aún no se ha administrado",
  updated: "Último cambio",
  updatedBy: "Quién lo cambió",
  never: "sin cambios todavía",
  scopeNotice: "Guardar aquí no cambia otros ambientes. Para mover el enlace de Producción hay que entrar a Producción.",
  save: "Guardar enlace",
  saving: "Guardando...",
  saved: "El enlace quedó guardado en este ambiente.",
  restore: "Volver al destino por defecto",
  invalid: "Escribe la dirección completa y que empiece por https://"
} as const;

export const INSTALL_STEPS = [
  { id: "abrir", label: "Abre el enlace en Chrome", detail: "Toca «Abrir la app» y espera a que cargue la pantalla de ingreso." },
  { id: "menu", label: "Toca los tres puntos", detail: "Están arriba a la derecha, dentro del propio Chrome." },
  { id: "instalar", label: "Elige «Instalar app»", detail: "En algunos equipos dice «Añadir a pantalla principal» o «Crear acceso directo»." },
  { id: "acceso", label: "Confirma y crea el acceso directo", detail: "La app queda con su icono en tu pantalla de inicio, como cualquier aplicación." }
] as const;
