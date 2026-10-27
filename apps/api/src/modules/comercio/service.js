// Comercio (M-30) - capa de servicio.
// MODULO AISLADO: solo toca modelos Comercio* (tablas comercio_*). No lee ni escribe
// maestros del ERP (Item/Party/Account). Los unicos vinculos externos son tenant_id y
// created_by (usuario), por trazabilidad.
// Tenant: los filtros de lectura los inyecta core/prisma.js via runWithTenant; dentro
// de $transaction se opera con ids ya validados por lecturas tenant-escopadas y los
// updateMany incluyen tenant_id explicitamente (defensa en profundidad).
// Documentos (ventas, creditos, compras, gastos) no se borran: se anulan por status.
const crypto = require("node:crypto");
const prisma = require("../../core/prisma");
const storage = require("./storage");

const TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

const SALE_STATUS_ACTIVE = "active";
const SALE_STATUS_VOIDED = "voided";
const CREDIT_STATUS_OPEN = "open";
const CREDIT_STATUS_PAID = "paid";
const CREDIT_STATUS_VOIDED = "voided";
const INSTALLMENT_OPEN = "open";
const INSTALLMENT_PARTIAL = "partial";
const INSTALLMENT_PAID = "paid";
const PAYMENT_CASH = "cash";
const PAYMENT_CREDIT = "credit";
const FREQUENCIES = new Set(["weekly", "biweekly", "monthly"]);
const FREQUENCY_DAYS = { weekly: 7, biweekly: 14 };
// Direccion de los movimientos "otros": ingreso fuera del catalogo o egreso operativo.
const EXPENSE_DIRECTION_EXPENSE = "expense";
const EXPENSE_DIRECTION_INCOME = "income";
const EXPENSE_DIRECTIONS = new Set([EXPENSE_DIRECTION_EXPENSE, EXPENSE_DIRECTION_INCOME]);

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function num(value) { return Number(value ?? 0); }
function normalizeText(value) { return String(value ?? "").trim(); }
function nullableText(value, max = 500) {
  const text = normalizeText(value).slice(0, max);
  return text || null;
}

// Enlace social: se acepta con o sin esquema (facebook.com/x o https://facebook.com/x)
// y se normaliza a https. Vacio = null (se quita de la vitrina). Rechaza cualquier cosa
// que no sea http(s) para no publicar javascript:/data: en los enlaces de la vitrina.
function normalizeSocialUrl(value, label) {
  const text = normalizeText(value).slice(0, 200);
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw appError(400, "SETTINGS_SOCIAL_INVALID", `El enlace de ${label} no es valido`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw appError(400, "SETTINGS_SOCIAL_INVALID", `El enlace de ${label} debe ser una direccion web (http/https)`);
  }
  return url.toString();
}

// Fecha de negocio: "YYYY-MM-DD" se almacena al mediodia UTC para que el dia calendario
// sea identico en UTC y en America/Bogota (UTC-5) y la serializacion no corra fechas.
function businessDateToUtc(value) {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw appError(400, "DATE_INVALID", `Fecha invalida: ${text || "(vacia)"}. Usa el formato AAAA-MM-DD`);
  }
  return new Date(`${text}T12:00:00Z`);
}
function toBusinessDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
function todayBusiness() { return new Date().toISOString().slice(0, 10); }
function addDaysUtc(date, days) { return new Date(date.getTime() + days * 86_400_000); }

// Mes calendario con dia recortado al fin de mes (31-ene + 1 mes = 28/29-feb).
function addMonthsUtc(date, months) {
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

// === Helpers puros exportados para pruebas unitarias ===

// Cronograma de cuotas sin interes: base truncada a centavos y la ULTIMA cuota absorbe
// el residuo de redondeo, de modo que la suma cierre exactamente en `amount`.
function buildInstallmentSchedule({ amount, count, frequency, firstDueDate }) {
  const total = round2(Number(amount) || 0);
  if (total <= 0) throw appError(400, "CREDIT_AMOUNT_INVALID", "El monto a financiar debe ser mayor a cero");
  const installments = Number(count);
  if (!Number.isInteger(installments) || installments < 1 || installments > 60) {
    throw appError(400, "CREDIT_COUNT_INVALID", "El numero de cuotas debe estar entre 1 y 60");
  }
  if (!FREQUENCIES.has(frequency)) {
    throw appError(400, "CREDIT_FREQUENCY_INVALID", "La frecuencia debe ser weekly, biweekly o monthly");
  }
  const base = Math.floor((total / installments) * 100) / 100;
  const rows = [];
  for (let index = 0; index < installments; index += 1) {
    let due;
    if (frequency === "monthly") due = addMonthsUtc(firstDueDate, index);
    else due = addDaysUtc(firstDueDate, index * FREQUENCY_DAYS[frequency]);
    const amountRow = index === installments - 1 ? round2(total - base * (installments - 1)) : base;
    rows.push({ number: index + 1, due_date: due, amount: amountRow });
  }
  return rows;
}

// Reparto de un abono entre cuotas: oldest-first por vencimiento (y numero como desempate).
// Devuelve { allocations: {installment_id: monto}, applied, leftover }.
function allocateInstallments(installments, amount) {
  let left = round2(Number(amount) || 0);
  const allocations = {};
  const ordered = [...installments].sort((a, b) => {
    const dueDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    return dueDiff !== 0 ? dueDiff : a.number - b.number;
  });
  for (const row of ordered) {
    if (left <= 0) break;
    const pending = round2(num(row.amount) - num(row.paid_amount));
    if (pending <= 0) continue;
    const take = Math.min(left, pending);
    allocations[String(row.id)] = round2(take);
    left = round2(left - take);
  }
  return { allocations, applied: round2(num(amount) - left), leftover: left };
}

// Costo promedio ponderado en la compra: (stock*costo + qty*unit_cost) / (stock+qty).
function weightedAverageCost(stock, currentCost, quantity, unitCost) {
  const s = Math.max(0, Number(stock) || 0);
  const q = Math.max(0, Number(quantity) || 0);
  if (s + q <= 0) return round2(unitCost);
  return round2((s * (Number(currentCost) || 0) + q * (Number(unitCost) || 0)) / (s + q));
}

// === Serializacion ===

function productDto(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category || null,
    unit: row.unit || "unidad",
    price: num(row.price),
    cost: num(row.cost),
    stock: row.stock,
    min_stock: row.min_stock,
    active: row.active,
    notes: row.notes || null,
    has_photo: Boolean(row.photo_path),
    low_stock: row.stock <= row.min_stock,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null
  };
}

function customerDto(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    document: row.document || null,
    phone: row.phone || null,
    email: row.email || null,
    address: row.address || null,
    active: row.active,
    notes: row.notes || null,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null
  };
}

function saleItemDto(row) {
  return {
    id: row.id,
    line_number: row.line_number,
    product_id: row.product_id,
    product_code: row.product_code || null,
    product_name: row.product_name,
    quantity: row.quantity,
    unit_price: num(row.unit_price),
    unit_cost: num(row.unit_cost),
    line_total: num(row.line_total)
  };
}

