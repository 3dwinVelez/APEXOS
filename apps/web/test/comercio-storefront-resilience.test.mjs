import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const page = read("../app/tienda/[code]/page.tsx");
const dashboard = read("../app/dashboard/comercio/page.tsx");

test("la vitrina es un componente de servidor por peticion", () => {
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /import Storefront from "@\/components\/comercio\/storefront"/);
});

test("la vitrina conserva el ultimo catalogo bueno para sobrevivir reinicios del API", () => {
  // Un reinicio del API no puede dejar al cliente con una pantalla de error.
  assert.match(page, /const catalogFallback = new Map<string, \{ at: number; data: PublicCatalog \}>\(\)/);
  assert.match(page, /const FALLBACK_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(page, /Date\.now\(\) - cached\.at < FALLBACK_TTL_MS/);
  assert.match(page, /if \(!response\.ok\) return fallback \? \{ status: "ok", data: fallback \}/);
  assert.match(page, /catalogFallback\.set\(code, \{ at: Date\.now\(\), data \}\)/);
});

test("una tienda desactivada no se enmascara con el catalogo guardado", () => {
  const body = /async function fetchCatalog[\s\S]*?\n\}/.exec(page)?.[0] ?? "";
  const closed = /if \(response\.status === 404\) \{[\s\S]*?return \{ status: "closed" \};/.exec(body)?.[0] ?? "";
  assert.match(closed, /catalogFallback\.delete\(code\)/);
  assert.doesNotMatch(closed, /fallback/);
});

test("sin catalogo guardado el error sigue siendo visible", () => {
  assert.match(page, /No fue posible cargar la tienda/);
  assert.match(page, /result\.status === "unavailable" \|\| !result\.data/);
});

test("el ranking del panel no repite claves cuando dos productos comparten nombre", () => {
  // top_products agrupa por producto, no por nombre: dos productos distintos pueden
  // llamarse igual y romper la lista con claves duplicadas.
  assert.match(dashboard, /key=\{product\.product_id \?\? `\$\{product\.product_name\}-\$\{index\}`\}/);
});
