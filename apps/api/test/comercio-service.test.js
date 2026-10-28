const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

// Helpers puros del modulo real (no tocan base de datos).
const comercio = require("../src/modules/comercio/service");
const schemaModule = require("../src/modules/comercio/schema");

const { buildInstallmentSchedule, allocateInstallments, weightedAverageCost, normalizeDiscountPercent, discountedPrice, promotionActive, bestPromotionFor, storefrontBanner, effectiveDiscountPercent, renderPromotionMessage } = comercio;

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
      comercioStockMovement: [],
      comercioPromotion: [],
      comercioPromotionCategory: [],
      comercioPromotionProduct: [],
      comercioPromotionSend: []
    }
  };
  const relations = {
    comercioSale: { items: ["comercioSaleItem", "sale_id"] },
    comercioCredit: { installments: ["comercioInstallment", "credit_id"], payments: ["comercioPayment", "credit_id"] },
    comercioPayment: { credit: ["comercioCredit", "id"] },
    comercioPromotion: {
      categories: ["comercioPromotionCategory", "promotion_id"],
      products: ["comercioPromotionProduct", "promotion_id"]
    }
  };
  const defaults = {
    comercioSettings: { store_name: "Mi comercio", currency: "COP", receipt_note: null, preferences_json: {} },
    comercioProduct: { code: "", name: "", category: null, unit: "unidad", price: 0, discount_percent: 0, cost: 0, stock: 0, min_stock: 0, active: true, notes: null, photo_path: null, photo_mime: null, catalog_featured: false },
    comercioCustomer: { code: "", name: "", document: null, phone: null, email: null, address: null, active: true, notes: null },
    comercioInstallment: { number: 1, due_date: null, amount: 0, paid_amount: 0, status: "open", paid_at: null },
    comercioPromotion: { scope: "all", status: "draft", start_date: null, end_date: null, message: null, created_by: null }
  };

  // Unicidades que el servicio espera de la migracion (send por promocion+cliente,
  // segmentos por promocion+destino).
  function duplicated(rows, model, row) {
    if (model === "comercioPromotionSend") {
      return rows.some((item) => item.promotion_id === row.promotion_id && item.customer_id === row.customer_id);
    }
    if (model === "comercioPromotionCategory") {
      return rows.some((item) => item.promotion_id === row.promotion_id && item.category === row.category);
    }
    if (model === "comercioPromotionProduct") {
      return rows.some((item) => item.promotion_id === row.promotion_id && item.product_id === row.product_id);
    }
    return false;
  }

  function hydrate(model, row, include = {}) {
    const rels = relations[model];
    const out = { ...row };
    if (rels) {
      for (const [rel, [targetModel, foreignKey]] of Object.entries(rels)) {
        out[rel] = state.collections[targetModel].filter((item) => item[foreignKey] === row.id);
      }
    }
    if (include._count?.select?.sends) {
      out._count = {
        sends: state.collections.comercioPromotionSend.filter((item) => item.promotion_id === row.id).length
      };
    }
    return out;
  }

  function delegate(model) {
    const rows = state.collections[model];
    // Emula el middleware SOFT_DELETE de core/prisma.js: los maestros archivados (active=false)
    // solo son visibles cuando el where trae __includeInactive: true. Sin esta semántica el
    // arnés nunca vio la colisión de códigos al reactivar el conteo sobre filas inactivas.
    const softMaster = model === "comercioProduct" || model === "comercioCustomer";
    const keep = (row, where) => matches(row, where) && !(softMaster && row.active === false && where.__includeInactive !== true);
    return {
      findMany: async ({ where = {}, orderBy, take, skip, include } = {}) => {
        state.calls.push({ op: `${model}.findMany`, where });
        let out = sortRows(rows.filter((row) => keep(row, where)), orderBy);
        if (skip) out = out.slice(skip);
        if (take !== undefined) out = out.slice(0, take);
        return out.map((row) => hydrate(model, structuredClone(row), include));
      },
      findFirst: async ({ where = {}, orderBy, include } = {}) => {
        state.calls.push({ op: `${model}.findFirst`, where });
        const out = sortRows(rows.filter((row) => keep(row, where)), orderBy);
        return out.length ? hydrate(model, structuredClone(out[0]), include) : null;
      },
      count: async ({ where = {} } = {}) => {
        state.calls.push({ op: `${model}.count`, where });
        return rows.filter((row) => keep(row, where)).length;
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
      createMany: async ({ data = [], skipDuplicates = false } = {}) => {
        state.calls.push({ op: `${model}.createMany`, data });
        const list = Array.isArray(data) ? data : [data];
        let count = 0;
        for (const entry of list) {
          const row = { id: ++state.sequence, tenant_id: TENANT, created_at: new Date(), ...structuredClone(entry) };
          if (skipDuplicates && duplicated(rows, model, row)) continue;
          rows.push(row);
          count += 1;
        }
        return { count };
      },
      deleteMany: async ({ where = {} } = {}) => {
        state.calls.push({ op: `${model}.deleteMany`, where });
        const before = rows.length;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (matches(rows[index], where)) rows.splice(index, 1);
        }
        return { count: before - rows.length };
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
    exports: {
      MAX_BYTES: 5 * 1024 * 1024,
      validateProductImage: () => ({ extension: "png", mime: "image/png" }),
      publicViewUrl: (path) => (path ? `https://public.test/${path}` : null)
    }
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

// === Descuentos parametrizables ===

test("normalizeDiscountPercent: techo 90%, vacio es cero y el fuera de rango se rechaza", () => {
  assert.equal(normalizeDiscountPercent(undefined), 0);
  assert.equal(normalizeDiscountPercent(""), 0);
  assert.equal(normalizeDiscountPercent(null), 0);
  assert.equal(normalizeDiscountPercent("25"), 25);
  assert.equal(normalizeDiscountPercent(12.5), 12.5);
  for (const bad of [-1, 90.5, 100, "abc"]) {
    assert.throws(() => normalizeDiscountPercent(bad), (error) => error.code === "DISCOUNT_PERCENT_INVALID", `debia rechazar ${bad}`);
  }
});

test("discountedPrice: aplica el porcentaje sobre el precio de lista y redondea a centavos", () => {
  assert.equal(discountedPrice(18000, 0), 18000);
  assert.equal(discountedPrice(18000, 25), 13500);
  assert.equal(discountedPrice(1990, 10), 1791);
  assert.equal(discountedPrice(10000, 33.33), 6667);
  assert.equal(discountedPrice(0, 50), 0);
});

test("promotionActive: estado, porcentaje y ventana inclusiva", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const base = { name: "Fin de mes", scope: "all", status: "active", percent: 30 };
  assert.equal(promotionActive(base, now), true);
  assert.equal(promotionActive({ ...base, status: "draft" }, now), false);
  assert.equal(promotionActive({ ...base, status: "paused" }, now), false);
  assert.equal(promotionActive({ ...base, percent: 0 }, now), false);
  assert.equal(promotionActive({ ...base, start_date: "2026-11-01T12:00:00Z" }, now), false);
  assert.equal(promotionActive({ ...base, end_date: "2026-10-01T12:00:00Z" }, now), false);
  // Extremos inclusivos y ventana abierta por un lado.
  assert.equal(promotionActive({ ...base, start_date: now.toISOString() }, now), true);
  assert.equal(promotionActive({ ...base, end_date: now.toISOString() }, now), true);
  assert.equal(promotionActive(null, now), false);
});

test("bestPromotionFor: respeta alcance y gana el mayor descuento sin sumar", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const promotions = [
    { id: 1, name: "Toda la tienda", scope: "all", status: "active", percent: 10 },
    { id: 2, name: "Ropa", scope: "categories", status: "active", percent: 25, categories: [{ category: "Ropa" }] },
    { id: 3, name: "Gorra", scope: "products", status: "active", percent: 40, products: [{ product_id: 7 }] },
    { id: 4, name: "Pausada", scope: "all", status: "paused", percent: 80 }
  ];
  assert.equal(bestPromotionFor({ id: 1, category: "Ferreteria" }, promotions, now).percent, 10);
  assert.equal(bestPromotionFor({ id: 2, category: "Ropa" }, promotions, now).percent, 25);
  assert.equal(bestPromotionFor({ id: 7, category: "Ropa" }, promotions, now).percent, 40);
  assert.equal(bestPromotionFor({ id: 8, category: null }, [], now).percent, 0);
  // El producto conserva su propio descuento cuando es mayor; nunca se acumulan.
  assert.equal(effectiveDiscountPercent({ id: 7, category: "Ropa", discount_percent: 15 }, promotions, now), 40);
  assert.equal(effectiveDiscountPercent({ id: 8, category: "Ferreteria", discount_percent: 35 }, promotions, now), 35);
  assert.equal(effectiveDiscountPercent({ id: 9, discount_percent: 0 }, promotions, now), 10);
  assert.equal(effectiveDiscountPercent({}, null, now), 0);
});

test("storefrontBanner: anuncia solo promociones de toda la tienda y manda el mayor", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const banner = storefrontBanner([
    { id: 1, name: "General", scope: "all", status: "active", percent: 10, start_date: "2026-10-20T12:00:00Z", end_date: new Date("2026-11-11T12:00:00Z") },
    { id: 2, name: "Refuerzo", scope: "all", status: "active", percent: 20 },
    { id: 3, name: "Ropa", scope: "categories", status: "active", percent: 50, categories: [{ category: "Ropa" }] }
  ], now);
  assert.equal(banner.active, true);
  assert.equal(banner.percent, 20);
  assert.equal(banner.label, "Refuerzo");
  assert.equal(storefrontBanner([], now).active, false);
  assert.equal(storefrontBanner([{ id: 3, name: "Ropa", scope: "categories", status: "active", percent: 50 }], now).percent, 0);
});