function saleDto(row, items = row.items) {
  return {
    id: row.id,
    number: row.number,
    full_number: row.full_number,
    date: toBusinessDate(row.date),
    customer_id: row.customer_id,
    customer_name: row.customer_name || null,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    total: num(row.total),
    cost_total: num(row.cost_total),
    payment_type: row.payment_type,
    method: row.method || null,
    status: row.status,
    note: row.note || null,
    voided_at: row.voided_at ? row.voided_at.toISOString() : null,
    void_reason: row.void_reason || null,
    created_by: row.created_by,
    items: (items || []).map(saleItemDto),
    created_at: row.created_at ? row.created_at.toISOString() : null
  };
}

function installmentDto(row) {
  const pending = round2(num(row.amount) - num(row.paid_amount));
  return {
    id: row.id,
    number: row.number,
    due_date: toBusinessDate(row.due_date),
    amount: num(row.amount),
    paid_amount: num(row.paid_amount),
    pending,
    status: row.status,
    paid_at: row.paid_at ? row.paid_at.toISOString() : null
  };
}

function paymentDto(row) {
  return {
    id: row.id,
    credit_id: row.credit_id,
    date: toBusinessDate(row.date),
    amount: num(row.amount),
    method: row.method,
    note: row.note || null,
    allocations: row.allocations || null,
    created_at: row.created_at ? row.created_at.toISOString() : null
  };
}

function creditDto(row, installments = row.installments, payments = row.payments) {
  const paid = round2((payments || []).reduce((sum, item) => sum + num(item.amount), 0));
  const balance = round2(num(row.financed_amount) - paid);
  const today = todayBusiness();
  const overdue = (installments || []).some((item) =>
    item.status !== INSTALLMENT_PAID && toBusinessDate(item.due_date) < today);
  return {
    id: row.id,
    number: row.number,
    full_number: row.full_number,
    sale_id: row.sale_id,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    financed_amount: num(row.financed_amount),
    down_payment: num(row.down_payment),
    installment_count: row.installment_count,
    frequency: row.frequency,
    first_due_date: toBusinessDate(row.first_due_date),
    status: row.status,
    paid_at: row.paid_at ? row.paid_at.toISOString() : null,
    balance,
    paid_total: paid,
    overdue,
    installments: (installments || []).map(installmentDto),
    payments: (payments || []).map(paymentDto),
    created_at: row.created_at ? row.created_at.toISOString() : null
  };
}

function purchaseDto(row) {
  return {
    id: row.id,
    number: row.number,
    full_number: row.full_number,
    date: toBusinessDate(row.date),
    product_id: row.product_id,
    product_code: row.product_code || null,
    product_name: row.product_name,
    supplier: row.supplier,
    quantity: row.quantity,
    unit_cost: num(row.unit_cost),
    total: num(row.total),
    note: row.note || null,
    created_at: row.created_at ? row.created_at.toISOString() : null
  };
}

function expenseDto(row) {
  return {
    id: row.id,
    number: row.number,
    full_number: row.full_number,
    date: toBusinessDate(row.date),
    concept: row.concept,
    category: row.category || null,
    amount: num(row.amount),
    direction: row.direction === EXPENSE_DIRECTION_INCOME ? EXPENSE_DIRECTION_INCOME : EXPENSE_DIRECTION_EXPENSE,
    method: row.method || null,
    note: row.note || null,
    status: row.status,
    created_at: row.created_at ? row.created_at.toISOString() : null
  };
}

function movementDto(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    product_code: row.product_code || null,
    product_name: row.product_name,
    change: row.change,
    stock_before: row.stock_before,
    stock_after: row.stock_after,
    reason: row.reason,
    reference: row.reference || null,
    occurred_at: toBusinessDate(row.occurred_at),
    created_at: row.created_at ? row.created_at.toISOString() : null
  };
}

function settingsDto(row) {
  return {
    store_name: row.store_name,
    currency: row.currency || "COP",
    receipt_note: row.receipt_note || null,
    catalog_enabled: Boolean(row.catalog_enabled),
    catalog_code: row.catalog_code || null,
    catalog_whatsapp: row.catalog_whatsapp || null,
    catalog_facebook: row.catalog_facebook || null,
    catalog_instagram: row.catalog_instagram || null,
    preferences: row.preferences_json && typeof row.preferences_json === "object" ? row.preferences_json : {},
    updated_at: row.updated_at ? row.updated_at.toISOString() : null
  };
}

// === Numeracion y codigos por tenant ===

async function nextNumberTx(tx, model, tenantId) {
  const last = await tx[model].findFirst({ where: { tenant_id: tenantId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number || 0) + 1;
}

async function nextCodeTx(tx, model, tenantId, prefix) {
  // __includeInactive: el maestro archivado sigue ocupando su codigo (unique tenant+code);
  // sin el flag el contador reinicia sobre filas inactivas y el alta nueva choca con P2002.
  const last = await tx[model].findFirst({
    where: { tenant_id: tenantId, code: { startsWith: prefix }, __includeInactive: true },
    orderBy: { id: "desc" },
    select: { code: true }
  });
  const current = Number(String(last?.code || "").replace(/\D/g, "")) || 0;
  return `${prefix}${String(current + 1).padStart(4, "0")}`;
}

// === Query helpers ===

function parseLimitOffset(query = {}, defaultLimit = 100, maxLimit = 500) {
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { take: limit, skip: offset };
}

function dateRangeWhere(query = {}, field = "date") {
  const where = {};
  if (normalizeText(query.from)) where[field] = { ...(where[field] || {}), gte: businessDateToUtc(query.from) };
  if (normalizeText(query.to)) where[field] = { ...(where[field] || {}), lte: addDaysUtc(businessDateToUtc(query.to), 1) };
  return where;
}

// === Configuracion del comercio ===

// Alfabeto sin 0/1/i/l/o para que el codigo del link publico sea legible al copiarlo.
const CATALOG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomCatalogCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (const byte of bytes) out += CATALOG_ALPHABET[byte % CATALOG_ALPHABET.length];
  return out;
}

async function getSettings(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.comercioSettings.findFirst({ where: {} });
    if (existing) return settingsDto(existing);
    const created = await prisma.comercioSettings.create({ data: {} });
    return settingsDto(created);
  });
}

async function updateSettings(tenantId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.comercioSettings.findFirst({ where: {} })
      || await prisma.comercioSettings.create({ data: {} });
    const payload = {};
    if (data.store_name !== undefined) {
      const name = nullableText(data.store_name, 120);
      if (!name) throw appError(400, "SETTINGS_STORE_NAME_INVALID", "El nombre del negocio no puede quedar vacio");
      payload.store_name = name;
    }
    if (data.currency !== undefined) {
      const currency = nullableText(data.currency, 8);
      if (!currency) throw appError(400, "SETTINGS_CURRENCY_INVALID", "La moneda es obligatoria (ej. COP)");
      payload.currency = currency.toUpperCase();
    }
    if (data.receipt_note !== undefined) payload.receipt_note = nullableText(data.receipt_note, 300);
    if (data.catalog_whatsapp !== undefined) payload.catalog_whatsapp = nullableText(data.catalog_whatsapp, 32);
    if (data.catalog_facebook !== undefined) payload.catalog_facebook = normalizeSocialUrl(data.catalog_facebook, "Facebook");
    if (data.catalog_instagram !== undefined) payload.catalog_instagram = normalizeSocialUrl(data.catalog_instagram, "Instagram");
    if (data.catalog_enabled !== undefined) {
      const enable = Boolean(data.catalog_enabled);
      payload.catalog_enabled = enable;
      // Al activar sin codigo se genera el link corto; al desactivar se CONSERVA el codigo
      // (revocacion sin quemar el link difundido; volver a activar lo reusa).
      if (enable && !current.catalog_code) payload.catalog_code = randomCatalogCode();
    }
    if (data.preferences !== undefined) {
      const prefs = data.preferences;
      if (prefs === null || (typeof prefs !== "object" || Array.isArray(prefs))) {
        throw appError(400, "SETTINGS_PREFERENCES_INVALID", "Las preferencias visuales deben ser un objeto");
      }
      payload.preferences_json = prefs;
    }
    const updated = await updateSettingsWithUniqueCode(current.id, payload);
    return settingsDto(updated);
  });
}

