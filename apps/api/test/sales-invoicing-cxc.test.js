const test = require("node:test");
const assert = require("node:assert/strict");

test("sales-invoice module can be required without error", () => {
  const service = require("../src/modules/sales-invoice/service");
  assert.ok(service);
  assert.equal(typeof service.createSalesInvoice, "function");
  assert.equal(typeof service.simulateSalesInvoice, "function");
  assert.equal(typeof service.listSalesInvoices, "function");
  assert.equal(typeof service.getSalesInvoice, "function");
  assert.equal(typeof service.cancelSalesInvoice, "function");
  assert.equal(typeof service.getSalesByCustomer, "function");
  assert.equal(typeof service.getSalesByItem, "function");
  assert.equal(typeof service.getSalesByDate, "function");
  assert.equal(typeof service.getSalesDetail, "function");

  const schema = require("../src/modules/sales-invoice/schema");
  assert.ok(schema.createInvoiceSchema);
  assert.ok(schema.simulateInvoiceSchema);

  const routes = require("../src/modules/sales-invoice/routes");
  assert.ok(routes);
});

test("sales-invoice schema validates required fields", () => {
  const schema = require("../src/modules/sales-invoice/schema");

  // Verify createInvoiceSchema structure
  const body = schema.createInvoiceSchema.body;
  assert.ok(body.required.includes("customer_id"));
  assert.ok(body.required.includes("lines"));

  // Verify lines minItems
  assert.equal(body.properties.lines.minItems, 1);
  assert.ok(body.properties.lines.items.required.includes("item_id"));
  assert.ok(body.properties.lines.items.required.includes("qty"));
  assert.ok(body.properties.lines.items.required.includes("unit_price"));

  // Verify retention_codes schema
  assert.ok(body.properties.retention_codes);
  assert.equal(body.properties.retention_codes.type, "array");
});

test("accounts-receivable module can be required without error", () => {
  const service = require("../src/modules/accounts-receivable/service");
  assert.ok(service);
  assert.equal(typeof service.listDocuments, "function");
  assert.equal(typeof service.getDocument, "function");
  assert.equal(typeof service.getCustomerStatement, "function");
  assert.equal(typeof service.getCustomerBalance, "function");
  assert.equal(typeof service.registerPayment, "function");
  assert.equal(typeof service.getAgingReport, "function");
  assert.equal(typeof service.listRetentions, "function");
  assert.equal(typeof service.createRetention, "function");
  assert.equal(typeof service.updateRetention, "function");
  assert.equal(typeof service.initializeRetentions, "function");

  const schema = require("../src/modules/accounts-receivable/schema");
  assert.ok(schema.paymentSchema);
  assert.ok(schema.retentionSchema);

  const routes = require("../src/modules/accounts-receivable/routes");
  assert.ok(routes);
});

test("accounts-receivable schema validates payment fields", () => {
  const schema = require("../src/modules/accounts-receivable/schema");

  const body = schema.paymentSchema.body;
  assert.ok(body.required.includes("customer_id"));
  assert.ok(body.required.includes("amount"));
  assert.ok(body.required.includes("method"));
  assert.ok(body.properties.method.enum.includes("cash"));
  assert.ok(body.properties.method.enum.includes("bank_transfer"));
  assert.ok(body.properties.method.enum.includes("check"));
  assert.ok(body.properties.method.enum.includes("credit_card"));

  const retBody = schema.retentionSchema.body;
  assert.ok(retBody.required.includes("code"));
  assert.ok(retBody.required.includes("description"));
  assert.ok(retBody.required.includes("account_code"));
  assert.ok(retBody.required.includes("percent"));
});

test("accounting service CxC functions are exported", () => {
  const accountingService = require("../src/modules/accounting/service");
  assert.equal(typeof accountingService.prepareReceivableDocument, "function");
  assert.equal(typeof accountingService.simulateReceivableDocument, "function");
  assert.equal(typeof accountingService.createReceivableDocument, "function");
  assert.equal(typeof accountingService.listReceivableDocuments, "function");
  assert.equal(typeof accountingService.listOpenReceivableInvoices, "function");
  assert.equal(typeof accountingService.getCustomerStatement, "function");
  assert.equal(typeof accountingService.registerPaymentReceivable, "function");
  assert.equal(typeof accountingService.getAgingReceivablesReport, "function");
  assert.equal(typeof accountingService.initializeRetentionMasters, "function");
  assert.equal(typeof accountingService.getRetentionMasters, "function");
  assert.equal(typeof accountingService.saveRetentionMaster, "function");
});

test("accounting service pure functions work correctly", () => {
  const accountingService = require("../src/modules/accounting/service");

  // Test round
  assert.equal(accountingService.round(10.567), 10.57);
  assert.equal(accountingService.round(10), 10);
  assert.equal(accountingService.round(10.001), 10);
  assert.equal(accountingService.round(0), 0);

  // Test periodBounds
  const bounds = accountingService.periodBounds("2026-07");
  assert.ok(bounds.start instanceof Date);
  assert.ok(bounds.end instanceof Date);
  assert.equal(bounds.start.getMonth(), 6); // July is 0-indexed
  assert.equal(bounds.start.getFullYear(), 2026);
  assert.equal(bounds.end.getMonth(), 6);
  assert.equal(bounds.end.getDate(), 31);

  // Test periodFromDate
  assert.equal(accountingService.periodFromDate("2026-07-15"), "2026-07");
  assert.equal(accountingService.periodFromDate("2026-01-01"), "2026-01");
  assert.equal(accountingService.periodFromDate("2025-12-31"), "2025-12");
});
