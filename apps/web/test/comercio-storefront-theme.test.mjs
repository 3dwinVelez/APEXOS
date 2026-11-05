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

import { buildStorefrontVars, DEFAULT_STOREFRONT_THEME, hexToRgb, inkOn, isDark, relativeLuminance } from "../components/comercio/storefront-theme.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

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
  assert.equal(vars["--sf-accent-t"], "16 185 129");
  assert.equal(vars["--sf-promo-t"], "225 29 72");
  // El acento sobre fondo oscuro se aclara para que el precio sea legible.
  assert.equal(vars["--sf-accent-text-t"], "64 199 154");
  assert.equal(vars["--sf-ink-strong-t"], "245 245 245");
  assert.equal(vars["--sf-ink-t"], "255 255 255");
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
  assert.equal(light["--sf-photo-accent-t"], "124 217 186", "el acento se aclara hacia blanco, no hacia negro");
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
});

test("los presets cubren fondo claro y fondo oscuro", () => {
  // Si todos los presets fueran oscuros, la rama de tinta clara nunca se probaria a mano.
  const claros = APPEARANCE_PRESETS_SOURCE.filter((preset) => relativeLuminance(hexToRgb(preset.base)) >= 0.32);
  assert.ok(claros.length >= 2, "al menos dos paletas con fondo claro");
  assert.ok(APPEARANCE_PRESETS_SOURCE.length >= 4);
});