// Derivacion de la paleta de la vitrina publica Comercio. El tenant elige tres colores
// (acento, promocion, fondo) y cinco modos (tono de superficie, profundidad, patron de
// fondo, esquinas y vela del cartel); aqui eso se expande a las variables CSS que leen las
// clases sf-* de app/tienda/storefront.css. Puramente numerico: sin dependencias.
//
// Por que OKLCH y no mezclar RGB: mezclar en sRGB codificado en gamma no es perceptual.
// Bajarle un 12% de blanco a un verde lo deja lavado, mezclarlo con negro lo ensucia, y el
// salto entre dos superficies "iguales" se ve disparejo. OKLCH separa lo que el ojo percibe
// por separado: L (claridad), C (saturacion) y h (tono). Las superficies suben de claridad
// en pasos uniformes, los acentos conservan su tono y la saturacion se recorta cuando el
// color pedido no cabe en sRGB (gamut fit) en vez de recortar canal por canal.
//
// Y sobre todo: el texto deja de salir de una formula fija y se elige por CONTRASTE MEDIDO.
// toneAtContrast()/ensureContrast() mueven la claridad hasta que la razon de contraste WCAG
// contra la superficie donde va pintado alcanza el objetivo. Eso arregla las paletas
// hostiles: lima sobre fondo claro se oscurece hasta leerse, azul marino sobre casi negro
// se aclara, y el acento del comercio nunca queda en 2:1.

export type SurfaceTint = "neutro" | "suave" | "marcado";
export type SurfaceDepth = "plana" | "media" | "alta";
export type BackgroundPattern = "ninguno" | "puntos" | "cuadricula" | "diagonal";
export type CornerRadius = "recto" | "suave" | "redondo";
export type BannerScrim = "ligero" | "medio" | "fuerte";

export type StorefrontTheme = {
  accent: string;
  promo: string;
  base: string;
  surface_tint: SurfaceTint;
  surface_depth: SurfaceDepth;
  background_pattern: BackgroundPattern;
  corner_radius: CornerRadius;
  banner_scrim: BannerScrim;
  headline: string | null;
  subhead: string | null;
  banner_url: string | null;
};

export const SURFACE_TINTS: readonly SurfaceTint[] = ["neutro", "suave", "marcado"];
export const SURFACE_DEPTHS: readonly SurfaceDepth[] = ["plana", "media", "alta"];
export const BACKGROUND_PATTERNS: readonly BackgroundPattern[] = ["ninguno", "puntos", "cuadricula", "diagonal"];
export const CORNER_RADII: readonly CornerRadius[] = ["recto", "suave", "redondo"];
export const BANNER_SCRIMS: readonly BannerScrim[] = ["ligero", "medio", "fuerte"];

// "suave" reproduce las esquinas que la vitrina ya tenia (rounded-xl/2xl/3xl de Tailwind),
// asi que el tema default no cambia el aspecto que los clientes conocen.
export const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  accent: "#10b981",
  promo: "#e11d48",
  base: "#0a0a0a",
  surface_tint: "neutro",
  surface_depth: "media",
  background_pattern: "ninguno",
  corner_radius: "suave",
  banner_scrim: "medio",
  headline: null,
  subhead: null,
  banner_url: null
};

export type Rgb = { r: number; g: number; b: number };
type Oklch = { l: number; c: number; h: number };

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const NEAR_BLACK: Rgb = { r: 10, g: 10, b: 10 };

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

// Convierte una tripleta "r g b" de las variables --sf-* en hex, para que el panel de
// configuracion pueda pintar la rampa de colores derivados y medir su contraste.
export function tripletToHex(triplet: string): string {
  const [r, g, b] = String(triplet || "").trim().split(/\s+/).map(Number);
  if (![r, g, b].every((n) => Number.isFinite(n))) return "#000000";
  return rgbToHex({ r, g, b });
}

// Mezcla en el espacio codificado en gamma. Se conserva porque los presets ya publicados la
// usan; la derivacion de la vitrina ya no depende de ella.
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