test("renderPromotionMessage: personaliza marcadores y cae en un texto por defecto", () => {
  const rendered = renderPromotionMessage("Hola {cliente}, {negocio} tiene {promo} con {descuento}: {enlace}", {
    customerName: "Maria", storeName: "La Estacion", promotionName: "Fin de mes", percent: 15, link: "https://tienda.test/tienda/abc"
  });
  assert.equal(rendered, "Hola Maria, La Estacion tiene Fin de mes con 15%: https://tienda.test/tienda/abc");
  const fallback = renderPromotionMessage(null, { customerName: "Ana", storeName: "Mi negocio", promotionName: "Promo", percent: 10, link: "" });
  assert.match(fallback, /Hola Ana/);
  assert.match(fallback, /10%/);
});

test("createSale: cobra el precio con el descuento del producto, no el de lista", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioProduct.push(
      { id: 1, tenant_id: TENANT, code: "P-0001", name: "Zapato", unit: "unidad", price: 100000, discount_percent: 25, cost: 60000, stock: 4, min_stock: 0, active: true }
    );
    const sale = await service.createSale(TENANT, 7, { items: [{ product_id: 1, quantity: 2 }], payment_type: "cash" });
    assert.equal(sale.items[0].unit_price, 75000);
    assert.equal(sale.subtotal, 150000);
    assert.equal(sale.total, 150000);
    // El costo sigue siendo el real: el descuento sale del margen, no del costo.
    assert.equal(sale.cost_total, 120000);
  } finally { restore(); }
});

