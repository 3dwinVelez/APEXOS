// Derivacion de la paleta de la vitrina publica Comercio desde los tres colores que
// eligio el tenant (acento, promocion y fondo). El servidor valida y devuelve estos tres
// hex mas los textos del cartel; aqui se expanden a las variables CSS que consumen las
// clases sf-* de app/tienda/storefront.css. Puramente numerico: sin dependencias.

export type StorefrontTheme = {
  accent: string;
  promo: string;
  base: string;
  headline: string | null;
  subhead: string | null;
  banner_url: string | null;
};

export const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  accent: "#10b981",
  promo: "#e11d48",
  base: "#0a0a0a",
  headline: null,
  subhead: null,
  banner_url: null
};

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

// Luminancia relativa WCAG 2.1 (umbral 0.179 es el corte clasicos de contraste).
export function relativeLuminance(color: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function isDark(color: Rgb | null, fallback = true): boolean {
  if (!color) return fallback;
  return relativeLuminance(color) < 0.32;
}

// Tinta sobre una superficie solida: negro casi puro o blanco, el que de mejor razon de
// contraste WCAG. Se compara la razon (L+0.05), no la diferencia de luminancia: con la
// diferencia un verde medio (L~0.42) se llevaria blanco a 2.2:1, ilegible, cuando el
// negro llega a ~8:1. El punto de cruce sale de 1.05/(L+0.05) = (L+0.05)/0.05, o sea
// L = sqrt(0.0525) - 0.05 ~ 0.179: el corte clasico.
export function inkOn(hexColor: string): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return "#ffffff";
  return relativeLuminance(rgb) < 0.179 ? "#ffffff" : "#0a0a0a";
}

function triplet(color: Rgb | null, fallback: Rgb): string {
  const c = color ?? fallback;
  return `${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}`;
}

// Tinta "sobre fotografia": cuando el comercio sube un banner, la columna de texto cae
// encima de una foto que el scrim ya oscurecio. Ahi la tinta del tema no sirve (en un
// fondo claro es casi negra y desaparece), asi que el tratamiento es fijo: letra clara y
// acentos aclarados hacia blanco, sin importar el tema elegido.
const PHOTO_INK = {
  strong: "255 255 255",
  ink: "245 245 245",
  body: "228 230 233",
  secondary: "203 207 212",
  muted: "170 175 182",
  faint: "190 195 202"
} as const;

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const NEAR_BLACK: Rgb = { r: 10, g: 10, b: 10 };

// Cada familia de color produce las variantes que consumen las clases sf-*:
// el color elegido es la base; las demas son mezclas hacia la tinta del tema. Los
// factores estan calibrados para que el tema default quede lo mas cerca posible de la
// paleta original de la vitrina (emerald/rose), que es lo que ya ven los clientes.
function familyVars(prefix: string, accentHex: string, base: Rgb, dark: boolean, ink: Rgb): Record<string, string> {
  const solid = hexToRgb(accentHex) ?? base;
  const bright = mix(solid, WHITE, 0.24);
  const text = dark ? mix(solid, WHITE, 0.2) : mix(solid, NEAR_BLACK, 0.22);
  const textSoft = dark ? mix(solid, WHITE, 0.45) : mix(solid, NEAR_BLACK, 0.1);
  const deep = mix(solid, base, 0.62);
  return {
    [`--sf-${prefix}-t`]: triplet(solid, base),
    [`--sf-${prefix}-strong-t`]: triplet(bright, base),
    [`--sf-${prefix}-text-t`]: triplet(text, ink),
    [`--sf-${prefix}-soft-t`]: triplet(textSoft, ink),
    [`--sf-${prefix}-deep-t`]: triplet(deep, base),
    [`--sf-on-${prefix}`]: inkOn(rgbToHex(solid))
  };
}

// Convierte el tema del tenant en el set completo de variables CSS de la vitrina.
// Un color corrupto o ausente cae al default: la vitrina nunca queda sin paleta.
export function buildStorefrontVars(theme: Partial<StorefrontTheme> | null | undefined): Record<string, string> {
  const merged = { ...DEFAULT_STOREFRONT_THEME, ...(theme || {}) };
  const baseRgb = hexToRgb(merged.base) ?? hexToRgb(DEFAULT_STOREFRONT_THEME.base)!;
  const accentRgb = hexToRgb(merged.accent) ?? hexToRgb(DEFAULT_STOREFRONT_THEME.accent)!;
  const promoRgb = hexToRgb(merged.promo) ?? hexToRgb(DEFAULT_STOREFRONT_THEME.promo)!;
  const dark = isDark(baseRgb);
  const ink = dark ? WHITE : NEAR_BLACK;
  // Los grises de la interfaz (superficies, bordes, textos) se derivan del fondo:
  // mezclas hacia la tinta, calibradas para reproducir la escala neutral que la
  // vitrina tenia fijada en Tailwind (950/900/800/700/600/500/400/300/100).
  return {
    "--sf-base-t": triplet(baseRgb, NEAR_BLACK),
    "--sf-surface-t": triplet(mix(baseRgb, ink, 0.055), baseRgb),
    "--sf-surface2-t": triplet(mix(baseRgb, ink, 0.115), baseRgb),
    "--sf-surface3-t": triplet(mix(baseRgb, ink, 0.22), baseRgb),
    "--sf-line3-t": triplet(mix(baseRgb, ink, 0.22), baseRgb),
    "--sf-line4-t": triplet(mix(baseRgb, ink, 0.295), baseRgb),
    "--sf-ink-t": triplet(ink, WHITE),
    "--sf-ink-strong-t": triplet(mix(baseRgb, ink, 0.96), ink),
    "--sf-ink-body-t": triplet(mix(baseRgb, ink, 0.825), ink),
    "--sf-ink-secondary-t": triplet(mix(baseRgb, ink, 0.625), ink),
    "--sf-ink-muted-t": triplet(mix(baseRgb, ink, 0.43), ink),
    "--sf-ink-faint-t": triplet(mix(baseRgb, ink, 0.295), ink),
    "--sf-ink-ghost-t": triplet(mix(baseRgb, ink, 0.22), ink),
    "--sf-ink-deepest-t": triplet(mix(baseRgb, ink, 0.115), ink),
    ...familyVars("accent", rgbToHex(accentRgb), baseRgb, dark, ink),
    ...familyVars("promo", rgbToHex(promoRgb), baseRgb, dark, ink),
    // Las variantes de fotografia salen del mismo acento/promo del tenant, siempre
    // aclaradas hacia blanco: es la unica superficie que no cambia con el tema.
    "--sf-photo-ink-strong-t": PHOTO_INK.strong,
    "--sf-photo-ink-t": PHOTO_INK.ink,
    "--sf-photo-ink-body-t": PHOTO_INK.body,
    "--sf-photo-ink-secondary-t": PHOTO_INK.secondary,
    "--sf-photo-ink-muted-t": PHOTO_INK.muted,
    "--sf-photo-ink-faint-t": PHOTO_INK.faint,
    "--sf-photo-accent-t": triplet(mix(accentRgb, WHITE, 0.45), baseRgb),
    "--sf-photo-accent-soft-t": triplet(mix(accentRgb, WHITE, 0.62), baseRgb),
    "--sf-photo-promo-t": triplet(mix(promoRgb, WHITE, 0.45), baseRgb),
    "--sf-photo-promo-soft-t": triplet(mix(promoRgb, WHITE, 0.62), baseRgb)
  };
}