// Luminancia relativa WCAG 2.1: la que manda en las razones de contraste. La L de OKLab es
// la que manda en la percepcion de claridad. Son cosas distintas y el motor usa ambas.
export function relativeLuminance(color: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function contrastRatioHex(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return 1;
  return contrastRatio(ca, cb);
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toSrgbChannel(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

export function rgbToOklch(color: Rgb): Oklch {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const labL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757873 * s;
  const c = Math.hypot(labA, labB);
  let h = c < 1e-6 ? 0 : (Math.atan2(labB, labA) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: labL, c, h };
}

function oklchToRaw({ l, c, h }: Oklch): { r: number; g: number; b: number } {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0624150255 * a - 1.2955076619 * b;
  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;
  return {
    r: 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    g: -1.2684380046 * lc + 2.6097573293 * mc - 0.3413193965 * sc,
    b: -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc
  };
}

// Un color "cabe" cuando ningun canal lineal se sale del rango. Recortar canal por canal es
// la trampa clasica: un azul saturado se vuelve violeta. Aqui se recorta la SATURACION
// conservando claridad y tono, que es lo que el ojo acepta como "ese mismo color, menos
// intenso".
function inGamut(raw: { r: number; g: number; b: number }): boolean {
  const e = 1e-5;
  return raw.r >= -e && raw.r <= 1 + e && raw.g >= -e && raw.g <= 1 + e && raw.b >= -e && raw.b <= 1 + e;
}

export function oklchToRgb(color: Oklch): Rgb {
  const h = ((color.h % 360) + 360) % 360;
  const l = Math.max(0, Math.min(1, color.l));
  const c = Math.max(0, color.c);
  let chroma = c;
  if (!inGamut(oklchToRaw({ l, c, h }))) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToRaw({ l, c: mid, h }))) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  const raw = oklchToRaw({ l, c: chroma, h });
  // Con saturacion cero el color es gris y debe salir EXACTamente gris: las filas de la
  // matriz de conversion no suman 1.0 con precision flotante, asi que r, g y b difieren en
  // ~1e-4 y al redondear aparece un gris con tinte (212 211 212). Un neutro sucio en la
  // interfaz es justo el defecto que se ve en una vitrina oscura.
  if (chroma < 1e-6) {
    const gray = toSrgbChannel((raw.r + raw.g + raw.b) / 3);
    return { r: gray, g: gray, b: gray };
  }
  return { r: toSrgbChannel(raw.r), g: toSrgbChannel(raw.g), b: toSrgbChannel(raw.b) };
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

// El corte de "tema oscuro" se mide en OKLab, no en luminancia: un azul de marca intenso
// tiene luminancia baja pero se ve claro, y al reves. 0.55 es donde una superficie empieza
// a pedir letra oscura en la practica.
export function isDark(color: Rgb | null, fallback = true): boolean {
  if (!color) return fallback;
  return rgbToOklch(color).l < 0.55;
}

const DARK_CEILING_L = 0.44;
const LIGHT_FLOOR_L = 0.6;
// Extremos fisicos de la rampa: una superficie nunca llega a blanco o negro puros.
const RAMP_TOP_L = 0.94;
const RAMP_BOTTOM_L = 0.06;

// Hacia donde mueve la claridad el escalon de superficies. En los dos temas extremos es la
// direccion de siempre (tarjetas apenas mas claras que un fondo negro, apenas mas oscuras
// que un fondo blanco). Con un fondo de gris medio esa direccion ya no deja cuarto para la
// tinta — blanco sobre gris claro no llega ni a 3:1 — y entonces las tarjetas se mueven
// HACIA EL EXTREMO CONTRARIO de la tinta: letra clara con tarjetas mas oscuras que el fondo,
// letra oscura con tarjetas mas claras. DARK_CEILING_L y LIGHT_FLOOR_L son las franjas donde
// todavia cabe la rampa de cuatro pasos en la direccion de siempre. El escalon se comprime
// cuando el cuarto disponible hasta el borde fisico de la rampa no cubre los cuatro pasos.
function surfaceDirection(baseL: number, dark: boolean): number {
  if (dark) return baseL < DARK_CEILING_L ? 1 : -1;
  return baseL > LIGHT_FLOOR_L ? -1 : 1;
}

function headroomScale(baseL: number, dir: number, maxStep: number): number {
  const room = dir > 0 ? RAMP_TOP_L - baseL : baseL - RAMP_BOTTOM_L;
  if (room <= 0) return 0;
  return Math.max(0, Math.min(1, room / maxStep));
}

// Busca la claridad MAS CERCANA al fondo cuya razon de contraste contra el fondo sea >=
// target. Biseccion sobre un intervalo donde el contraste es monotono: del fondo (1:1) al
// extremo (el color mas separado posible).
//
// Si la superficie no tiene tanto cuarto como pide el objetivo (un fondo de gris medio es
// el caso real), el objetivo se reescala en proportion: la jerarquia de la rampa se
// conserva en vez de colapsar todos los niveles al extremo y pintar la interfaz plana.
function toneAtContrast(bg: Rgb, extreme: Oklch, target: number, chroma: number, ceiling: number, hue: number): Rgb {
  const top = oklchToRgb({ l: extreme.l, c: chroma, h: hue });
  const maxRatio = contrastRatio(bg, top);
  const effective = maxRatio >= target ? target : 1 + ((target - 1) * (maxRatio - 1)) / (ceiling - 1);
  if (effective <= 1.05) return oklchToRgb({ l: extreme.l, c: 0, h: hue });
  let lo = rgbToOklch(bg).l;
  let hi = extreme.l;
  for (let i = 0; i < 26; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(bg, oklchToRgb({ l: mid, c: chroma, h: hue })) >= effective) hi = mid;
    else lo = mid;
  }
  return oklchToRgb({ l: hi, c: chroma, h: hue });
}

// Ajusta un color del tenant hasta que se lea sobre la superficie donde va pintado, sin
// cambiarle el tono: mueve claridad y, si hace falta, recorta saturacion. Si el color ya
// cumple, se devuelve TAL CUAL: el cliente eligio ese verde, y reconvertirlo por OKLCH
// redondea canales y le cambia el color de la marca un par de puntos.
function ensureContrast(bg: Rgb, seed: Rgb, target: number, upward: boolean): Rgb {
  if (contrastRatio(bg, seed) >= target) return seed;
  const start = rgbToOklch(seed);
  const endL = upward ? 0.97 : 0.06;
  // Al acercarse al extremo la saturacion se relaja: un lima saturado no alcanza 4.5:1
  // contra blanco, pero su version menos saturada y mas oscura si se lee.
  const ratioAt = (t: number) =>
    contrastRatio(bg, oklchToRgb({ l: start.l + (endL - start.l) * t, c: start.c * (1 - 0.45 * t), h: start.h }));
  if (ratioAt(1) < target) return oklchToRgb({ l: endL, c: 0, h: start.h });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 26; i += 1) {
    const mid = (lo + hi) / 2;
    if (ratioAt(mid) >= target) hi = mid;
    else lo = mid;
  }
  return oklchToRgb({ l: start.l + (endL - start.l) * hi, c: start.c * (1 - 0.45 * hi), h: start.h });
}

