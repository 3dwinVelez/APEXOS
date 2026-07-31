const prisma = require("../../core/prisma");
const { brainQueue } = require("../../fabric/queues");
const accountingService = require("../accounting/service");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function createItem(tenantId, userId, data) {
  const {
    code = null, name, type, unit, category_id, family_code = null, society_code = null, branch_code = null, costing_method = "weighted_average",
    unit_cost, unit_price, tax_rate = 0,
    stock_min = 0, stock_max = null,
    weight_kg = 0, volume_m3 = 0, metadata = {}
  } = data;

  if (code && String(code).includes(" ")) throw appError(400, "INVALID_CODE", "El codigo no puede tener espacios");
  if (!name.trim()) {
    throw appError(400, "REQUIRED_NAME", "El nombre es obligatorio");
  }
  const validTypes = ["product", "service", "asset", "component", "raw_material"];
  if (!validTypes.includes(type)) {
    throw appError(400, "INVALID_TYPE", `Tipo invalido: ${type}`);
  }
  if ((unit_cost ?? 0) < 0 || (unit_price ?? 0) < 0) {
    throw appError(400, "INVALID_PRICE", "Los precios no pueden ser negativos");
  }
  if (costing_method !== "weighted_average") {
    throw appError(400, "INVALID_COSTING_METHOD", "Por ahora solo esta disponible promedio ponderado");
  }
  if (tax_rate < 0 || tax_rate > 35) {
    throw appError(400, "INVALID_TAX", "tax_rate debe estar entre 0 y 35");
  }
  if (stock_max !== null && stock_max <= stock_min) {
    throw appError(400, "INVALID_STOCK", "stock_max debe ser mayor a stock_min");
  }
  if (category_id) {
    const category = await prisma.runWithTenant(tenantId, () => prisma.category.findFirst({ where: { id: category_id } }));
    if (!category) throw appError(404, "CATEGORY_NOT_FOUND", "La categoria no existe");
  }

  return prisma.runWithTenant(tenantId, async () => {
    let family = null;
    const normalizedFamily = normalizeCode(family_code || metadata.family);
    const societyCode = normalizeCode(society_code || metadata.society_code);
    const branchCode = normalizeCode(branch_code || metadata.branch_code);
    if (!normalizedFamily) throw appError(400, "REQUIRED_FAMILY", "Selecciona una familia para el producto");
    if (!societyCode || !branchCode) throw appError(400, "REQUIRED_ORGANIZATION", "Sociedad y sucursal son obligatorias para el producto");
    await assertBranchOrganization(tenantId, societyCode, branchCode);
    family = await prisma.inventoryFamily.findFirst({ where: { code: normalizedFamily, active: true } });
    if (!family) throw appError(404, "FAMILY_NOT_FOUND", "La familia del producto no existe o esta inactiva");
    if (family.society_code && family.society_code !== societyCode) throw appError(400, "FAMILY_SOCIETY_MISMATCH", "La familia no pertenece a la sociedad seleccionada");
    if (family.branch_code && family.branch_code !== branchCode) throw appError(400, "FAMILY_BRANCH_MISMATCH", "La familia no pertenece a la sucursal seleccionada");

    const finalCode = code ? normalizeCode(code) : await nextFamilyItemCode(family);
    const existing = await prisma.item.findFirst({ where: { code: finalCode } });
    if (existing) throw appError(409, "DUPLICATE_CODE", `El codigo ${finalCode} ya existe`);
    if (family.code_start && family.code_end) {
      assertCodeInRange(finalCode, family.code_start, family.code_end);
    }
    return prisma.item.create({
    data: {
      tenant_id: tenantId,
      code: finalCode,
      name: name.trim(),
      type,
      unit,
      category_id,
      family_id: family.id,
      family_code: family.code,
      society_code: societyCode,
      branch_code: branchCode,
      costing_method,
      unit_cost,
      unit_price,
      tax_rate,
      stock_current: 0,
      stock_min,
      stock_max,
      weight_kg,
      volume_m3,
      abc_class: "C",
      active: true,
      metadata: { ...metadata, costing_method, family: family.code, society_code: societyCode, branch_code: branchCode }
    }
    });
  });
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function warehouseDto(place) {
  const locations = place.locations || [];
  const stockTotal = locations.reduce((sum, location) => sum + (location.items || []).reduce((inner, item) => inner + Number(item.qty || 0), 0), 0);
  return {
    id: place.id,
    code: place.code,
    name: place.name,
    type: place.type,
    warehouse_type: place.warehouse_type || "owned",
    warehouse_type_label: place.warehouse_type === "consignment" ? "Consignacion" : "Propia",
    address: place.address || "",
    city: place.city || "",
    country: place.country || "CO",
    society_code: place.society_code || "",
    branch_code: place.branch_code || "",
    cost_center_code: place.cost_center_code || "",
    active: place.active !== false,
    locations_count: locations.length,
    stock_total: stockTotal,
    created_at: place.created_at
  };
}

async function assertWarehouseOrganization(tenantId, societyCode, branchCode, costCenterCode) {
  const tree = await accountingService.getOrganizationTree(tenantId);
  const society = (tree.societies || []).find((item) => item.active !== false && item.code === societyCode);
  if (!society) throw appError(400, "SOCIETY_NOT_IN_MASTER", "La sociedad debe existir y estar activa");
  const branch = (tree.branches || []).find((item) => item.active !== false && item.code === branchCode && item.society_code === societyCode);
  if (!branch) throw appError(400, "BRANCH_NOT_IN_MASTER", "La sucursal debe existir, estar activa y pertenecer a la sociedad");
  const costCenter = (tree.cost_centers || []).find((item) => item.active !== false && item.code === costCenterCode && item.branch_code === branchCode && item.society_code === societyCode);
  if (!costCenter) throw appError(400, "COST_CENTER_NOT_IN_MASTER", "El centro de costo debe existir, estar activo y pertenecer a la sucursal");
  return { society, branch, costCenter };
}

async function assertBranchOrganization(tenantId, societyCode, branchCode) {
  const tree = await accountingService.getOrganizationTree(tenantId);
  const society = (tree.societies || []).find((item) => item.active !== false && item.code === societyCode);
  if (!society) throw appError(400, "SOCIETY_NOT_IN_MASTER", "La sociedad debe existir y estar activa");
  const branch = (tree.branches || []).find((item) => item.active !== false && item.code === branchCode && item.society_code === societyCode);
  if (!branch) throw appError(400, "BRANCH_NOT_IN_MASTER", "La sucursal debe existir, estar activa y pertenecer a la sociedad");
  return { society, branch };
}

function parseRangeCode(value, field) {
  const raw = String(value || "").trim();
  if (!/^\d+$/.test(raw)) throw appError(400, "INVALID_FAMILY_RANGE", `${field} debe ser numerico`);
  return Number(raw);
}

function assertCodeInRange(code, start, end) {
  const numericCode = parseRangeCode(code, "El codigo de producto");
  const numericStart = parseRangeCode(start, "El codigo inicial");
  const numericEnd = parseRangeCode(end, "El codigo final");
  if (numericStart > numericEnd) throw appError(400, "INVALID_FAMILY_RANGE", "El codigo inicial no puede ser mayor al codigo final");
  if (numericCode < numericStart || numericCode > numericEnd) {
    throw appError(409, "FAMILY_CODE_RANGE_EXHAUSTED", `El codigo ${code} esta fuera del rango ${start}-${end}`);
  }
}

async function nextFamilyItemCode(family) {
  if (!family.code_start || !family.code_end) throw appError(400, "FAMILY_RANGE_REQUIRED", "La familia no tiene rango de codigos configurado");
  const start = parseRangeCode(family.code_start, "El codigo inicial");
  const end = parseRangeCode(family.code_end, "El codigo final");
  if (start > end) throw appError(400, "INVALID_FAMILY_RANGE", "El codigo inicial no puede ser mayor al codigo final");
  const items = await prisma.item.findMany({
    where: { family_id: family.id, active: true },
    select: { code: true }
  });
  const used = items
    .map((item) => (/^\d+$/.test(String(item.code || "")) ? Number(item.code) : null))
    .filter((value) => value !== null && value >= start && value <= end);
  const next = used.length ? Math.max(...used) + 1 : start;
  if (next > end) throw appError(409, "FAMILY_CODE_RANGE_EXHAUSTED", `La familia ${family.code} ya consumio el rango ${family.code_start}-${family.code_end}`);
  return String(next).padStart(String(family.code_start).length, "0");
}

async function updateItem(tenantId, itemId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const item = await prisma.item.findFirst({ where: { id: itemId } });
    if (!item) throw appError(404, "NOT_FOUND", "Item no encontrado");
    if (!item.active) throw appError(422, "INACTIVE", "No se puede editar un item inactivo");

    const { code, type, stock_current, tenant_id, family_code, costing_method, society_code, branch_code, ...safeData } = data;
    if (costing_method && costing_method !== "weighted_average") throw appError(400, "INVALID_COSTING_METHOD", "Por ahora solo esta disponible promedio ponderado");
    const nextSocietyCode = society_code !== undefined ? normalizeCode(society_code) : item.society_code;
    const nextBranchCode = branch_code !== undefined ? normalizeCode(branch_code) : item.branch_code;
    if (society_code !== undefined || branch_code !== undefined || family_code) {
      if (!nextSocietyCode || !nextBranchCode) throw appError(400, "REQUIRED_ORGANIZATION", "Sociedad y sucursal son obligatorias para el producto");
      await assertBranchOrganization(tenantId, nextSocietyCode, nextBranchCode);
      safeData.society_code = nextSocietyCode;
      safeData.branch_code = nextBranchCode;
      safeData.metadata = { ...(item.metadata || {}), ...(safeData.metadata || {}), society_code: nextSocietyCode, branch_code: nextBranchCode };
    }
    if (family_code) {
      const family = await prisma.inventoryFamily.findFirst({ where: { code: normalizeCode(family_code), active: true } });
      if (!family) throw appError(404, "FAMILY_NOT_FOUND", "La familia del producto no existe o esta inactiva");
      if (family.society_code && family.society_code !== nextSocietyCode) throw appError(400, "FAMILY_SOCIETY_MISMATCH", "La familia no pertenece a la sociedad seleccionada");
      if (family.branch_code && family.branch_code !== nextBranchCode) throw appError(400, "FAMILY_BRANCH_MISMATCH", "La familia no pertenece a la sucursal seleccionada");
      safeData.family_id = family.id;
      safeData.family_code = family.code;
      safeData.metadata = { ...(item.metadata || {}), ...(safeData.metadata || {}), family: family.code };
    }
    if (costing_method) safeData.costing_method = costing_method;

    if (safeData.tax_rate !== undefined && (safeData.tax_rate < 0 || safeData.tax_rate > 35)) {
      throw appError(400, "INVALID_TAX", "tax_rate debe estar entre 0 y 35");
    }

    const newMin = safeData.stock_min ?? item.stock_min;
    const newMax = safeData.stock_max ?? item.stock_max;
    if (newMax !== null && newMax <= newMin) {
      throw appError(400, "INVALID_STOCK", "stock_max debe ser mayor a stock_min");
    }

    if (safeData.category_id) {
      const category = await prisma.category.findFirst({ where: { id: safeData.category_id } });
      if (!category) throw appError(404, "CATEGORY_NOT_FOUND", "La categoria no existe");
    }

    return prisma.item.update({ where: { id: itemId }, data: safeData });
  });
}

