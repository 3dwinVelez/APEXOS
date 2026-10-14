const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/service.js"), "utf8");
const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/routes.js"), "utf8");
const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20261014120000_accounting_opening_balances_nullable_party/migration.sql"), "utf8");
const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/contabilidad/importar-saldos-iniciales/page.tsx"), "utf8");

test("saldos iniciales tienen plantilla, preview y confirmacion protegidos por contabilidad", () => {
  assert.match(routes, /accounting\/opening-balances\/template/);
  assert.match(routes, /accounting\/opening-balances\/validate/);
  assert.match(routes, /accounting\/opening-balances\"/);
  assert.match(routes, /requirePermission\("accounting", "write"\)/);
  assert.match(service, /openingCents/);
  assert.match(service, /OPENING_BALANCE_UNBALANCED/);
  assert.match(service, /OPENING_BALANCES_ALREADY_POSTED/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /reserveAccountingDocumentNumber/);
  assert.match(page, /Validar plantilla/);
  assert.match(page, /Confirmar contabilización/);
});

test("tercero contable es opcional en la linea persistida y la migracion es puntual", () => {
  assert.match(schema, /model CntCuedoc[\s\S]*?party_id\s+Int\?/);
  assert.match(migration, /ALTER TABLE \"cnt_cuedoc\" ALTER COLUMN \"party_id\" DROP NOT NULL/);
  assert.doesNotMatch(service, /OPENING_BALANCE_PARTY_REQUIRED/);
});

test("recuperacion puntual conserva modelos de gastos menores y tipos contables", () => {
  assert.match(schema, /model PettyCashConcept/);
  assert.match(schema, /model PettyCashBox/);
  assert.match(schema, /model PettyCashAdvance/);
  assert.match(schema, /model PettyCashVoucher/);
  assert.match(schema, /model PettyCashVoucherLine/);
  assert.match(service, /code: \"GM\"/);
  assert.match(service, /code: \"APC\"/);
  assert.match(service, /code: \"LCM\"/);
});
