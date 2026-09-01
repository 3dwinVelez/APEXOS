import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const editor = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/StandaloneCommercialDocumentEditor.tsx", import.meta.url), "utf8");
const orders = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/pedidos/page.tsx", import.meta.url), "utf8");
const quotations = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/cotizaciones/page.tsx", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../../api/src/modules/commercial-management/schema.js", import.meta.url), "utf8");
const visits = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/VisitOperationsPanel.tsx", import.meta.url), "utf8");
const agenda = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/agenda/page.tsx", import.meta.url), "utf8");

test("cotizaciones y pedidos se pueden crear desde sus listados sin visita", () => {
  assert.match(orders, /Nuevo pedido/);
  assert.match(orders, /kind="order"/);
  assert.match(quotations, /Nueva cotización/);
  assert.match(quotations, /kind="quotation"/);
  assert.doesNotMatch(editor, /visit_id/);
  assert.match(editor, /optional=\{false\}/);
});

test("la cancelación del pedido está restringida y exige justificación", () => {
  assert.match(orders, /\["REGISTERED", "CONFIRMED"\]\.includes\(order\.status\)/);
  assert.match(orders, /Motivo de cancelación \(obligatorio\)/);
  assert.match(orders, /status: "CANCELLED", reason: reason\.trim\(\)/);
  assert.match(schema, /status: \{ const: "CANCELLED" \}/);
  assert.match(schema, /then: \{ required: \["reason"\] \}/);
});

test("los listados principales ofrecen tarjetas móviles y acciones de un clic", () => {
  for (const source of [orders, quotations, visits]) {
    assert.match(source, /md:hidden/);
    assert.match(source, /hidden overflow-x-auto md:block/);
    assert.doesNotMatch(source, /onDoubleClick/);
  }
  assert.match(orders, /Consultando pedidos/);
  assert.match(quotations, /Consultando cotizaciones/);
  assert.match(visits, /Consultando visitas/);
});

test("agenda y formularios priorizan el uso móvil sin reducir el escritorio", () => {
  assert.match(agenda, /matchMedia\("\(max-width: 639px\)"\)/);
  assert.match(agenda, /setView\("day"\)/);
  assert.match(agenda, /role="dialog"/);
  assert.match(editor, /md:hidden/);
  assert.match(editor, /sticky bottom-0/);
  assert.match(editor, /event\.key !== "Escape"/);
});
