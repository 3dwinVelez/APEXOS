const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DISABLE_REDIS = "true";
const treasury = require("../src/modules/treasury/service");

test("treasury separates receipt CI from supplier disbursement CE", () => {
  assert.deepEqual(treasury.directionConfig("receipt"), { role: "customer", sourceType: "cxc", model: "cxcCabdoc", docType: "CI", partyField: "customer_id", balanceField: "receivable_balance" });
  assert.deepEqual(treasury.directionConfig("disbursement"), { role: "supplier", sourceType: "cxp", model: "cxpCabdoc", docType: "CE", partyField: "supplier_id", balanceField: "payable_balance" });
});

test("partial and total applications never produce a negative invoice", () => {
  const sources = [{ id: 1, number: "FV-1", balance: 100 }, { id: 2, number: "FV-2", balance: 80 }];
  assert.deepEqual(treasury.prepareApplications(sources, new Map([[1, 25], [2, 80]])).map((row) => row.after), [75, 0]);
  assert.throws(() => treasury.prepareApplications([sources[0]], new Map([[1, 100.01]])), (error) => error.code === "PAYMENT_EXCEEDS_INVOICE_BALANCE");
});

test("treasury schemas require bank, party, date and explicit applications", () => {
  const schema = require("../src/modules/treasury/schema");
  for (const field of ["direction", "posting_date", "party_id", "bank_id", "applications"]) assert.ok(schema.paymentSchema.body.required.includes(field));
  assert.equal(schema.paymentSchema.body.properties.applications.minItems, 1);
  for (const field of ["code", "name", "account_id"]) assert.ok(schema.bankSchema.body.required.includes(field));
});

test("treasury migration is additive and keeps audit/reversal structures", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260807040000_treasury_banks_payments/migration.sql"), "utf8");
  for (const token of ["treasury_banks", "treasury_payments", "treasury_payment_applications", "reversal_accounting_document_id", "balance_before", "balance_after"]) assert.ok(sql.includes(token));
  assert.doesNotMatch(sql, /^\s*(DROP\b|TRUNCATE\b|DELETE\s+FROM\b)/im);
});

test("legacy CxC payment endpoints are replaced by treasury routes", () => {
  const oldRoutes = fs.readFileSync(path.join(__dirname, "../src/modules/accounts-receivable/routes.js"), "utf8");
  const accountingRoutes = fs.readFileSync(path.join(__dirname, "../src/modules/accounting/routes.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/modules/treasury/routes.js"), "utf8");
  assert.ok(!oldRoutes.includes('post("/accounts-receivable/payments'));
  assert.ok(!accountingRoutes.includes('post("/accounting/payments'));
  for (const route of ["/treasury/banks", "/treasury/open-items", "/treasury/payments", "/treasury/payments/:id/cancel"]) assert.ok(routes.includes(route));
});

test("payment service keeps accounting, balance concurrency and reversal atomic", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/modules/treasury/service.js"), "utf8");
  for (const token of ["prisma.$transaction", "balance: row.source.balance", "PAYMENT_EXCEEDS_INVOICE_BALANCE", "is_reversal: true", "referenced_document_id: original.id", "receivable_balance", "payable_balance"]) assert.ok(source.includes(token), `Missing treasury control: ${token}`);
});
