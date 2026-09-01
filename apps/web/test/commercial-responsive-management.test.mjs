import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const masters = read("../app/dashboard/gestion-comercial/maestros/page.tsx");
const budgets = read("../app/dashboard/gestion-comercial/presupuestos/page.tsx");
const reports = read("../app/dashboard/gestion-comercial/reportes/page.tsx");
const comparison = read("../app/dashboard/gestion-comercial/reportes/cotizado-vs-pedido/page.tsx");

test("maestros mantiene tabla de escritorio y tarjetas operables en móvil", () => {
  assert.match(masters, /md:hidden/);
  assert.match(masters, /Modificar|Editar/);
  assert.match(masters, /Inactivar/);
  assert.match(masters, /document\.body\.style\.overflow = "hidden"/);
});

test("presupuestos muestra configuración y ejecución como tarjetas móviles", () => {
  assert.match(budgets, /hidden overflow-x-auto md:block/);
  assert.match(budgets, /mobile-report-/);
  assert.match(budgets, /Modificar presupuesto/);
  assert.match(budgets, /role="dialog"/);
});

test("reportes gerenciales conservan tabla de escritorio y resumen móvil", () => {
  for (const source of [reports, comparison]) {
    assert.match(source, /hidden overflow-x-auto md:block/);
    assert.match(source, /space-y-3 md:hidden/);
  }
  assert.match(reports, /Sin resultado/);
  assert.match(comparison, /Valor cotizado/);
  assert.match(comparison, /Valor pedido/);
});
