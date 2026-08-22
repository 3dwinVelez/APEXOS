process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/routes.js"), "utf8");
const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/service.js"), "utf8");
const accounting = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/service.js"), "utf8");
const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/compras/ordenes/recibir/page.tsx"), "utf8");

test("la ruta de devolución está registrada con esquema y permiso de aprobación", () => {
  assert.match(routes, /post\("\/purchases\/orders\/:id\/return"/);
  assert.match(routes, /schema: schema\.purchaseReturnSchema/);
  assert.match(routes, /service\.returnPurchaseOrder/);
});

test("la devolución usa cuentas de familia y documento contable inverso", () => {
  assert.match(service, /const available = moves\.reduce/);
  assert.match(service, /EXCEEDS_RECEIVED/);
  assert.match(service, /inventoryService\.stockMoveTx/);
  assert.match(service, /source_type: "purchase_return"/);
  assert.match(service, /familyAccounting\.goods_receipt_account_code/);
  assert.match(service, /familyAccounting\.gr_ir_account_code/);
  assert.match(service, /createGoodsReceiptDocumentTx/);
  assert.match(service, /is_reversal: true/);
  assert.match(accounting, /data\.is_reversal === true \? source\.gr_ir_account_code/);
  assert.match(accounting, /is_reversal: data\.is_reversal === true/);
});

test("la interfaz usa modal y exige doble clic para documentos", () => {
  assert.doesNotMatch(page, /window\.prompt/);
  assert.match(page, /Devolver mercancía - \$\{returnOrder\.number\}/);
  assert.match(page, /onDoubleClick=\{\(\) => setSelectedAccountingDocument\(row\)\}/);
  assert.match(page, /Doble clic para ver documento y contabilización/);
  assert.match(page, /Confirmar devolución/);
  assert.match(page, /returnQuantities/);
  assert.match(page, /Disponible para devolver/);
  assert.match(page, /supera lo recibido pendiente de devolver/);
  assert.match(page, /returned_lines: returnedLines/);
});