async function listItems(tenantId, filters = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const {
      search, type, category_id, abc_class,
      low_stock = false, active = true,
      page = 1, limit = 20, sort_by = "name", sort_dir = "asc"
    } = filters;

    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(100, Math.max(1, Number(limit)));
    const where = { active: active !== false };
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } }
      ];
    }
    if (type) where.type = type;
    if (category_id) where.category_id = Number(category_id);
    if (abc_class) where.abc_class = abc_class;

    const whitelist = ["name", "code", "stock_current", "unit_cost"];
    const orderBy = whitelist.includes(sort_by) ? { [sort_by]: sort_dir === "desc" ? "desc" : "asc" } : { name: "asc" };

    const [rawData, total] = await Promise.all([
      prisma.item.findMany({
        where,
        orderBy,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: { category: { select: { id: true, name: true } } }
      }),
      prisma.item.count({ where })
    ]);

    const data = low_stock ? rawData.filter((item) => item.stock_current <= item.stock_min) : rawData;
    return { data, total, page: safePage, pages: Math.max(1, Math.ceil(total / safeLimit)) };
  });
}

async function applyWeightedAverageCost(tx, tenantId, userId, item, qty, unitCost, sourceType = null, sourceId = null) {
  const previousQty = Number(item.stock_current || 0);
  const previousCost = Number(item.unit_cost || 0);
  const incomingQty = Number(qty || 0);
  const incomingCost = Number(unitCost ?? previousCost);
  const nextQty = previousQty + incomingQty;
  const nextValue = previousQty * previousCost + incomingQty * incomingCost;
  const nextAverage = nextQty > 0 ? Math.round((nextValue / nextQty) * 10000) / 10000 : incomingCost;
  await tx.productCost.create({
    data: {
      item_id: item.id,
      costing_method: "weighted_average",
      quantity_balance: nextQty,
      value_balance: Math.round(nextValue * 100) / 100,
      average_cost: nextAverage,
      last_unit_cost: incomingCost,
      source_type: sourceType,
      source_id: sourceId,
      created_by: userId || null
    }
  });
  return nextAverage;
}

