const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

function loadPurchasesService({ fakePrisma, fakeAccountingService }) {
  const prismaPath = require.resolve("../src/core/prisma");
  const accountingPath = require.resolve("../src/modules/accounting/service");
  const inventoryPath = require.resolve("../src/modules/inventory/service");
  const servicePath = require.resolve("../src/modules/purchases/service");
  const paths = [prismaPath, accountingPath, inventoryPath, servicePath];
  const previous = new Map(paths.map((modulePath) => [modulePath, require.cache[modulePath]]));

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  require.cache[accountingPath] = { id: accountingPath, filename: accountingPath, loaded: true, exports: fakeAccountingService };
  require.cache[inventoryPath] = { id: inventoryPath, filename: inventoryPath, loaded: true, exports: {} };
  delete require.cache[servicePath];

  return {
    service: require(servicePath),
    restore() {
      for (const modulePath of paths) {
        if (previous.get(modulePath)) require.cache[modulePath] = previous.get(modulePath);
        else delete require.cache[modulePath];
      }
    }
  };
}

test("purchase invoice posts accounting and PO controls in one extended transaction", async () => {
  const supplier = { id: 41, type: "supplier", active: true };
  const item = {
    id: 81,
    code: "ITEM-81",
    name: "Insumo",
    active: true,
    family: {
      accounting: {
        gr_ir_account_code: "2335",
        goods_receipt_account_code: "143505"
      }
    }
  };
  const purchaseOrderLine = { id: 301, item_id: item.id, qty: 2, description: "Insumo" };
  const purchaseOrder = {
    id: 201,
    number: "OC-201",
    party_id: supplier.id,
    status: "open",
    metadata: {},
    lines: [purchaseOrderLine]
  };
  const controls = [];
  const fakeTx = {
    party: { findFirst: async () => supplier },
    transaction: {
      findFirst: async () => purchaseOrder,
      update: async ({ data }) => ({ ...purchaseOrder, ...data })
    },
    item: { findFirst: async () => item },
    purchaseOrderInvoiceLine: {
      findMany: async ({ where }) => where.purchase_order_line_id
        ? controls.filter((row) => row.purchase_order_line_id === where.purchase_order_line_id)
        : controls.filter((row) => row.purchase_order_id === where.purchase_order_id),
      create: async ({ data }) => {
        controls.push(data);
        return data;
      }
    }
  };

  let transactionCalls = 0;
  let transactionOptions;
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback, options) => {
      transactionCalls += 1;
      transactionOptions = options;
      return callback(fakeTx);
    }
  };

  let accountingTx;
  let accountingPayload;
  const fakeAccountingService = {
    createPayableDocumentTx: async (tx, tenantId, userId, payload) => {
      accountingTx = tx;
      accountingPayload = { tenantId, userId, payload };
      return { id: 501, number: "FC-501", lines: [] };
    }
  };
  const loaded = loadPurchasesService({ fakePrisma, fakeAccountingService });

  try {
    const result = await loaded.service.createPurchaseInvoice("tenant-1", 7, {
      document_kind: "invoice",
      with_purchase_order: true,
      supplier_id: supplier.id,
      purchase_order_id: purchaseOrder.id,
      supplier_reference: "FV-9001",
      posting_date: "2026-07-27",
      lines: [{
        item_id: item.id,
        purchase_order_line_id: purchaseOrderLine.id,
        qty: 2,
        unit_cost: 125,
        vat_code: "IVA19"
      }]
    });

    assert.equal(transactionCalls, 1);
    assert.equal(transactionOptions, undefined);
    assert.equal(accountingTx, fakeTx);
    assert.equal(accountingPayload.tenantId, "tenant-1");
    assert.equal(accountingPayload.userId, 7);
    assert.equal(accountingPayload.payload.source_module, "purchases");
    assert.equal(accountingPayload.payload.lines[0].account_code, "2335");
    assert.equal(accountingPayload.payload.lines[0].movement, "debit");
    assert.equal(controls.length, 1);
    assert.equal(controls[0].cxp_cabdoc_id, 501);
    assert.deepEqual(result.purchase_order, { id: 201, number: "OC-201" });
  } finally {
    loaded.restore();
  }
});

test("purchase invoice blocks an EM/RF account equal to the supplier payable account", async () => {
  const supplier = { id: 41, type: "supplier", active: true };
  const item = {
    id: 81,
    code: "ITEM-81",
    name: "Insumo",
    active: true,
    family: { accounting: { gr_ir_account_code: "2205", goods_receipt_account_code: "1435" } }
  };
  const purchaseOrderLine = { id: 301, item_id: item.id, qty: 2, description: "Insumo" };
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    party: { findFirst: async () => supplier },
    transaction: { findFirst: async () => ({ id: 201, number: "OC-201", party_id: supplier.id, status: "open", lines: [purchaseOrderLine] }) },
    item: { findFirst: async () => item },
    purchaseOrderInvoiceLine: { findMany: async () => [] }
  };
  let simulationCalled = false;
  const loaded = loadPurchasesService({
    fakePrisma,
    fakeAccountingService: { simulatePayableDocument: async () => { simulationCalled = true; } }
  });

  try {
    await assert.rejects(
      loaded.service.simulatePurchaseInvoice("tenant-1", {
        document_kind: "invoice",
        with_purchase_order: true,
        supplier_id: supplier.id,
        purchase_order_id: 201,
        associated_account_code: "2205",
        lines: [{ item_id: item.id, purchase_order_line_id: purchaseOrderLine.id, qty: 1, unit_cost: 100, vat_code: "IVA19" }]
      }),
      (error) => error.code === "GR_IR_EQUALS_PAYABLE_ACCOUNT" && error.statusCode === 422
    );
    assert.equal(simulationCalled, false);
  } finally {
    loaded.restore();
  }
});
