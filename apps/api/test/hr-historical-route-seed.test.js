const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../scripts/seed-scj-hr-historical-route-qa.js"), "utf8");

test("el poblador historico esta limitado a Supabase QA y SCJ", () => {
  assert.match(source, /CERTIFICATION_TARGET/);
  assert.match(source, /jbirkghkekuifgfsgquq/);
  assert.match(source, /cbbf3627-4336-4f23-95c6-1077414bcd17/);
  assert.match(source, /juliana@apexos\.local/);
});

test("el escenario historico enlaza cuatro marcas, huella GPS y jornada", () => {
  for (const type of ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"]) assert.match(source, new RegExp(type));
  assert.match(source, /gpsPing\.createMany/);
  assert.match(source, /workSession\.create/);
  assert.match(source, /route_id: route\.id/);
});

test("el poblador es idempotente y no elimina datos operativos", () => {
  assert.match(source, /if \(existing\)/);
  assert.doesNotMatch(source, /deleteMany|delete\(/);
});