test("createSale: la promocion vigente manda sobre el descuento del producto dentro de su ventana", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioPromotion.push({
      id: 1, tenant_id: TENANT, name: "Noviembre", scope: "all", percent: 30, status: "active",
      start_date: new Date("2026-11-01T12:00:00Z"), end_date: new Date("2026-11-30T12:00:00Z")
    });
    prisma.state.collections.comercioProduct.push(
      { id: 1, tenant_id: TENANT, code: "P-0001", name: "Balon", price: 50000, discount_percent: 10, cost: 30000, stock: 5, min_stock: 0, active: true },
      { id: 2, tenant_id: TENANT, code: "P-0002", name: "Red", price: 50000, discount_percent: 60, cost: 30000, stock: 5, min_stock: 0, active: true }
    );
    const dentro = await service.createSale(TENANT, 7, { date: "2026-11-05", items: [{ product_id: 1, quantity: 1 }], payment_type: "cash" });
    assert.equal(dentro.items[0].unit_price, 35000, "promocion 30% supera al descuento propio de 10%");
    const mayor = await service.createSale(TENANT, 7, { date: "2026-11-05", items: [{ product_id: 2, quantity: 1 }], payment_type: "cash" });
    assert.equal(mayor.items[0].unit_price, 20000, "el descuento propio de 60% sigue siendo el mayor");
    const fuera = await service.createSale(TENANT, 7, { date: "2026-12-05", items: [{ product_id: 1, quantity: 1 }], payment_type: "cash" });
    assert.equal(fuera.items[0].unit_price, 45000, "promocion vencida: solo aplica el descuento del producto");
  } finally { restore(); }
});

