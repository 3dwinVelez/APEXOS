process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const service = require("../src/modules/purchases/service");
const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/routes.js"), "utf8");
const schema = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/schema.js"), "utf8");
const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/compras/ordenes/nueva/page.tsx"), "utf8");

test("el cierre calcula únicamente el saldo pendiente y conserva lo recibido", () => {
  assert.deepEqual(service.purchaseOrderClosureState(
    [{ qty: 10 }, { qty: 5 }],
    [{ type: "in", qty: 7 }, { type: "in", qty: 2 }, { type: "out", qty: 1 }]
  ), { orderedQuantity: 15, receivedQuantity: 8, pendingQuantity: 7 });
  assert.equal(service.purchaseOrderClosureState([{ qty: 4 }], [{ type: "in", qty: 4 }]).pendingQuantity, 0);
});

test("el contrato exige motivo y solo expone el cierre cuando existe saldo", () => {
  assert.match(routes, /\/purchases\/orders\/:id\/close/);
  assert.match(schema, /closePurchaseOrderSchema/);
  assert.match(schema, /minLength: 3/);
  assert.match(page, /\["confirmed", "partial"\]\.includes\(selectedOrder\.status\)/);
  assert.match(page, /Number\(selectedOrder\.pending_quantity\) > 0/);
  assert.match(page, /Cerrar saldo pendiente/);
});

test("el PDF de la OC contiene cabecera, bodega, posiciones y totales", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../web/lib/purchaseOrderPdf.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, TextEncoder, Blob, URL, document: {} });
  const bytes = module.exports.buildPurchaseOrderPdf({
    number: "PO-000011", status: "partial", created_at: "2026-08-12T14:00:00Z", due_date: "2026-08-20", currency: "COP",
    subtotal: 200000, tax_total: 0, total: 200000, notes: "Entrega coordinada",
    company: { name: "Empresa de prueba", tax_id: "900000000", country: "CO", society_code: "SOC-01", society_name: "Sociedad Colombia" },
    warehouse: { code: "BP01", name: "Bodega principal", address: "Calle 1", city: "Bogota", country: "CO" },
    party: { name: "Proveedor Uno", tax_id: "800000000" }, created_by_user: { name: "Usuario Compras" },
    lines: [{ position: 1, sku: "SKU-01", description: "Producto de prueba", unit: "UND", qty: 10, received_quantity: 4, pending_quantity: 6, unit_cost: 20000, total: 200000 }]
  });
  const pdf = Buffer.from(bytes).toString("latin1");
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /Empresa de prueba/);
  assert.match(pdf, /Empresa compradora/i);
  assert.match(pdf, /Sociedad Colombia/);
  assert.match(pdf, /Bodega principal/);
  assert.match(pdf, /SKU-01/);
  assert.match(pdf, /TOTAL ORDEN/);
  assert.doesNotMatch(pdf, /Sucursal/);
});
