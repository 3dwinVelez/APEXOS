// Pruebas de la vitrina tematizada del Comercio.
//  1) El motor de variables (components/comercio/storefront-theme.ts) produce la paleta
//     correcta, se defiende contra temas corruptos y coincide con el fallback del CSS.
//  2) El markup de la vitrina y del panel de configuracion no vuelve a colores literales
//     de Tailwind y usa solo clases sf-* que existan realmente en storefront.css.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildStorefrontVars, contrastRatio, contrastRatioHex, DEFAULT_STOREFRONT_THEME, hexToRgb, inkOn, isDark, relativeLuminance, tripletToHex } from "../components/comercio/storefront-theme.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

// Las variables salen como tripletas "r g b" y las tintas de boton como hex; esta funcion
// acepta las dos formas para poder medir contraste entre dos variables cualesquiera.
const tripletOrHex = (value) => (String(value).startsWith("#") ? String(value) : tripletToHex(String(value)));

const css = read("../app/tienda/storefront.css");
const storefront = read("../components/comercio/storefront.tsx");
const page = read("../app/tienda/[code]/page.tsx");
const config = read("../app/dashboard/comercio/configuracion/page.tsx");

// Los presets viven en una pagina .tsx y node no importa JSX: se leen del fuente para
// poder exigir que la coleccion cubra tambien los fondos claros.
const APPEARANCE_PRESETS_SOURCE = [...config.matchAll(/\{\s*label: "[^"]+", accent: "(#[0-9a-fA-F]{6})", promo: "(#[0-9a-fA-F]{6})", base: "(#[0-9a-fA-F]{6})"\s*\}/g)]
  .map((match) => ({ accent: match[1], promo: match[2], base: match[3] }));

test("el tema default reproduce la paleta original de la vitrina", () => {
  const vars = buildStorefrontVars(DEFAULT_STOREFRONT_THEME);
  assert.equal(vars["--sf-base-t"], "10 10 10");
  // El color de la marca se pinta TAL CUAL: el motor no lo pasa por OKLCH si ya es legible,
  // porque la ida y vuelta redondea canales y un #10b981 se volviera #0db97f.
  assert.equal(vars["--sf-accent-t"], "16 185 129");
  assert.equal(vars["--sf-promo-t"], "225 29 72");
  assert.equal(vars["--sf-accent-text-t"], "16 185 129", "el esmeralda default ya se lee: no se altera");
  assert.equal(vars["--sf-ink-t"], "255 255 255");
  // La escala neutral conserva la rampa que la vitrina tenia fijada en Tailwind
  // (900/800/700/600); el motor la reproduce midiendo claridad, no copiando literales.
  assert.equal(vars["--sf-surface-t"], "23 23 23");
  assert.equal(vars["--sf-surface2-t"], "38 38 38");
  assert.equal(vars["--sf-line4-t"], "82 82 82");
  assert.equal(vars["--sf-ink-body-t"], "212 212 212", "neutral-300");
  // Tolerancia de un punto: la rampa ahora sale de OKLab y del contraste medido.
  assert.ok(Math.abs(Number(vars["--sf-ink-strong-t"].split(" ")[0]) - 245) <= 6);
  assert.ok(Math.abs(Number(vars["--sf-ink-secondary-t"].split(" ")[0]) - 163) <= 4);
  assert.ok(Math.abs(Number(vars["--sf-ink-muted-t"].split(" ")[0]) - 139) <= 4);
});

test("la letra y los botones cumplen el contraste minimo medido, no por formula", () => {
  // Es la garantia que el usuario pidio: "los colores no se ajustan bien". Se comprueba
  // sobre la superficie real donde se pinta cada cosa, con la razon WCAG 2.1.
  const ratio = (a, b) => contrastRatioHex(tripletOrHex(a), tripletOrHex(b));
  const vigentes = [
    ["--sf-ink-strong-t", "--sf-surface-t", 4.5],
    ["--sf-ink-body-t", "--sf-surface-t", 4.5],
    ["--sf-ink-secondary-t", "--sf-surface-t", 3],
    // El precio de referencia, «Ref. P-0019», el contador del departamento y el aviso legal
    // del pie salen de muted/faint: es texto que el cliente lee, no decoracion. La vitrina
    // media 3,8:1 ahi porque la lista se certificaba sin estos dos niveles.
    ["--sf-ink-muted-t", "--sf-surface-t", 4.5],
    ["--sf-ink-faint-t", "--sf-surface-t", 4.5],
    ["--sf-accent-text-t", "--sf-surface-t", 4.5],
    ["--sf-promo-text-t", "--sf-surface-t", 4.5],
    ["--sf-accent-soft-t", "--sf-surface-t", 4.5]
  ];
  const temas = [
    DEFAULT_STOREFRONT_THEME,
    { ...DEFAULT_STOREFRONT_THEME, base: "#f8fafc", accent: "#84cc16" }, // lima sobre papel
    { ...DEFAULT_STOREFRONT_THEME, base: "#0b1220", accent: "#1e3a8a" }, // azul marino
    { ...DEFAULT_STOREFRONT_THEME, base: "#ffffff", accent: "#f97316" }, // naranja sobre blanco
    { ...DEFAULT_STOREFRONT_THEME, base: "#140b1c", accent: "#22c55e", promo: "#a855f7" }
  ];
  for (const tema of temas) {
    const vars = buildStorefrontVars(tema);
    for (const [fg, bg, min] of vigentes) {
      assert.ok(ratio(vars[fg], vars[bg]) >= min, `${tema.base}/${tema.accent}: ${fg} rinde ${ratio(vars[fg], vars[bg]).toFixed(2)}:1 sobre ${bg}`);
    }
    // Los botones solidos: la tinta la elige el motor segun el color del comercio.
    assert.ok(ratio(vars["--sf-on-accent"], vars["--sf-accent-t"]) >= 4.5, `${tema.accent}: tinta del boton primario`);
    assert.ok(ratio(vars["--sf-on-promo"], vars["--sf-promo-t"]) >= 4.5, `${tema.promo}: tinta del boton de promocion`);
  }
});

test("un color ileible se corrige sin cambiar el tono y el boton conserva la marca", () => {
  // Lima puro sobre papel claro: el precio (accent-text) tiene que oscurecerse hasta leerse,
  // pero el boton primario sigue pintado con el lima que escogio el comercio y letra oscura.
  const vars = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, base: "#fefce8", accent: "#a3e635" });
  assert.equal(vars["--sf-accent-t"], "163 230 53", "el boton pinta el color de la marca exacto");
  assert.equal(vars["--sf-on-accent"], "#0a0a0a");
  assert.notEqual(vars["--sf-accent-text-t"], "163 230 53", "el precio si se ajusta: lima puro no se lee sobre crema");
  assert.ok(contrastRatioHex(tripletToHex(vars["--sf-accent-text-t"]), tripletToHex(vars["--sf-surface-t"])) >= 4.5);
  // Y se oscurece hacia ese mismo tono, no hacia un gris cualquiera.
  assert.ok(Number(vars["--sf-accent-text-t"].split(" ")[1]) > Number(vars["--sf-accent-text-t"].split(" ")[2]));
});

test("las variables del motor coinciden con el fallback declarado en el CSS", () => {
  // Sin tema inyectado el navegador usa el :root del CSS; si el motor y el fallback
  // divergen, el primer render se ve distinto del resto.
  const root = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const vars = buildStorefrontVars(DEFAULT_STOREFRONT_THEME);
  for (const [name, value] of Object.entries(vars)) {
    assert.match(root, new RegExp(`${name}: ${value.replace(/ /g, "\\s+")};`), `${name} diverge del fallback CSS`);
  }
});

test("un fondo claro invierte la escala de tintas, no deja islas oscuras", () => {
  const light = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, base: "#f8fafc" });
  assert.equal(light["--sf-ink-t"], "10 10 10", "la tinta pasa a casi negro");
  assert.equal(light["--sf-base-t"], "248 250 252");
  // Las superficies se mezlan hacia la tinta: sobre fondo claro son mas oscuras, no mas claras.
  const [surfaceR] = light["--sf-surface-t"].split(" ").map(Number);
  assert.ok(surfaceR < 248, "la superficie se oscurece respecto al fondo");
  const dark = buildStorefrontVars(DEFAULT_STOREFRONT_THEME);
  const [darkSurfaceR] = dark["--sf-surface-t"].split(" ").map(Number);
  assert.ok(darkSurfaceR > 10, "sobre fondo oscuro la superficie se aclara");
  // El texto de acento se oscurece sobre fondo claro.
  const [lightAccentR] = light["--sf-accent-text-t"].split(" ").map(Number);
  const [darkAccentR] = dark["--sf-accent-text-t"].split(" ").map(Number);
  assert.ok(lightAccentR < darkAccentR);
});

