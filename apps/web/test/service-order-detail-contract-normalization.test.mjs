import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/servicios/[id]/page.tsx", import.meta.url), "utf8");

test("normaliza colecciones antes de seleccionar solicitudes en el detalle", () => {
  assert.match(source, /function normalizeOrder\(order: ServiceOrder\)/);
  assert.match(source, /const data = normalizeOrder\(response\);/);
  assert.match(source, /const items = asCollection<ServiceOrderItem>\(order\.items\)/);
});

test("la encuesta tolera contratos vacios o envueltos", () => {
  assert.match(source, /api<unknown>\("\/api\/v1\/services\/satisfaction-questions"\)/);
  assert.match(source, /const questions = asCollection<SatisfactionQuestion>\(response\);/);
});