async function getSocietyValuationTx(tx, societyCode, itemId) {
  const society = normalizeCode(societyCode);
  if (!society) throw appError(400, "SOCIETY_REQUIRED", "La sociedad es obligatoria para valorar inventario");
  let valuation = await tx.skuValuation.findFirst({ where: { society_code: society, item_id: Number(itemId) } });
  if (valuation) return valuation;
  const locations = await tx.itemLocation.findMany({ where: { item_id: Number(itemId), location: { place: { society_code: society } } } });
  const item = await tx.item.findFirst({ where: { id: Number(itemId) } });
  const quantity = locations.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const average = Number(item?.unit_cost || 0);
  return tx.skuValuation.create({ data: { society_code: society, item_id: Number(itemId), quantity_balance: quantity, value_balance: Math.round(quantity * average * 100) / 100, average_cost: average } });
}

function calculateSocietyValuation({ quantityBalance, valueBalance, averageCost, qty, unitCost, direction }) {
  const previousQty = Number(quantityBalance || 0);
  const previousValue = Number(valueBalance || 0);
  const previousAverage = Number(averageCost || 0);
  const quantity = Number(qty || 0);
  if (quantity <= 0) throw appError(400, "INVALID_QTY", "La cantidad debe ser mayor a cero");
  if (direction === "in") {
    const incomingCost = Number(unitCost ?? previousAverage);
    const nextQty = previousQty + quantity;
    const nextValue = previousValue + quantity * incomingCost;
    return { quantity_balance: nextQty, value_balance: Math.round(nextValue * 100) / 100, average_cost: nextQty > 0 ? Math.round((nextValue / nextQty) * 10000) / 10000 : incomingCost, recognized_cost: incomingCost };
  }
  if (direction !== "out") throw appError(400, "INVALID_VALUATION_DIRECTION", "Direccion de valoracion invalida");
  if (previousQty - quantity < -0.0001) throw appError(422, "INSUFFICIENT_SOCIETY_STOCK", "Stock insuficiente en la sociedad");
  const nextQty = previousQty - quantity;
  const nextValue = Math.max(0, previousValue - quantity * previousAverage);
  return { quantity_balance: nextQty, value_balance: Math.round(nextValue * 100) / 100, average_cost: nextQty > 0 ? previousAverage : 0, recognized_cost: previousAverage };
}

async function applySocietyValuationTx(tx, tenantId, userId, { societyCode, item, qty, unitCost, direction, sourceType, sourceId }) {
  await tx.$queryRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock_result",
    `${tenantId}:${normalizeCode(societyCode)}:${item.id}`
  );
  const valuation = await getSocietyValuationTx(tx, societyCode, item.id);
  const result = calculateSocietyValuation({ quantityBalance: valuation.quantity_balance, valueBalance: valuation.value_balance, averageCost: valuation.average_cost, qty, unitCost, direction });
  const updated = await tx.skuValuation.update({ where: { id: valuation.id }, data: { quantity_balance: result.quantity_balance, value_balance: result.value_balance, average_cost: result.average_cost, version: { increment: 1 } } });
  await tx.productCost.create({ data: { item_id: item.id, society_code: normalizeCode(societyCode), costing_method: "weighted_average", quantity_balance: result.quantity_balance, value_balance: updated.value_balance, average_cost: result.average_cost, last_unit_cost: result.recognized_cost, source_type: sourceType, source_id: sourceId, created_by: userId || null } });
  return { ...updated, recognized_cost: result.recognized_cost };
}