test("con cartel subido el texto del hero pasa a tinta de fotografia", () => {
  // El scrim oscurece la foto: sobre ella la tinta de un tema claro (casi negra)
  // desaparece. Por eso el set de foto es fijo y claro, y solo se aplica con banner.
  const light = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, base: "#f8fafc" });
  assert.equal(light["--sf-ink-t"], "10 10 10", "el tema claro sigue mandando fuera del cartel");
  assert.equal(light["--sf-photo-ink-t"], "245 245 245", "sobre la foto la letra es clara");
  // El acento de foto se mide contra la foto oscurecida (20 20 20), no contra el tema:
  // tiene que leerse sobre ella y por eso siempre es mas claro que el del tema claro.
  const fotoRgb = (triplet) => {
    const [r, g, b] = triplet.split(" ").map(Number);
    return { r, g, b };
  };
  assert.ok(contrastRatio(fotoRgb(light["--sf-photo-accent-t"]), fotoRgb("20 20 20")) >= 4.5, "el acento sobre la foto no se lee");
  assert.ok(contrastRatio(fotoRgb(light["--sf-photo-promo-t"]), fotoRgb("20 20 20")) >= 4.5, "la promocion sobre la foto no se lee");
  const [fotoR] = light["--sf-photo-accent-t"].split(" ").map(Number);
  const [temaR] = light["--sf-accent-text-t"].split(" ").map(Number);
  assert.ok(fotoR > temaR, "el acento de foto debe ser mas claro que el del tema claro");

  assert.match(css, /\.sf-on-photo \{[^}]*color: rgb\(var\(--sf-photo-ink-t\)\)/, "la clase de foto debe repintar el texto heredado");
  for (const varName of ["--sf-ink-t", "--sf-ink-body-t", "--sf-ink-muted-t", "--sf-accent-text-t", "--sf-promo-text-t"]) {
    assert.match(css, new RegExp(`\\.sf-on-photo \\{[\\s\\S]*?${varName.replace(/-/g, "\\-")}: var\\(--sf-photo-`), `${varName} no se reasigna sobre el cartel`);
  }
  // Se aplica por la presencia del banner, no por el tema.
  assert.match(storefront, /const photoClass = catalog\.theme\.banner_url \? "sf-on-photo" : "";/);
  assert.match(storefront, /\$\{photoClass\}/);
  assert.match(config, /bannerPreview \? " sf-on-photo" : ""/, "la previa del panel tiene que verse como la vitrina real");
});

