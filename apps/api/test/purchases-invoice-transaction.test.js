const test = require("node:test");
const assert = require("node:assert/strict");

test("la factura de compra reutiliza la transaccion para crear el documento contable", async () => {
  const prismaPath = require.resolve("../src/core/prisma");
  const inventoryPath = require.resolve("../src/modules/inventory/service");
  const accountingPath = require.resolve("../src/modules/accounting/service");
  const purchasesPath = require.resolve("../src/modules/purchases/service");
  const tx = {
    party: { findFirst: async () => ({ id: 11, type: "supplier", active: true }) },
    location: { findFirst: async () => ({ id: 22, code: "BOD-QA", active: true, place: {} }) },
    productCost: { create: async () => ({}) },
    itemLocation: {
      findFirst: async () => null,
      create: async () => ({})
    },
    movement: { create: async () => ({}) },
    item: {
      findFirst: async () => ({
        id: 33,
        code: "SKU-QA",
        name: "Producto QA",
        stock_current: 0,
        unit_cost: 0,
        family: {
          accounting: {
            goods_receipt_account_code: "1435",
            gr_ir_account_code: "2610"
          }
        }
      }),
      update: async () => ({})
    }
  };
  let accountingTx = null;

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      runWithTenant: (_tenantId, callback) => callback(),
      $transaction: (callback) => callback(tx)
    }
  };
  require.cache[inventoryPath] = {
    id: inventoryPath,
    filename: inventoryPath,
    loaded: true,
    exports: {}
  };
  require.cache[accountingPath] = {
    id: accountingPath,
    filename: accountingPath,
    loaded: true,
    exports: {
      createPayableDocument: async () => assert.fail("No debe abrir una transaccion contable independiente"),
      createPayableDocumentTx: async (receivedTx) => {
        accountingTx = receivedTx;
        return { id: 44, number: "CP-000044" };
      }
    }
  };
  delete require.cache[purchasesPath];
  const purchases = require(purchasesPath);

  const result = await purchases.createPurchaseInvoice("tenant-qa", 7, {
    document_kind: "invoice",
    with_purchase_order: false,
    location_id: 22,
    posting_date: "2026-07-29",
    due_term: "AP30",
    supplier_reference: "FAC-QA-44",
    header_text: "Factura QA",
    supplier_id: 11,
    society_code: "SOC-QA",
    branch_code: "BR-QA",
    cost_center_code: "CC-QA",
    associated_account_code: "2205",
    lines: [{
      item_id: 33,
      qty: 1,
      unit_cost: 100,
      vat_code: "COMPRAS-19",
      description: "Producto QA"
    }]
  });

  assert.strictEqual(accountingTx, tx);
  assert.equal(result.number, "CP-000044");
});