async function stockMoveTx(tx, tenantId, userId, data) {
  const {
    item_id, type, qty, from_location_id = null, to_location_id = null,
    transaction_id = null, purchase_order_line_id = null, cost = null, lot = null, reason = null, expiry = null,
    society_code = null, source_type = null, source_id = null, correlation_id = null, idempotency_key = null, affect_valuation = true
  } = data;

  if (type === "transfer") {
    throw appError(409, "WAREHOUSE_TRANSFER_REQUIRED", "Los traslados deben crearse, despacharse a transito y descargarse completamente desde el modulo de traslados");
  }
  if (!["in", "out", "adjustment"].includes(type)) {
    throw appError(400, "INVALID_MOVE_TYPE", "Tipo de movimiento invalido");
  }
  if (!qty || qty <= 0) throw appError(400, "INVALID_QTY", "La cantidad debe ser mayor a 0");

  const item = await tx.item.findFirst({ where: { id: item_id, active: true } });
  if (!item) throw appError(404, "ITEM_NOT_FOUND", "Item no encontrado");
  if (idempotency_key) {
    const existing = await tx.movement.findFirst({ where: { idempotency_key } });
    if (existing) return { movement: existing, item, idempotent: true };
  }

  if (type === "out" && !from_location_id) {
    throw appError(400, "FROM_LOCATION_REQUIRED", "from_location_id es obligatorio para salidas");
  }
  if (type === "in" && !to_location_id) {
    throw appError(400, "TO_LOCATION_REQUIRED", "to_location_id es obligatorio para entradas");
  }
  const delta = (type === "in" || type === "adjustment") ? qty : -qty;
  if (item.stock_current + delta < 0) {
    throw appError(422, "INSUFFICIENT_STOCK", "Stock insuficiente");
  }

  if (from_location_id) {
    await tx.location.findFirstOrThrow({ where: { id: from_location_id, active: true } }).catch(() => {
      throw appError(404, "FROM_LOCATION_NOT_FOUND", "Ubicacion origen no encontrada");
    });
  }
  if (to_location_id) {
    await tx.location.findFirstOrThrow({ where: { id: to_location_id, active: true } }).catch(() => {
      throw appError(404, "TO_LOCATION_NOT_FOUND", "Ubicacion destino no encontrada");
    });
  }

  const locationId = to_location_id || from_location_id;
  const location = locationId ? await tx.location.findFirst({ where: { id: locationId }, include: { place: true } }) : null;
  const movementSociety = normalizeCode(society_code || location?.place?.society_code || item.society_code);
  let nextAverageCost = item.unit_cost;
  let valuation = null;
  if (affect_valuation && item.costing_method === "weighted_average") {
    valuation = await applySocietyValuationTx(tx, tenantId, userId, { societyCode: movementSociety, item, qty, unitCost: cost ?? item.unit_cost, direction: (type === "in" || type === "adjustment") ? "in" : "out", sourceType: source_type || "movement", sourceId: source_id || transaction_id });
    nextAverageCost = valuation.average_cost;
  }

  const movement = await tx.movement.create({
    data: {
      item_id,
      type,
      from_location: from_location_id,
      to_location: to_location_id,
      transaction_id,
      purchase_order_line_id,
      society_code: movementSociety,
      source_type,
      source_id,
      correlation_id,
      idempotency_key,
      qty,
      cost: cost ?? item.unit_cost,
      lot,
      reason,
      created_by: userId
    }
  });

  const updated = await tx.item.update({ where: { id: item_id }, data: { stock_current: { increment: delta }, unit_cost: nextAverageCost } });

  if (to_location_id) {
    const currentTo = await tx.itemLocation.findFirst({ where: { item_id, location_id: to_location_id, lot: lot ?? null } });
    if (currentTo) {
      await tx.itemLocation.update({ where: { id: currentTo.id }, data: { qty: { increment: qty }, cost: nextAverageCost } });
    } else {
      await tx.itemLocation.create({
        data: { item_id, location_id: to_location_id, qty, lot, expiry: expiry ? new Date(expiry) : null, cost: cost ?? item.unit_cost }
      });
    }
  }

  if (from_location_id) {
    const currentFrom = await tx.itemLocation.findFirst({ where: { item_id, location_id: from_location_id } });
    if (!currentFrom || currentFrom.qty < qty) throw appError(422, "INSUFFICIENT_LOCATION_STOCK", "Stock insuficiente en ubicacion origen");
    await tx.itemLocation.update({ where: { id: currentFrom.id }, data: { qty: { decrement: qty } } });
  }

  if (updated.stock_current <= updated.stock_min) {
    setImmediate(() => {
      brainQueue.add("inventory-stock-alert", {
        tenant_id: tenantId,
        type: "STOCK_ALERT",
        module: "inventory",
        item_id: updated.id
      }).catch(() => undefined);
    });
  }

  return { movement, item: updated, valuation };
}

async function stockMove(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction((tx) => stockMoveTx(tx, tenantId, userId, data)));
}

async function ensureTransitLocationTx(tx, tenantId, societyCode) {
  const code = `TRANSITO-${normalizeCode(societyCode)}`;
  let place = await tx.place.findFirst({ where: { code, type: "transit", __includeInactive: true } });
  if (!place) place = await tx.place.create({ data: { type: "transit", code, name: `Mercancia en transito ${societyCode}`, society_code: normalizeCode(societyCode), active: true } });
  let location = await tx.location.findFirst({ where: { place_id: place.id, code: "TRANSITO" } });
  if (!location) location = await tx.location.create({ data: { place_id: place.id, code: "TRANSITO", zone: "transit", active: true } });
  return location;
}

async function createWarehouseTransfer(tenantId, userId, data) {
  if (!Array.isArray(data.lines) || !data.lines.length) throw appError(400, "NO_TRANSFER_LINES", "El traslado requiere al menos una linea");
  const itemIds = data.lines.map((line) => Number(line.item_id));
  if (new Set(itemIds).size !== itemIds.length) throw appError(400, "DUPLICATE_TRANSFER_SKU", "Cada SKU debe aparecer una sola vez en el traslado");
  if (Number(data.origin_place_id) === Number(data.destination_place_id)) throw appError(400, "SAME_WAREHOUSE", "La bodega origen y destino deben ser diferentes");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    if (data.idempotency_key) {
      const existing = await tx.warehouseTransfer.findFirst({ where: { idempotency_key: data.idempotency_key }, include: { lines: true } });
      if (existing) return existing;
    }
    const [origin, destination] = await Promise.all([
      tx.place.findFirst({ where: { id: Number(data.origin_place_id), type: "warehouse", active: true } }),
      tx.place.findFirst({ where: { id: Number(data.destination_place_id), type: "warehouse", active: true } })
    ]);
    if (!origin || !destination) throw appError(404, "WAREHOUSE_NOT_FOUND", "Bodega origen o destino no encontrada");
    if (!origin.society_code || origin.society_code !== destination.society_code) throw appError(422, "CROSS_SOCIETY_TRANSFER", "El traslado debe realizarse entre bodegas de la misma sociedad");
    const count = await tx.warehouseTransfer.count();
    const lines = [];
    for (const row of data.lines) {
      if (Number(row.qty) <= 0) throw appError(400, "INVALID_QTY", "La cantidad debe ser mayor a cero");
      const item = await tx.item.findFirst({ where: { id: Number(row.item_id), active: true } });
      if (!item) throw appError(404, "ITEM_NOT_FOUND", `Item ${row.item_id} no encontrado`);
      const valuation = await getSocietyValuationTx(tx, origin.society_code, item.id);
      lines.push({ tenant_id: tenantId, item_id: item.id, qty: Number(row.qty), unit_cost: Number(valuation.average_cost), lot: row.lot || null });
    }
    return tx.warehouseTransfer.create({ data: { number: `TR-${String(count + 1).padStart(6, "0")}`, society_code: origin.society_code, origin_place_id: origin.id, destination_place_id: destination.id, reason: data.reason || null, correlation_id: data.correlation_id || crypto.randomUUID(), idempotency_key: data.idempotency_key || null, created_by: userId || null, lines: { create: lines } }, include: { lines: true } });
  }));
}