test("un color corrupto cae al default: la vitrina nunca queda sin paleta", () => {
  const vars = buildStorefrontVars({ accent: "rojo", promo: "#12", base: null });
  assert.equal(vars["--sf-accent-t"], "16 185 129");
  assert.equal(vars["--sf-promo-t"], "225 29 72");
  assert.equal(vars["--sf-base-t"], "10 10 10");
  assert.equal(buildStorefrontVars(null)["--sf-base-t"], "10 10 10");
  assert.equal(buildStorefrontVars(undefined)["--sf-accent-t"], "16 185 129");
  // Un modo inventado (o inyectado desde la base de datos) no puede colarse como CSS.
  const modos = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, surface_tint: "neon", corner_radius: "xss", background_pattern: "url(evil)" });
  assert.equal(modos["--sf-pattern"], "none", "un patron desconocido pinta plano, no un url() ajeno");
  assert.equal(modos["--sf-radius-card"], "1.25rem", "radio desconocido cae al suave de siempre");
  assert.equal(modos["--sf-surface-t"], buildStorefrontVars(DEFAULT_STOREFRONT_THEME)["--sf-surface-t"], "tono desconocido cae al neutro");
});

test("los cinco modos de personalizacion cambian la pintura", () => {
  const base = buildStorefrontVars(DEFAULT_STOREFRONT_THEME);
  // Tono: la superficie hereda saturacion del acento, y "marcado" mas que "suave".
  const chroma = (triplet) => {
    const [r, g, b] = triplet.split(" ").map(Number);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min;
  };
  const suave = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, accent: "#f59e0b", surface_tint: "suave" });
  const marcado = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, accent: "#f59e0b", surface_tint: "marcado" });
  assert.equal(chroma(base["--sf-surface2-t"]), 0, "neutro: grises puros");
  assert.ok(chroma(suave["--sf-surface2-t"]) > 0, "suave: la superficie se tiñe del acento");
  // El margen, no solo el ">" numerico: con el tope aplicado despues del factor, un acento
  // saturado pide mas croma del que sRGB admite en una superficie oscura y los dos modos se
  // recortan al mismo color. La vitrina pinta igual y el comercio cree que no guardo.
  assert.ok(chroma(marcado["--sf-surface2-t"]) - chroma(suave["--sf-surface2-t"]) >= 8, "marcado debe tinjer de forma visible mas que suave");
  const fondoMarron = { ...DEFAULT_STOREFRONT_THEME, accent: "#f59e0b", base: "#171310" };
  const suaveMarron = buildStorefrontVars({ ...fondoMarron, surface_tint: "suave" });
  const marcadoMarron = buildStorefrontVars({ ...fondoMarron, surface_tint: "marcado" });
  assert.ok(chroma(marcadoMarron["--sf-surface-t"]) - chroma(suaveMarron["--sf-surface-t"]) >= 8, "el margen se exige tambien sobre un fondo de color");
  // "neutro" sobre un fondo con color no es gris: es el color del fondo sin tinte de acento.
  const neutroMarron = buildStorefrontVars({ ...fondoMarron, surface_tint: "neutro" });
  assert.ok(chroma(neutroMarron["--sf-surface-t"]) <= chroma(suaveMarron["--sf-surface-t"]), "neutro tinje menos que suave");
  const [neutroR, , neutroB] = neutroMarron["--sf-surface-t"].split(" ").map(Number);
  assert.ok(neutroR > neutroB, "un fondo marron no se vuelve gris con tono neutro: conserva su propio tinte");
  // Profundidad: separa las tarjetas del fondo y manda en la opacidad de la sombra.
  const plana = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, surface_depth: "plana" });
  const alta = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, surface_depth: "alta" });
  assert.ok(Number(alta["--sf-surface2-t"].split(" ")[0]) - Number(alta["--sf-base-t"].split(" ")[0])
    > Number(plana["--sf-surface2-t"].split(" ")[0]) - Number(plana["--sf-base-t"].split(" ")[0]), "alta separa mas las tarjetas");
  assert.ok(Number(alta["--sf-shadow-alpha"]) > Number(plana["--sf-shadow-alpha"]));
  assert.equal(base["--sf-shadow-alpha"], "0.4", "media es lo que ya se veia");
  // Patron de fondo y esquinas.
  assert.equal(base["--sf-pattern"], "none");
  assert.match(buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, background_pattern: "puntos" })["--sf-pattern"], /radial-gradient/);
  assert.match(buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, background_pattern: "cuadricula" })["--sf-pattern"], /linear-gradient/);
  assert.match(buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, background_pattern: "diagonal" })["--sf-pattern"], /repeating-linear-gradient/);
  assert.ok(buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, background_pattern: "puntos" })["--sf-pattern"].includes("--sf-line4-t"), "el patron se tiñe con la linea del tema");
  assert.equal(buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, corner_radius: "recto" })["--sf-radius-card"], "0.375rem");
  assert.ok(Number.parseFloat(buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, corner_radius: "redondo" })["--sf-radius-md"])
    > Number.parseFloat(base["--sf-radius-md"]));
  // Velo del cartel: ligero deja ver la foto, fuerte la tapa.
  const ligero = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, banner_scrim: "ligero" });
  const fuerte = buildStorefrontVars({ ...DEFAULT_STOREFRONT_THEME, banner_scrim: "fuerte" });
  assert.ok(Number(fuerte["--sf-scrim-bottom"]) > Number(ligero["--sf-scrim-bottom"]));
  assert.equal(base["--sf-scrim-top"], "0.55", "medio reproduce la vela que ya tenia el cartel");
});