// catalog_code es unico GLOBAL: el choque (improbable) se reintenta con otro codigo.
async function updateSettingsWithUniqueCode(id, payload) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.comercioSettings.update({ where: { id }, data: payload });
    } catch (error) {
      if (error?.code === "P2002" && payload.catalog_code && attempt < 5) {
        payload.catalog_code = randomCatalogCode();
        continue;
      }
      throw error;
    }
  }
}

// Regenerar quema el link anterior (el cliente difunde uno nuevo). Exige write.
async function regenerateCatalogCode(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.comercioSettings.findFirst({ where: {} })
      || await prisma.comercioSettings.create({ data: {} });
    const updated = await updateSettingsWithUniqueCode(current.id, { catalog_code: randomCatalogCode() });
    return settingsDto(updated);
  });
}

// === Vitrina publica ===
// Unica puerta: el codigo corto (globalmente unico). El lector anonimo NUNCA ve
// tenant_id, costo, stock crudo ni ids internos; disponible/agotado se deriva del stock.
async function publicCatalog(code) {
  const clean = normalizeText(String(code || "")).toLowerCase();
  if (!/^[a-z0-9]{4,32}$/.test(clean)) throw appError(404, "CATALOG_NOT_FOUND", "La tienda publica no esta disponible");
  // Sin contexto de tenant: core/prisma.js no inyecta filtro y catalog_code es la clave.
  const settings = await prisma.comercioSettings.findFirst({ where: { catalog_code: clean } });
  if (!settings || !settings.catalog_enabled) throw appError(404, "CATALOG_NOT_FOUND", "La tienda publica no esta disponible");
  return prisma.runWithTenant(settings.tenant_id, async () => {
    // SOFT_DELETE ya limita a productos activos.
    const rows = await prisma.comercioProduct.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
    const items = rows.map((row) => ({
      code: row.code,
      name: row.name,
      category: row.category || null,
      unit: row.unit || "unidad",
      price: num(row.price),
      available: row.stock > 0,
      photo_url: storage.publicViewUrl(row.photo_path)
    }));
    return {
      store_name: settings.store_name,
      currency: settings.currency || "COP",
      whatsapp: settings.catalog_whatsapp || null,
      facebook: settings.catalog_facebook || null,
      instagram: settings.catalog_instagram || null,
      categories: [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
      items
    };
  });
}

// === Maestros: productos ===

async function listProducts(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.comercioProduct.findMany({
      where: query.include_inactive === "true" ? { __includeInactive: true } : {},
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
    const search = normalizeText(query.q).toLowerCase();
    const filtered = rows.filter((row) => {
      if (search && !`${row.name} ${row.code} ${row.category || ""}`.toLowerCase().includes(search)) return false;
      if (query.low_stock === "true" && !(row.stock <= row.min_stock)) return false;
      if (query.category && normalizeText(query.category) && row.category !== query.category) return false;
      return true;
    });
    const { take, skip } = parseLimitOffset(query);
    return { items: filtered.slice(skip, skip + take).map(productDto), total: filtered.length };
  });
}

async function findProductTx(tx, tenantId, id, { requireActive = true } = {}) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
  const product = await tx.comercioProduct.findFirst({ where: { id: productId, tenant_id: tenantId, __includeInactive: true } });
  if (!product) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
  if (requireActive && !product.active) throw appError(409, "PRODUCT_INACTIVE", `El producto ${product.name} esta inactivo`);
  return product;
}

async function getProduct(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const productId = Number(id);
    const row = await prisma.comercioProduct.findFirst({ where: { id: productId, __includeInactive: true } });
    if (!row) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    return productDto(row);
  });
}

function productPayload(data, { partial = false } = {}) {
  const payload = {};
  if (!partial || data.name !== undefined) {
    const name = nullableText(data.name, 160);
    if (!name) throw appError(400, "PRODUCT_NAME_REQUIRED", "El nombre del producto es obligatorio");
    payload.name = name;
  }
  if (data.category !== undefined) payload.category = nullableText(data.category, 80);
  if (data.unit !== undefined) payload.unit = nullableText(data.unit, 20) || "unidad";
  if (!partial || data.price !== undefined) {
    const price = Number(data.price);
    if (!Number.isFinite(price) || price < 0) throw appError(400, "PRODUCT_PRICE_INVALID", "El precio de venta debe ser un numero mayor o igual a cero");
    payload.price = round2(price);
  }
  if (!partial || data.cost !== undefined) {
    const cost = Number(data.cost);
    if (!Number.isFinite(cost) || cost < 0) throw appError(400, "PRODUCT_COST_INVALID", "El costo unitario debe ser un numero mayor o igual a cero");
    payload.cost = round2(cost);
  }
  if (data.min_stock !== undefined) {
    const min = Number(data.min_stock);
    if (!Number.isInteger(min) || min < 0) throw appError(400, "PRODUCT_MIN_STOCK_INVALID", "El stock minimo debe ser un entero mayor o igual a cero");
    payload.min_stock = min;
  }
  if (data.active !== undefined) payload.active = data.active !== false;
  if (data.notes !== undefined) payload.notes = nullableText(data.notes, 500);
  return payload;
}

async function createProduct(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const payload = productPayload(data);
    const initialStock = Number(data.stock ?? 0);
    if (!Number.isInteger(initialStock) || initialStock < 0) throw appError(400, "PRODUCT_STOCK_INVALID", "Las existencias deben ser un entero mayor o igual a cero");
    payload.stock = initialStock;
    payload.code = await nextCodeTx(tx, "comercioProduct", tenantId, "P-");
    const created = await tx.comercioProduct.create({ data: payload });
    if (initialStock > 0) {
      await tx.comercioStockMovement.create({
        data: {
          tenant_id: tenantId,
          product_id: created.id,
          product_code: created.code,
          product_name: created.name,
          change: initialStock,
          stock_before: 0,
          stock_after: initialStock,
          reason: "initial",
          reference: null,
          occurred_at: new Date(),
          created_by: userId || null
        }
      });
    }
    return productDto(created);
  }, TX_OPTIONS));
}

