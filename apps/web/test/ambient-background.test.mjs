import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ambientBlock = () => {
  const css = read("app/globals.css");
  const start = css.indexOf("/* ===== Fondo ambiente");
  assert.ok(start >= 0, "falta el bloque del fondo ambiente en globals.css");
  const end = css.indexOf("@media print", start);
  return css.slice(start, end === -1 ? undefined : end);
};

test("el fondo ambiente se monta una vez en el layout y queda fuera del árbol accesible", () => {
  const layout = read("app/layout.tsx");
  assert.equal((layout.match(/className="apex-ambient"/g) || []).length, 1);
  assert.match(layout, /aria-hidden="true"/);
  assert.match(layout, /apex-ambient-drift/);
  assert.match(layout, /apex-ambient-grain/);
});

test("el ambiente trabaja detrás del contenido y no intercepta punteros", () => {
  const css = ambientBlock();
  assert.match(css, /\.apex-ambient \{[^}]*position: fixed;/s);
  assert.match(css, /\.apex-ambient \{[^}]*z-index: -1;/s);
  assert.match(css, /\.apex-ambient \{[^}]*pointer-events: none;/s);
  assert.match(read("app/globals.css"), /body \{[^}]*isolation: isolate;/s);
});

test("claro y oscuro tienen intensidades propias sobre la misma paleta", () => {
  const css = read("app/globals.css");
  const alphas = (block) => [...block.matchAll(/--ambient-alpha-[abc]:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const lightRoot = css.slice(css.indexOf(":root {"), css.indexOf("html[data-font-scale"));
  const darkRoot = css.slice(css.indexOf("html.dark {"), css.indexOf("* {"));
  assert.equal(alphas(lightRoot).length, 3);
  assert.equal(alphas(darkRoot).length, 3);
  assert.notDeepEqual(alphas(lightRoot), alphas(darkRoot));
  assert.match(css, /--ambient-glow-a: 8 205 187/);
  assert.match(css, /--ambient-glow-b: 0 108 112/);
  assert.match(css, /--ambient-glow-c: 13 148 136/);
});

test("el marco de la app deja ver el ambiente en los dos temas", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.apex-app-gradient \{[^}]*background: transparent;/s);
  const darkSurfaces = css.match(/html\.dark \.apex-section-card,[\s\S]*?\}/);
  assert.ok(darkSurfaces, "falta el bloque de superficies oscuras");
  assert.doesNotMatch(darkSurfaces[0], /apex-app-gradient/, "el marco oscuro no debe repintar una superficie opaca");
  const chrome = read("components/shell/DashboardChrome.tsx");
  assert.doesNotMatch(chrome, /min-h-screen bg-paper/, "los marcos del panel pintan el papel ellos mismos y tapan el ambiente");
});

test("el grano viaja inline y la capa no hace peticiones de red", () => {
  const css = ambientBlock();
  assert.match(css, /background-image: url\("data:image\/svg\+xml,/);
  assert.match(css, /background-size: 160px 160px/);
  assert.doesNotMatch(css, /url\(\s*["']?https?:/);
});

test("la deriva es compositiva, solo en escritorio y se detiene con movimiento reducido", () => {
  const css = ambientBlock();
  const driftStart = css.indexOf(".apex-ambient-drift {");
  const drift = css.slice(driftStart, css.indexOf("}", driftStart));
  assert.match(css, /\.apex-ambient-drift,\s*\.apex-ambient-grain \{[^}]*position: absolute;/s);
  assert.doesNotMatch(drift, /\b(left|top|width|height)\s*:/);
  assert.match(css, /@keyframes apex-ambient-drift \{\s*from \{ transform: translate3d/, "la animación debe mover solo transform");
  assert.match(css, /@media \(min-width: 1024px\) and \(prefers-reduced-motion: no-preference\)/);
  assert.match(read("app/globals.css"), /\.apex-backdrop-enter,\s*\.apex-ambient-drift \{\s*animation: none !important;/, "movimiento reducido debe apagar la deriva en el bloque compartido");
  assert.match(css, /html\[data-reduced-motion="true"\] \.apex-ambient-drift \{\s*animation: none;/);
});

test("alto contraste e impresión se quedan sin ambiente", () => {
  const css = read("app/globals.css");
  assert.match(css, /html\[data-contrast="high"\] \.apex-ambient \{\s*display: none;/);
  assert.match(css, /@media print \{\s*\.apex-ambient \{ display: none; \}/);
});

test("las intensidades del ambiente quedan fijadas por tema", () => {
  const css = read("app/globals.css");
  const alphas = (block) => [...block.matchAll(/--ambient-alpha-[abc]:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const grain = (block) => Number(block.match(/--ambient-grain:\s*([\d.]+)/)[1]);
  const lightRoot = css.slice(css.indexOf(":root {"), css.indexOf("html[data-font-scale"));
  const darkRoot = css.slice(css.indexOf("html.dark {"), css.indexOf("* {"));
  assert.deepEqual(alphas(lightRoot), [0.12, 0.09, 0.06]);
  assert.deepEqual(alphas(darkRoot), [0.13, 0.22, 0.13], "el oscuro alza las luces para que los huecos respiren");
  assert.equal(grain(lightRoot), 0.04, "el grano claro sube a 0.04 para no perder textura en blanco");
  assert.equal(grain(darkRoot), 0.06);
});

const ruleBlock = (css, selector, fromIndex = 0) => {
  const start = css.indexOf(selector, fromIndex);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(start, close);
};

test("el marco del tema oscuro gana oficio sin mover layout", () => {
  const css = read("app/globals.css");
  assert.match(read("components/shell/Sidebar.tsx"), /apex-chrome-sidebar/, "el costado lleva su clase marcadora");
  assert.match(read("components/shell/DashboardChrome.tsx"), /apex-chrome-topbar/, "la barra superior lleva su clase marcadora");

  const sidebar = ruleBlock(css, "html.dark aside.apex-chrome-sidebar");
  assert.ok(sidebar, "falta la regla del costado oscuro");
  assert.match(sidebar, /linear-gradient\(180deg/);
  assert.match(sidebar, /border-right-color: rgb\(45 212 191 \/ 0\.14\)/);

  const header = ruleBlock(css, "html.dark header.apex-chrome-topbar");
  assert.ok(header, "falta la regla de la barra superior real");
  assert.match(header, /background: rgb\(20 32 41 \/ 0\.94\)/);

  const toolbar = ruleBlock(css, "html.dark main > .apex-chrome-topbar");
  assert.ok(toolbar, "falta la regla de la barra de herramientas del panel");
  assert.match(toolbar, /border-bottom: 1px solid rgb\(45 212 191 \/ 0\.1\)/);

  const card = ruleBlock(css, "html.dark .apex-section-card {", css.indexOf("html.dark .apex-section-card,"));
  assert.ok(card, "falta la regla de oficio de las tarjetas de sección");
  assert.match(card, /box-shadow: 0 0 0 1px rgb\(45 212 191/);
  assert.doesNotMatch(card, /\b(width|height|margin|padding|border-width)\s*:/, "el oficio de las tarjetas no puede mover la caja");

  const baseCard = ruleBlock(css, ".apex-section-card {");
  assert.match(baseCard, /box-shadow: 0 1px 2px/, "la tarjeta base gana sombra suave en los dos temas");

  const flatContrast = ruleBlock(css, "html.dark[data-contrast=\"high\"] aside.apex-chrome-sidebar");
  assert.ok(flatContrast, "el alto contraste restaura superficies planas");
  assert.match(css, /html\[data-contrast="high"\] \.apex-section-card \{\s*box-shadow: none !important;/);
});