test("las rampas se declaran donde vive el tema, no en :root", () => {
  // Un valor personalizado se sustituye en el elemento donde se DECLARA y despues se hereda
  // ya resuelto. Declaradas en :root, las rampas se congelaban al negro de la hoja: el
  // inline de <Storefront/> con las variables del comercio no las alcanzaba y el fondo claro
  // recibia letra casi negra sobre un degradado negro.
  const raiz = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
  const contenedor = /\.sf-root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
  assert.ok(contenedor.length > 0, "no se encontro el bloque .sf-root");
  for (const nombre of ["--sf-grad-hero", "--sf-grad-contact", "--sf-grad-progress", "--sf-grad-thumb", "--sf-grad-below", "--sf-shadow-accent"]) {
    assert.ok(!raiz.includes(nombre), `${nombre} sigue declarado en :root: no seguira el tema`);
    assert.ok(contenedor.includes(nombre), `${nombre} no se declara en .sf-root`);
  }
  // Y el fallback sin variables inyectadas tiene que seguir siendo el negro de siempre.
  assert.match(raiz, /--sf-base-t: 10 10 10/);
});

test("el pie de foto del destacado pinta sobre el fondo del tema, no sobre la fotografia", () => {
  // El degradado del pie sostiene la letra: si su tramo solido se corta antes de donde
  // empieza el texto, la letra queda sobre los pixeles de la foto. Con tema oscuro eso se
  // perdonaba (letra blanca sobre foto oscura); con tema claro la letra es casi negra y
  // desaparece. La rampa tiene que llegar casi opaca hasta el punto donde arranca el texto.
  const ramp = /--sf-grad-below: linear-gradient\(\s*0deg,[^;]*\)/.exec(css)?.[0];
  assert.ok(ramp, "no se encontro la rampa del pie de foto");
  const stops = [...ramp.matchAll(/\/\s*([\d.]+)\)\s+(\d+)%/g)].map((m) => ({ alpha: Number(m[1]), at: Number(m[2]) }));
  const solid = stops.find((s) => s.alpha >= 0.9);
  assert.ok(solid && solid.at >= 55, "el tramo casi solido debe llegar al menos al 55 % de la altura");
  // El texto arranca despues de ese borde: el padding superior del contenedor (56px) deja
  // el pie por debajo del 58 % en la tarjeta real, y el bloque cubre ~2/3 de la foto.
  assert.match(storefront, /className="absolute inset-x-0 bottom-0 sf-grad-below p-4 pt-14"/, "el pie de foto perdio su zona de difuminado");
});