async function updateProduct(tenantId, userId, id, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const current = await findProductTx(tx, tenantId, id, { requireActive: false });
    const payload = productPayload(data, { partial: true });
    // El stock NO se edita por aqui: todo cambio de existencias pasa por adjustStock,
    // compras o ventas, y queda trazado en comercio_stock_movements.
    delete payload.stock;
    const updated = await tx.comercioProduct.update({ where: { id: current.id }, data: payload });
    return productDto(updated);
  }, TX_OPTIONS));
}

async function setProductActive(tenantId, id, active) {
  return prisma.runWithTenant(tenantId, async () => {
    const productId = Number(id);
    const current = await prisma.comercioProduct.findFirst({ where: { id: productId, __includeInactive: true } });
    if (!current) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    const updated = await prisma.comercioProduct.update({ where: { id: current.id }, data: { active } });
    return productDto(updated);
  });
}

// Ajuste manual de existencias (conteo fisico, merma, devolucion, correccion).
async function adjustStock(tenantId, userId, id, data) {
  const reason = nullableText(data.reason, 60) || "Conteo fisico";
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const product = await findProductTx(tx, tenantId, id, { requireActive: false });
    let target;
    if (data.new_stock !== undefined) {
      target = Number(data.new_stock);
      if (!Number.isInteger(target) || target < 0) throw appError(400, "STOCK_ADJUST_INVALID", "La nueva cantidad debe ser un entero mayor o igual a cero");
    } else {
      const change = Number(data.change);
      if (!Number.isInteger(change) || change === 0) throw appError(400, "STOCK_ADJUST_INVALID", "Indica un cambio distinto de cero o la nueva cantidad");
      target = product.stock + change;
      if (target < 0) throw appError(409, "STOCK_NEGATIVE", `El ajuste dejaria ${product.name} en ${target} unidades; el stock no puede ser negativo`);
    }
    const delta = target - product.stock;
    if (delta === 0) return { product: productDto(product), movement: null };
    const updated = await tx.comercioProduct.updateMany({
      where: { id: product.id, tenant_id: tenantId, stock: product.stock },
      data: { stock: target }
    });
    if (updated.count !== 1) throw appError(409, "STOCK_CHANGED", "Otro ajuste modifico el stock durante la operacion; vuelve a intentar");
    const movement = await tx.comercioStockMovement.create({
      data: {
        tenant_id: tenantId,
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        change: delta,
        stock_before: product.stock,
        stock_after: target,
        reason: "adjustment",
        reference: reason,
        occurred_at: new Date(),
        created_by: userId || null
      }
    });
    const row = await tx.comercioProduct.findFirst({ where: { id: product.id, tenant_id: tenantId } });
    return { product: productDto(row), movement: movementDto(movement) };
  }, TX_OPTIONS));
}

// === Fotografias de producto (Supabase Storage, bucket comercio-assets) ===

async function attachProductPhoto(tenantId, id, { bytes, mime, declaredMime }) {
  const validated = storage.validateProductImage(bytes, declaredMime || mime);
  return prisma.runWithTenant(tenantId, async () => {
    const productId = Number(id);
    const current = await prisma.comercioProduct.findFirst({ where: { id: productId, __includeInactive: true } });
    if (!current) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    const objectPath = storage.objectKey({ tenantId, productId: current.id, extension: validated.extension });
    const storagePath = await storage.uploadProductPhoto({
      objectPath,
      bytes,
      contentType: validated.mime
    });
    // La foto anterior se elimina best-effort: si falla, la fila ya no referencia el objeto.
    const previous = current.photo_path;
    const updated = await prisma.comercioProduct.update({
      where: { id: current.id },
      data: { photo_path: storagePath, photo_mime: validated.mime }
    });
    if (previous) await storage.removeProductPhoto(previous).catch(() => false);
    return { ...productDto(updated), photo_url: await storage.signedViewUrl(storagePath) };
  });
}

async function productPhotoUrl(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const productId = Number(id);
    const current = await prisma.comercioProduct.findFirst({ where: { id: productId, __includeInactive: true } });
    if (!current) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    if (!current.photo_path) return { photo_url: null };
    return { photo_url: await storage.signedViewUrl(current.photo_path) };
  });
}

async function detachProductPhoto(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const productId = Number(id);
    const current = await prisma.comercioProduct.findFirst({ where: { id: productId, __includeInactive: true } });
    if (!current) throw appError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    const previous = current.photo_path;
    const updated = await prisma.comercioProduct.update({
      where: { id: current.id },
      data: { photo_path: null, photo_mime: null }
    });
    if (previous) await storage.removeProductPhoto(previous).catch(() => false);
    return productDto(updated);
  });
}

// === Maestros: clientes ===

async function listCustomers(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.comercioCustomer.findMany({
      where: query.include_inactive === "true" ? { __includeInactive: true } : {},
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
    const search = normalizeText(query.q).toLowerCase();
    const filtered = rows.filter((row) =>
      !search || `${row.name} ${row.code} ${row.phone || ""} ${row.document || ""}`.toLowerCase().includes(search));
    const { take, skip } = parseLimitOffset(query);
    return { items: filtered.slice(skip, skip + take).map(customerDto), total: filtered.length };
  });
}

function customerPayload(data, { partial = false } = {}) {
  const payload = {};
  if (!partial || data.name !== undefined) {
    const name = nullableText(data.name, 160);
    if (!name) throw appError(400, "CUSTOMER_NAME_REQUIRED", "El nombre del cliente es obligatorio");
    payload.name = name;
  }
  if (data.document !== undefined) payload.document = nullableText(data.document, 30);
  if (data.phone !== undefined) payload.phone = nullableText(data.phone, 30);
  if (data.email !== undefined) payload.email = nullableText(data.email, 160);
  if (data.address !== undefined) payload.address = nullableText(data.address, 300);
  if (data.active !== undefined) payload.active = data.active !== false;
  if (data.notes !== undefined) payload.notes = nullableText(data.notes, 500);
  return payload;
}

async function createCustomer(tenantId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const payload = customerPayload(data);
    payload.code = await nextCodeTx(tx, "comercioCustomer", tenantId, "C-");
    const created = await tx.comercioCustomer.create({ data: payload });
    return customerDto(created);
  }, TX_OPTIONS));
}

async function updateCustomer(tenantId, id, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const customerId = Number(id);
    const current = await prisma.comercioCustomer.findFirst({ where: { id: customerId, __includeInactive: true } });
    if (!current) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");
    const updated = await prisma.comercioCustomer.update({ where: { id: current.id }, data: customerPayload(data, { partial: true }) });
    return customerDto(updated);
  });
}

async function setCustomerActive(tenantId, id, active) {
  return prisma.runWithTenant(tenantId, async () => {
    const customerId = Number(id);
    const current = await prisma.comercioCustomer.findFirst({ where: { id: customerId, __includeInactive: true } });
    if (!current) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");
    if (active !== true) {
      const openCredits = await prisma.comercioCredit.count({ where: { customer_id: current.id, status: CREDIT_STATUS_OPEN } });
      if (openCredits > 0) throw appError(409, "CUSTOMER_HAS_OPEN_CREDITS", `El cliente tiene ${openCredits} credito(s) vigente(s); no se puede desactivar`);
    }
    const updated = await prisma.comercioCustomer.update({ where: { id: current.id }, data: { active } });
    return customerDto(updated);
  });
}

