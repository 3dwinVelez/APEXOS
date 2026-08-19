const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "test";
process.env.DISABLE_BACKGROUND_WORKERS = "true";
process.env.DISABLE_REDIS = "true";

const accounting = require("../src/modules/accounting/service");

test("las cuentas asociadas se restringen a cuentas PUCC compatibles", () => {
  assert.equal(accounting.isReceivableAccount({ code: "130505", type: "asset" }), true);
  assert.equal(accounting.isReceivableAccount({ code: "220505", type: "liability" }), false);
  assert.equal(accounting.isPayableAccount({ code: "220505", name: "Proveedores", type: "liability" }), true);
  assert.equal(accounting.isPayableAccount({ code: "130505", name: "Clientes", type: "asset" }), false);
});

test("las retenciones del tercero se normalizan y deben existir activas en su maestro", () => {
  assert.deepEqual(accounting.normalizeRetentionCodes([{ code: "retefuente-2.5" }, "RETEICA-0.5", "reteica-0.5"]), ["RETEFUENTE-2.5", "RETEICA-0.5"]);
  assert.doesNotThrow(() => accounting.assertRetentionCodesInMaster(["RETEIVA-15"], [{ code: "RETEIVA-15", active: true }], "ventas"));
  assert.throws(
    () => accounting.assertRetentionCodesInMaster(["RETEIVA-15"], [{ code: "RETEIVA-15", active: false }], "ventas"),
    (error) => error.code === "RETENTION_MASTER_NOT_FOUND" && error.statusCode === 400,
  );
});

test("las retenciones de compra respetan maestro, base editable e importe editable", () => {
  const masters = [
    { code: "RF-COMPRA", type: "retefuente", concept: "ReteFuente compras", account_code: "2365", percent: 2.5, minimum_base: 100000, active: true },
    { code: "RIVA-COMPRA", type: "reteiva", concept: "ReteIVA compras", account_code: "2367", percent: 15, minimum_base: 0, active: true }
  ];
  const rows = accounting.normalizePayableRetentions([
    { code: "rf-compra", base: 1000000, amount: 25000 },
    { code: "RIVA-COMPRA", base: 190000, amount: 28000 }
  ], masters, 1000000, 190000);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.code, row.base, row.amount]), [["RF-COMPRA", 1000000, 25000], ["RIVA-COMPRA", 190000, 28000]]);
  assert.throws(() => accounting.normalizePayableRetentions([{ code: "INACTIVA", base: 1000, amount: 10 }], masters, 1000, 190), (error) => error.code === "RETENTION_MASTER_NOT_FOUND");
});

test("la simulacion CXP incorpora retenciones al asiento y al saldo neto", () => {
  const service = fs.readFileSync(path.join(__dirname, "../src/modules/accounting/service.js"), "utf8");
  assert.match(service, /const retentionRows = normalizePayableRetentions/);
  assert.match(service, /const total = round\(grossTotal - retentionTotal\)/);
  assert.match(service, /retention_total: preview\.retentionTotal/);
  assert.match(service, /tax_type: retention\.type/);
});

test("la factura calcula retenciones aunque el maestro llegue despues del detalle", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../web/app/dashboard/compras/facturas/page.tsx"), "utf8");
  assert.match(page, /const base = row\.type === "reteiva" \? totals\.tax : totals\.subtotal/);
  assert.match(page, /amount: base >= row\.minimum_base \? Math\.round\(base \* row\.percent\) \/ 100 : 0/);
  assert.match(page, /retentionRevision/);
  assert.match(page, /totals\.tax, retentionRevision/);
});

test("el maestro de terceros usa listas PUCC y una pestaña separada de retenciones", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../web/app/dashboard/contabilidad/terceros/page.tsx"), "utf8");
  assert.match(page, /role="tab"[^>]*>Retenciones<\/button>/);
  assert.match(page, /Seleccionar cuenta CxC/);
  assert.match(page, /Seleccionar cuenta CxP/);
  assert.match(page, /accounting\/retention-masters\?scope=sales/);
  assert.match(page, /accounting\/retention-masters\?scope=purchases/);
  assert.doesNotMatch(page, /placeholder="RETEFUENTE/);
});
