import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const dashboardRoot = path.join(root, "app/dashboard");

// Rutas estaticas reales del dashboard. Se excluyen la raiz, la redireccion de
// configuracion y el alias de mallas (reexport de rutas), que no son destinos propios.
const ALIASES = new Set(["/dashboard/configuracion", "/dashboard/talento-humano/mallas"]);
const staticRoutes = fs.readdirSync(dashboardRoot, { recursive: true })
  .map((entry) => String(entry).replace(/\\/g, "/"))
  .filter((entry) => entry.endsWith("/page.tsx") || entry === "page.tsx")
  .map((entry) => `/dashboard${entry === "page.tsx" ? "" : `/${entry.replace(/\/page\.tsx$/, "")}`}`)
  .filter((route) => !route.includes("[") && route !== "/dashboard" && !ALIASES.has(route));

const functionsSource = read("lib/moduleFunctions.ts");
const modulesSource = read("lib/modules.ts");
const paletteSource = read("components/system/CommandPalette.tsx");
const actionsSource = read("lib/operationalWorkspace.ts");

const functionEntries = functionsSource.split("\n")
  .filter((line) => /^\s*\{ id: "fn-/.test(line))
  .map((line) => ({
    id: line.match(/id: "([^"]+)"/)?.[1],
    label: line.match(/label: "([^"]+)"/)?.[1],
    href: line.match(/href: "([^"]+)"/)?.[1],
    module: line.match(/module: "([^"]+)"/)?.[1],
    keywords: line.match(/keywords: "([^"]*)"/)?.[1] || ""
  }));

const moduleSlugs = [...modulesSource.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
const actionHrefs = [...actionsSource.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);

test("el registro de funciones cubre todas las rutas del dashboard", () => {
  assert.ok(staticRoutes.length >= 80, `el inventario de rutas solo encontro ${staticRoutes.length} destinos`);
  const covered = new Set([
    ...moduleSlugs.map((slug) => `/dashboard/${slug}`),
    ...actionHrefs,
    ...functionEntries.map((entry) => entry.href)
  ]);
  const uncovered = staticRoutes.filter((route) => !covered.has(route));
  assert.deepEqual(uncovered, [], `rutas sin acceso desde el centro de comandos: ${uncovered.join(", ")}`);
});

test("cada funcion del registro apunta a una ruta estatica existente", () => {
  const routes = new Set(staticRoutes);
  const invalid = functionEntries.filter((entry) => !routes.has(entry.href));
  assert.deepEqual(invalid.map((entry) => `${entry.label} -> ${entry.href}`), []);
  const duplicated = functionEntries.map((entry) => entry.href).filter((href, index, all) => all.indexOf(href) !== index);
  assert.deepEqual(duplicated, []);
});

test("cada funcion declara modulo habilitable, etiqueta y palabras clave", () => {
  assert.ok(functionEntries.length >= 60, `el registro solo tiene ${functionEntries.length} funciones`);
  for (const entry of functionEntries) {
    assert.ok(entry.id && entry.label && entry.href && entry.module, `entrada incompleta: ${JSON.stringify(entry)}`);
    assert.ok(moduleSlugs.includes(entry.module), `modulo desconocido en ${entry.id}: ${entry.module}`);
    assert.ok(entry.keywords.trim().split(/\s+/).length >= 3, `palabras clave insuficientes en ${entry.id}`);
  }
});

test("el buscador ofrece las funciones clave del modulo de talento humano", () => {
  const byLabel = new Map(functionEntries.map((entry) => [entry.label, entry]));
  assert.equal(byLabel.get("Crear mallas")?.href, "/dashboard/talento-humano/rutas");
  assert.equal(byLabel.get("Ver monitor de mallas")?.href, "/dashboard/talento-humano/mapa");
  assert.match(byLabel.get("Ver monitor de mallas")?.keywords || "", /marcacion/);
});

test("los alias excluidos si son redirecciones y no destinos propios", () => {
  assert.match(read("app/dashboard/configuracion/page.tsx"), /redirect\("\/dashboard\/administracion"\)/);
  assert.match(read("app/dashboard/talento-humano/mallas/page.tsx"), /export \{ default \} from "\.\.\/rutas\/page"/);
});

test("la paleta une acciones, funciones y modulos sin duplicar destinos", () => {
  assert.match(paletteSource, /MODULE_FUNCTIONS/);
  assert.match(paletteSource, /MODULES_BY_SLUG/);
  assert.match(paletteSource, /moduleHome\(/);
  assert.match(paletteSource, /const taken = new Set\(\[\.\.\.actions, \.\.\.functions\]\.map\(\(item\) => item\.href\)\)/);
  assert.match(paletteSource, /MODULES\.filter\(\(module\) => enabled\(module\.slug\) && !taken\.has\(moduleHome\(module\.slug\)\)\)/);
  assert.match(functionsSource, /cxc: "\/dashboard\/cxc\/documentos"/);
});

test("la busqueda ignora acentos y prioriza coincidencias de etiqueta", () => {
  assert.match(paletteSource, /normalize\("NFD"\)\.replace\(\/\[\\u0300-\\u036f\]\/g, ""\)/);
  assert.match(paletteSource, /function relevance\(item: CommandItem, term: string\)/);
  assert.match(paletteSource, /return a\.index - b\.index|b\.score - a\.score/);
});

test("los comandos recientes se persisten y se ofrecen al abrir sin busqueda", () => {
  assert.match(paletteSource, /RECENT_KEY = "apex_recent_commands_v1"/);
  assert.match(paletteSource, /setRecentIds\(readRecentIds\(\)\)/);
  assert.match(paletteSource, /localStorage\.setItem\(RECENT_KEY, JSON\.stringify\(\[item\.id, \.\.\.readRecentIds\(\)\.filter\(\(id\) => id !== item\.id\)\]\.slice\(0, 6\)\)\)/);
  assert.match(paletteSource, /if \(!term\) \{/);
});

test("la paleta conserva atajo global, accesibilidad y modulos habilitados", () => {
  assert.match(paletteSource, /Control\+K Meta\+K/);
  assert.match(paletteSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(paletteSource, /OPERATIONAL_ACTIONS/);
  assert.match(paletteSource, /access\.bySlug\[slug\] === true/);
  assert.match(paletteSource, /loadModuleAccess\(MODULES\)/);
  assert.match(paletteSource, /isSupabaseSession/);
  assert.match(paletteSource, /router\.push/);
  assert.match(paletteSource, /role="combobox"/);
  assert.match(paletteSource, /role="listbox"/);
  assert.match(paletteSource, /aria-activedescendant/);
  assert.match(paletteSource, /aria-labelledby="apex-command-title"/);
  assert.match(paletteSource, /trigger\.current\?\.focus\(\)/);
  assert.match(paletteSource, /document\.body\.style\.overflow = "hidden"/);
});