// === Ventas ===

// El precio y el costo los fija el servidor desde el producto (el cliente solo manda
// producto + cantidad). La venta congela el costo promedio vigente: margen historico.
async function createSale(tenantId, userId, data) {
  const date = businessDateToUtc(normalizeText(data.date) || todayBusiness());
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const rawItems = Array.isArray(data.items) ? data.items : [];
    if (!rawItems.length) throw appError(400, "SALE_ITEMS_REQUIRED", "Agrega al menos un producto a la venta");
    const merged = new Map();
    for (const item of rawItems) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw appError(400, "SALE_QUANTITY_INVALID", "Las cantidades deben ser enteros mayores a cero");
      merged.set(Number(item.product_id), (merged.get(Number(item.product_id)) || 0) + quantity);
    }
    if (merged.size > 200) throw appError(400, "SALE_ITEMS_LIMIT", "Maximo 200 productos distintos por venta");

    let customerId = null;
    let customerName = null;
    if (data.customer_id !== undefined && data.customer_id !== null && data.customer_id !== "") {
      const customer = await tx.comercioCustomer.findFirst({ where: { id: Number(data.customer_id), tenant_id: tenantId } });
      if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");
      customerId = customer.id;
      customerName = customer.name;
    }

    const paymentType = data.payment_type === PAYMENT_CREDIT ? PAYMENT_CREDIT : PAYMENT_CASH;
    if (paymentType === PAYMENT_CREDIT && !customerId) {
      throw appError(400, "CREDIT_CUSTOMER_REQUIRED", "Las ventas a credito exigen un cliente identificado");
    }

    const discount = round2(Number(data.discount) || 0);
    if (discount < 0) throw appError(400, "SALE_DISCOUNT_INVALID", "El descuento no puede ser negativo");

    // Descuento atomo por producto: si el stock cambia en paralelo, la venta falla limpia.
    const lines = [];
    for (const [productId, quantity] of merged.entries()) {
      const product = await findProductTx(tx, tenantId, productId);
      const decremented = await tx.comercioProduct.updateMany({
        where: { id: product.id, tenant_id: tenantId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } }
      });
      if (decremented.count !== 1) {
        throw appError(409, "STOCK_INSUFFICIENT", `Stock insuficiente para ${product.name}: pide ${quantity} y hay ${product.stock}`);
      }
      const after = await tx.comercioProduct.findFirst({ where: { id: product.id, tenant_id: tenantId } });
      lines.push({
        product,
        quantity,
        unit_price: num(product.price),
        unit_cost: num(product.cost),
        stock_before: product.stock,
        stock_after: after.stock
      });
    }

    const number = await nextNumberTx(tx, "comercioSale", tenantId);
    const fullNumber = `V-${String(number).padStart(6, "0")}`;
    const subtotal = round2(lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0));
    if (discount > subtotal) throw appError(400, "SALE_DISCOUNT_INVALID", "El descuento no puede superar el subtotal");
    const total = round2(subtotal - discount);
    const costTotal = round2(lines.reduce((sum, line) => sum + line.unit_cost * line.quantity, 0));

    const sale = await tx.comercioSale.create({
      data: {
        tenant_id: tenantId,
        number,
        full_number: fullNumber,
        date,
        customer_id: customerId,
        customer_name: customerName,
        subtotal,
        discount,
        total,
        cost_total: costTotal,
        payment_type: paymentType,
        method: paymentType === PAYMENT_CREDIT ? null : nullableText(data.method, 60) || "Efectivo",
        status: SALE_STATUS_ACTIVE,
        note: nullableText(data.note, 500),
        created_by: userId || null
      }
    });

    let lineIndex = 0;
    for (const line of lines) {
      lineIndex += 1;
      await tx.comercioSaleItem.create({
        data: {
          tenant_id: tenantId,
          sale_id: sale.id,
          line_number: lineIndex,
          product_id: line.product.id,
          product_code: line.product.code,
          product_name: line.product.name,
          quantity: line.quantity,
          unit_price: line.unit_price,
          unit_cost: line.unit_cost,
          line_total: round2(line.unit_price * line.quantity)
        }
      });
      await tx.comercioStockMovement.create({
        data: {
          tenant_id: tenantId,
          product_id: line.product.id,
          product_code: line.product.code,
          product_name: line.product.name,
          change: -line.quantity,
          stock_before: line.stock_before,
          stock_after: line.stock_after,
          reason: "sale",
          reference: fullNumber,
          occurred_at: date,
          created_by: userId || null
        }
      });
    }

    let credit = null;
    if (paymentType === PAYMENT_CREDIT) {
      const setup = data.credit || {};
      const downPayment = round2(Number(setup.down_payment) || 0);
      if (downPayment < 0 || downPayment > total) throw appError(400, "CREDIT_DOWN_INVALID", "La cuota inicial debe estar entre 0 y el total de la venta");
      const financed = round2(total - downPayment);
      const frequency = normalizeText(setup.frequency) || "biweekly";
      const firstDue = businessDateToUtc(normalizeText(setup.first_due_date) || todayBusiness());
      const schedule = financed > 0
        ? buildInstallmentSchedule({ amount: financed, count: setup.installment_count ?? 4, frequency, firstDueDate: firstDue })
        : [];
      const creditNumber = await nextNumberTx(tx, "comercioCredit", tenantId);
      const created = await tx.comercioCredit.create({
        data: {
          tenant_id: tenantId,
          number: creditNumber,
          full_number: `CR-${String(creditNumber).padStart(4, "0")}`,
          sale_id: sale.id,
          customer_id: customerId,
          customer_name: customerName,
          financed_amount: financed,
          down_payment: downPayment,
          installment_count: schedule.length,
          frequency,
          first_due_date: firstDue,
          status: schedule.length ? CREDIT_STATUS_OPEN : CREDIT_STATUS_PAID,
          paid_at: schedule.length ? null : new Date()
        }
      });
      for (const row of schedule) {
        await tx.comercioInstallment.create({
          data: {
            tenant_id: tenantId,
            credit_id: created.id,
            number: row.number,
            due_date: row.due_date,
            amount: row.amount
          }
        });
      }
      credit = created;
    }

    const items = await tx.comercioSaleItem.findMany({ where: { sale_id: sale.id }, orderBy: { line_number: "asc" } });
    return { ...saleDto(sale, items), credit_full_number: credit ? credit.full_number : null };
  }, TX_OPTIONS));
}

async function listSales(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = { ...dateRangeWhere(query) };
    if (query.status === SALE_STATUS_VOIDED) where.status = SALE_STATUS_VOIDED;
    else if (query.status === SALE_STATUS_ACTIVE) where.status = SALE_STATUS_ACTIVE;
    if (query.payment_type === PAYMENT_CASH || query.payment_type === PAYMENT_CREDIT) where.payment_type = query.payment_type;
    if (query.customer_id) where.customer_id = Number(query.customer_id);
    const { take, skip } = parseLimitOffset(query);
    const [rows, total] = await Promise.all([
      prisma.comercioSale.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], take, skip, include: { items: { orderBy: { line_number: "asc" } } } }),
      prisma.comercioSale.count({ where })
    ]);
    return { items: rows.map((row) => saleDto(row)), total };
  });
}

