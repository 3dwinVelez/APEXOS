import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const readSource = (relative) => read(relative).replace(/^\s*\/\/.*$/gm, "");
const chrome = readSource("../components/shell/DashboardChrome.tsx");
const expanded = read("../components/accounting/PygVehicleExpanded.tsx");
const expandedPage = read("../app/dashboard/contabilidad/pyg/ampliado/page.tsx");
const normalPage = read("../app/dashboard/contabilidad/pyg/page.tsx");
const helpers = read("../lib/pyg-expanded.ts");

test("el chrome arranca en checking idéntico en servidor y cliente", () => {
  assert.match(chrome, /useState<ChromeMode>\("checking"\)/);
  assert.match(chrome, /type ChromeMode = "checking" \| "standard" \| "marking_only"/);
  assert.match(chrome, /if \(mode === "checking"\)/);
  assert.doesNotMatch(chrome, /window\.location/);
  // El modo inicial no puede depender del almacenamiento ni del navegador en el primer render.
  assert.doesNotMatch(chrome, /useState<ChromeMode>\(\(\) =>/);
  assert.doesNotMatch(chrome, /useState<ChromeMode>\(isMarkingOnlyAccess\)/);
});

test("el modo expanded se deriva con usePathname de la ruta exacta ampliada", () => {
  assert.match(chrome, /import \{ usePathname \} from "next\/navigation"/);
  assert.match(chrome, /const pathname = usePathname\(\)/);
  assert.match(chrome, /const expanded = pathname === PYG_EXPANDED_PATH/);
  assert.match(chrome, /PYG_EXPANDED_PATH/);
  assert.doesNotMatch(chrome, /EXPANDED_VIEW_PREFIX/);
  assert.doesNotMatch(chrome, /pathname\.startsWith/);
});

// Delimita el bloque real `if (<condición>) { ... }` contando llaves, sin depender de
// comentarios ni del orden del texto que los rodea.
function ifBlock(source, condition) {
  const start = source.indexOf(`if (${condition}) {`);
  assert.ok(start >= 0, `no se encontró el bloque if (${condition})`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`el bloque if (${condition}) no cierra`);
}

test("el chrome ampliado conserva el guard de acceso y no monta el sidebar", () => {
  const expandedBranch = ifBlock(chrome, "expanded");
  assert.match(expandedBranch, /<RouteAccessGuard>\{children\}<\/RouteAccessGuard>/);
  assert.doesNotMatch(expandedBranch, /<Sidebar/);
  assert.match(expandedBranch, /apex-app-gradient min-h-screen/);
  // Orden real de las ramas: checking, marking_only y solo después expanded.
  const checking = chrome.indexOf('if (mode === "checking") {');
  const markingOnly = chrome.indexOf('if (mode === "marking_only") {');
  const expandedAt = chrome.indexOf("if (expanded) {");
  assert.ok(checking >= 0 && markingOnly > checking && expandedAt > markingOnly, "expanded se evalúa al final");
  assert.match(chrome, /const expanded = pathname === PYG_EXPANDED_PATH/);
});

test("el chrome conserva el perfil de marcaciones y la navegación estándar", () => {
  assert.match(chrome, /isMarkingOnlyAccess\(\)/);
  assert.match(chrome, /MARKING_ONLY_PROFILE/);
  const standard = chrome.slice(chrome.indexOf("if (mode === \"marking_only\")"));
  assert.match(standard, /<Sidebar \/>/);
  assert.match(standard, /<MobileNav \/>/);
});

test("la página ampliada normaliza la selección y valida el período en el servidor", () => {
  assert.match(expandedPage, /parsePyVehicleSelection\(rawPlate\)/);
  assert.match(expandedPage, /isPygPeriod\(rawPeriod\) \? rawPeriod : null/);
  assert.doesNotMatch(expandedPage, /normalizePyPlate/);
});

test("el enlace de la página normal es nativo y no usa BroadcastChannel ni window.open", () => {
  assert.doesNotMatch(normalPage, /BroadcastChannel/);
  assert.doesNotMatch(normalPage, /window\.open/);
  assert.doesNotMatch(normalPage, /watchPygExpandedOpen/);
  assert.match(normalPage, /target="_blank"/);
  assert.match(normalPage, /rel="noopener noreferrer"/);
  assert.match(normalPage, /Se abre en una pestaña o ventana nueva/);
});

test("la página normal no exporta ayudantes fuera del default de un page de Next", () => {
  const exports = normalPage.match(/^export (?!default)[^\n]*/gm) || [];
  assert.deepEqual(exports, []);
});

test("la vista ampliada no anuncia apertura ni depende de temporizadores", () => {
  assert.doesNotMatch(helpers, /BroadcastChannel/);
  assert.doesNotMatch(helpers, /setTimeout/);
  assert.doesNotMatch(expanded, /BroadcastChannel|announcePygExpandedOpen|setTimeout/);
});

test("volver al PYG usa la ruta normal en lugar de la ampliada", () => {
  assert.match(expanded, /href=\{pygBackHref\(\)\}/);
  assert.match(expanded, /pygBackHref/);
  assert.doesNotMatch(expanded, /href=\{shellHref/);
  assert.doesNotMatch(expanded, /href="\/dashboard\/contabilidad\/pyg"/);
});
