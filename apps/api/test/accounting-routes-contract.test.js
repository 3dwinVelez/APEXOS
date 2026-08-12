const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.DISABLE_BACKGROUND_WORKERS = "true";

const build = require("../server");

const accountingRoutes = [
  ["POST", "/api/v1/accounting/chart/init"],
  ["GET", "/api/v1/accounting/accounts"],
  ["POST", "/api/v1/accounting/accounts"],
  ["PUT", "/api/v1/accounting/accounts/1"],
  ["DELETE", "/api/v1/accounting/accounts/1"],
  ["POST", "/api/v1/accounting/journal"],
  ["GET", "/api/v1/accounting/ledger/1105"],
  ["GET", "/api/v1/accounting/reports/balance-sheet"],
  ["GET", "/api/v1/accounting/reports/income-statement"],
  ["GET", "/api/v1/accounting/reports/trial-balance"],
  ["GET", "/api/v1/accounting/reports/taxes"],
  ["GET", "/api/v1/accounting/reports/receivables"],
  ["GET", "/api/v1/accounting/reports/payables"],
  ["GET", "/api/v1/accounting/periods"],
  ["PATCH", "/api/v1/accounting/periods/2026-07"],
  ["GET", "/api/v1/accounting/organization-tree"],
  ["POST", "/api/v1/accounting/organization-tree"],
  ["DELETE", "/api/v1/accounting/organization-tree/branch/BOG"],
  ["GET", "/api/v1/accounting/document-masters"],
  ["POST", "/api/v1/accounting/document-masters/types"],
  ["POST", "/api/v1/accounting/document-masters/numbering"],
  ["GET", "/api/v1/accounting/vat-masters"],
  ["POST", "/api/v1/accounting/vat-masters"],
  ["DELETE", "/api/v1/accounting/vat-masters/COMPRAS-19"],
  ["GET", "/api/v1/accounting/payable-accounts"],
  ["GET", "/api/v1/accounting/documents"],
  ["POST", "/api/v1/accounting/documents"],
  ["GET", "/api/v1/accounting/payables/documents"],
  ["GET", "/api/v1/accounting/payables/open-invoices"],
  ["GET", "/api/v1/accounting/payables/suppliers/1/documents"],
  ["POST", "/api/v1/accounting/payables/documents/simulate"],
  ["POST", "/api/v1/accounting/payables/documents"],
  ["POST", "/api/v1/accounting/payables/applications"],
  ["GET", "/api/v1/accounting/third-party-masters"],
  ["POST", "/api/v1/accounting/third-party-masters/document-types"],
  ["POST", "/api/v1/accounting/third-party-masters/locations"],
  ["GET", "/api/v1/accounting/third-parties"],
  ["POST", "/api/v1/accounting/third-parties"],
  ["PUT", "/api/v1/accounting/third-parties/1"],
  ["POST", "/api/v1/accounting/payments"]
];

test("all accounting UI routes are registered under /api/v1", async (t) => {
  const app = await build();
  t.after(() => app.close());
  await app.ready();

  for (const [method, url] of accountingRoutes) {
    const response = await app.inject({ method, url });
    assert.notEqual(response.statusCode, 404, `${method} ${url} is not registered`);
    assert.ok(
      response.statusCode === 400 || response.statusCode === 401,
      `${method} ${url} must run schema validation or authentication`
    );
  }
});
