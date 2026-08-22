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

test("supplier creation returns the complete UI contract", async () => {
  const createdRow = {
    id: 41,
    tenant_id: "tenant-1",
    type: "supplier",
    name: "Proveedor Integral",
    country: "CO",
    metadata: {},
    active: true
  };
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    party: {
      findFirst: async () => null,
      create: async () => createdRow
    }
  };
  const loaded = loadPurchasesService(fakePrisma);

  try {
    const supplier = await loaded.service.createSupplier("tenant-1", 7, {
      name: "Proveedor Integral",
      credit_days: 30
    });
    assert.equal(supplier.id, createdRow.id);
    assert.deepEqual(supplier.metrics, {
      orders_count: 0,
      open_orders: 0,
      pending_receipts: 0,
      total_purchased: 0,
      service_level: 100,
      last_order_at: null,
      last_order_number: null
    });
    assert.deepEqual(supplier.recent_orders, []);
  } finally {
    loaded.restore();
  }
});

test("supplier partial update does not require name", async () => {
  let updateData;
  const current = {
    id: 42,
    type: "supplier",
    name: "Proveedor Existente",
    country: "CO",
    metadata: {},
    active: true
  };
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    party: {
      findFirst: async () => current,
      update: async ({ data }) => {
        updateData = data;
        return { ...current, ...data };
      }
    }
  };
  const loaded = loadPurchasesService(fakePrisma);

  try {
    const supplier = await loaded.service.updateSupplier("tenant-1", current.id, {
      email: "compras@proveedor.test",
      metadata: { notes: "Actualizado" }
    });
    assert.equal(updateData.name, current.name);
    assert.equal(supplier.email, "compras@proveedor.test");
  } finally {
    loaded.restore();
  }
});
