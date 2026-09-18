const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/purchases/service.js"),
  "utf8",
);

test("la importacion y sus costos persisten el tenant de la sesion", () => {
  assert.match(
    serviceSource,
    /purchaseImport\.create\(\{ data: \{ tenant_id: tenantId, purchase_order_id:/,
  );
  assert.match(
    serviceSource,
    /purchaseImportCost\.create\(\{ data: \{ tenant_id: tenantId, import_id:/,
  );
});