async function dispatchWarehouseTransfer(tenantId, userId, transferId) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const transfer = await tx.warehouseTransfer.findFirst({ where: { id: Number(transferId) }, include: { lines: true } });
    if (!transfer) throw appError(404, "TRANSFER_NOT_FOUND", "Traslado no encontrado");
    if (transfer.status === "in_transit" || transfer.status === "received") return transfer;
    if (transfer.status !== "draft") throw appError(422, "INVALID_TRANSFER_STATUS", "Solo un traslado en borrador puede despacharse");
    const originLocation = await tx.location.findFirst({ where: { place_id: transfer.origin_place_id, active: true }, orderBy: { id: "asc" } });
    if (!originLocation) throw appError(404, "ORIGIN_LOCATION_NOT_FOUND", "La bodega origen no tiene ubicacion activa");
    const transit = await ensureTransitLocationTx(tx, tenantId, transfer.society_code);
    for (const line of transfer.lines) {
      const originStock = await tx.itemLocation.findFirst({ where: { item_id: line.item_id, location_id: originLocation.id, lot: line.lot } });
      if (!originStock || Number(originStock.qty) < Number(line.qty)) throw appError(422, "INSUFFICIENT_LOCATION_STOCK", `Stock insuficiente para despachar item ${line.item_id}`);
      await tx.itemLocation.update({ where: { id: originStock.id }, data: { qty: { decrement: line.qty } } });
      const transitStock = await tx.itemLocation.findFirst({ where: { item_id: line.item_id, location_id: transit.id, lot: line.lot } });
      if (transitStock) await tx.itemLocation.update({ where: { id: transitStock.id }, data: { qty: { increment: line.qty }, cost: line.unit_cost } });
      else await tx.itemLocation.create({ data: { item_id: line.item_id, location_id: transit.id, qty: line.qty, lot: line.lot, cost: line.unit_cost } });
      await tx.movement.create({ data: { type: "transfer_dispatch", item_id: line.item_id, from_location: originLocation.id, to_location: transit.id, qty: line.qty, cost: line.unit_cost, society_code: transfer.society_code, source_type: "warehouse_transfer", source_id: transfer.id, correlation_id: transfer.correlation_id, idempotency_key: `transfer:${transfer.id}:dispatch:${line.id}`, reason: transfer.reason, created_by: userId || null } });
    }
    return tx.warehouseTransfer.update({ where: { id: transfer.id }, data: { status: "in_transit", transit_location_id: transit.id, dispatched_by: userId || null, dispatched_at: new Date() }, include: { lines: true } });
  }));
}

async function receiveWarehouseTransfer(tenantId, userId, transferId) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const transfer = await tx.warehouseTransfer.findFirst({ where: { id: Number(transferId) }, include: { lines: true } });
    if (!transfer) throw appError(404, "TRANSFER_NOT_FOUND", "Traslado no encontrado");
    if (transfer.status === "received") return transfer;
    if (transfer.status !== "in_transit") throw appError(422, "INVALID_TRANSFER_STATUS", "Solo un traslado en transito puede descargarse");
    const destination = await tx.location.findFirst({ where: { place_id: transfer.destination_place_id, active: true }, orderBy: { id: "asc" } });
    if (!destination) throw appError(404, "DESTINATION_LOCATION_NOT_FOUND", "La bodega destino no tiene ubicacion activa");
    for (const line of transfer.lines) {
      const transitStock = await tx.itemLocation.findFirst({ where: { item_id: line.item_id, location_id: transfer.transit_location_id, lot: line.lot } });
      if (!transitStock || Number(transitStock.qty) < Number(line.qty)) throw appError(409, "TRANSIT_BALANCE_MISMATCH", "El saldo en transito no permite la descarga completa");
      await tx.itemLocation.update({ where: { id: transitStock.id }, data: { qty: { decrement: line.qty } } });
      const destinationStock = await tx.itemLocation.findFirst({ where: { item_id: line.item_id, location_id: destination.id, lot: line.lot } });
      if (destinationStock) await tx.itemLocation.update({ where: { id: destinationStock.id }, data: { qty: { increment: line.qty }, cost: line.unit_cost } });
      else await tx.itemLocation.create({ data: { item_id: line.item_id, location_id: destination.id, qty: line.qty, lot: line.lot, cost: line.unit_cost } });
      await tx.movement.create({ data: { type: "transfer_receive", item_id: line.item_id, from_location: transfer.transit_location_id, to_location: destination.id, qty: line.qty, cost: line.unit_cost, society_code: transfer.society_code, source_type: "warehouse_transfer", source_id: transfer.id, correlation_id: transfer.correlation_id, idempotency_key: `transfer:${transfer.id}:receive:${line.id}`, reason: transfer.reason, created_by: userId || null } });
    }
    return tx.warehouseTransfer.update({ where: { id: transfer.id }, data: { status: "received", received_by: userId || null, received_at: new Date() }, include: { lines: true } });
  }));
}

async function listWarehouseTransfers(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.society_code ? { society_code: normalizeCode(query.society_code) } : {}),
      ...(query.origin_place_id ? { origin_place_id: Number(query.origin_place_id) } : {}),
      ...(query.destination_place_id ? { destination_place_id: Number(query.destination_place_id) } : {})
    };
    if (query.from_date || query.to_date) {
      where.created_at = {};
      if (query.from_date) where.created_at.gte = new Date(query.from_date + "T00:00:00");
      if (query.to_date) where.created_at.lte = new Date(query.to_date + "T23:59:59.999");
    }
    const rows = await prisma.warehouseTransfer.findMany({ where, include: { lines: { include: { item: true } } }, orderBy: { created_at: "desc" }, take: Math.min(Number(query.limit || 100), 500) });
    const placeIds = [...new Set(rows.flatMap((row) => [row.origin_place_id, row.destination_place_id]))];
    const places = placeIds.length ? await prisma.place.findMany({ where: { id: { in: placeIds } } }) : [];
    const placeById = new Map(places.map((place) => [place.id, place]));
    return rows.map((row) => ({ ...row, origin: placeById.get(row.origin_place_id) || null, destination: placeById.get(row.destination_place_id) || null }));
  });
}

async function getWarehouseTransfer(tenantId, transferId) {
  return prisma.runWithTenant(tenantId, async () => {
    const row = await prisma.warehouseTransfer.findFirst({ where: { id: Number(transferId) }, include: { lines: { include: { item: true } } } });
    if (!row) throw appError(404, "TRANSFER_NOT_FOUND", "Traslado no encontrado");
    const [origin, destination] = await Promise.all([
      prisma.place.findFirst({ where: { id: row.origin_place_id } }),
      prisma.place.findFirst({ where: { id: row.destination_place_id } })
    ]);
    return { ...row, origin, destination };
  });
}

async function listFamilies(tenantId, query = {}) {
  const includeInactive = query.active === "all" || query.include_inactive === "true";
  return prisma.runWithTenant(tenantId, () => prisma.inventoryFamily.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(query.society_code ? { society_code: normalizeCode(query.society_code) } : {}),
      ...(query.branch_code ? { branch_code: normalizeCode(query.branch_code) } : {})
    },
    include: { accounting: true },
    orderBy: { code: "asc" }
  }));
}

