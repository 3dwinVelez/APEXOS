const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

// Helpers puros del modulo real (no tocan base de datos).
const comercio = require("../src/modules/comercio/service");
const schemaModule = require("../src/modules/comercio/schema");

const { buildInstallmentSchedule, allocateInstallments, weightedAverageCost } = comercio;

// === Mini motor en memoria con el subconjunto de Prisma que usa el servicio ===

const TENANT = "t-1";

function matchValue(rowVal, cond) {
  if (cond instanceof Date) return rowVal instanceof Date && rowVal.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    if (cond.gte !== undefined && !(rowVal >= cond.gte)) return false;
    if (cond.lte !== undefined && !(rowVal <= cond.lte)) return false;
    if (cond.startsWith !== undefined && !String(rowVal ?? "").startsWith(cond.startsWith)) return false;
    if (cond.in !== undefined && !cond.in.includes(rowVal)) return false;
    return true;
  }
  return rowVal === cond;
}

function matches(row, where = {}) {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "__includeInactive") continue;
    if (!matchValue(row[key], cond)) return false;
  }
  return true;
}

function sortRows(rows, orderBy) {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, dir] = Object.entries(clause)[0];
      const av = a[field]; const bv = b[field];
      const an = av instanceof Date ? av.getTime() : av;
      const bn = bv instanceof Date ? bv.getTime() : bv;
      if (an === bn) continue;
      if (an === undefined || an === null) return 1;
      if (bn === undefined || bn === null) return -1;
      return (an < bn ? -1 : 1) * (dir === "desc" ? -1 : 1);
    }
    return 0;
  });
}

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !(value instanceof Date)
      && (value.increment !== undefined || value.decrement !== undefined)) {
      row[key] = (row[key] || 0) + (value.increment !== undefined ? value.increment : -value.decrement);
    } else {
      row[key] = value;
    }
  }
}

function fakePrisma() {
  const state = {
    sequence: 0,
    calls: [],
    collections: {
      comercioSettings: [],
      comercioProduct: [],
      comercioCustomer: [],
      comercioSale: [],
      comercioSaleItem: [],
      comercioCredit: [],
      comercioInstallment: [],
      comercioPayment: [],
      comercioPurchase: [],
      comercioExpense: [],
      comercioStockMovement: []
    }
  };
  const relations = {
    comercioSale: { items: ["comercioSaleItem", "sale_id"] },
    comercioCredit: { installments: ["comercioInstallment", "credit_id"], payments: ["comercioPayment", "credit_id"] },
    comercioPayment: { credit: ["comercioCredit", "id"] }
  };
  const defaults = {
    comercioSettings: { store_name: "Mi comercio", currency: "COP", receipt_note: null, preferences_json: {} },
    comercioProduct: { code: "", name: "", category: null, unit: "unidad", price: 0, cost: 0, stock: 0, min_stock: 0, active: true, notes: null, photo_path: null, photo_mime: null },
    comercioCustomer: { code: "", name: "", document: null, phone: null, email: null, address: null, active: true, notes: null },
    comercioInstallment: { number: 1, due_date: null, amount: 0, paid_amount: 0, status: "open", paid_at: null }
  };

  function hydrate(model, row) {
    const include = relations[model];
    if (!include) return row;
    const out = { ...row };
    for (const [rel, [targetModel, foreignKey]] of Object.entries(include)) {
      out[rel] = state.collections[targetModel].filter((item) => item[foreignKey] === row.id);
    }
    return out;
  }

  function delegate(model) {
    const rows = state.collections[model];
    return {
      findMany: async ({ where = {}, orderBy, take, skip, include } = {}) => {
        state.calls.push({ op: `${model}.findMany`, where });
        void include;
        let out = sortRows(rows.filter((row) => matches(row, where)), orderBy);
        if (skip) out = out.slice(skip);
        if (take !== undefined) out = out.slice(0, take);
        return out.map((row) => hydrate(model, structuredClone(row)));
      },
      findFirst: async ({ where = {}, orderBy, include } = {}) => {
        state.calls.push({ op: `${model}.findFirst`, where });
        void include;
        const out = sortRows(rows.filter((row) => matches(row, where)), orderBy);
        return out.length ? hydrate(model, structuredClone(out[0])) : null;
      },
      count: async ({ where = {} } = {}) => {
        state.calls.push({ op: `${model}.count`, where });
        return rows.filter((row) => matches(row, where)).length;
      },
      create: async ({ data = {} } = {}) => {
        state.calls.push({ op: `${model}.create`, data });
        const created = {
          id: ++state.sequence,
          tenant_id: TENANT,
          created_at: new Date(),
          updated_at: new Date(),
          ...(defaults[model] || {}),
          ...structuredClone(data)
        };
        rows.push(created);
        return hydrate(model, structuredClone(created));
      },
      update: async ({ where = {}, data = {} } = {}) => {
        state.calls.push({ op: `${model}.update`, where, data });
        const row = rows.find((item) => matches(item, where));
        if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
        applyData(row, structuredClone(data));
        row.updated_at = new Date();
        return hydrate(model, structuredClone(row));
      },
      updateMany: async ({ where = {}, data = {} } = {}) => {
        state.calls.push({ op: `${model}.updateMany`, where, data });
        const selected = rows.filter((item) => matches(item, where));
        for (const row of selected) applyData(row, structuredClone(data));
        return { count: selected.length };
      }
    };
  }

  const prisma = {
    state,
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(prisma)
  };
  for (const model of Object.keys(state.collections)) prisma[model] = delegate(model);
  return prisma;
}

