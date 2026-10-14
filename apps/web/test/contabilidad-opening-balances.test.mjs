import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");
const page = read("../app/dashboard/contabilidad/importar-saldos-iniciales/page.tsx");

test("contabilidad publica la ruta real de importacion de saldos iniciales", () => {
  assert.ok(fs.existsSync(path.resolve(directory, "../app/dashboard/contabilidad/importar-saldos-iniciales/page.tsx")));
  assert.match(page, /opening-balances\/template/);
  assert.match(page, /opening-balances\/validate/);
  assert.match(page, /opening-balances"/);
  assert.match(page, /Descargar Excel/);
});

test("la previsualizacion queda invalidada al cambiar el Excel y no se duplica la confirmacion", () => {
  assert.match(page, /setPreview\(null\); setPosted\(null\);/);
  assert.match(page, /if \(!preview \|\| busy\) return;/);
  assert.match(page, /disabled=\{!preview \|\| busy\}/);
});