async function listWarehouseLocations(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    await ensureDefaultWarehouseLocations(tenantId);
    const locations = await prisma.location.findMany({
      where: { active: true },
      include: { place: true },
      orderBy: [{ place_id: "asc" }, { code: "asc" }]
    });
    return locations.map((location) => ({
      id: location.id,
      code: location.code,
      zone: location.zone,
      place_id: location.place_id,
      warehouse_code: location.place?.code || "",
      warehouse_name: location.place?.name || "",
      warehouse_type: location.place?.warehouse_type || "owned",
      society_code: location.place?.society_code || "",
      branch_code: location.place?.branch_code || "",
      cost_center_code: location.place?.cost_center_code || "",
      label: `${location.place?.name || "Bodega"} / ${location.code}`
    }));
  });
}

async function ensureDefaultWarehouseLocations(tenantId, tx = prisma) {
  const warehouses = await tx.place.findMany({
    where: { type: "warehouse", active: true },
    include: { locations: true }
  });
  for (const warehouse of warehouses) {
    if ((warehouse.locations || []).some((location) => location.active !== false)) continue;
    await tx.location.create({
      data: {
        tenant_id: tenantId,
        place_id: warehouse.id,
        code: "GEN",
        zone: "general",
        abc_class: "C",
        active: true
      }
    });
  }
}

async function listWarehouses(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const includeInactive = query.active === "all" || query.include_inactive === "true";
    const search = String(query.search || "").trim();
    const where = {
      type: "warehouse",
      ...(includeInactive ? { __includeInactive: true } : { active: true }),
      ...(search ? {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
          { society_code: { contains: search, mode: "insensitive" } },
          { branch_code: { contains: search, mode: "insensitive" } },
          { cost_center_code: { contains: search, mode: "insensitive" } }
        ]
      } : {})
    };
    const warehouses = await prisma.place.findMany({
      where,
      include: { locations: { include: { items: true } } },
      orderBy: { code: "asc" }
    });
    return warehouses.map(warehouseDto);
  });
}

async function saveWarehouse(tenantId, data, placeId = null) {
  const code = normalizeCode(data.code);
  const name = String(data.name || "").trim();
  const societyCode = normalizeCode(data.society_code);
  const branchCode = normalizeCode(data.branch_code);
  const costCenterCode = normalizeCode(data.cost_center_code);
  const warehouseType = String(data.warehouse_type || "owned").trim();
  if (!code || !name) throw appError(400, "REQUIRED_WAREHOUSE", "Codigo y nombre de bodega son obligatorios");
  if (!["owned", "consignment"].includes(warehouseType)) throw appError(400, "INVALID_WAREHOUSE_TYPE", "El tipo de bodega debe ser propia o consignacion");
  await assertWarehouseOrganization(tenantId, societyCode, branchCode, costCenterCode);

  return prisma.runWithTenant(tenantId, async () => {
    const duplicated = await prisma.place.findFirst({
      where: { code, __includeInactive: true, ...(placeId ? { id: { not: Number(placeId) } } : {}) }
    });
    if (duplicated) throw appError(409, "DUPLICATE_WAREHOUSE", `Ya existe una bodega con codigo ${code}`);

    const payload = {
      type: "warehouse",
      code,
      name,
      address: String(data.address || "").trim() || null,
      city: String(data.city || "").trim() || null,
      country: normalizeCode(data.country || "CO") || "CO",
      society_code: societyCode,
      branch_code: branchCode,
      cost_center_code: costCenterCode,
      warehouse_type: warehouseType,
      active: data.active !== false,
      metadata: {
        ...(data.metadata || {}),
        society_code: societyCode,
        branch_code: branchCode,
        cost_center_code: costCenterCode,
        warehouse_type: warehouseType
      }
    };

    if (placeId) {
      const current = await prisma.place.findFirst({ where: { id: Number(placeId), type: "warehouse", __includeInactive: true } });
      if (!current) throw appError(404, "WAREHOUSE_NOT_FOUND", "Bodega no encontrada");
      await prisma.place.update({ where: { id: current.id }, data: payload });
    } else {
      await prisma.place.create({ data: payload });
    }
    await ensureDefaultWarehouseLocations(tenantId);
    return listWarehouses(tenantId, { active: "all" });
  });
}

async function deleteWarehouse(tenantId, placeId) {
  return prisma.runWithTenant(tenantId, async () => {
    const warehouse = await prisma.place.findFirst({
      where: { id: Number(placeId), type: "warehouse", active: true },
      include: { locations: { include: { items: true } } }
    });
    if (!warehouse) throw appError(404, "WAREHOUSE_NOT_FOUND", "Bodega no encontrada");
    const locationIds = warehouse.locations.map((location) => location.id);
    const stockRows = warehouse.locations.flatMap((location) => location.items || []).filter((row) => Number(row.qty || 0) !== 0);
    if (stockRows.length) throw appError(409, "WAREHOUSE_HAS_STOCK", "No se puede borrar una bodega con stock en sus ubicaciones");
    if (locationIds.length) {
      const movements = await prisma.movement.count({
        where: { OR: [{ from_location: { in: locationIds } }, { to_location: { in: locationIds } }] }
      });
      if (movements > 0) throw appError(409, "WAREHOUSE_HAS_MOVEMENTS", "No se puede borrar una bodega con movimientos de inventario asociados");
      await prisma.itemLocation.deleteMany({ where: { location_id: { in: locationIds } } });
      await prisma.location.deleteMany({ where: { place_id: warehouse.id } });
    }
    await prisma.place.delete({ where: { id: warehouse.id } });
    return listWarehouses(tenantId, { active: "all" });
  });
}

