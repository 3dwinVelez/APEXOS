import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "../app/dashboard/reportes/apex-heart/page.tsx"), "utf8");

test("Apex Heart abre vistas analíticas enlazadas por URL", () => {
  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("view"\)/);
  assert.match(source, /viewsForRouting\.includes/);
});

test("el análisis de producto permite drill-down al registro operativo", () => {
  assert.match(source, /\/dashboard\/inventario\/productos\/\$\{p\.item_id\}/);
  assert.match(source, /abrir su detalle operativo/);
});
