const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
process.env.REDIS_DISABLED = "true";

const sales = require("../src/modules/sales-invoice/service");
const accounting = require("../src/modules/accounting/service");

test("sales-invoice module exports its complete workflow", () => {
  assert.equal(typeof sales.createSalesInvoice, "function");
  assert.equal(typeof sales.createSalesInvoiceTx, "function");
  assert.equal(typeof sales.importSalesInvoices, "function");
  assert.equal(typeof sales.simulateSalesInvoice, "function");
  assert.equal(typeof sales.listSalesInvoices, "function");
  assert.equal(typeof sales.getSalesInvoice, "function");
  assert.equal(typeof sales.cancelSalesInvoice, "function");
  assert.equal(typeof sales.getSalesByCustomer, "function");
  assert.equal(typeof sales.getSalesByItem, "function");
  assert.equal(typeof sales.getSalesByDate, "function");
  assert.equal(typeof sales.getSalesDetail, "function");
  const schema = require("../src/modules/sales-invoice/schema");
  assert.ok(schema.createInvoiceSchema);
  assert.ok(schema.simulateInvoiceSchema);
  assert.ok(require("../src/modules/sales-invoice/routes"));
});

test("sales-invoice schema keeps required headers and permits default SKU price", () => {
  const body = require("../src/modules/sales-invoice/schema").createInvoiceSchema.body;
  assert.ok(body.required.includes("customer_id"));
  assert.ok(body.required.includes("lines"));
  assert.equal(body.properties.lines.minItems, 1);
  assert.ok(body.properties.lines.items.required.includes("item_id"));
  assert.ok(body.properties.lines.items.required.includes("qty"));
  assert.equal(body.properties.lines.items.required.includes("unit_price"), false);
  assert.equal(body.properties.retention_codes.type, "array");
});

test("accounts-receivable module exports payments, aging and retention masters", () => {
  const service = require("../src/modules/accounts-receivable/service");
  for (const name of [
    "listDocuments", "getDocument", "getCustomerStatement", "getCustomerBalance",
    "registerPayment", "cancelPayment", "getAgingReport", "listRetentions", "createRetention",
    "updateRetention", "initializeRetentions"
  ]) assert.equal(typeof service[name], "function");
  const schema = require("../src/modules/accounts-receivable/schema");
  assert.ok(schema.paymentSchema);
  assert.ok(schema.retentionSchema);
  assert.ok(require("../src/modules/accounts-receivable/routes"));
});

test("accounts-receivable schemas cover receipt and tax configuration", () => {
  const schema = require("../src/modules/accounts-receivable/schema");
  const payment = schema.paymentSchema.body;
  for (const field of ["customer_id", "amount", "method"]) assert.ok(payment.required.includes(field));
  for (const method of ["cash", "bank_transfer", "check", "credit_card"]) assert.ok(payment.properties.method.enum.includes(method));
  const retention = schema.retentionSchema.body;
  for (const field of ["code", "description", "account_code", "percent"]) assert.ok(retention.required.includes(field));
  assert.deepEqual(retention.properties.retention_type.enum, ["retefuente", "reteiva", "reteica"]);
});

test("accounting CxC functions and pure helpers stay exported", () => {
  for (const name of [
    "prepareReceivableDocument", "simulateReceivableDocument", "createReceivableDocument",
    "createReceivableDocumentTx", "listReceivableDocuments", "listOpenReceivableInvoices",
    "getCustomerStatement", "registerPaymentReceivable", "cancelPaymentReceivable", "getAgingReceivablesReport",
    "initializeRetentionMasters", "getRetentionMasters", "saveRetentionMaster",
    "round", "periodBounds", "periodFromDate", "assertPaymentWithinBalance"
  ]) assert.equal(typeof accounting[name], "function");
  assert.equal(accounting.round(10.567), 10.57);
  assert.equal(accounting.periodFromDate("2026-07-15"), "2026-07");
  const bounds = accounting.periodBounds("2026-07");
  assert.equal(bounds.start.getMonth(), 6);
  assert.equal(bounds.end.getDate(), 31);
});

test("calcula precio por defecto, descuento e IVA de una posicion", () => {
  const result = sales.calculateSalesLine(
    { qty: 2, discount: 10, tax_rate: 19 },
    { unit_price: 100000, tax_rate: 0 }
  );
  assert.deepEqual(result, {
    qty: 2,
    unitPrice: 100000,
    discount: 10,
    taxRate: 19,
    discountAmount: 20000,
    subtotal: 180000,
    taxAmount: 34200,
    total: 214200
  });
});

test("rechaza descuentos fuera del rango permitido", () => {
  assert.throws(
    () => sales.calculateSalesLine({ qty: 1, unit_price: 100, discount: 101 }, { unit_price: 0, tax_rate: 19 }),
    (error) => error.code === "INVALID_DISCOUNT" && error.statusCode === 422
  );
});

test("normaliza encabezados de importacion Excel en espanol", () => {
  assert.deepEqual(
    sales.normalizeImportRow({ "Grupo Factura": "A-1", "Cliente NIT": "9001", "Centro Costo": "CC01" }),
    { grupo_factura: "A-1", cliente_nit: "9001", centro_costo: "CC01" }
  );
});

test("recaudo permite abono parcial y rechaza sobrepago", () => {
  assert.equal(accounting.assertPaymentWithinBalance(50, 100), true);
  assert.throws(
    () => accounting.assertPaymentWithinBalance(100.02, 100),
    (error) => error.code === "PAYMENT_EXCEEDS_SELECTED_BALANCE" && error.statusCode === 422
  );
});

test("migracion incluye factura, CxC, impuestos, reversion y costo por sociedad", () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    "../prisma/migrations/20260730030000_customer_sales_invoicing_cxc/migration.sql"
  ), "utf8");
  for (const token of [
    "sales_invoices",
    "sales_invoice_lines",
    "cxc_cabdoc",
    "cxc_cuedoc",
    "tax_base",
    "is_reversal",
    "cancelled_by",
    "inv_sku_valuations",
    "society_code"
  ]) assert.match(migration, new RegExp(token));
});
