process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/compras/ordenes/nueva/page.tsx"), "utf8");
const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/routes.js"), "utf8");
const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/service.js"), "utf8");

test("la orden inicia con diez posiciones y permite escribir o buscar SKU", () => {
  assert.match(page, /blankLines\(form\.expected_at\)/);
  assert.match(page, /count = 10/);
  assert.match(page, /list="purchase-order-skus"/);
  assert.match(page, /function updateSku/);
  assert.match(page, /Escribe o Enter para buscar/);
  assert.match(page, /handleSkuEnter/);
  assert.match(page, /El SKU \$\{code\} no existe/);
  assert.match(page, /Buscar SKU para la posición/);
  assert.match(page, /Buscar por código, nombre o clasificación ABC/);
});

test("la orden excluye filas vacias y no captura IVA por posicion", () => {
  assert.match(page, /activeLines\.map/);
  assert.match(page, /tax_rate: 0/);
  assert.doesNotMatch(page, /<TaxSelect/);
  assert.doesNotMatch(page, />Imp\.</);
});

test("el panel de ordenes no ofrece recepcion WMS", () => {
  assert.doesNotMatch(page, /Recepcion WMS/);
  assert.doesNotMatch(page, /createReceipt/);
});

test("los borradores se pueden abrir y guardar sobre la misma orden", () => {
  assert.match(page, /Editar borrador/);
  assert.match(page, /onDoubleClick=\{\(\) => order\.status === "draft" && editOrder\(order\)\}/);
  assert.match(page, /editingOrder \? `\/api\/v1\/purchases\/orders\/\$\{editingOrder\.id\}`/);
  assert.match(page, /method: editingOrder \? "PUT" : "POST"/);
  assert.match(page, /Guardar cambios/);
  assert.match(routes, /fastify\.put\("\/purchases\/orders\/:id"/);
  assert.match(service, /current\.status !== "draft"/);
  assert.match(service, /ORDER_NOT_DRAFT/);
  assert.doesNotMatch(service, /transactionLine\.deleteMany/);
  assert.match(service, /lines: \{ deleteMany: \{\}, create: processedLines \}/);
});
