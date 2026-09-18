import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { asCollection, asRecord } from "../lib/api-collections.ts";

test("acepta colecciones directas y contratos envueltos usados por ventas", () => {
  const rows = [{ id: 1 }];

  assert.deepEqual(asCollection(rows), rows);
  assert.deepEqual(asCollection({ data: rows }), rows);
  assert.deepEqual(asCollection({ rows }), rows);
  assert.deepEqual(asCollection({ customers: rows }, ["customers"]), rows);
  assert.deepEqual(asCollection({ data: { invoices: rows } }, ["invoices"]), rows);
});

test("un contrato inesperado nunca llega como objeto a una llamada map", () => {
  assert.deepEqual(asCollection(undefined), []);
  assert.deepEqual(asCollection({ error: "forbidden" }, ["orders"]), []);
  assert.deepEqual(asCollection({ data: { total: 3 } }, ["items"]), []);
});

test("extrae recursos de detalle envueltos sin alterar objetos canonicos", () => {
  const invoice = { id: 7, lines: [] };
  assert.deepEqual(asRecord(invoice, ["invoice"]), invoice);
  assert.deepEqual(asRecord({ invoice }, ["invoice"]), invoice);
  assert.deepEqual(asRecord(null, ["invoice"]), {});
});

test("las pantallas de ventas normalizan respuestas antes de renderizar colecciones", () => {
  const pages = [
    "../app/dashboard/ventas/clientes/page.tsx",
    "../app/dashboard/ventas/ordenes/page.tsx",
    "../app/dashboard/ventas/ordenes/nueva/page.tsx",
    "../app/dashboard/ventas/facturas/page.tsx",
    "../app/dashboard/ventas/facturas/nueva/page.tsx",
    "../app/dashboard/ventas/facturas/[id]/page.tsx",
    "../app/dashboard/ventas/reportes/page.tsx"
  ];

  for (const page of pages) {
    const source = fs.readFileSync(new URL(page, import.meta.url), "utf8");
    assert.match(source, /asCollection/);
  }
});