async function saveFamily(tenantId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const code = String(data.code || "").trim().toUpperCase();
    const societyCode = normalizeCode(data.society_code);
    const branchCode = normalizeCode(data.branch_code);
    const codeStart = String(data.code_start || "").trim();
    const codeEnd = String(data.code_end || "").trim();
    if (!code) throw appError(400, "REQUIRED_FAMILY_CODE", "El codigo de familia es obligatorio");
    if (!societyCode || !branchCode) throw appError(400, "REQUIRED_ORGANIZATION", "Sociedad y sucursal son obligatorias para la familia");
    await assertBranchOrganization(tenantId, societyCode, branchCode);
    assertCodeInRange(codeStart, codeStart, codeEnd);
    const family = await prisma.inventoryFamily.upsert({
      where: { tenant_id_code: { tenant_id: tenantId, code } },
      update: {
        name: String(data.name || "").trim(),
        description: data.description || null,
        society_code: societyCode,
        branch_code: branchCode,
        code_start: codeStart,
        code_end: codeEnd,
        active: data.active !== false
      },
      create: {
        tenant_id: tenantId,
        code,
        name: String(data.name || "").trim(),
        description: data.description || null,
        society_code: societyCode,
        branch_code: branchCode,
        code_start: codeStart,
        code_end: codeEnd,
        active: data.active !== false
      }
    });
    const accounting = data.accounting || {};
    await prisma.inventoryFamilyAccounting.upsert({
      where: { family_id: family.id },
      update: { ...accounting, active: accounting.active !== false },
      create: { tenant_id: tenantId, family_id: family.id, ...accounting, active: accounting.active !== false }
    });
    return listFamilies(tenantId, { active: "all" });
  });
}

async function getFamilyAccountingByItem(tx, itemId) {
  const item = await tx.item.findFirst({ where: { id: itemId }, include: { family: { include: { accounting: true } } } });
  if (!item) throw appError(404, "ITEM_NOT_FOUND", "Producto no encontrado");
  if (!item.family?.accounting) throw appError(400, "FAMILY_ACCOUNTING_NOT_FOUND", `La familia ${item.family_code || ""} no tiene configuracion contable`);
  return { item, accounting: item.family.accounting };
}

async function adjustStock(tenantId, userId, data) {
  const { item_id, new_stock, location_id = null, reason = "Ajuste manual" } = data;
  if (new_stock < 0) throw appError(400, "INVALID_STOCK", "new_stock no puede ser negativo");
  return prisma.runWithTenant(tenantId, async () => {
    const item = await prisma.item.findFirst({ where: { id: item_id } });
    if (!item) throw appError(404, "ITEM_NOT_FOUND", "Item no encontrado");
    const diff = Number(new_stock) - Number(item.stock_current);
    if (diff === 0) return item;
    const moveType = diff > 0 ? "in" : "out";
    await stockMove(tenantId, userId, {
      item_id, type: moveType, qty: Math.abs(diff),
      from_location_id: diff < 0 ? location_id : null,
      to_location_id: diff > 0 ? location_id : null,
      reason
    });
    return prisma.item.findUnique({ where: { id: item_id } });
  });
}

async function getKardex(tenantId, itemId, filters = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const item = await prisma.item.findFirst({ where: { id: itemId }, select: { id: true, code: true, name: true, unit: true, stock_current: true, unit_cost: true } });
    if (!item) throw appError(404, "ITEM_NOT_FOUND", "Item no encontrado");

    const { from_date, to_date, type, location_id, page = 1, limit = 50 } = filters;
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(500, Math.max(1, Number(limit)));
    const where = { item_id: itemId };
    if (type) where.type = type;
    if (from_date || to_date) where.created_at = {};
    if (from_date) where.created_at.gte = new Date(from_date);
    if (to_date) where.created_at.lte = new Date(to_date);
    if (location_id) where.OR = [{ from_location: Number(location_id) }, { to_location: Number(location_id) }];

    const [allMovements, total] = await Promise.all([
      prisma.movement.findMany({ where, orderBy: { created_at: "asc" }, include: { transaction: true } }),
      prisma.movement.count({ where })
    ]);
    const locationIds = [...new Set(allMovements.flatMap((movement) => [movement.from_location, movement.to_location]).filter(Boolean))];
    const transferIds = [...new Set(allMovements.filter((movement) => movement.source_type === "warehouse_transfer" && movement.source_id).map((movement) => movement.source_id))];
    const transfers = transferIds.length ? await prisma.warehouseTransfer.findMany({ where: { id: { in: transferIds } }, select: { id: true, number: true } }) : [];
    const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]));
    const purchaseNumbers = [...new Set(allMovements.filter((movement) => movement.source_type === "purchase_order_receipt" && movement.transaction?.number).map((movement) => movement.transaction.number))];
    const receiptDocuments = purchaseNumbers.length ? await prisma.cntCabdoc.findMany({ where: { document_type: "EM", reference: { in: purchaseNumbers } }, orderBy: { posting_date: "desc" } }) : [];
    const receiptDocumentByReference = new Map();
    for (const document of receiptDocuments) if (!receiptDocumentByReference.has(document.reference)) receiptDocumentByReference.set(document.reference, document);
    const locations = locationIds.length ? await prisma.location.findMany({ where: { id: { in: locationIds } }, include: { place: true } }) : [];
    const locationById = new Map(locations.map((location) => [location.id, location]));

    function locationLabel(locationId) {
      if (!locationId) return "";
      const location = locationById.get(locationId);
      if (!location) return `Ubicacion ${locationId}`;
      return `${location.place?.code || ""} ${location.place?.name || ""} / ${location.code}`.trim();
    }

    function movementSign(movement) {
      if (movement.type === "out") return -1;
      if (["transfer", "transfer_dispatch", "transfer_receive"].includes(movement.type)) return 0;
      return 1;
    }

    let balance = 0;
    const data = allMovements.map((movement) => {
      const sign = movementSign(movement);
      const signedQty = Number(movement.qty || 0) * sign;
      balance += signedQty;
      return {
        id: movement.id,
        created_at: movement.created_at,
        type: movement.type,
        direction: signedQty >= 0 ? "in" : "out",
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        qty: Number(movement.qty || 0),
        in_qty: signedQty > 0 || movement.type === "transfer_receive" ? Number(movement.qty || 0) : 0,
        out_qty: signedQty < 0 || movement.type === "transfer_dispatch" ? Number(movement.qty || 0) : 0,
        balance: Math.round(balance * 10000) / 10000,
        unit_cost: Number(movement.cost || 0),
        value: Math.round(Number(movement.qty || 0) * Number(movement.cost || 0) * 100) / 100,
        document_type: movement.source_type || movement.transaction?.type || movement.type,
        document_id: movement.source_id || movement.transaction_id || null,
        document_number: movement.transaction?.number || transferById.get(movement.source_id)?.number || "",
        accounting_document_id: receiptDocumentByReference.get(movement.transaction?.number)?.id || null,
        accounting_document_number: receiptDocumentByReference.get(movement.transaction?.number)?.full_number || "",
        reason: movement.reason || "",
        from_location_id: movement.from_location,
        to_location_id: movement.to_location,
        from_warehouse: locationLabel(movement.from_location),
        to_warehouse: locationLabel(movement.to_location),
        warehouse: signedQty < 0 ? locationLabel(movement.from_location) : locationLabel(movement.to_location || movement.from_location),
        lot: movement.lot || ""
      };
    }).slice((safePage - 1) * safeLimit, safePage * safeLimit);

    return { item, data, total, page: safePage, pages: Math.max(1, Math.ceil(total / safeLimit)), current_stock: item.stock_current, current_average_cost: item.unit_cost };
  });
}