function loadComercioService(prisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const storagePath = require.resolve("../src/modules/comercio/storage");
  const servicePath = require.resolve("../src/modules/comercio/service");
  const previous = { prisma: require.cache[prismaPath], storage: require.cache[storagePath], service: require.cache[servicePath] };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[storagePath] = {
    id: storagePath, filename: storagePath, loaded: true,
    exports: { MAX_BYTES: 5 * 1024 * 1024, validateProductImage: () => ({ extension: "png", mime: "image/png" }) }
  };
  delete require.cache[servicePath];
  const service = require(servicePath);
  const restore = () => {
    for (const [key, path] of Object.entries({ prisma: prismaPath, storage: storagePath, service: servicePath })) {
      if (previous[key]) require.cache[path] = previous[key];
      else delete require.cache[path];
    }
  };
  return { service, restore };
}

async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, code, `esperaba ${code} pero fallo con ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`se esperaba un error ${code}`);
}

// === Helpers puros ===

test("buildInstallmentSchedule: la ultima cuota absorbe el residuo y la suma cierra exacta", () => {
  const rows = buildInstallmentSchedule({
    amount: 1000.10, count: 3, frequency: "weekly", firstDueDate: new Date("2026-11-03T12:00:00Z")
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.amount), [333.36, 333.36, 333.38]);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, 1000.10);
  assert.deepEqual(rows.map((row) => row.due_date.toISOString().slice(0, 10)), ["2026-11-03", "2026-11-10", "2026-11-17"]);
});

test("buildInstallmentSchedule: mensual con recorte de fin de mes (31-ene -> 28-feb)", () => {
  const rows = buildInstallmentSchedule({
    amount: 300, count: 3, frequency: "monthly", firstDueDate: new Date("2026-01-31T12:00:00Z")
  });
  assert.deepEqual(rows.map((row) => row.due_date.toISOString().slice(0, 10)), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("buildInstallmentSchedule: valida monto, count y frecuencia", () => {
  const due = new Date("2026-11-03T12:00:00Z");
  assert.throws(() => buildInstallmentSchedule({ amount: 0, count: 4, frequency: "weekly", firstDueDate: due }), /mayor a cero/);
  assert.throws(() => buildInstallmentSchedule({ amount: 100, count: 61, frequency: "weekly", firstDueDate: due }), /entre 1 y 60/);
  assert.throws(() => buildInstallmentSchedule({ amount: 100, count: 4, frequency: "daily", firstDueDate: due }), /frecuencia/);
});

test("allocateInstallments: oldest-first, salta cuotas pagadas y reporta sobrante", () => {
  const installments = [
    { id: 3, number: 3, due_date: new Date("2026-11-17T12:00:00Z"), amount: 100, paid_amount: 0 },
    { id: 1, number: 1, due_date: new Date("2026-11-03T12:00:00Z"), amount: 100, paid_amount: 100 },
    { id: 2, number: 2, due_date: new Date("2026-11-10T12:00:00Z"), amount: 100, paid_amount: 40 }
  ];
  const first = allocateInstallments(installments, 90);
  assert.deepEqual(first.allocations, { "2": 60, "3": 30 });
  assert.equal(first.applied, 90);
  assert.equal(first.leftover, 0);

  const second = allocateInstallments(installments, 250);
  assert.deepEqual(second.allocations, { "2": 60, "3": 100 });
  assert.equal(second.applied, 160);
  assert.equal(second.leftover, 90);
});

test("weightedAverageCost: promedio ponderado y casos borde", () => {
  assert.equal(weightedAverageCost(10, 100, 10, 120), 110);
  assert.equal(weightedAverageCost(0, 100, 5, 120), 120);
  assert.equal(weightedAverageCost(0, 100, 0, 120), 120);
  assert.equal(weightedAverageCost(3, 1000, 7, 1), Math.round((3 * 1000 + 7 * 1) / 10 * 100) / 100);
});

// === Flujo de documentos con prisma falso ===

test("createSale en efectivo: numera V-000001, descuenta stock y traza movimientos", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push(
      { id: 1, tenant_id: TENANT, code: "P-0001", name: "Cafe molido", unit: "unidad", price: 18000, cost: 12000, stock: 10, min_stock: 2, active: true, category: null, notes: null, photo_path: null, photo_mime: null, created_at: new Date(), updated_at: new Date() }
    );
    const sale = await service.createSale(TENANT, 7, {
      date: "2026-10-26",
      items: [{ product_id: 1, quantity: 2 }, { product_id: 1, quantity: 1 }],
      payment_type: "cash", method: "Efectivo"
    });
    assert.equal(sale.full_number, "V-000001");
    assert.equal(sale.total, 54000);
    assert.equal(sale.cost_total, 36000);
    assert.equal(sale.items.length, 1, "items duplicados se fusionan en una linea");
    assert.equal(sale.items[0].quantity, 3);
    const product = prisma.state.collections.comercioProduct.find((row) => row.id === 1);
    assert.equal(product.stock, 7);
    const movement = prisma.state.collections.comercioStockMovement.find((row) => row.reason === "sale");
    assert.equal(movement.change, -3);
    assert.equal(movement.reference, "V-000001");
  } finally { restore(); }
});

test("createSale: stock insuficiente aborta con STOCK_INSUFFICIENT y no crea la venta", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push(
      { id: 1, tenant_id: TENANT, code: "P-0001", name: "Arroz", price: 5000, cost: 4000, stock: 2, min_stock: 0, active: true },
      { id: 2, tenant_id: TENANT, code: "P-0002", name: "Azucar", price: 4000, cost: 3000, stock: 50, min_stock: 0, active: true }
    );
    await expectError(service.createSale(TENANT, 7, {
      items: [{ product_id: 2, quantity: 1 }, { product_id: 1, quantity: 99 }]
    }), "STOCK_INSUFFICIENT");
    assert.equal(prisma.state.collections.comercioSale.length, 0);
  } finally { restore(); }
});

test("createSale: venta sin cliente no puede ser a credito", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push({ id: 1, tenant_id: TENANT, code: "P-0001", name: "Jabon", price: 6000, cost: 4000, stock: 10, active: true });
    await expectError(service.createSale(TENANT, 7, {
      items: [{ product_id: 1, quantity: 1 }], payment_type: "credit"
    }), "CREDIT_CUSTOMER_REQUIRED");
  } finally { restore(); }
});

test("createSale a credito: genera cronograma, descuenta el pago inicial y abre el credito", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push({ id: 1, tenant_id: TENANT, code: "P-0001", name: "Colchoneta", price: 100000, cost: 70000, stock: 4, active: true });
    prisma.state.collections.comercioCustomer.push({ id: 11, tenant_id: TENANT, code: "C-0001", name: "Ana Perez", active: true });
    const sale = await service.createSale(TENANT, 7, {
      date: "2026-10-26",
      items: [{ product_id: 1, quantity: 1 }],
      payment_type: "credit", customer_id: 11,
      credit: { down_payment: 20000, installment_count: 4, frequency: "biweekly", first_due_date: "2026-11-05" }
    });
    assert.equal(sale.credit_full_number, "CR-0001");
    const credit = prisma.state.collections.comercioCredit[0];
    assert.equal(credit.financed_amount, 80000);
    assert.equal(credit.status, "open");
    const installments = prisma.state.collections.comercioInstallment.filter((row) => row.credit_id === credit.id);
    assert.equal(installments.length, 4);
    assert.deepEqual(installments.map((row) => row.amount), [20000, 20000, 20000, 20000]);
    assert.deepEqual(installments.map((row) => row.due_date.toISOString().slice(0, 10)),
      ["2026-11-05", "2026-11-19", "2026-12-03", "2026-12-17"]);
  } finally { restore(); }
});

test("addCreditPayment: abono parcial deja cuota partial; saldo cero paga el credito", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    const due1 = new Date("2026-11-05T12:00:00Z");
    const due2 = new Date("2026-11-19T12:00:00Z");
    prisma.state.collections.comercioCredit.push({ id: 50, tenant_id: TENANT, number: 1, full_number: "CR-0001", financed_amount: 50000, down_payment: 0, installment_count: 2, frequency: "biweekly", first_due_date: due1, status: "open", paid_at: null, sale_id: 1, customer_id: 11, customer_name: "Ana Perez", created_at: new Date(), updated_at: new Date() });
    prisma.state.collections.comercioInstallment.push(
      { id: 51, tenant_id: TENANT, credit_id: 50, number: 1, due_date: due1, amount: 25000, paid_amount: 0, status: "open", paid_at: null },
      { id: 52, tenant_id: TENANT, credit_id: 50, number: 2, due_date: due2, amount: 25000, paid_amount: 0, status: "open", paid_at: null }
    );

    const partial = await service.addCreditPayment(TENANT, 7, 50, { amount: 10000, date: "2026-11-06" });
    assert.equal(partial.credit.balance, 40000);
    assert.equal(partial.payment.allocations["51"], 10000);
    let inst1 = prisma.state.collections.comercioInstallment.find((row) => row.id === 51);
    assert.equal(inst1.status, "partial");
    assert.equal(inst1.paid_amount, 10000);

    await expectError(service.addCreditPayment(TENANT, 7, 50, { amount: 40001 }), "PAYMENT_AMOUNT_INVALID");

    const final = await service.addCreditPayment(TENANT, 7, 50, { amount: 40000, date: "2026-11-20" });
    assert.equal(final.credit.status, "paid");
    assert.equal(final.credit.balance, 0);
    inst1 = prisma.state.collections.comercioInstallment.find((row) => row.id === 51);
    assert.equal(inst1.status, "paid");
    const inst2 = prisma.state.collections.comercioInstallment.find((row) => row.id === 52);
    assert.equal(inst2.status, "paid");
  } finally { restore(); }
});

test("voidSale: devuelve el stock y anula; si el credito ya tiene abonos se bloquea", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push({ id: 1, tenant_id: TENANT, code: "P-0001", name: "Ventilador", price: 90000, cost: 60000, stock: 5, min_stock: 0, active: true });
    prisma.state.collections.comercioSale.push({ id: 10, tenant_id: TENANT, number: 1, full_number: "V-000001", date: new Date("2026-10-26T12:00:00Z"), subtotal: 90000, discount: 0, total: 90000, cost_total: 60000, payment_type: "cash", method: "Efectivo", status: "active", note: null, customer_id: null, customer_name: null, created_at: new Date(), updated_at: new Date() });
    prisma.state.collections.comercioSaleItem.push({ id: 12, tenant_id: TENANT, sale_id: 10, line_number: 1, product_id: 1, product_code: "P-0001", product_name: "Ventilador", quantity: 2, unit_price: 90000, unit_cost: 60000, line_total: 180000 });

    const voided = await service.voidSale(TENANT, 7, 10, { reason: "Error de digitacion" });
    assert.equal(voided.status, "voided");
    const product = prisma.state.collections.comercioProduct.find((row) => row.id === 1);
    assert.equal(product.stock, 7);
    const movement = prisma.state.collections.comercioStockMovement.find((row) => row.reason === "sale_void");
    assert.equal(movement.change, 2);

    await expectError(service.voidSale(TENANT, 7, 10, {}), "SALE_ALREADY_VOIDED");

    // Credito con abonos registrados bloquea la anulacion.
    prisma.state.collections.comercioSale.push({ id: 11, tenant_id: TENANT, number: 2, full_number: "V-000002", date: new Date("2026-10-26T12:00:00Z"), subtotal: 50000, discount: 0, total: 50000, cost_total: 30000, payment_type: "credit", status: "active", created_at: new Date(), updated_at: new Date() });
    prisma.state.collections.comercioCredit.push({ id: 60, tenant_id: TENANT, sale_id: 11, customer_id: 11, customer_name: "Ana", number: 1, full_number: "CR-0001", financed_amount: 50000, down_payment: 0, installment_count: 1, frequency: "weekly", first_due_date: null, status: "open", created_at: new Date(), updated_at: new Date() });
    prisma.state.collections.comercioPayment.push({ id: 61, tenant_id: TENANT, credit_id: 60, date: new Date("2026-11-01T12:00:00Z"), amount: 10000, method: "Efectivo", allocations: {}, created_at: new Date(), updated_at: new Date() });
    await expectError(service.voidSale(TENANT, 7, 11, {}), "CREDIT_HAS_PAYMENTS");
  } finally { restore(); }
});

test("createPurchase: actualiza costo promedio ponderado, stock y numero CMP-0001", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push({ id: 1, tenant_id: TENANT, code: "P-0001", name: "Azucar", price: 5000, cost: 4000, stock: 10, min_stock: 0, active: true });
    const purchase = await service.createPurchase(TENANT, 7, {
      product_id: 1, quantity: 10, unit_cost: 4800, supplier: "Distribuidora La Fe", date: "2026-10-26"
    });
    assert.equal(purchase.full_number, "CMP-0001");
    assert.equal(purchase.total, 48000);
    const product = prisma.state.collections.comercioProduct.find((row) => row.id === 1);
    assert.equal(product.stock, 20);
    assert.equal(product.cost, 4400);
    const movement = prisma.state.collections.comercioStockMovement.find((row) => row.reason === "purchase");
    assert.equal(movement.stock_after, 20);
    assert.equal(movement.reference, "CMP-0001");
  } finally { restore(); }
});

test("adjustStock: new_stock fijo, bloqueo optimista y negativo rechazado", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push({ id: 1, tenant_id: TENANT, code: "P-0001", name: "Leche", price: 3000, cost: 2200, stock: 8, min_stock: 0, active: true });
    const ok = await service.adjustStock(TENANT, 7, 1, { new_stock: 6, reason: "Merma" });
    assert.equal(ok.product.stock, 6);
    assert.equal(ok.movement.change, -2);
    assert.equal(ok.movement.reason, "adjustment");

    await expectError(service.adjustStock(TENANT, 7, 1, { change: -100 }), "STOCK_NEGATIVE");

    // Carrera: otro proceso ya dejo el stock en 4; el where optimista no coincide.
    prisma.state.collections.comercioProduct[0].stock = 4;
    prisma.state.collections.comercioProduct[0].name = "Leche";
    const staleId = prisma.state.collections.comercioProduct[0].id;
    const originalUpdateMany = prisma.comercioProduct.updateMany;
    prisma.comercioProduct.updateMany = async (args) => {
      if (args.where.stock !== undefined) return { count: 0 };
      return originalUpdateMany(args);
    };
    void staleId;
    await expectError(service.adjustStock(TENANT, 7, 1, { new_stock: 5 }), "STOCK_CHANGED");
  } finally { restore(); }
});

test("createProduct: asigna codigo P-0001 y traza el movimiento inicial", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    const product = await service.createProduct(TENANT, 7, { name: "Panela", price: 2500, cost: 1800, stock: 25 });
    assert.equal(product.code, "P-0001");
    assert.equal(product.stock, 25);
    const movement = prisma.state.collections.comercioStockMovement[0];
    assert.equal(movement.reason, "initial");
    assert.equal(movement.change, 25);
    // El codigo del segundo producto incrementa.
    const second = await service.createProduct(TENANT, 7, { name: "Bistec", price: 15000, cost: 11000 });
    assert.equal(second.code, "P-0002");
    assert.equal(second.stock, 0);
  } finally { restore(); }
});

test("setCustomerActive: no desactiva clientes con creditos vigentes", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioCustomer.push({ id: 11, tenant_id: TENANT, code: "C-0001", name: "Ana", active: true });
    prisma.state.collections.comercioCredit.push({ id: 50, tenant_id: TENANT, customer_id: 11, status: "open", financed_amount: 10000, full_number: "CR-0001" });
    await expectError(service.setCustomerActive(TENANT, 11, false), "CUSTOMER_HAS_OPEN_CREDITS");
    const inactive = await service.setCustomerActive(TENANT, 11, true);
    assert.equal(inactive.active, true);
  } finally { restore(); }
});

test("esquemas Fastify: el body de venta rechaza propiedades desconocidas", () => {
  assert.equal(schemaModule.saleCreateSchema.body.additionalProperties, false);
  assert.equal(schemaModule.productUpdateSchema.body.properties.stock, undefined, "el stock no se edita por PUT /products/:id");
});
