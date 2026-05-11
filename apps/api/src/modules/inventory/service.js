const prisma = require("../../core/prisma");
const { brainQueue } = require("../../fabric/queues");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function createItem(tenantId, userId, data) {
  const {
    code, name, type, unit, category_id,
    unit_cost, unit_price, tax_rate = 0,
    stock_min = 0, stock_max = null,
    weight_kg = 0, volume_m3 = 0, metadata = {}
  } = data;

  if (!code || code.includes(" ")) {
    throw appError(400, "INVALID_CODE", "El codigo es obligatorio y no puede tener espacios");
  }
  if (!name?.trim()) {
    throw appError(400, "REQUIRED_NAME", "El nombre es obligatorio");
  }
  const validTypes = ["product", "service", "asset", "component", "raw_material"];
  if (!validTypes.includes(type)) {
    throw appError(400, "INVALID_TYPE", `Tipo invalido: ${type}`);
  }
  if ((unit_cost ?? 0) < 0 || (unit_price ?? 0) < 0) {
    throw appError(400, "INVALID_PRICE", "Los precios no pueden ser negativos");
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

  const existing = await prisma.runWithTenant(tenantId, () => prisma.item.findFirst({ where: { code: code.toUpperCase().trim() } }));
  if (existing) throw appError(409, "DUPLICATE_CODE", `El codigo ${code} ya existe`);

  return prisma.runWithTenant(tenantId, () => prisma.item.create({
    data: {
      tenant_id: tenantId,
      code: code.toUpperCase().trim(),
      name: name.trim(),
      type,
      unit,
      category_id,
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
      metadata
    }
  }));
}

async function updateItem(tenantId, itemId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const item = await prisma.item.findFirst({ where: { id: itemId } });
    if (!item) throw appError(404, "NOT_FOUND", "Item no encontrado");
    if (!item.active) throw appError(422, "INACTIVE", "No se puede editar un item inactivo");

    const { code, type, stock_current, tenant_id, ...safeData } = data;

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

async function stockMove(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const {
      item_id, type, qty, from_location_id = null, to_location_id = null,
      transaction_id = null, cost = null, lot = null, reason = null, expiry = null
    } = data;

    if (!["in", "out", "transfer", "adjustment"].includes(type)) {
      throw appError(400, "INVALID_MOVE_TYPE", "Tipo de movimiento invalido");
    }
    if (!qty || qty <= 0) throw appError(400, "INVALID_QTY", "La cantidad debe ser mayor a 0");

    const item = await tx.item.findFirst({ where: { id: item_id, active: true } });
    if (!item) throw appError(404, "ITEM_NOT_FOUND", "Item no encontrado");

    if ((type === "out" || type === "transfer") && !from_location_id) {
      throw appError(400, "FROM_LOCATION_REQUIRED", "from_location_id es obligatorio para salidas y transferencias");
    }
    if ((type === "in" || type === "transfer") && !to_location_id) {
      throw appError(400, "TO_LOCATION_REQUIRED", "to_location_id es obligatorio para entradas y transferencias");
    }
    if (type === "transfer" && from_location_id === to_location_id) {
      throw appError(400, "SAME_LOCATION", "No puedes transferir a la misma ubicacion");
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

    const movement = await tx.movement.create({
      data: {
        item_id,
        type,
        from_location: from_location_id,
        to_location: to_location_id,
        transaction_id,
        qty,
        cost: cost ?? item.unit_cost,
        lot,
        reason,
        created_by: userId
      }
    });

    const updated = await tx.item.update({ where: { id: item_id }, data: { stock_current: { increment: delta } } });

    if (to_location_id) {
      const currentTo = await tx.itemLocation.findFirst({ where: { item_id, location_id: to_location_id, lot: lot ?? null } });
      if (currentTo) {
        await tx.itemLocation.update({ where: { id: currentTo.id }, data: { qty: { increment: qty } } });
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

    return { movement, item: updated };
  }));
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
    const item = await prisma.item.findFirst({ where: { id: itemId }, select: { id: true, code: true, name: true, unit: true, stock_current: true } });
    if (!item) throw appError(404, "ITEM_NOT_FOUND", "Item no encontrado");

    const { from_date, to_date, type, location_id, page = 1, limit = 50 } = filters;
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(200, Math.max(1, Number(limit)));
    const where = { item_id: itemId };
    if (type) where.type = type;
    if (from_date || to_date) where.created_at = {};
    if (from_date) where.created_at.gte = new Date(from_date);
    if (to_date) where.created_at.lte = new Date(to_date);
    if (location_id) where.OR = [{ from_location: Number(location_id) }, { to_location: Number(location_id) }];

    const [movements, total] = await Promise.all([
      prisma.movement.findMany({ where, orderBy: { created_at: "asc" }, skip: (safePage - 1) * safeLimit, take: safeLimit }),
      prisma.movement.count({ where })
    ]);

    let balance = 0;
    const data = movements.map((movement) => {
      const sign = movement.type === "out" ? -1 : 1;
      balance += movement.qty * sign;
      return { ...movement, balance: Math.round(balance * 10000) / 10000 };
    });

    return { item, data, total, current_stock: item.stock_current };
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
  stockMove,
  adjustStock,
  getKardex,
  runSlotting,
  reserve
};
