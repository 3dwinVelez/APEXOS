import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("la navegación global ofrece salto al contenido y anuncios de ruta", () => {
  const accessibility = read("components/shell/NavigationAccessibility.tsx");
  const chrome = read("components/shell/DashboardChrome.tsx");
  const layout = read("app/layout.tsx");
  assert.match(accessibility, /Saltar al contenido principal/);
  assert.match(accessibility, /aria-live="polite"/);
  assert.match(accessibility, /Página cargada:/);
  assert.match(chrome, /id="apex-main-content"/);
  assert.match(chrome, /tabIndex=\{-1\}/);
  assert.ok(layout.indexOf("<NavigationAccessibility />") < layout.indexOf("<SessionLifecycle />"));
});

test("las transiciones de página y diálogo respetan movimiento reducido", () => {
  const styles = read("app/globals.css");
  const pageTransition = read("components/shell/PageTransition.tsx");
  assert.match(pageTransition, /apex-page-enter/);
  assert.match(styles, /@keyframes apexPageEnter/);
  assert.match(styles, /@keyframes apexDialogEnter/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.apex-page-enter,[\s\S]*animation: none !important/);
  assert.match(styles, /\.apex-interactive:hover,[\s\S]*transform: none !important/);
});

test("la paleta expone combobox, listbox y devuelve el foco al cerrarse", () => {
  const source = read("components/system/CommandPalette.tsx");
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /aria-labelledby="apex-command-title"/);
  assert.match(source, /trigger\.current\?\.focus\(\)/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
});