function triplet(color: Rgb, fallback: Rgb): string {
  const c = color ?? fallback;
  return `${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}`;
}

// Cuanto sube de claridad cada escalon de superficie, en L de OKLab. Calibrados contra el
// fondo default (#0a0a0a, L=0.145) para que la vitrina conserve la escala neutral que ya
// tenia fijada en Tailwind (900/800/700/600); con otro fondo, headroomScale los comprime.
const SURFACE_STEPS = { surface: 0.06, surface2: 0.124, surface3: 0.226, line4: 0.293 } as const;
const DEPTH_FACTORS: Record<SurfaceDepth, number> = { plana: 0.55, media: 1, alta: 1.35 };
const SHADOW_ALPHAS: Record<SurfaceDepth, string> = { plana: "0.28", media: "0.4", alta: "0.55" };
const TINT_FACTORS: Record<SurfaceTint, number> = { neutro: 0, suave: 0.34, marcado: 0.62 };
const TINT_CHROMA_CAP = 0.075;

// Razon de contraste objetivo de cada nivel de texto, medida contra la superficie de las
// tarjetas. strong/body/secondary sobran para AA; muted es el piso AA de texto pequeno;
// faint y ghost son decorativos (precio tachado, microcopy) y quedan por encima de lo que
// daba la mezcla RGB anterior en el tema default.
const INK_TARGETS = { strong: 17, body: 12, secondary: 7, muted: 3.8, faint: 2.3, ghost: 1.75 } as const;

