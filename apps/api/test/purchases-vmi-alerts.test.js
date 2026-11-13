const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

function loadPurchasesService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/purchases/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

const lowItem = { id: 5, code: "SKU-1", name: "Item bajo minimo", active: true, stock_current: 0, stock_min: 0, stock_max: 100 };

test("VMI alerts tolerates an item with no inbound movement (no supplier)", async () => {
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    item: {
      fields: { stock_min: "stock_min" },
      findMany: async () => [lowItem]
    },
    movement: {
      // Sin movimiento de entrada con transaccion en la ventana -> null (caso que rompia con 500).
      findFirst: async () => null
    }
  };
  const loaded = loadPurchasesService(fakePrisma);

  try {
    const alerts = await loaded.service.checkVMIAlerts("tenant-1");
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].item_id, lowItem.id);
    assert.equal(alerts[0].supplier_id, null);
    assert.equal(alerts[0].supplier_name, null);
    assert.equal(alerts[0].urgency, "HIGH");
  } finally {
    loaded.restore();
  }
});

test("VMI alerts resolves the supplier from the last inbound movement", async () => {
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    item: {
      fields: { stock_min: "stock_min" },
      findMany: async () => [lowItem]
    },
    movement: {
      findFirst: async () => ({ transaction: { party: { id: 9, name: "Proveedor Cert-QA" } } })
    }
  };
  const loaded = loadPurchasesService(fakePrisma);

  try {
    const alerts = await loaded.service.checkVMIAlerts("tenant-1");
    assert.equal(alerts[0].supplier_id, 9);
    assert.equal(alerts[0].supplier_name, "Proveedor Cert-QA");
  } finally {
    loaded.restore();
  }
});
