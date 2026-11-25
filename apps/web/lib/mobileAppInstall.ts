// Contrato de la app movil de APEXOS (repo aparte `AppApexos`, PWA servida en Railway).
// Vive aqui y no en la pantalla para que la prueba de fuente y la certificacion de navegador
// comparen el mismo texto: el copy de los pasos y la URL son contrato, no decoracion del JSX.

export const MOBILE_APP_FALLBACK_URL = "https://appapexos-production.up.railway.app";

export type DeviceSignal = { userAgent: string; maxTouchPoints: number; platform: string };

// El respaldo esta quemado a proposito: la app es un unico servicio, asi que QA y Produccion
// apuntan al mismo destino y ninguna variable de ambiente es prerrequisito del boton.
export function mobileAppUrl(env: string | undefined = process.env.NEXT_PUBLIC_MOBILE_APP_URL): string {
  const candidate = String(env || MOBILE_APP_FALLBACK_URL).trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" && parsed.hostname) return candidate;
  } catch {
    // Configuracion torcida: mejor el destino conocido que un enlace vacio en el lobby.
  }
  return MOBILE_APP_FALLBACK_URL;
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
  copyLink: "Copiar enlace",
  desktopNotice: "La app es exclusiva para celulares. Si la abres desde el computador, APEXOS no te dejará instalarla y te lo dirá en pantalla.",
  desktopHint: "Envíate el enlace por WhatsApp o correo y ábrelo con Chrome en tu celular. Estos son los pasos que verás allí.",
  copied: "Enlace copiado. Ya puedes enviarlo a tu celular.",
  copyBlocked: "Tu navegador no permitió copiar. El enlace está escrito abajo: selecciónalo y cópialo.",
  installedHint: "¿Ya la instalaste? Ábrela desde su icono y entra con el mismo correo y la misma contraseña."
} as const;

export const INSTALL_STEPS = [
  { id: "abrir", label: "Abre el enlace en Chrome", detail: "Toca «Abrir la app» y espera a que cargue la pantalla de ingreso." },
  { id: "menu", label: "Toca los tres puntos", detail: "Están arriba a la derecha, dentro del propio Chrome." },
  { id: "instalar", label: "Elige «Instalar app»", detail: "En algunos equipos dice «Añadir a pantalla principal» o «Crear acceso directo»." },
  { id: "acceso", label: "Confirma y crea el acceso directo", detail: "La app queda con su icono en tu pantalla de inicio, como cualquier aplicación." }
] as const;
