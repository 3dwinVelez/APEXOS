const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("los traslados y sus lineas reciben tenant_id mediante el middleware Prisma", () => {
  const source = fs.readFileSync(path.join(root, "src/core/prisma.js"), "utf8");
  assert.match(source, /TENANT_MODELS[\s\S]*"WarehouseTransfer"/);
  assert.match(source, /TENANT_MODELS[\s\S]*"WarehouseTransferLine"/);
});

test("la bodega de consignacion persiste y presenta el cliente enlazado", () => {
  const source = fs.readFileSync(path.join(root, "src/modules/inventory/service.js"), "utf8");
  assert.match(source, /CONSIGNMENT_CUSTOMER_REQUIRED/);
  assert.match(source, /consignment_customer_id:\s*consignmentCustomerId \|\| null/);
  assert.match(source, /consignment_customer_name:/);
});
