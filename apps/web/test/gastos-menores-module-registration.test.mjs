import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const modules = read("../lib/modules.ts");
const moduleAccess = read("../lib/moduleAccess.ts");
const nav = read("../components/gastos-menores-nav.tsx");

test("modules.ts registra Gastos Menores en el area Finanzas", () => {
  assert.match(modules, /slug: "gastos-menores"/);
  assert.match(modules, /name: "Gastos Menores"/);
  assert.match(modules, /area: "Finanzas"/);
  // Icono consistente con el resto del catalogo: reutiliza un icono de lucide-react.
  assert.match(modules, /Wallet,/);
  assert.match(modules, /icon: Wallet/);
});

test("moduleAccess replica el modulo en los tres mapas de permisos", () => {
  assert.match(moduleAccess, /"gastos-menores": "gastos_menores"/);
  assert.match(moduleAccess, /"gastos-menores": \["accounting"\]/);
  assert.match(moduleAccess, /"gastos-menores": \["gastos_menores", "contabilidad"\]/);
});

test("el modulo reutiliza permisos de contabilidad y no inventa un modulo propio", () => {
  // El backend requirePermission("accounting", ...) para todo /petty-cash: la UI
  // debe pedir exactamente ese modulo de permiso, jamas un "petty-cash" inventado.
  const permissionLine = /"gastos-menores": (\[[^\]]*\])/.exec(moduleAccess)?.[1] ?? "";
  assert.ok(permissionLine.length > 0, "gastos-menores debe estar en permissionModulesBySlug");
  assert.equal(permissionLine, '["accounting"]');
});

test("MODULES registra las acciones funcionales de Gastos Menores", () => {
  assert.match(modules, /nextActions: \["Configurar conceptos", "Crear caja menor", "Registrar gasto"\]/);
});

test("las rutas publicadas por Gastos Menores responden a paginas reales", () => {
  for (const href of [
    "/dashboard/gastos-menores/conceptos",
    "/dashboard/gastos-menores/cajas",
    "/dashboard/gastos-menores/anticipos",
    "/dashboard/gastos-menores/gastos",
    "/dashboard/gastos-menores/gastos/nuevo",
    "/dashboard/gastos-menores/reportes"
  ]) {
    assert.ok(fs.existsSync(path.resolve(directory, `../app${href}/page.tsx`)), `${href} debe tener page.tsx`);
  }
});

test("las paginas del modulo existen en el dashboard", () => {
  for (const route of [
    "/dashboard/gastos-menores",
    "/dashboard/gastos-menores/conceptos",
    "/dashboard/gastos-menores/cajas",
    "/dashboard/gastos-menores/anticipos",
    "/dashboard/gastos-menores/gastos",
    "/dashboard/gastos-menores/gastos/nuevo",
    "/dashboard/gastos-menores/reportes"
  ]) {
    const file = path.resolve(directory, `../app${route}/page.tsx`);
    assert.ok(fs.existsSync(file), `${route} debe tener page.tsx`);
  }
});

test("la navegacion publica todas las secciones del modulo", () => {
  assert.match(nav, /\{ href: "\/dashboard\/gastos-menores\/anticipos", label: "Anticipos" \}/);
  assert.match(nav, /\{ href: "\/dashboard\/gastos-menores\/gastos", label: "Gastos" \}/);
  assert.match(nav, /\{ href: "\/dashboard\/gastos-menores\/gastos\/nuevo", label: "Digitar gastos" \}/);
  assert.match(nav, /\{ href: "\/dashboard\/gastos-menores\/reportes", label: "Reportes" \}/);
  assert.match(nav, /const active = pathname === item\.href;/);
});
