import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

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

function formatUtcDateSource() {
  const start = page.indexOf("function formatUtcDate");
  assert.notEqual(start, -1, "falta el helper formatUtcDate en la pagina");
  const open = page.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < page.length; index += 1) {
    if (page[index] === "{") depth += 1;
    else if (page[index] === "}") {
      depth -= 1;
      if (depth === 0) return page.slice(start, index + 1).replace(/: string/g, "");
    }
  }
  throw new Error("formatUtcDate sin cierre");
}

function loadFormatUtcDate() {
  return vm.runInNewContext(`${formatUtcDateSource()}; formatUtcDate`);
}

test("la fecha de corte se muestra por calendario UTC sin corrimiento", () => {
  assert.match(page, /formatUtcDate\(preview\.posting_date\)/);
  assert.doesNotMatch(page, /toLocaleDateString\("es-CO"\)/);
  const formatUtcDate = loadFormatUtcDate();
  assert.equal(formatUtcDate("2025-12-31T00:00:00.000Z"), "31/12/2025");
  assert.equal(formatUtcDate("2025-01-01T00:00:00.000Z"), "01/01/2025");
  assert.equal(formatUtcDate("no-es-fecha"), "--");
});

test("la fecha de corte no cambia en zonas horarias distintas", () => {
  const body = `${formatUtcDateSource()}; formatUtcDate`;
  const script = `const vm = require("node:vm"); const formatUtcDate = vm.runInNewContext(${JSON.stringify(body)}); if (formatUtcDate("2025-12-31T00:00:00.000Z") !== "31/12/2025") process.exit(1); process.stdout.write("ok");`;
  for (const timeZone of ["America/Bogota", "Asia/Tokyo", "UTC"]) {
    const output = execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: timeZone }, encoding: "utf8" });
    assert.equal(output, "ok", `fecha incorrecta en ${timeZone}`);
  }
});