test("el patron, las esquinas y el velo del cartel estan cableados en la hoja y la vitrina", () => {
  // De nada sirve que el motor produzca las variables si nadie las lee.
  assert.match(css, /\.sf-pattern \{[^}]*background-image: var\(--sf-pattern\)/, "la clase de patron no lee la variable");
  assert.match(css, /\.sf-banner-scrim \{[^}]*var\(--sf-scrim-top\)[^}]*var\(--sf-scrim-mid\)[^}]*var\(--sf-scrim-bottom\)/, "el velo del cartel sigue con alfa literales");
  assert.match(css, /--sf-shadow-accent: [^;]*var\(--sf-shadow-alpha\)/, "la sombra no sigue la profundidad elegida");
  assert.match(css, /\.sf-root :is\(\.rounded-xl[^)]*\) \{ border-radius: var\(--sf-radius-card\)/, "las tarjetas no leen el radio del tema");
  assert.match(css, /\.sf-root :is\(\.rounded-md, \.rounded-lg\) \{ border-radius: var\(--sf-radius-md\)/, "los controles no leen el radio del tema");
  // El cajon de pedido y el modal se apoyan al borde en escritorio: esa excepcion
  // responsiva tiene que seguir mandando sobre el radio del tema.
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.sf-root \.md\\:rounded-none \{ border-radius: 0; \}/, "la excepcion responsiva del cajon se perdio");
  // La raiz de la vitrina y de la previa tienen la clase que activa todo lo anterior.
  assert.match(storefront, /className="sf-root min-h-screen sf-bg-base sf-pattern/);
  assert.match(config, /"sf-root sf-bg-base sf-pattern sf-text-strong"/);
});