async function getSale(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const sale = await prisma.comercioSale.findFirst({
      where: { id: Number(id) },
      include: { items: { orderBy: { line_number: "asc" } } }
    });
    if (!sale) throw appError(404, "SALE_NOT_FOUND", "Venta no encontrada");
    const credit = await prisma.comercioCredit.findFirst({ where: { sale_id: sale.id } });
    return { ...saleDto(sale), credit_id: credit ? credit.id : null };
  });
}

// Anulacion: devuelve el stock, traza el movimiento y anula el credito asociado.
// Si el credito ya recibio abonos, la anulacion se bloquea: primero debe tratarse la
// cartera (el comerciante decide si devuelve el dinero y registra el ajuste a mano).
async function voidSale(tenantId, userId, id, data = {}) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const sale = await tx.comercioSale.findFirst({
      where: { id: Number(id), tenant_id: tenantId },
      include: { items: true }
    });
    if (!sale) throw appError(404, "SALE_NOT_FOUND", "Venta no encontrada");
    if (sale.status !== SALE_STATUS_ACTIVE) throw appError(409, "SALE_ALREADY_VOIDED", "La venta ya esta anulada");
    const reason = nullableText(data.reason, 300) || "Anulacion";

    for (const item of sale.items) {
      if (!item.product_id) continue;
      const product = await tx.comercioProduct.findFirst({ where: { id: item.product_id, tenant_id: tenantId } });
      if (!product) continue; // Producto desaparecido (no deberia): la venta conserva su snapshot.
      await tx.comercioProduct.updateMany({
        where: { id: product.id, tenant_id: tenantId },
        data: { stock: { increment: item.quantity } }
      });
      await tx.comercioStockMovement.create({
        data: {
          tenant_id: tenantId,
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          change: item.quantity,
          stock_before: product.stock,
          stock_after: product.stock + item.quantity,
          reason: "sale_void",
          reference: sale.full_number,
          occurred_at: new Date(),
          created_by: userId || null
        }
      });
    }

    const credit = await tx.comercioCredit.findFirst({ where: { sale_id: sale.id, tenant_id: tenantId } });
    if (credit && credit.status !== CREDIT_STATUS_VOIDED) {
      const paidCount = await tx.comercioPayment.count({ where: { credit_id: credit.id, tenant_id: tenantId } });
      if (paidCount > 0) {
        throw appError(409, "CREDIT_HAS_PAYMENTS", `El credito ${credit.full_number} ya recibio abonos; anular la venta dejaria pagos huerfanos`);
      }
      await tx.comercioCredit.update({ where: { id: credit.id }, data: { status: CREDIT_STATUS_VOIDED } });
    }

    const updated = await tx.comercioSale.update({
      where: { id: sale.id },
      data: { status: SALE_STATUS_VOIDED, voided_at: new Date(), void_reason: reason }
    });
    const items = await tx.comercioSaleItem.findMany({ where: { sale_id: sale.id }, orderBy: { line_number: "asc" } });
    return saleDto(updated, items);
  }, TX_OPTIONS));
}

// === Cartera (creditos) ===

async function listCredits(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.comercioCredit.findMany({
      where: {},
      orderBy: [{ status: "asc" }, { created_at: "desc" }],
      include: { installments: { orderBy: { number: "asc" } }, payments: { orderBy: { date: "asc" } } }
    });
    const today = todayBusiness();
    const mapped = rows.map((row) => creditDto(row));
    const filtered = mapped.filter((row) => {
      if (query.status === "open" && (row.status !== CREDIT_STATUS_OPEN || row.balance <= 0)) return false;
      if (query.status === "overdue" && !(row.status === CREDIT_STATUS_OPEN && row.overdue && row.balance > 0)) return false;
      if (query.status === "paid" && !(row.status === CREDIT_STATUS_PAID || (row.status === CREDIT_STATUS_OPEN && row.balance <= 0))) return false;
      if (query.status === "voided" && row.status !== CREDIT_STATUS_VOIDED) return false;
      if (query.customer_id && row.customer_id !== Number(query.customer_id)) return false;
      if (query.q) {
        const search = normalizeText(query.q).toLowerCase();
        if (!`${row.customer_name} ${row.full_number}`.toLowerCase().includes(search)) return false;
      }
      void today;
      return true;
    });
    const { take, skip } = parseLimitOffset(query);
    return {
      items: filtered.slice(skip, skip + take),
      total: filtered.length,
      totals: {
        outstanding: round2(filtered.reduce((sum, row) => sum + (row.status === CREDIT_STATUS_VOIDED ? 0 : row.balance), 0)),
        overdue: round2(filtered.reduce((sum, row) => sum + (row.overdue && row.status === CREDIT_STATUS_OPEN ? row.balance : 0), 0))
      }
    };
  });
}

async function getCredit(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const credit = await prisma.comercioCredit.findFirst({
      where: { id: Number(id) },
      include: { installments: { orderBy: { number: "asc" } }, payments: { orderBy: { date: "asc" } } }
    });
    if (!credit) throw appError(404, "CREDIT_NOT_FOUND", "Credito no encontrado");
    return creditDto(credit);
  });
}

// Abono: se reparte oldest-first entre cuotas y se traza en payment.allocations.
async function addCreditPayment(tenantId, userId, id, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const credit = await tx.comercioCredit.findFirst({
      where: { id: Number(id), tenant_id: tenantId },
      include: { installments: true, payments: true }
    });
    if (!credit) throw appError(404, "CREDIT_NOT_FOUND", "Credito no encontrado");
    if (credit.status === CREDIT_STATUS_VOIDED) throw appError(409, "CREDIT_VOIDED", "El credito esta anulado");
    const amount = round2(Number(data.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw appError(400, "PAYMENT_AMOUNT_INVALID", "El valor del abono debe ser mayor a cero");
    const paidSoFar = round2(credit.payments.reduce((sum, item) => sum + num(item.amount), 0));
    const balance = round2(num(credit.financed_amount) - paidSoFar);
    if (balance <= 0) throw appError(409, "CREDIT_ALREADY_PAID", "El credito no tiene saldo pendiente");
    if (amount > balance) throw appError(400, "PAYMENT_AMOUNT_INVALID", `El abono (${amount}) supera el saldo pendiente (${balance})`);

    const { allocations, applied } = allocateInstallments(credit.installments, amount);
    for (const installment of credit.installments) {
      const take = allocations[String(installment.id)];
      if (!take) continue;
      const newPaid = round2(num(installment.paid_amount) + take);
      const fully = newPaid >= round2(num(installment.amount)) - 0.005;
      await tx.comercioInstallment.updateMany({
        where: { id: installment.id, tenant_id: tenantId },
        data: {
          paid_amount: newPaid,
          status: fully ? INSTALLMENT_PAID : INSTALLMENT_PARTIAL,
          paid_at: fully ? new Date() : installment.paid_at
        }
      });
    }
    const payment = await tx.comercioPayment.create({
      data: {
        tenant_id: tenantId,
        credit_id: credit.id,
        date: businessDateToUtc(normalizeText(data.date) || todayBusiness()),
        amount: applied,
        method: nullableText(data.method, 60) || "Efectivo",
        note: nullableText(data.note, 500),
        allocations,
        created_by: userId || null
      }
    });
    const newBalance = round2(balance - applied);
    if (newBalance <= 0) {
      await tx.comercioCredit.updateMany({
        where: { id: credit.id, tenant_id: tenantId },
        data: { status: CREDIT_STATUS_PAID, paid_at: new Date() }
      });
    }
    const refreshed = await tx.comercioCredit.findFirst({
      where: { id: credit.id, tenant_id: tenantId },
      include: { installments: { orderBy: { number: "asc" } }, payments: { orderBy: { date: "asc" } } }
    });
    return { credit: creditDto(refreshed), payment: paymentDto(payment) };
  }, TX_OPTIONS));
}