test("createSale: una promocion segmentada solo rebaja los productos de su alcance", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioPromotion.push({
      id: 1, tenant_id: TENANT, name: "Solo ropa", scope: "categories", percent: 20, status: "active",
      start_date: null, end_date: null
    });
    prisma.state.collections.comercioPromotionCategory.push({ id: 1, tenant_id: TENANT, promotion_id: 1, category: "Ropa" });
    prisma.state.collections.comercioProduct.push(
      { id: 1, tenant_id: TENANT, code: "P-0001", name: "Camisa", category: "Ropa", price: 40000, discount_percent: 0, cost: 20000, stock: 5, min_stock: 0, active: true },
      { id: 2, tenant_id: TENANT, code: "P-0002", name: "Taladro", category: "Ferreteria", price: 40000, discount_percent: 0, cost: 20000, stock: 5, min_stock: 0, active: true }
    );
    const ropa = await service.createSale(TENANT, 7, { items: [{ product_id: 1, quantity: 1 }], payment_type: "cash" });
    assert.equal(ropa.items[0].unit_price, 32000);
    const ferreteria = await service.createSale(TENANT, 7, { items: [{ product_id: 2, quantity: 1 }], payment_type: "cash" });
    assert.equal(ferreteria.items[0].unit_price, 40000, "fuera del alcance se cobra el precio de lista");
  } finally { restore(); }
});

test("updateProduct: persiste descuento y destacado; el DTO expone el precio final", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    const created = await service.createProduct(TENANT, 7, { name: "Jugo", price: 9000, cost: 5000, discount_percent: 15, catalog_featured: true });
    assert.equal(created.discount_percent, 15);
    assert.equal(created.price_final, 7650);
    assert.equal(created.catalog_featured, true);
    assert.equal(created.price, 9000, "el precio de lista no se reescribe");
    const updated = await service.updateProduct(TENANT, 7, created.id, { discount_percent: 0 });
    assert.equal(updated.price_final, 9000);
    await expectError(service.updateProduct(TENANT, 7, created.id, { discount_percent: 95 }), "DISCOUNT_PERCENT_INVALID");
  } finally { restore(); }
});

test("listProducts: sale_price es el precio del mostrador con la mejor promocion ponderada", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    const byName = (items, name) => items.find((item) => item.name === name);
    await service.createProduct(TENANT, 7, { name: "Sin descuento", price: 10000, cost: 5000 });
    await service.createProduct(TENANT, 7, { name: "Con descuento propio", price: 10000, cost: 5000, discount_percent: 25 });

    // Sin promociones: el mostrador cobra el precio final del maestro.
    let list = (await service.listProducts(TENANT, {})).items;
    assert.equal(byName(list, "Sin descuento").sale_price, 10000);
    assert.equal(byName(list, "Con descuento propio").sale_price, 7500);

    // Promocion del 10% vigente (sin ventana): rebaja lo que no tiene descuento propio,
    // pero nunca se acumula con el 25% del producto.
    const promo = await service.createPromotion(TENANT, 7, { name: "Liquidacion", percent: 10, status: "active" });
    list = (await service.listProducts(TENANT, {})).items;
    assert.equal(byName(list, "Sin descuento").sale_discount_percent, 10);
    assert.equal(byName(list, "Sin descuento").sale_price, 9000);
    assert.equal(byName(list, "Sin descuento").sale_promotion, "Liquidacion");
    assert.equal(byName(list, "Sin descuento").price_final, 10000, "price_final sigue siendo solo el descuento del producto");
    assert.equal(byName(list, "Con descuento propio").sale_discount_percent, 25);
    assert.equal(byName(list, "Con descuento propio").sale_price, 7500);
    assert.equal(byName(list, "Con descuento propio").sale_promotion, null);

    // Promocion fuera de ventana: vuelve el precio propio.
    await service.updatePromotion(TENANT, promo.id, { start_date: "2099-01-01" });
    list = (await service.listProducts(TENANT, {})).items;
    assert.equal(byName(list, "Sin descuento").sale_price, 10000);
  } finally { restore(); }
});