test("la tinta sobre un color solido es la que mas contraste da", () => {
  assert.equal(inkOn("#10b981"), "#0a0a0a", "verde vivo: letra oscura");
  assert.equal(inkOn("#0a0a0a"), "#ffffff");
  assert.equal(inkOn("no-es-hex"), "#ffffff", "sin dato util se conserva el blanco de siempre");
  // El contraste efectivo no puede quedar por debajo del umbral legible.
  const ratio = (a, b) => {
    const la = relativeLuminance(hexToRgb(a));
    const lb = relativeLuminance(hexToRgb(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  assert.ok(ratio("#10b981", inkOn("#10b981")) > 4.5);
  assert.equal(isDark(hexToRgb("#f8fafc")), false);
  assert.equal(isDark(hexToRgb("#0a0a0a")), true);
});

test("la vitrina se pinta con variables, no con colores literales de Tailwind", () => {
  assert.match(storefront, /style=\{storefrontStyleVars\(catalog\)\}/);
  assert.match(storefront, /import \{ buildStorefrontVars \} from "\.\/storefront-theme"/);
  // Los literales que fijaban el aspect
  const prohibidos = [
    /\bbg-neutral-\d/,
    /\btext-neutral-\d/,
    /\bborder-neutral-\d/,
    /\bbg-emerald-\d/,
    /\btext-emerald-\d/,
    /\bborder-emerald-\d/,
    /\bbg-rose-\d/,
    /\btext-rose-\d/,
    /\bborder-rose-\d/,
    /\btext-white\b/
  ];
  for (const patron of prohibidos) {
    assert.doesNotMatch(storefront, patron, `${patron} volvio a la vitrina: debe usar su clase sf-*`);
  }
  // Prohibicion generica por familia: la lista de arriba crecia a mano y dejo pasar
  // teal/sky/amber. Un literal de Tailwind en el markup gana por orden de hoja y el
  // comercio ve su boton del color equivocado, asi que ningun color fijo es valido.
  const literales = storefront.match(/\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|accent)-(?:neutral|zinc|gray|slate|emerald|rose|teal|sky|amber|violet|indigo|blue|green|red|orange|cyan|fuchsia|purple|pink|lime|yellow|stone)-\d{2,3}\b/g) || [];
  assert.deepEqual(literales, [], "colores literales de Tailwind en la vitrina: deben salir de las clases sf-*");
  // El negro literal queda solo donde es vela, no tema: los scrim de modal.
  const negros = storefront.match(/bg-black\/\d+/g) || [];
  assert.ok(negros.every((clase) => clase === "bg-black/70" || clase === "bg-black/75"), "solo los scrim pueden usar negro fijo");
});

test("toda clase sf-* del markup existe en la hoja de estilos", () => {
  // Deriva del markup, no de una lista a mano: una clase escrita y jamas definida se
  // pinta transparente y el error solo se ve en el navegador.
  const tokens = new Set();
  for (const source of [storefront, config]) {
    for (const match of source.matchAll(/(?<![-\w])(sf-[a-z0-9]+(?:-[a-z0-9]+)*)(?![-\w])/g)) {
      tokens.add(match[1]);
    }
  }
  assert.ok(tokens.size > 40, `se esperaban decenas de clases sf-*, hay ${tokens.size}`);
  // El markup usa prefijos escapados (hover:sf-...); la hoja declara ambas formas.
  const defined = (token) => css.includes(`.${token}`) || css.includes(`\\:${token}`);
  const faltantes = [...tokens].filter((token) => !defined(token));
  assert.deepEqual(faltantes, [], "clases sf-* usadas sin definicion en storefront.css");
});

test("los botones solidos usan la tinta del tema, nunca un blanco literal", () => {
  // `color: #fff` sobre un acento medio rinde ~2.2:1: el boton se ve pero no se lee.
  // La unica tinta valida sale de --sf-on-accent / --sf-on-promo.
  assert.doesNotMatch(css, /color:\s*#fff/i);
  assert.match(css, /\.sf-btn-accent[^{]*\{[^}]*color: var\(--sf-on-accent\)/);
  assert.match(css, /\.sf-btn-promo \{[^}]*color: var\(--sf-on-promo\)/);
  // Ningun color de marca puede quedar literal en la hoja: si el boton primario fuera
  // todavia esmeralda fijo, un comercio azul seguiria viendo botones verdes.
  assert.doesNotMatch(css, /rgb\(5 150 105\)/, "esmeralda-600 literal: debe salir de --sf-accent-t");
});

test("el catalogo publico trae el tema y la hoja de estilos de la vitrina", () => {
  assert.match(page, /import "\.\.\/storefront\.css"/);
  assert.match(page, /theme: StorefrontTheme/);
  // Un API desplegado antes del cambio responde sin tema: se pinta con el default.
  assert.match(page, /data\.theme = data\.theme \|\| DEFAULT_STOREFRONT_THEME/);
});

test("el cartel del tenant manda sobre el texto fijo", () => {
  assert.match(storefront, /catalog\.theme\.headline \|\| catalog\.tagline/);
  assert.match(storefront, /catalog\.theme\.subhead \|\|/);
  assert.match(storefront, /catalog\.theme\.banner_url/);
  assert.match(storefront, /className="sf-banner-img"/);
  assert.match(storefront, /sf-banner-scrim/);
});

test("el panel de configuracion edita el tema a traves de los endpoints del API", () => {
  assert.match(config, /\/api\/v1\/comercio\/settings\/storefront\/theme", \{\s*method: "PUT"/);
  assert.match(config, /\/api\/v1\/comercio\/settings\/storefront\/banner/);
  assert.match(config, /method: "DELETE"/);
  assert.match(config, /\/api\/v1\/comercio\/settings\/storefront\/generate-image/);
  // El banner se borra con confirmacion: es destructivo sobre un objeto del bucket.
  assert.match(config, /confirmRemoveBanner/);
  // La previa reutiliza el mismo motor que la vitrina.
  assert.match(config, /buildStorefrontVars\(\{ \.\.\.appearance, banner_url: bannerPreview \}\)/);
  // Sin permiso de escritura nada se toca.
  assert.match(config, /disabled=\{!access\.canWrite \|\| appearanceBusy\}/);
  // Los cinco modos viajan en el mismo PUT que los colores: si uno se queda fuera, el
  // comercio lo cambia en la previa, guarda y al refrescar lo pierde.
  for (const key of ["surface_tint", "surface_depth", "background_pattern", "corner_radius", "banner_scrim"]) {
    assert.match(config, new RegExp(`${key}: appearance\\.${key}`), `${key} no se guarda`);
  }
  // El panel muestra el contraste medido de la rampa derivada, no solo los tres hex.
  assert.match(config, /contrastRatioHex/, "la rampa de contraste del panel no mide nada");
  assert.match(config, /ContrastRamp/, "la previa no pinta la rampa de colores derivados");
  // El panel se organiza en pestanas: un solo scroll de 900 campos no es un panel profesional.
  assert.match(config, /role="tablist"/);
  assert.match(config, /type TabId = "negocio" \| "vitrina" \| "apariencia"/);
});

test("los presets cubren fondo claro y fondo oscuro", () => {
  // Si todos los presets fueran oscuros, la rama de tinta clara nunca se probaria a mano.
  const claros = APPEARANCE_PRESETS_SOURCE.filter((preset) => relativeLuminance(hexToRgb(preset.base)) >= 0.32);
  assert.ok(claros.length >= 2, "al menos dos paletas con fondo claro");
  assert.ok(APPEARANCE_PRESETS_SOURCE.length >= 4);
});

test("la prosa visible del panel escribe el español con sus tildes", () => {
  // El resto del producto (facturas-recibidas, pyg, gestion-comercial) tilda los textos que
  // ve el cliente. Un panel que dice "Configuracion" al lado del "Configuración" del resto
  // del dashboard se lee como borrador y nadie lo corrige despues: se fija aqui.
  // Los comentarios del repositorio se escriben sin tilde por convencion, así que se mira
  // solo la prosa: cadenas y nodos de texto con tres palabras o mas, nunca rutas ni clases.
  const sinComentarios = config.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const candidatas = [
    ...[...sinComentarios.matchAll(/"([^"\n]{6,300})"/g)].map((m) => m[1]),
    ...[...sinComentarios.matchAll(/>([^<>{}]\s?[^<>{\n]{5,300})</g)].map((m) => m[1])
  ].filter((s) => s.trim().split(/\s+/).length >= 3 && !/[=/@]|px-|text-|font-|grid-|rounded|border-|bg-|line-through|uppercase/.test(s));
  assert.ok(candidatas.length >= 40, "el panel no expuso suficientes frases para vigilar la ortografia");
  // Raiz sin tilde + sufijo: atrapa singular, plural y femenino sin escribirlos uno por uno.
  // Ojo con los que NO llevan tilde en plural (botones es correcto, boton no; imagen es
  // correcto, imagenes no): esa lista es la que hace que el guardado no marque falsos positivos.
  const sinTilde = /(configuracion|personalizacion|pagina|publica|promocion|campanas?|aplicacion|categoria|envio|numero|boton\b|titulo|cuadricula|reticula|linea|tecnico|catalogo|panaderia|cafe|minima|pestana|subtitulo|previsualizacion|tambien|aqui|ultimo|rapido|exito|informacion|descripcion|imagenes\b|direccion|podras|ademas|pais|codigo|ajustala|detras|calidos|cafeteria|envialo|ultima)(\b|es\b|s\b)/i;
  const ofensoras = candidatas.filter((s) => sinTilde.test(s));
  assert.deepEqual(ofensoras, [], `textos del panel sin tilde: ${JSON.stringify(ofensoras.slice(0, 6))}`);
  // El guardado no puede ser decorativo: si esta prueba no atrapara una falta escrita a
  // mano, el filtro de prosa esta mal y la ortografia del panel vuelve a irse sola.
  assert.match("Guarda la Configuracion de la pagina", sinTilde, "la prueba no detecta ni una falta conocida");
});