// === Compras ===

async function listPurchases(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = dateRangeWhere(query);
    const { take, skip } = parseLimitOffset(query);
    const [rows, total] = await Promise.all([
      prisma.comercioPurchase.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], take, skip }),
      prisma.comercioPurchase.count({ where })
    ]);
    return { items: rows.map(purchaseDto), total };
  });
}

async function createPurchase(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const product = await findProductTx(tx, tenantId, data.product_id);
    const quantity = Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw appError(400, "PURCHASE_QUANTITY_INVALID", "La cantidad comprada debe ser un entero mayor a cero");
    const unitCost = Number(data.unit_cost);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw appError(400, "PURCHASE_COST_INVALID", "El costo unitario de la compra debe ser mayor o igual a cero");
    const date = businessDateToUtc(normalizeText(data.date) || todayBusiness());
    const supplier = nullableText(data.supplier, 160);
    if (!supplier) throw appError(400, "PURCHASE_SUPPLIER_REQUIRED", "Indica el proveedor de la compra");

    const newCost = weightedAverageCost(product.stock, product.cost, quantity, unitCost);
    const updated = await tx.comercioProduct.updateMany({
      where: { id: product.id, tenant_id: tenantId, stock: product.stock },
      data: { stock: { increment: quantity }, cost: newCost }
    });
    if (updated.count !== 1) throw appError(409, "STOCK_CHANGED", "Otra operacion modifico el producto durante la compra; vuelve a intentar");

    const number = await nextNumberTx(tx, "comercioPurchase", tenantId);
    const created = await tx.comercioPurchase.create({
      data: {
        tenant_id: tenantId,
        number,
        full_number: `CMP-${String(number).padStart(4, "0")}`,
        date,
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        supplier,
        quantity,
        unit_cost: round2(unitCost),
        total: round2(unitCost * quantity),
        note: nullableText(data.note, 500),
        created_by: userId || null
      }
    });
    await tx.comercioStockMovement.create({
      data: {
        tenant_id: tenantId,
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        change: quantity,
        stock_before: product.stock,
        stock_after: product.stock + quantity,
        reason: "purchase",
        reference: created.full_number,
        occurred_at: date,
        created_by: userId || null
      }
    });
    return purchaseDto(created);
  }, TX_OPTIONS));
}

// === Gastos ===

async function listExpenses(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = dateRangeWhere(query);
    if (query.status === SALE_STATUS_VOIDED) where.status = SALE_STATUS_VOIDED;
    else if (query.status !== "all") where.status = "active";
    if (EXPENSE_DIRECTIONS.has(normalizeText(query.direction))) where.direction = normalizeText(query.direction);
    const { take, skip } = parseLimitOffset(query);
    const [rows, total] = await Promise.all([
      prisma.comercioExpense.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], take, skip }),
      prisma.comercioExpense.count({ where })
    ]);
    return { items: rows.map(expenseDto), total };
  });
}

function expensePayload(data, { partial = false } = {}) {
  const payload = {};
  if (!partial || data.concept !== undefined) {
    const concept = nullableText(data.concept, 160);
    if (!concept) throw appError(400, "EXPENSE_CONCEPT_REQUIRED", "El concepto del gasto es obligatorio");
    payload.concept = concept;
  }
  if (data.category !== undefined) payload.category = nullableText(data.category, 80);
  if (!partial || data.amount !== undefined) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw appError(400, "EXPENSE_AMOUNT_INVALID", "El valor del gasto debe ser mayor a cero");
    payload.amount = round2(amount);
  }
  if (data.method !== undefined) payload.method = nullableText(data.method, 60);
  if (data.note !== undefined) payload.note = nullableText(data.note, 500);
  if (data.direction !== undefined) {
    const direction = normalizeText(data.direction);
    if (!EXPENSE_DIRECTIONS.has(direction)) {
      throw appError(400, "EXPENSE_DIRECTION_INVALID", "La direccion debe ser income o expense");
    }
    payload.direction = direction;
  }
  return payload;
}

async function createExpense(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const payload = expensePayload(data);
    payload.date = businessDateToUtc(normalizeText(data.date) || todayBusiness());
    const number = await nextNumberTx(tx, "comercioExpense", tenantId);
    const created = await tx.comercioExpense.create({
      data: {
        tenant_id: tenantId,
        number,
        full_number: `G-${String(number).padStart(4, "0")}`,
        status: "active",
        created_by: userId || null,
        ...payload
      }
    });
    return expenseDto(created);
  }, TX_OPTIONS));
}

async function updateExpense(tenantId, id, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.comercioExpense.findFirst({ where: { id: Number(id) } });
    if (!current) throw appError(404, "EXPENSE_NOT_FOUND", "Gasto no encontrado");
    if (current.status !== "active") throw appError(409, "EXPENSE_VOIDED", "El gasto esta anulado y no se puede editar");
    const payload = expensePayload(data, { partial: true });
    if (data.date !== undefined) payload.date = businessDateToUtc(data.date);
    const updated = await prisma.comercioExpense.update({ where: { id: current.id }, data: payload });
    return expenseDto(updated);
  });
}

async function voidExpense(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.comercioExpense.findFirst({ where: { id: Number(id) } });
    if (!current) throw appError(404, "EXPENSE_NOT_FOUND", "Gasto no encontrado");
    if (current.status !== "active") throw appError(409, "EXPENSE_VOIDED", "El gasto ya esta anulado");
    const updated = await prisma.comercioExpense.update({ where: { id: current.id }, data: { status: SALE_STATUS_VOIDED } });
    return expenseDto(updated);
  });
}

// === Movimientos de inventario ===

async function listMovements(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.product_id) where.product_id = Number(query.product_id);
    const from = normalizeText(query.from);
    const to = normalizeText(query.to);
    if (from || to) {
      where.occurred_at = {};
      if (from) where.occurred_at.gte = businessDateToUtc(from);
      if (to) where.occurred_at.lte = addDaysUtc(businessDateToUtc(to), 1);
    }
    const { take, skip } = parseLimitOffset(query);
    const [rows, total] = await Promise.all([
      prisma.comercioStockMovement.findMany({ where, orderBy: { occurred_at: "desc" }, take, skip }),
      prisma.comercioStockMovement.count({ where })
    ]);
    return { items: rows.map(movementDto), total };
  });
}

// === Reportes y tablero ===

