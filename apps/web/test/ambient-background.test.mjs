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
