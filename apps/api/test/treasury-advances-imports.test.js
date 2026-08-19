const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
process.env.DISABLE_REDIS = "true";
const treasury = require("../src/modules/treasury/service");
const purchases = require("../src/modules/purchases/service");

test("anticipos usan clases y naturalezas contables independientes", () => {
  assert.equal(treasury.advanceConfig("customer").docType, "AC");
  assert.equal(treasury.advanceConfig("customer").accountType, "liability");
  assert.equal(treasury.advanceConfig("supplier").docType, "AP");
  assert.equal(treasury.advanceConfig("supplier").accountType, "asset");
});

test("costos se distribuyen por valor y solo capitalizables", () => {
  const result = purchases.allocateImportCosts([{ id: 1, qty: 2, unit_cost: 100 }, { id: 2, qty: 1, unit_cost: 300 }], [{ classification: "capitalizable", estimated_amount: 100 }, { classification: "recoverable_tax", estimated_amount: 190 }]);
  assert.equal(result.get(1), 40); assert.equal(result.get(2), 60);
});

test("migracion es aditiva y conserva Float", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260807090000_treasury_advances_purchase_imports/migration.sql"), "utf8");
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE FROM)\b/im);
  assert.match(sql, /DOUBLE PRECISION/); assert.match(sql, /treasury_advances/); assert.match(sql, /pur_import_costs/);
});

test("contratos exponen cruces, filtro por proveedor y recepcion completa", () => {
  const tr = fs.readFileSync(path.join(__dirname, "../src/modules/treasury/routes.js"), "utf8");
  const pr = fs.readFileSync(path.join(__dirname, "../src/modules/purchases/routes.js"), "utf8");
  const ps = fs.readFileSync(path.join(__dirname, "../src/modules/purchases/service.js"), "utf8");
  assert.match(tr, /advances\/:id\/apply/); assert.match(pr, /invoiceable-costs/);
  assert.match(ps, /IMPORT_FULL_RECEIPT_REQUIRED/); assert.match(ps, /IMPORT_INVOICE_SUPPLIER_MISMATCH/);
  assert.match(ps, /IMPORT_VARIANCE_WITHOUT_STOCK/); assert.match(ps, /import_cost_adjustment/);
});