test("updateSettings: deja de manejar campanas (ahora viven en Promociones)", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    const saved = await service.updateSettings(TENANT, { catalog_tagline: "Todo para tu vuelta" });
    assert.equal(saved.catalog_tagline, "Todo para tu vuelta");
    assert.equal("catalog_promo_percent" in saved, false);
    assert.equal("catalog_promo_label" in saved, false);
  } finally { restore(); }
});

test("promociones: valida alcance, ventana y activacion; edita segmentos", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    await service.createProduct(TENANT, 7, { name: "Gorra", category: "Ropa", price: 20000, cost: 9000 });
    await expectError(service.createPromotion(TENANT, 7, { name: "", percent: 10 }), "PROMOTION_NAME_INVALID");
    await expectError(service.createPromotion(TENANT, 7, { name: "Mala", percent: 95 }), "DISCOUNT_PERCENT_INVALID");
    await expectError(service.createPromotion(TENANT, 7, {
      name: "Rango", percent: 10, start_date: "2026-11-10", end_date: "2026-11-01"
    }), "PROMOTION_RANGE_INVALID");
    await expectError(service.createPromotion(TENANT, 7, {
      name: "Activa sin descuento", percent: 0, status: "active"
    }), "PROMOTION_PERCENT_REQUIRED");
    await expectError(service.createPromotion(TENANT, 7, {
      name: "Categorias vacias", percent: 10, status: "active", scope: "categories"
    }), "PROMOTION_SCOPE_EMPTY");
    await expectError(service.createPromotion(TENANT, 7, {
      name: "Producto inexistente", percent: 10, status: "active", scope: "products", product_ids: [99]
    }), "PROMOTION_PRODUCT_NOT_FOUND");

    const promo = await service.createPromotion(TENANT, 7, {
      name: "Fin de mes", percent: 15, status: "active", scope: "categories", categories: ["Ropa", "Ropa", ""],
      start_date: "2026-10-01", end_date: "2026-11-30", message: "Hola {cliente}: {descuento} en {negocio}"
    });
    assert.equal(promo.scope, "categories");
    assert.deepEqual(promo.categories, ["Ropa"], "las categorias se deduplican y las vacias se descartan");
    assert.equal(promo.start_date, "2026-10-01");
    assert.equal(promo.active, true);

    const paused = await service.setPromotionStatus(TENANT, promo.id, "paused");
    assert.equal(paused.active, false);
    const archived = await service.setPromotionStatus(TENANT, promo.id, "archived");
    assert.equal(archived.status, "archived");
    await expectError(service.updatePromotion(TENANT, promo.id, { name: "Otra" }), "PROMOTION_ARCHIVED");
    await expectError(service.setPromotionStatus(TENANT, promo.id, "active"), "PROMOTION_ARCHIVED");
    await expectError(service.deletePromotion(TENANT, promo.id), "PROMOTION_NOT_DRAFT");

    const draft = await service.setPromotionStatus(TENANT, promo.id, "draft");
    const updated = await service.updatePromotion(TENANT, draft.id, { scope: "all", name: "Todo el local" });
    assert.equal(updated.scope, "all");
    assert.deepEqual(updated.categories, [], "cambiar a alcance total limpia los segmentos");
    const deleted = await service.deletePromotion(TENANT, updated.id);
    assert.equal(deleted.deleted, true);
    assert.equal(prisma.state.collections.comercioPromotion.length, 0);
  } finally { restore(); }
});