async function getInventoryCosts(tenantId, filters = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const { search, family_code, society_code, page = 1, limit = 100 } = filters;
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(200, Math.max(1, Number(limit)));
    const where = { active: true };
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } }
      ];
    }
    if (family_code) where.family_code = normalizeCode(family_code);

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: { family: true, locations: { include: { location: { include: { place: true } } } } }
      }),
      prisma.item.count({ where })
    ]);
    const itemIds = items.map((item) => item.id);
    const costRows = itemIds.length ? await prisma.productCost.findMany({
      where: { item_id: { in: itemIds } },
      orderBy: { created_at: "desc" }
    }) : [];
    const valuations = itemIds.length ? await prisma.skuValuation.findMany({ where: { item_id: { in: itemIds }, ...(society_code ? { society_code: normalizeCode(society_code) } : {}) } }) : [];
    const latestCostByItem = new Map();
    for (const row of costRows) {
      if (!latestCostByItem.has(row.item_id)) latestCostByItem.set(row.item_id, row);
    }
    const data = items.map((item) => {
      const latestCost = latestCostByItem.get(item.id);
      const valuation = valuations.find((row) => row.item_id === item.id && row.society_code === normalizeCode(society_code || item.society_code)) || valuations.find((row) => row.item_id === item.id);
      const physicalStock = (item.locations || []).filter((row) => row.location?.place?.type === "warehouse" && (!valuation || row.location?.place?.society_code === valuation.society_code)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const transitStock = (item.locations || []).filter((row) => row.location?.place?.type === "transit" && (!valuation || row.location?.place?.society_code === valuation.society_code)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const warehouseLabels = [...new Set((item.locations || [])
        .filter((row) => Number(row.qty || 0) !== 0)
        .map((row) => `${row.location?.place?.code || ""} ${row.location?.place?.name || ""} / ${row.location?.code || ""}`.trim()))];
      const warehouseRows = (item.locations || [])
        .filter((row) => Number(row.qty || 0) !== 0 && (!valuation || row.location?.place?.society_code === valuation.society_code))
        .map((row) => ({
          location_id: row.location_id,
          warehouse_id: row.location?.place_id,
          warehouse_code: row.location?.place?.code || "",
          warehouse_name: row.location?.place?.name || "",
          location_code: row.location?.code || "",
          type: row.location?.place?.type || "warehouse",
          qty: Number(row.qty || 0)
        }));
      const averageCost = Number(valuation?.average_cost ?? item.unit_cost ?? latestCost?.average_cost ?? 0);
      const stock = Number(valuation?.quantity_balance ?? item.stock_current ?? 0);
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        family_code: item.family_code || item.family?.code || "",
        family_name: item.family?.name || "",
        unit: item.unit,
        society_code: valuation?.society_code || item.society_code || "",
        stock_current: stock,
        physical_stock: physicalStock,
        transit_stock: transitStock,
        available_stock: physicalStock,
        location_stock: physicalStock + transitStock,
        average_cost: averageCost,
        last_unit_cost: Number(latestCost?.last_unit_cost ?? item.unit_cost ?? 0),
        value_balance: Number(valuation?.value_balance ?? Math.round(stock * averageCost * 100) / 100),
        last_cost_date: latestCost?.created_at || null,
        last_source_type: latestCost?.source_type || "",
        last_source_id: latestCost?.source_id || null,
        warehouses: warehouseLabels,
        warehouse_rows: warehouseRows
      };
    });
    const totals = data.reduce((acc, row) => ({
      stock_units: acc.stock_units + row.stock_current,
      inventory_value: acc.inventory_value + row.value_balance
    }), { stock_units: 0, inventory_value: 0 });
    return { data, total, page: safePage, pages: Math.max(1, Math.ceil(total / safeLimit)), totals: { stock_units: Math.round(totals.stock_units * 10000) / 10000, inventory_value: Math.round(totals.inventory_value * 100) / 100 } };
  });
}

async function runSlotting(tenantId, placeId = null) {
  return prisma.runWithTenant(tenantId, async () => {
    const items = await prisma.item.findMany({ where: { active: true } });
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const velocities = [];
    for (const item of items) {
      const out = await prisma.movement.aggregate({
        where: { item_id: item.id, type: "out", created_at: { gte: since } },
        _sum: { qty: true }
      });
      velocities.push({ item, velocity: out._sum.qty || 0 });
    }

    velocities.sort((a, b) => b.velocity - a.velocity);
    const totalVelocity = velocities.reduce((sum, row) => sum + row.velocity, 0) || 1;
    let running = 0;
    const updated = [];

    for (const row of velocities) {
      running += row.velocity / totalVelocity;
      const abc = running <= 0.8 ? "A" : running <= 0.95 ? "B" : "C";
      await prisma.item.update({ where: { id: row.item.id }, data: { abc_class: abc } });
      updated.push({ id: row.item.id, code: row.item.code, name: row.item.name, velocity: row.velocity, abc_class: abc });
    }

    const breakdown = updated.reduce((acc, row) => ({ ...acc, [row.abc_class]: acc[row.abc_class] + 1 }), { A: 0, B: 0, C: 0 });
    return {
      run_at: new Date().toISOString(),
      items_analyzed: updated.length,
      breakdown,
      items: updated
    };
  });
}

async function reserve() {
  return { reserved: true };
}

module.exports = {
  createItem,
  updateItem,
  listItems,
  listFamilies,
  listWarehouses,
  listWarehouseLocations,
  saveWarehouse,
  deleteWarehouse,
  saveFamily,
  getFamilyAccountingByItem,
  applyWeightedAverageCost,
  stockMove,
  stockMoveTx,
  getSocietyValuationTx,
  calculateSocietyValuation,
  applySocietyValuationTx,
  createWarehouseTransfer,
  dispatchWarehouseTransfer,
  receiveWarehouseTransfer,
  listWarehouseTransfers,
  getWarehouseTransfer,
  adjustStock,
  getKardex,
  getInventoryCosts,
  runSlotting,
  reserve
};
