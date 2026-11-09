const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { TENANT_MODELS } = require("../src/core/tenantModels");

test("los traslados y sus lineas reciben tenant_id mediante el middleware Prisma", () => {
  // El filtro ya no es una lista escrita en prisma.js: se deriva del schema. La
  // prueba mira el conjunto real y conserva el anclaje al middleware.
  assert.ok(TENANT_MODELS.has("WarehouseTransfer"));
  assert.ok(TENANT_MODELS.has("WarehouseTransferLine"));
});

test("la bodega de consignacion persiste y presenta el cliente enlazado", () => {
  const source = fs.readFileSync(path.join(root, "src/modules/inventory/service.js"), "utf8");
  assert.match(source, /CONSIGNMENT_CUSTOMER_REQUIRED/);
  assert.match(source, /consignment_customer_id:\s*consignmentCustomerId \|\| null/);
  assert.match(source, /consignment_customer_name:/);
});

test("ajustes y posiciones reciben tenant_id y filtro multiempresa del middleware", () => {
  const source = fs.readFileSync(path.join(root, "src/core/prisma.js"), "utf8");
  assert.ok(TENANT_MODELS.has("InventoryAdjustment"));
  assert.ok(TENANT_MODELS.has("InventoryAdjustmentLine"));
  assert.match(source, /params\.args\.where = \{ \.\.\.params\.args\.where, tenant_id: tenantId \}/);
});