test("audiencia y envio: personaliza por cliente con WhatsApp y evita repetir envios", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioSettings.push({
      id: 1, tenant_id: TENANT, store_name: "La Estacion", catalog_enabled: true, catalog_code: "estacion"
    });
    prisma.state.collections.comercioCustomer.push(
      { id: 1, tenant_id: TENANT, code: "C-0001", name: "Ana", phone: "+57 300 111 2233", active: true },
      { id: 2, tenant_id: TENANT, code: "C-0002", name: "Beto", phone: null, active: true },
      { id: 3, tenant_id: TENANT, code: "C-0003", name: "Carla", phone: "3009998877", active: true }
    );
    const promo = await service.createPromotion(TENANT, 7, {
      name: "Fin de mes", percent: 15, status: "active", message: "Hola {cliente}, {promo} con {descuento}: {enlace}"
    });

    const audience = await service.promotionAudience(TENANT, promo.id, { base_url: "http://localhost:3001" });
    assert.equal(audience.totals.audience, 2, "solo clientes con WhatsApp valido");
    assert.equal(audience.totals.pending, 2);
    assert.equal(audience.items[0].message, "Hola Ana, Fin de mes con 15%: http://localhost:3001/tienda/estacion");
    assert.match(audience.items[0].wa_url, /^https:\/\/wa\.me\/573001112233\?text=/);

    const first = await service.registerPromotionSends(TENANT, 7, promo.id, {
      customer_ids: [1, 3, 2], base_url: "http://localhost:3001"
    });
    assert.equal(first.registered, 2);
    assert.equal(first.without_phone, 1);
    const again = await service.registerPromotionSends(TENANT, 7, promo.id, { customer_ids: [1] });
    assert.equal(again.registered, 0, "no duplica el envio al mismo cliente");
    assert.equal(again.skipped, 1);

    const pending = await service.promotionAudience(TENANT, promo.id, { pending: "true" });
    assert.equal(pending.totals.sent, 2);
    assert.equal(pending.totals.pending, 0);
    assert.equal(pending.items.length, 0);
    await expectError(service.promotionAudience(TENANT, promo.id, { base_url: "javascript:alert(1)" }), "PROMOTION_BASE_URL_INVALID");
  } finally { restore(); }
});

