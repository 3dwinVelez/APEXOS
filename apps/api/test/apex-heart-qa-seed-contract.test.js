const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("el seed YTD está limitado a Cliente Piloto QA y es idempotente", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../scripts/seed-apex-heart-qa-ytd.js"), "utf8");
  assert.match(source, /CLIENTE_PILOTO_QA_2026/);
  assert.match(source, /cliente\.piloto\.qa\.prod/);
  assert.match(source, /if \(await findOne\("sales_invoices"/);
  assert.match(source, /resolution=merge-duplicates/);
  assert.doesNotMatch(source, /DELETE|deleteMany|method:\s*"DELETE"/);
});

test("el certificador exige cobertura de todos los datasets gráficos", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../scripts/certifications/apex-heart-qa-data.js"), "utf8");
  for (const dataset of ["products", "categories", "monthly", "purchase_trend", "receivable_aging", "payable_aging", "inventory_health", "inventory_trend", "invoice_details", "alerts"]) assert.match(source, new RegExp(dataset));
});