function inRange(dateValue, from, to) {
  const day = toBusinessDate(dateValue);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

async function reportSummary(tenantId, query = {}) {
  const from = normalizeText(query.from) || null;
  const to = normalizeText(query.to) || null;
  return prisma.runWithTenant(tenantId, async () => {
    const [sales, credits, products, purchases] = await Promise.all([
      prisma.comercioSale.findMany({
        where: { status: SALE_STATUS_ACTIVE, ...(from || to ? dateRangeWhere({ from, to }) : {}) },
        include: { items: true }
      }),
      prisma.comercioCredit.findMany({ where: { status: CREDIT_STATUS_OPEN }, include: { installments: true, payments: true } }),
      prisma.comercioProduct.findMany({ where: { __includeInactive: true } }),
      prisma.comercioPurchase.findMany({ where: dateRangeWhere({ from, to }) })
    ]);
    const expenses = await prisma.comercioExpense.findMany({
      where: { status: "active", ...(from || to ? dateRangeWhere({ from, to }) : {}) }
    });

    const salesTotal = round2(sales.reduce((sum, row) => sum + num(row.total), 0));
    const costTotal = round2(sales.reduce((sum, row) => sum + num(row.cost_total), 0));
    const grossMargin = round2(salesTotal - costTotal);
    // La tabla comercio_expenses mezcla las dos direcciones: egresos operativos e
    // ingresos fuera del catalogo. El resultado estimado suma los ingresos extra.
    const expensesTotal = round2(expenses.filter((row) => row.direction !== EXPENSE_DIRECTION_INCOME).reduce((sum, row) => sum + num(row.amount), 0));
    const incomeTotal = round2(expenses.filter((row) => row.direction === EXPENSE_DIRECTION_INCOME).reduce((sum, row) => sum + num(row.amount), 0));
    const purchasesTotal = round2(purchases.reduce((sum, row) => sum + num(row.total), 0));

    const today = todayBusiness();
    let receivable = 0;
    let overdueReceivable = 0;
    for (const credit of credits) {
      const paid = round2(credit.payments.reduce((sum, item) => sum + num(item.amount), 0));
      const balance = round2(num(credit.financed_amount) - paid);
      if (balance <= 0) continue;
      receivable += balance;
      const late = credit.installments.some((item) =>
        item.status !== INSTALLMENT_PAID && toBusinessDate(item.due_date) < today);
      if (late) overdueReceivable += balance;
    }

    const activeProducts = products.filter((row) => row.active);
    const inventoryValue = round2(products.reduce((sum, row) => sum + row.stock * num(row.cost), 0));
    const lowStock = activeProducts
      .filter((row) => row.stock <= row.min_stock)
      .map(productDto);

    const byProduct = new Map();
    const byCustomer = new Map();
    const byDay = new Map();
    const byMethod = new Map();
    for (const sale of sales) {
      const day = toBusinessDate(sale.date);
      byDay.set(day, round2((byDay.get(day) || 0) + num(sale.total)));
      if (sale.customer_id) {
        const key = `${sale.customer_id}`;
        const entry = byCustomer.get(key) || { customer_id: sale.customer_id, customer_name: sale.customer_name, total: 0, sales: 0 };
        entry.total = round2(entry.total + num(sale.total));
        entry.sales += 1;
        byCustomer.set(key, entry);
      }
      if (sale.payment_type === PAYMENT_CASH) {
        const method = sale.method || "Sin especificar";
        byMethod.set(method, round2((byMethod.get(method) || 0) + num(sale.total)));
      }
      for (const item of sale.items) {
        const key = item.product_id ? `p${item.product_id}` : `n${item.product_name}`;
        const entry = byProduct.get(key) || { product_id: item.product_id, product_name: item.product_name, quantity: 0, revenue: 0, margin: 0 };
        entry.quantity += item.quantity;
        entry.revenue = round2(entry.revenue + num(item.line_total));
        entry.margin = round2(entry.margin + (num(item.line_total) - num(item.unit_cost) * item.quantity));
        byProduct.set(key, entry);
      }
    }
    // Los abonos a cartera tambien son entrada de caja por medio de pago.
    const paymentsInRange = await prisma.comercioPayment.findMany({
      where: dateRangeWhere({ from, to }),
      include: { credit: { select: { full_number: true } } }
    });
    for (const payment of paymentsInRange) {
      const method = payment.method || "Sin especificar";
      byMethod.set(method, round2((byMethod.get(method) || 0) + num(payment.amount)));
    }

    return {
      range: { from, to },
      totals: {
        sales: salesTotal,
        cost_of_goods: costTotal,
        gross_margin: grossMargin,
        expenses: expensesTotal,
        income: incomeTotal,
        purchases: purchasesTotal,
        estimated_result: round2(grossMargin + incomeTotal - expensesTotal),
        receivable: round2(receivable),
        overdue_receivable: round2(overdueReceivable),
        inventory_value: inventoryValue,
        cash_collected: round2(
          sales.filter((row) => row.payment_type === PAYMENT_CASH).reduce((sum, row) => sum + num(row.total), 0)
          + paymentsInRange.reduce((sum, row) => sum + num(row.amount), 0)
        )
      },
      low_stock: lowStock,
      top_products: [...byProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      top_customers: [...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      daily_sales: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, total]) => ({ date, total })),
      cash_by_method: [...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([method, total]) => ({ method, total }))
    };
  });
}

async function dashboard(tenantId) {
  const now = new Date();
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;
  const today = todayBusiness();
  return prisma.runWithTenant(tenantId, async () => {
    const [summaryMonth, summaryToday, recentSales, recentMovements] = await Promise.all([
      reportSummary(tenantId, { from: monthStart, to: today }),
      reportSummary(tenantId, { from: today, to: today }),
      prisma.comercioSale.findMany({
        where: { status: SALE_STATUS_ACTIVE },
        orderBy: { id: "desc" },
        take: 6
      }),
      prisma.comercioStockMovement.findMany({ orderBy: { id: "desc" }, take: 8 })
    ]);
    return {
      today: summaryToday.totals,
      month: summaryMonth.totals,
      low_stock: summaryMonth.low_stock,
      top_products: summaryMonth.top_products.slice(0, 5),
      cash_by_method: summaryMonth.cash_by_method,
      recent_sales: recentSales.map((row) => saleDto(row)),
      recent_movements: recentMovements.map(movementDto)
    };
  });
}

module.exports = {
  // helpers puros exportados para pruebas unitarias
  buildInstallmentSchedule,
  allocateInstallments,
  weightedAverageCost,
  businessDateToUtc,
  toBusinessDate,
  // configuracion
  getSettings,
  updateSettings,
  regenerateCatalogCode,
  // vitrina publica
  publicCatalog,
  // maestros
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  setProductActive,
  adjustStock,
  attachProductPhoto,
  productPhotoUrl,
  detachProductPhoto,
  listCustomers,
  createCustomer,
  updateCustomer,
  setCustomerActive,
  // documentos
  createSale,
  listSales,
  getSale,
  voidSale,
  listCredits,
  getCredit,
  addCreditPayment,
  listPurchases,
  createPurchase,
  listExpenses,
  createExpense,
  updateExpense,
  voidExpense,
  listMovements,
  // reporteria
  reportSummary,
  dashboard
};