test("publicCatalog: expone precio final, precio de lista, descuento y banner sin filtrar costo ni stock", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    prisma.state.collections.comercioSettings.push({
      id: 1, tenant_id: TENANT, store_name: "La Estacion", currency: "COP", catalog_enabled: true, catalog_code: "estacion",
      catalog_whatsapp: "+573001112233", catalog_tagline: "Ropa, ferreteria y mas"
    });
    prisma.state.collections.comercioPromotion.push({
      id: 1, tenant_id: TENANT, name: "Liquidacion", scope: "all", percent: 25, status: "active", start_date: null, end_date: null
    });
    prisma.state.collections.comercioProduct.push(
      { id: 1, tenant_id: TENANT, code: "P-0001", name: "Gorra", category: "Ropa", unit: "unidad", price: 20000, discount_percent: 0, cost: 9000, stock: 3, min_stock: 0, active: true, notes: "Ajustable", photo_path: "ropa/gorra.png", catalog_featured: true },
      { id: 2, tenant_id: TENANT, code: "P-0002", name: "Martillo", category: "Ferreteria", unit: "unidad", price: 16000, discount_percent: 50, cost: 8000, stock: 0, min_stock: 0, active: true, notes: null, photo_path: null },
      // Archivado: la vitrina nunca lo publica.
      { id: 3, tenant_id: TENANT, code: "P-0003", name: "Retirado", category: "Ropa", unit: "unidad", price: 5000, discount_percent: 0, cost: 1000, stock: 4, min_stock: 0, active: false }
    );
    const catalog = await service.publicCatalog("estacion");
    assert.equal(catalog.tagline, "Ropa, ferreteria y mas");
    assert.equal(catalog.promo.active, true);
    assert.equal(catalog.promo.percent, 25);
    assert.equal(catalog.promo.label, "Liquidacion");
    assert.deepEqual(catalog.categories, ["Ferreteria", "Ropa"]);
    const gorra = catalog.items.find((item) => item.code === "P-0001");
    assert.equal(gorra.base_price, 20000);
    assert.equal(gorra.price, 15000, "la promocion de tienda aplica sobre el producto sin descuento propio");
    assert.equal(gorra.discount_percent, 25);
    assert.equal(gorra.featured, true);
    assert.equal(gorra.description, "Ajustable");
    assert.equal(gorra.photo_url, "https://public.test/ropa/gorra.png");
    const martillo = catalog.items.find((item) => item.code === "P-0002");
    assert.equal(martillo.price, 8000, "gana el descuento mayor (50% sobre la promocion de 25%)");
    assert.equal(martillo.available, false);
    assert.equal(catalog.items.find((item) => item.code === "P-0003"), undefined, "un producto archivado no se publica");
    const raw = JSON.stringify(catalog);
    assert.ok(!raw.includes("cost"), "el catalogo publico no revela costos");
    assert.ok(!raw.includes("stock"), "el catalogo publico no revela existencias");
    assert.ok(!raw.includes(TENANT), "el catalogo publico no revela el tenant");
  } finally { restore(); }
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

test("createProduct: el codigo no reinicia sobre productos archivados (unique tenant+code)", async () => {
  const prisma = fakePrisma();
  const { service, restore } = loadComercioService(prisma);
  try {
    const first = await service.createProduct(TENANT, 7, { name: "Cafe", price: 18000, cost: 11000 });
    assert.equal(first.code, "P-0001");
    await service.setProductActive(TENANT, first.id, false);
    // Si la numeracion ignorara los archivados, reiniciaria en P-0001 y colisionaria
    // con el unique (tenant_id, code): en real eso es P2002/409 DUPLICADO.
    const next = await service.createProduct(TENANT, 7, { name: "Tumo", price: 9000, cost: 5000 });
    assert.equal(next.code, "P-0002");
    const cust = await service.createCustomer(TENANT, { name: "Ana" });
    await service.setCustomerActive(TENANT, cust.id, false);
    const cust2 = await service.createCustomer(TENANT, { name: "Beto" });
    assert.equal(cust2.code, "C-0002");
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

test("esquemas Fastify: descuentos y promociones son propiedades escribibles con techo de 90", () => {
  for (const body of [schemaModule.productCreateSchema.body, schemaModule.productUpdateSchema.body]) {
    assert.equal(body.properties.discount_percent.maximum, 90);
    assert.equal(body.properties.catalog_featured.type, "boolean");
  }
  const settings = schemaModule.settingsSchema.body.properties;
  assert.equal(settings.catalog_promo_percent, undefined, "las campanas ya no se editan en Configuracion");
  assert.equal(settings.catalog_tagline.maxLength, 160);
  assert.equal(settings.catalog_foo, undefined, "el body de configuracion sigue siendo cerrado");

  const promotion = schemaModule.promotionCreateSchema.body;
  assert.equal(promotion.additionalProperties, false);
  assert.deepEqual(promotion.required, ["name", "percent"]);
  assert.equal(promotion.properties.percent.maximum, 90);
  assert.deepEqual(promotion.properties.scope.enum, ["all", "categories", "products"]);
  assert.deepEqual(promotion.properties.start_date.type, ["string", "null"]);
  assert.equal(promotion.properties.end_date.pattern, "^\\d{4}-\\d{2}-\\d{2}$");
  assert.equal(schemaModule.promotionStatusSchema.body.properties.status.enum.includes("archived"), true);
  assert.equal(schemaModule.promotionSendSchema.body.properties.customer_ids.maxItems, 500);
});