const SCRIM_VALUES: Record<BannerScrim, { top: string; mid: string; bottom: string }> = {
  ligero: { top: "0.42", mid: "0.08", bottom: "0.58" },
  medio: { top: "0.55", mid: "0.2", bottom: "0.72" },
  fuerte: { top: "0.68", mid: "0.34", bottom: "0.84" }
};

const RADIUS_VALUES: Record<CornerRadius, { md: string; card: string }> = {
  recto: { md: "0.25rem", card: "0.375rem" },
  suave: { md: "0.75rem", card: "1.25rem" },
  redondo: { md: "1.125rem", card: "1.75rem" }
};

// El patron se pinta con la linea mas clara del tema, y ese color ya vive en una variable,
// asi que se tiñe solo: la hoja de estilos no necesita saber que patron eligio el comercio.
// "ninguno" produce `none` y el fondo queda plano, como siempre.
const PATTERN_VALUES: Record<BackgroundPattern, { image: string; size: string }> = {
  ninguno: { image: "none", size: "auto" },
  puntos: { image: "radial-gradient(rgb(var(--sf-line4-t) / 0.28) 1px, transparent 1.2px)", size: "22px 22px" },
  cuadricula: {
    image:
      "linear-gradient(rgb(var(--sf-line4-t) / 0.17) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--sf-line4-t) / 0.17) 1px, transparent 1px)",
    size: "34px 34px"
  },
  diagonal: { image: "repeating-linear-gradient(135deg, rgb(var(--sf-line4-t) / 0.15) 0 1px, transparent 1px 14px)", size: "auto" }
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// Tinta "sobre fotografia": con banner subido, la columna de texto cae encima de una foto
// que el scrim ya oscurecio. Ahi la tinta del tema no sirve (en fondo claro es casi negra y
// desaparece), asi que el tratamiento es fijo: letra clara y acentos llevados al contraste
// que pide una foto oscura, sin importar el tema elegido.
const PHOTO_BG: Rgb = { r: 20, g: 20, b: 20 };
const PHOTO_INK = {
  strong: "255 255 255",
  ink: "245 245 245",
  body: "228 230 233",
  secondary: "203 207 212",
  muted: "170 175 182",
  faint: "190 195 202"
} as const;

// Cada familia de color produce las variantes que consumen las clases sf-*. El color elegido
// por el comercio se conserva mientras sea legible; de ahi en adelante las variantes salen
// de contraste medido, no de porcentajes fijos de mezcla.
function familyVars(prefix: string, seed: Rgb, surface: Rgb, dark: boolean): Record<string, string> {
  const base = rgbToOklch(seed);
  const surfaceL = rgbToOklch(surface).l;
  // El color del comercio se pinta TAL CUAL: ida y vuelta por OKLCH redondea canales y un
  // #10b981 se convertiria en #0db97f. El cliente eligio un hex, ese hex es su marca.
  const strong = oklchToRgb({ l: Math.max(0.02, Math.min(0.98, base.l + (dark ? 0.07 : -0.06))), c: base.c, h: base.h });
  const text = ensureContrast(surface, seed, 4.5, dark);
  // "soft" es la version decorativa del acento (hover, subtitulos, etiquetas): un paso mas
  // hacia la tinta y saturacion apenas baja, pero con el mismo piso de legibilidad de 4.5.
  // Mezclarlo fijo con blanco dejaba el color lavado; aqui sigue siendo el color de la marca.
  const softSeed = oklchToRgb({ l: Math.max(0.02, Math.min(0.98, base.l + (dark ? 0.1 : -0.09))), c: base.c * 0.82, h: base.h });
  const soft = ensureContrast(surface, softSeed, 4.5, dark);
  // "deep" es el lavado del acento sobre el fondo (hero, sombra, borde de paso). Antes se
  // hacia mezclando con el fondo, y en un tema claro producia un color MAS CLARO: el hero
  // verdoso se volvia blanco y la sombra desaparecia. Ahora mueve claridad hacia la tinta y
  // con saturacion controlada, igual en los dos temas.
  const deep = oklchToRgb({
    l: Math.max(0.04, Math.min(0.96, surfaceL + (dark ? 0.16 : -0.22))),
    c: Math.min(base.c * 0.62, 0.085),
    h: base.h
  });
  return {
    [`--sf-${prefix}-t`]: triplet(seed, seed),
    [`--sf-${prefix}-strong-t`]: triplet(strong, seed),
    [`--sf-${prefix}-text-t`]: triplet(text, seed),
    [`--sf-${prefix}-soft-t`]: triplet(soft, seed),
    [`--sf-${prefix}-deep-t`]: triplet(deep, seed),
    [`--sf-on-${prefix}`]: inkOn(rgbToHex(seed)),
    [`--sf-photo-${prefix}-t`]: triplet(ensureContrast(PHOTO_BG, seed, 4.5, true), seed),
    [`--sf-photo-${prefix}-soft-t`]: triplet(ensureContrast(PHOTO_BG, softSeed, 4.5, true), seed)
  };
}

// Convierte el tema del tenant en el set completo de variables CSS de la vitrina.
// Un color corrupto, un modo desconocido o un campo ausente caen al default: la vitrina
// nunca queda sin paleta ni con un valor inyectado desde el cliente.
export function buildStorefrontVars(theme: Partial<StorefrontTheme> | null | undefined): Record<string, string> {
  const merged = { ...DEFAULT_STOREFRONT_THEME, ...(theme || {}) };
  const baseRgb = hexToRgb(merged.base) ?? hexToRgb(DEFAULT_STOREFRONT_THEME.base)!;
  const accentRgb = hexToRgb(merged.accent) ?? hexToRgb(DEFAULT_STOREFRONT_THEME.accent)!;
  const promoRgb = hexToRgb(merged.promo) ?? hexToRgb(DEFAULT_STOREFRONT_THEME.promo)!;
  const tint = pick<SurfaceTint>(merged.surface_tint, SURFACE_TINTS, DEFAULT_STOREFRONT_THEME.surface_tint);
  const depth = pick<SurfaceDepth>(merged.surface_depth, SURFACE_DEPTHS, DEFAULT_STOREFRONT_THEME.surface_depth);
  const pattern = pick<BackgroundPattern>(merged.background_pattern, BACKGROUND_PATTERNS, DEFAULT_STOREFRONT_THEME.background_pattern);
  const radius = pick<CornerRadius>(merged.corner_radius, CORNER_RADII, DEFAULT_STOREFRONT_THEME.corner_radius);
  const scrim = pick<BannerScrim>(merged.banner_scrim, BANNER_SCRIMS, DEFAULT_STOREFRONT_THEME.banner_scrim);

  const dark = isDark(baseRgb);
  const ink = dark ? WHITE : NEAR_BLACK;
  const inkOklch = rgbToOklch(ink);
  const baseOklch = rgbToOklch(baseRgb);

  // Las superficies suben (o bajan) de claridad en pasos uniformes de OKLab desde el fondo,
  // comprimidos cuando el fondo ya esta cerca del techo. El "tono" hereda la saturacion del
  // acento: el mismo fondo con tono marcado se ve de marca, no de plantilla.
  const tintHue = baseOklch.c > 0.012 ? baseOklch.h : rgbToOklch(accentRgb).h;
  // El tope se aplica AL CROMA DEL ACENTO y el factor del modo despues, no al reves. Con
  // `min(factor * croma, tope)` un acento saturado (ambar: c=0.165) pide 0.056 en "suave" y
  // 0.102 en "marcado", y los dos se recortan al mismo techo de sRGB en las superficies
  // oscuras: el comercio mueve la perilla de tono, guarda, y la vitrina sale igual. Primero
  // el tope y despues el factor deja 0.026 contra 0.047, que son dos pinturas distintas.
  const tintChroma = TINT_FACTORS[tint] * Math.min(rgbToOklch(accentRgb).c, TINT_CHROMA_CAP);
  const dir = surfaceDirection(baseOklch.l, dark);
  const stepScale = DEPTH_FACTORS[depth] * headroomScale(baseOklch.l, dir, SURFACE_STEPS.line4 * DEPTH_FACTORS[depth]);
  const level = (step: number) => Math.max(0.02, Math.min(0.98, baseOklch.l + dir * step * stepScale));
  const at = (step: number) => oklchToRgb({ l: level(step), c: Math.max(baseOklch.c, tintChroma), h: tintHue });

  const surface = at(SURFACE_STEPS.surface);
  const surface2 = at(SURFACE_STEPS.surface2);
  const surface3 = at(SURFACE_STEPS.surface3);
  const line4 = at(SURFACE_STEPS.line4);
  // Los niveles de texto se resuelven contra la superficie de las tarjetas: la razon de
  // contraste objetivo decide la claridad, y el croma sigue el tono elegido. El tono de la
  // tinta NUNCA es el de la constante de color: blanco y negro tienen saturacion cero, y una
  // saturacion cero no define tono, asi que heredarlo de la constante daria rojo (h=0) y las
  // rampas tintadas salian rosas sobre un fondo marron.
  const inkAt = (target: number) => toneAtContrast(surface, inkOklch, target, tintChroma * 0.35, INK_TARGETS.strong, tintHue);

  return {
    "--sf-base-t": triplet(baseRgb, NEAR_BLACK),
    "--sf-surface-t": triplet(surface, baseRgb),
    "--sf-surface2-t": triplet(surface2, baseRgb),
    "--sf-surface3-t": triplet(surface3, baseRgb),
    "--sf-line3-t": triplet(surface3, baseRgb),
    "--sf-line4-t": triplet(line4, baseRgb),
    "--sf-ink-t": triplet(ink, WHITE),
    "--sf-ink-strong-t": triplet(inkAt(INK_TARGETS.strong), ink),
    "--sf-ink-body-t": triplet(inkAt(INK_TARGETS.body), ink),
    "--sf-ink-secondary-t": triplet(inkAt(INK_TARGETS.secondary), ink),
    "--sf-ink-muted-t": triplet(inkAt(INK_TARGETS.muted), ink),
    "--sf-ink-faint-t": triplet(inkAt(INK_TARGETS.faint), ink),
    "--sf-ink-ghost-t": triplet(inkAt(INK_TARGETS.ghost), ink),
    "--sf-ink-deepest-t": triplet(surface2, ink),
    ...familyVars("accent", accentRgb, surface, dark),
    ...familyVars("promo", promoRgb, surface, dark),
    "--sf-photo-ink-strong-t": PHOTO_INK.strong,
    "--sf-photo-ink-t": PHOTO_INK.ink,
    "--sf-photo-ink-body-t": PHOTO_INK.body,
    "--sf-photo-ink-secondary-t": PHOTO_INK.secondary,
    "--sf-photo-ink-muted-t": PHOTO_INK.muted,
    "--sf-photo-ink-faint-t": PHOTO_INK.faint,
    "--sf-radius-md": RADIUS_VALUES[radius].md,
    "--sf-radius-card": RADIUS_VALUES[radius].card,
    "--sf-scrim-top": SCRIM_VALUES[scrim].top,
    "--sf-scrim-mid": SCRIM_VALUES[scrim].mid,
    "--sf-scrim-bottom": SCRIM_VALUES[scrim].bottom,
    "--sf-shadow-alpha": SHADOW_ALPHAS[depth],
    // "--sf-pattern" referencia "--sf-line4-t": el navegador resuelve las variables al
    // pintar, no aqui, asi que el orden solo importa para copiar este bloque a :root.
    "--sf-pattern": PATTERN_VALUES[pattern].image,
    "--sf-pattern-size": PATTERN_VALUES[pattern].size
  };
}
