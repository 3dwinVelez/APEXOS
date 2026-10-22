// Servicio de Liquidacion de Transporte (paquetes por transportador).
//
// Capa de persistencia y workflow sobre el motor puro settlement-engine.js. Reutiliza los
// maestros existentes (TransportCarrier, TransportRateCard, Vehicle), el aislamiento por
// tenant (runWithTenant), la auditoria funcional (AuditLog) y la convencion de errores del
// TMS. No duplica maestros ni crea un subsistema paralelo: la liquidacion por viaje
// (TransportSettlement) sigue existiendo para el cierre del viaje; este dominio agrega la
// capa semanal/por-paquete con tarifas versionadas, ajustes, novedades, aprobaciones y
// contabilizacion idempotente que exige la especificacion.
//
// Las mutaciones criticas se serializan por tenant con el mismo advisory lock del TMS y se
// ejecutan en transaccion, de modo que la idempotencia y la concurrencia (RB-10/RB-12) se
// salvaguarden en la base y no solo en la UI.

const basePrisma = require("../../core/prisma");
const { AsyncLocalStorage } = require("node:async_hooks");
const settlementTransaction = new AsyncLocalStorage();
const E = require("./settlement-engine");
const { partyRoleWhere } = require("../parties/roles");
const { postSettlementIncomeTx, reverseSettlementIncomeTx } = require("./settlement-posting");
const { invalidateVehicleAccounting } = require("./vehicle-accounting");

async function listSettlementDestinations(tenantId) {
  return read(tenantId, db => db.transportDeliveryPoint.findMany({ where: { tenant_id: String(tenantId), active: true }, select: { id: true, code: true, name: true, address: true, city: true, customer_party_id: true }, orderBy: { name: "asc" } }));
}

async function listSettlementCustomers(tenantId) {
  return read(tenantId, db => db.party.findMany({ where: { tenant_id: String(tenantId), active: true, ...partyRoleWhere("customer") }, select: { id: true, name: true, tax_id: true }, orderBy: { name: "asc" } }));
}

async function listSettlementAccountingOptions(tenantId) {
  return read(tenantId, async db => {
    const accounts = await db.account.findMany({ where: { tenant_id: String(tenantId), active: true, allows_tx: true, type: { in: ["income", "asset"] } }, select: { code: true, name: true, type: true }, orderBy: { code: "asc" } });
    const { isReceivableAccount } = require("../accounting/service");
    return { income_accounts: accounts.filter(row => row.type === "income"), receivable_accounts: accounts.filter(isReceivableAccount) };
  });
}


const MODULE = "transport";
const ENTITY_PACKAGE = "TransportSettlementPackage";
const DECISIONS = new Set(["aprobada", "rechazada", "con_novedad"]);

function fail(statusCode, code, message, details) {
  return E.fail(statusCode, code, message, details);
}

function numberOr(value, fallback = 0) {
  return E.numberValue(value, fallback);
}

function decimalOr(value) {
  return value === null || value === undefined || value === "" ? null : E.round2(value);
}

function dateOrNull(value) {
  return E.toDate(value);
}

function read(tenantId, fn) {
  if (!tenantId) fail(401, "TMS_TENANT_REQUIRED", "Empresa requerida.");
  return basePrisma.runWithTenant(tenantId, async () => await fn(basePrisma, tenantId));
}

function write(tenantId, fn) {
  if (!tenantId) fail(401, "TMS_TENANT_REQUIRED", "Empresa requerida.");
  const current = settlementTransaction.getStore();
  if (current) {
    if (current.tenantId !== String(tenantId)) fail(403, "TMS_IMPORT_TENANT_MISMATCH", "Empresa no autorizada.");
    return fn(current.tx, tenantId);
  }
  return basePrisma.runWithTenant(tenantId, () =>
    basePrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `transport:${tenantId}`);
      return settlementTransaction.run({ tenantId: String(tenantId), tx }, () => fn(tx, tenantId));
    }, { maxWait: 10000, timeout: 25000 })
  );
}

async function audit(tx, user, action, entity, entityId, oldValue, newValue) {
  await tx.auditLog.create({
    data: {
      user_id: user?.id ?? null,
      action,
      module: MODULE,
      entity,
      entity_id: String(entityId ?? ""),
      ...(oldValue !== undefined ? { old_value: oldValue } : {}),
      ...(newValue !== undefined ? { new_value: newValue } : {})
    }
  });
}

function itemView(item) {
  if (!item) return item;
  return {
    ...item,
    quantity: Number(item.quantity),
    reported_value: item.reported_value == null ? null : Number(item.reported_value),
    rate_base: item.rate_base == null ? null : Number(item.rate_base),
    rate_unit_value: item.rate_unit_value == null ? null : Number(item.rate_unit_value),
    calculated_amount: Number(item.calculated_amount),
    adjusted_amount: Number(item.adjusted_amount),
    approved_amount: Number(item.approved_amount)
  };
}

function adjustmentView(adjustment) {
  return { ...adjustment, before_value: Number(adjustment.before_value), delta: Number(adjustment.delta), after_value: Number(adjustment.after_value) };
}

function accountingView(accounting) {
  return { ...accounting, amount: Number(accounting.amount) };
}

function packageView(pkg) {
  if (!pkg) return pkg;
  return {
    ...pkg,
    calculated_total: Number(pkg.calculated_total),
    adjusted_total: Number(pkg.adjusted_total),
    approved_total: Number(pkg.approved_total),
    accounted_total: Number(pkg.accounted_total),
    ...(pkg.items ? { items: pkg.items.map(itemView) } : {}),
    ...(pkg.adjustments ? { adjustments: pkg.adjustments.map(adjustmentView) } : {}),
    ...(pkg.accountings ? { accountings: pkg.accountings.map(accountingView) } : {})
  };
}

const PACKAGE_INCLUDE = { items: { orderBy: { id: "asc" } }, adjustments: { orderBy: { id: "asc" } }, issues: { orderBy: { id: "asc" } }, approvals: { orderBy: { id: "asc" } }, accountings: { orderBy: { id: "asc" } }, period: true };

// ---- Tipos de liquidacion (maestro, spec seccion 7) ----
async function listSettlementTypes(tenantId) {
  const stored = await read(tenantId, (db) => db.transportSettlementType.findMany({ orderBy: { code: "asc" } }));
  const byCode = new Map(stored.map((type) => [type.code, type]));
  const reserved = E.RESERVED_TYPE_CODES.map((code) => byCode.get(code) || { code, name: code, reserved: true, active: true, requires_reinforced_approval: code === "CAJA_MENOR", documentary_policy: "alerta", required_documents: [], id: null });
  const custom = stored.filter((type) => !E.RESERVED_TYPE_CODES.includes(type.code));
  return [...reserved, ...custom];
}

async function saveSettlementType(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const code = String(input.code || "").trim().toUpperCase();
    const name = String(input.name || "").trim();
    if (!code || !name) fail(400, "TMS_SETTLEMENT_TYPE_REQUIRED", "Codigo y nombre del tipo son obligatorios.");
    const data = {
      code, name,
      description: input.description || null,
      requires_reinforced_approval: input.requires_reinforced_approval === true,
      documentary_policy: input.documentary_policy === "bloqueo" ? "bloqueo" : "alerta",
      required_documents: Array.isArray(input.required_documents) ? input.required_documents : [],
      workflow: input.workflow && typeof input.workflow === "object" ? input.workflow : {}
    };
    let type;
    if (id) {
      await tx.transportSettlementType.findFirstOrThrow({ where: { id: Number(id) } });
      type = await tx.transportSettlementType.update({ where: { id: Number(id) }, data });
    } else {
      type = await tx.transportSettlementType.create({ data });
    }
    await audit(tx, user, "transport.settlement_type.saved", "TransportSettlementType", type.id, null, { code: type.code, name: type.name });
    return type;
  });
}

// ---- Periodos (contenedor semanal, spec secciones 3 y 7) ----
async function listSettlementPeriods(tenantId, query = {}) {
  return read(tenantId, (db) => db.transportSettlementPeriod.findMany({
    where: { ...(query.status ? { status: query.status } : {}) },
    include: { packages: { select: { id: true, code: true, status: true, carrier_name: true, adjusted_total: true, approved_total: true } } },
    orderBy: { start_date: "desc" }, take: Math.min(numberOr(query.limit, 100), 300)
  }));
}

async function saveSettlementPeriod(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const code = String(input.code || "").trim().toUpperCase();
    const startDate = dateOrNull(input.start_date);
    const endDate = dateOrNull(input.end_date);
    if (!code) fail(400, "TMS_SETTLEMENT_PERIOD_CODE_REQUIRED", "El codigo del periodo es obligatorio.");
    if (!startDate || !endDate) fail(400, "TMS_SETTLEMENT_PERIOD_DATES_REQUIRED", "Las fechas de inicio y fin del periodo son obligatorias.");
    if (endDate < startDate) fail(400, "TMS_SETTLEMENT_PERIOD_INVALID_RANGE", "La fecha de fin no puede ser anterior al inicio.");
    let period;
    if (id) {
      const current = await tx.transportSettlementPeriod.findFirstOrThrow({ where: { id: Number(id) } });
      period = await tx.transportSettlementPeriod.update({ where: { id: current.id }, data: { name: input.name ?? current.name, start_date: startDate, end_date: endDate, ...(input.status === "cerrado" || input.status === "abierto" ? { status: input.status } : {}) } });
      await audit(tx, user, "transport.settlement_period.updated", "TransportSettlementPeriod", period.id, { status: current.status }, { status: period.status });
    } else {
      period = await tx.transportSettlementPeriod.create({ data: { code, name: input.name || null, start_date: startDate, end_date: endDate, status: "abierto", created_by: user?.id ?? null } });
      await audit(tx, user, "transport.settlement_period.created", "TransportSettlementPeriod", period.id, null, { code: period.code });
    }
    return period;
  });
}

// ---- Paquetes ----
function packageWhere(query = {}) {
  const range = require("./settlement-filters").settlementDateRange(query);
  const stages = { creado: ["borrador", "validando", "preliquidada", "con_novedad", "en_revision", "rechazada"], aprobado: ["aprobada"], contabilizado: ["contabilizada"], liquidado: ["liquidada"] };
  return {
    ...(query.status ? { status: stages[query.status] ? { in: stages[query.status] } : query.status } : {}),
    ...(query.vehicle_id ? { metadata: { path: ["vehicle_id"], equals: Number(query.vehicle_id) } } : {}),
    ...(query.period_id ? { period_id: Number(query.period_id) } : {}),
    ...(query.period_code ? { period: { code: String(query.period_code) } } : {}),
    ...(range ? { items: { some: { service_date: range } } } : {}),
    ...(query.carrier_id ? { carrier_id: Number(query.carrier_id) } : {}),
    ...(query.type_code ? { type_code: String(query.type_code).toUpperCase() } : {}),
    ...(query.responsible_id ? { responsible_id: Number(query.responsible_id) } : {})
  };
}

async function listSettlementPackages(tenantId, query = {}) {
  return read(tenantId, (db) => db.transportSettlementPackage.findMany({
    where: packageWhere(query),
    include: { period: { select: { code: true, start_date: true, end_date: true } }, issues: { select: { id: true, blocking: true, status: true, category: true } } },
    orderBy: { updated_at: "desc" }, take: Math.min(numberOr(query.limit, 100), 300)
  })).then((rows) => rows.map((pkg) => ({
    ...packageView(pkg),
    open_blocking_issues: pkg.issues.filter((issue) => issue.blocking && E.OPEN_ISSUE_STATUSES.has(E.normalizeMatch(issue.status))).length,
    aging_days: Math.max(0, Math.floor((Date.now() - new Date(pkg.updated_at).getTime()) / 86400000))
  })));
}

async function getSettlementPackage(tenantId, id) {
  return read(tenantId, (db) => db.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: PACKAGE_INCLUDE })).then(packageView);
}

async function getSettlementControlTower(tenantId, query = {}) {
  const packages = await listSettlementPackages(tenantId, query);
  const sum = (list, field) => E.round2(list.reduce((acc, pkg) => acc + numberOr(pkg[field]), 0));
  const byStatus = (statuses) => packages.filter((pkg) => statuses.includes(pkg.status));
  return {
    generated_at: new Date().toISOString(),
    total_packages: packages.length,
    kpis: {
      draft_value: sum(byStatus(["borrador", "validando"]), "calculated_total"),
      created_value: sum(byStatus(["borrador", "validando", "preliquidada", "con_novedad", "en_revision", "rechazada"]), "adjusted_total"),
      liquidated_value: sum(byStatus(["liquidada"]), "accounted_total"),
      accounted_pending_value: sum(byStatus(["contabilizada"]), "accounted_total"),
      pending_approval_value: sum(byStatus(["preliquidada", "con_novedad", "en_revision"]), "adjusted_total"),
      approved_value: sum(byStatus(["aprobada"]), "approved_total"),
      accounted_value: sum(byStatus(["contabilizada", "liquidada"]), "accounted_total"),
      blocked_packages: packages.filter((pkg) => pkg.open_blocking_issues > 0).length,
      open_issues: packages.reduce((acc, pkg) => acc + pkg.issues.filter((issue) => E.OPEN_ISSUE_STATUSES.has(E.normalizeMatch(issue.status))).length, 0)
    },
    aging: packages.filter((pkg) => ["preliquidada", "con_novedad", "en_revision"].includes(pkg.status)).map((pkg) => ({ id: pkg.id, code: pkg.code, status: pkg.status, aging_days: pkg.aging_days })).sort((a, b) => b.aging_days - a.aging_days),
    packages
  };
}

// ---- Consolidacion de ingresos por vehiculo (torre de liquidacion) ----
// Reutiliza el motor puro: agrupa las lineas de los paquetes por placa para responder
// "cuanto ingreso genera cada vehiculo" sin duplicar consultas ni crear un subsistema aparte.
async function getSettlementVehicleConsolidation(tenantId, query = {}) {
  return read(tenantId, async (db) => {
    const range = require("./settlement-filters").settlementDateRange(query);
    const where = packageWhere(query);
    const [packages, matchedPackages] = await Promise.all([db.transportSettlementPackage.findMany({
      where,
      include: { items: range ? { where: { service_date: range } } : true, period: { select: { code: true, start_date: true, end_date: true } } },
      orderBy: { updated_at: "desc" }, take: Math.min(numberOr(query.limit, 200), 300)
    }), db.transportSettlementPackage.count({ where })]);
    const vehicles = E.consolidateByVehicle(packages.map((pkg) => ({
      ...packageView(pkg),
      period_code: pkg.period?.code || null
    })));
    const sum = (field) => E.round2(vehicles.reduce((acc, vehicle) => acc + numberOr(vehicle[field]), 0));
    return {
      generated_at: new Date().toISOString(),
      total_packages: packages.length,
      matched_packages: matchedPackages,
      has_more: matchedPackages > packages.length,
      totals: {
        vehicle_count: vehicles.length,
        line_count: vehicles.reduce((acc, vehicle) => acc + vehicle.line_count, 0),
        guide_count: vehicles.reduce((acc, vehicle) => acc + vehicle.guide_count, 0),
        weight_kg: sum("weight_kg"),
        distance_km: sum("distance_km"),
        calculated_total: sum("calculated_total"),
        adjusted_total: sum("adjusted_total"),
        approved_total: sum("approved_total")
      },
      vehicles
    };
  });
}

async function loadCarrier(tx, carrierId) {
  return tx.transportCarrier.findFirst({ where: { id: Number(carrierId), __includeInactive: true } });
}
async function loadSettlementVehicle(tx, id) {
  const vehicle = await tx.vehicle.findFirst({ where: { id: Number(id) } });
  if (!vehicle) fail(404, "TMS_SETTLEMENT_VEHICLE_NOT_FOUND", "El vehiculo no existe en la empresa activa.");
  if (["retirado", "inactivo", "bloqueado"].includes(vehicle.status)) fail(409, "TMS_SETTLEMENT_VEHICLE_INACTIVE", "El vehiculo no esta habilitado para liquidar.");
  return vehicle;
}
function rateAppliesToVehicle(rate, vehicle) {
  if (!vehicle) return true;
  if (rate.metadata?.vehicle_id != null && Number(rate.metadata.vehicle_id) !== vehicle.id) return false;
  return !rate.vehicle_type || E.normalizeMatch(rate.vehicle_type) === E.normalizeMatch(vehicle.type);
}

async function listSettlementRateOptions(tenantId, query = {}) {
  return read(tenantId, async (db) => {
    const vehicle = query.vehicle_id ? await loadSettlementVehicle(db, query.vehicle_id) : null;
    const rates = await db.transportRateCard.findMany({ where: { status: "activa" }, include: { carrier: true }, orderBy: [{ code: "asc" }, { version: "desc" }] });
    return rates.filter(rate => rate.active !== false && (!rate.carrier_id || (rate.carrier?.tenant_id === tenantId && E.carrierEligibility(rate.carrier).eligible)) && rateAppliesToVehicle(rate, vehicle) && (!query.currency || rate.currency === query.currency)).map(rate => {
      let metrics, calculation;
      try { metrics = E.settlementRateMetrics(rate); calculation = E.calculateItemAmount(rate, { ...metrics, quantity: 1 }); } catch (error) { if (!(error instanceof E.SettlementError)) throw error; }
      return { id: rate.id, code: rate.code, name: rate.name, version: rate.version, currency: rate.currency, valid_from: rate.valid_from, valid_to: rate.valid_to, unit_amount: calculation?.amount ?? null, components: calculation?.components ?? {}, default_metrics: metrics || { distance_km: 0, weight_kg: 1, volume_m3: 1, stop_count: 1, wait_minutes: 0 }, requires_distance: Number(rate.price_per_km) > 0, requires_weight: Number(rate.price_per_kg) > 0, requires_volume: Number(rate.price_per_m3) > 0, has_stops: Number(rate.price_per_stop) > 0, has_wait: E.rateCostConfig(rate).wait_rate_per_min > 0, route_description: [rate.metadata?.simulation?.origin_label, rate.metadata?.simulation?.destination_label].filter(Boolean).join(" → ") || rate.name };
    });
  });
}

async function resolveSettlementCriterion(tx, input, context) {
  const rate = await tx.transportRateCard.findFirst({ where: { id: Number(input.rate_card_id) } });
  if (!rate || rate.active === false || rate.status !== "activa") fail(422, "TMS_SETTLEMENT_SELECTED_RATE_UNAVAILABLE", "El tarifario seleccionado no esta activo en la empresa.");
  if (rate.carrier_id != null) {
    const carrier = await loadCarrier(tx, rate.carrier_id);
    if (!carrier) fail(422, "TMS_SETTLEMENT_SELECTED_RATE_UNAVAILABLE", "El transportador del tarifario no esta disponible en la empresa.");
    E.assertCarrierEligible(carrier);
  }
  if (!rateAppliesToVehicle(rate, context.vehicle)) fail(422, "TMS_SETTLEMENT_SELECTED_RATE_VEHICLE", "El tarifario no corresponde al vehiculo del paquete.");
  const date = dateOrNull(context.service_date) || new Date();
  if (!E.rateIsValidOn(rate, date)) fail(422, "TMS_SETTLEMENT_SELECTED_RATE_EXPIRED", "El tarifario no esta vigente para la fecha del servicio.");
  if (context.currency && rate.currency !== context.currency) fail(422, "TMS_SETTLEMENT_SELECTED_RATE_CURRENCY", "La moneda del tarifario no coincide con la del paquete.");
  if (input.rate_version != null && Number(input.rate_version) !== rate.version) fail(409, "TMS_SETTLEMENT_SELECTED_RATE_CHANGED", "La version del tarifario cambio. Seleccionelo nuevamente.");
  const metrics = E.settlementRateMetrics(rate, context.lockTariff ? {} : input.metrics || {});
  const calc = E.calculateItemAmount(rate, { ...metrics, quantity: 1 });
  if (context.checkPrice && E.cents(input.unit_value) !== E.cents(calc.amount)) fail(409, "TMS_SETTLEMENT_SELECTED_RATE_PRICE_CHANGED", "El valor del tarifario cambio o no corresponde al calculado. Asigne nuevamente el flete.");
  return { concept: `${rate.code} · ${rate.name}`.slice(0, 160), support: String(input.support || "").trim(), quantity: numberOr(input.quantity, 1), unit_value: calc.amount, rate_card_id: rate.id, rate_version: rate.version, rate_code: rate.code, metrics, rate_snapshot: { ...calc.snapshot, definition: JSON.parse(JSON.stringify({ ...rate, carrier: undefined })), components: calc.components, unit_amount: calc.amount, metrics, route_description: [rate.metadata?.simulation?.origin_label, rate.metadata?.simulation?.destination_label].filter(Boolean).join(" → ") || rate.name, assigned_at: new Date().toISOString() } };
}

async function quoteSettlementCriterion(tenantId, input) {
  return read(tenantId, async (db) => {
    const vehicle = input.vehicle_id ? await loadSettlementVehicle(db, input.vehicle_id) : null;
    return resolveSettlementCriterion(db, input, { vehicle, currency: input.currency || "COP", service_date: input.service_date });
  });
}
function currentAccountingMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find(part => part.type === "year").value}-${parts.find(part => part.type === "month").value}`;
}
async function automaticSettlementPeriod(tx, tenantId) {
  const code = currentAccountingMonth();
  const [year, month] = code.split("-").map(Number);
  const period = await tx.transportSettlementPeriod.upsert({ where: { tenant_id_code: { tenant_id: String(tenantId), code } }, create: { tenant_id: String(tenantId), code, name: `Periodo contable ${code}`, start_date: new Date(Date.UTC(year, month - 1, 1, 5)), end_date: new Date(Date.UTC(year, month, 1, 5) - 1), status: "abierto" }, update: {} });
  if (period.status === "cerrado") fail(409, "TMS_ACCOUNTING_MONTH_CLOSED", "El periodo contable actual está cerrado.");
  return period;
}

async function createSettlementPackage(tenantId, user, input) {
  if (input.metadata && Object.hasOwn(input.metadata, "settlement_import")) fail(400, "TMS_IMPORT_METADATA_RESERVED", "La trazabilidad de importación la asigna el servidor.");
  return write(tenantId, async (tx) => {
    const vehicle = input.vehicle_id ? await loadSettlementVehicle(tx, input.vehicle_id) : null;
    if (!vehicle && !input.carrier_id) fail(400, "TMS_SETTLEMENT_CARRIER_REQUIRED", "Seleccione un vehiculo.");
    const carrier = !vehicle ? await loadCarrier(tx, input.carrier_id) : null;
    if (!vehicle && !carrier) fail(404, "TMS_SETTLEMENT_CARRIER_NOT_FOUND", "El transportador no existe en la empresa activa.");
    if (carrier) E.assertCarrierEligible(carrier); // Compatibilidad con paquetes anteriores.
    if (vehicle && (!Array.isArray(input.items) || !input.items.length)) fail(400, "TMS_SETTLEMENT_ITEMS_REQUIRED", "Complete los documentos y criterios antes de crear el paquete.");
    const period = vehicle ? await automaticSettlementPeriod(tx, tenantId) : input.period_id ? await tx.transportSettlementPeriod.findFirst({ where: { id: Number(input.period_id) } }) : null;
    if (input.period_id && !period) fail(404, "TMS_SETTLEMENT_PERIOD_NOT_FOUND", "El periodo no existe en la empresa activa.");
    if (period && period.status === "cerrado") fail(409, "TMS_SETTLEMENT_PERIOD_CLOSED", "El periodo esta cerrado; no admite paquetes nuevos.");
    const typeCode = vehicle ? "TRANSPORTADOR" : String(input.type_code || "TRANSPORTADOR").trim().toUpperCase();
    const type = await tx.transportSettlementType.findFirst({ where: { code: typeCode } });
    // write() ya obtuvo el lock del tenant. La lectura y la reserva comparten
    // transaccion: dos creadores no pueden tomar el mismo consecutivo.
    const numbered = await tx.transportSettlementPackage.findMany({ where: { tenant_id: String(tenantId), code: { startsWith: "LIQ-", mode: "insensitive" } }, select: { code: true } });
    const code = E.nextSettlementPackageCode(numbered.map(row => row.code));
    const pkg = await tx.transportSettlementPackage.create({
      data: {
        code,
        period_id: period ? period.id : null,
        carrier_id: carrier?.id ?? null,
        carrier_code: vehicle?.plate || carrier.code,
        carrier_name: vehicle?.plate || carrier.legal_name,
        type_id: type ? type.id : null,
        type_code: typeCode,
        currency: String(input.currency || "COP").toUpperCase(),
        responsible_id: input.responsible_id ? Number(input.responsible_id) : (user?.id ?? null),
        observation: input.observation || null,
        status: E.PACKAGE_STATUS.BORRADOR,
        version: 0,
        metadata: { ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}), vehicle_id: vehicle?.id ?? null, vehicle_plate: vehicle?.plate ?? null, cost_center: vehicle?.cost_center || null, ...(vehicle ? { accounting_period: period.code, tariff_locked: true } : {}) },
        created_by: user?.id ?? null
      },
      include: PACKAGE_INCLUDE
    });
    if (Array.isArray(input.items) && input.items.length) await persistSettlementItems(tx, tenantId, user, pkg, { items: input.items });
    await audit(tx, user, "transport.settlement_package.created", ENTITY_PACKAGE, pkg.id, null, { code: pkg.code, carrier_id: carrier?.id ?? null, vehicle_id: vehicle?.id ?? null, type_code: typeCode, status: pkg.status });
    if (input.items?.length) return packageView(await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: pkg.id }, include: PACKAGE_INCLUDE }));
    return packageView(pkg);
  });
}

async function updateSettlementPackage(tenantId, user, id, input) {
  if (input.metadata && Object.hasOwn(input.metadata, "settlement_import")) fail(400, "TMS_IMPORT_METADATA_RESERVED", "La trazabilidad de importación no puede modificarse.");
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) } });
    E.assertEditable(pkg.status); // RB-11
    E.assertVersionMatch(input.version, pkg.version); // RB-12
    const before = { responsible_id: pkg.responsible_id, observation: pkg.observation, period_id: pkg.period_id, currency: pkg.currency };
    const data = { version: { increment: 1 } };
    if (input.responsible_id !== undefined) data.responsible_id = input.responsible_id ? Number(input.responsible_id) : null;
    if (input.observation !== undefined) data.observation = input.observation || null;
    if (input.currency !== undefined) data.currency = String(input.currency).toUpperCase();
    if (pkg.metadata?.tariff_locked && input.period_id !== undefined && input.period_id !== pkg.period_id) fail(409, "TMS_PERIOD_LOCKED", "El periodo contable es automático y no puede modificarse.");
    if (input.period_id !== undefined && !pkg.metadata?.tariff_locked) {
      const period = input.period_id ? await tx.transportSettlementPeriod.findFirst({ where: { id: Number(input.period_id) } }) : null;
      if (input.period_id && !period) fail(404, "TMS_SETTLEMENT_PERIOD_NOT_FOUND", "El periodo no existe en la empresa activa.");
      data.period_id = period ? period.id : null;
    }
    if (input.metadata && typeof input.metadata === "object") {
      const { vehicle_id, vehicle_plate, cost_center, accounting_period, tariff_locked, ...extra } = input.metadata;
      data.metadata = { ...(pkg.metadata || {}), ...extra };
    }
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.updated", ENTITY_PACKAGE, pkg.id, before, { responsible_id: updated.responsible_id, observation: updated.observation, period_id: updated.period_id, currency: updated.currency });
    return packageView(updated);
  });
}

function itemData(input, tenantId) {
  const guide = String(input.guide_reference || "").trim();
  if (!guide) fail(400, "TMS_SETTLEMENT_ITEM_GUIDE_REQUIRED", "La guia/referencia del detalle es obligatoria.");
  const quantity = numberOr(input.quantity, 1);
  if (quantity <= 0) fail(400, "TMS_SETTLEMENT_ITEM_INVALID_QUANTITY", "La cantidad debe ser positiva.");
  return {
    tenant_id: String(tenantId),
    guide_reference: guide,
    service: input.service || null,
    route_description: input.route_description || null,
    origin_name: input.origin_name || null,
    destination_name: input.destination_name || null,
    destination_city: input.destination_city || null,
    destination_municipality: input.destination_municipality || null,
    vehicle_plate: input.vehicle_plate || null,
    vehicle_type: input.vehicle_type || null,
    service_level: input.service_level || null,
    service_date: dateOrNull(input.service_date),
    base_type: input.base_type || "viaje",
    quantity,
    unit: input.unit || null,
    distance_km: numberOr(input.distance_km),
    weight_kg: numberOr(input.weight_kg),
    volume_m3: numberOr(input.volume_m3),
    stop_count: numberOr(input.stop_count, 1),
    reported_value: decimalOr(input.reported_value),
    observation: input.observation || null,
    metadata: { ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}), ...(input.charge_criteria ? { charge_criteria: E.normalizeChargeCriteria(input.charge_criteria) } : {}) }
  };
}

async function addSettlementItems(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { items: true, issues: true } });
    E.assertEditable(pkg.status); // RB-11
    E.assertVersionMatch(input.version, pkg.version); // RB-12
    return persistSettlementItems(tx, tenantId, user, pkg, input);
  });
}

async function saveSettlementDocuments(tenantId, user, id, input) {
  return write(tenantId, async tx => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id), tenant_id: String(tenantId) }, include: { items: true, issues: true, adjustments: true } });
    E.assertEditable(pkg.status);
    if (!Number.isInteger(input.version)) fail(400, "TMS_VERSION_REQUIRED", "Recargue el paquete antes de guardar.");
    E.assertVersionMatch(input.version, pkg.version);
    if (pkg.adjustments.some(adjustment => !adjustment.item_id)) fail(409, "TMS_DOCUMENTS_HAVE_ADJUSTMENTS", "El paquete tiene ajustes auditados; revise sus ajustes antes de modificar los documentos.");
    const vehicle = await loadSettlementVehicle(tx, input.vehicle_id);
    if (pkg.metadata?.vehicle_id && vehicle.id !== pkg.metadata.vehicle_id) fail(409, "TMS_VEHICLE_IMMUTABLE", "Conserve el vehículo del paquete.");
    const ids = (input.items || []).filter(item => item.id).map(item => item.id);
    if (new Set(ids).size !== ids.length || ids.some(id => !pkg.items.some(item => item.id === id)) || pkg.items.some(item => !ids.includes(item.id))) fail(409, "TMS_DOCUMENT_IDS_INVALID", "Conserve todos los documentos existentes del paquete.");
    const before = { period_id: pkg.period_id, metadata: pkg.metadata, items: pkg.items };
    const accountingPeriod = pkg.metadata?.tariff_locked ? null : await automaticSettlementPeriod(tx, tenantId);
    pkg.metadata = { ...pkg.metadata, vehicle_id: vehicle.id, vehicle_plate: vehicle.plate, cost_center: vehicle.cost_center || null, ...(accountingPeriod ? { tariff_locked: true, accounting_period: accountingPeriod.code } : {}) };
    await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { metadata: pkg.metadata, ...(accountingPeriod ? { period_id: accountingPeriod.id } : {}) } });
    const result = await persistSettlementItems(tx, tenantId, user, pkg, input, true);
    await audit(tx, user, "transport.settlement_package.documents_updated", ENTITY_PACKAGE, pkg.id, before, { metadata: pkg.metadata, items: result.items });
    return result;
  });
}

async function persistSettlementItems(tx, tenantId, user, pkg, input, editing = false) {
    const incoming = Array.isArray(input.items) ? input.items : [];
    if (!incoming.length) fail(400, "TMS_SETTLEMENT_ITEMS_REQUIRED", "Debe aportar al menos un detalle.");
    if (incoming.length > 500) fail(400, "TMS_SETTLEMENT_ITEMS_TOO_MANY", "Maximo 500 detalles por operacion.");
    const vehicle = pkg.metadata?.vehicle_id ? await loadSettlementVehicle(tx, pkg.metadata.vehicle_id) : null;
    const prepared = [];
    for (const item of incoming) {
      if (vehicle && !item.charge_criteria) fail(400, "TMS_SETTLEMENT_CRITERIA_REQUIRED", "Cada documento requiere criterios de cobro y soporte.");
      const destinationIds = item.delivery_point_ids || (item.delivery_point_id ? [item.delivery_point_id] : []);
      if (!Array.isArray(destinationIds) || destinationIds.length > 500 || new Set(destinationIds).size !== destinationIds.length) fail(400, "TMS_DESTINATIONS_INVALID", "Seleccione destinos sin repetir.");
      const destinations = [];
      for (const destinationId of destinationIds) {
        const point = await tx.transportDeliveryPoint.findFirst({ where: { id: Number(destinationId), tenant_id: String(tenantId), active: true } });
        if (!point) fail(422, "TMS_DESTINATION_INVALID", "Seleccione destinos activos de la empresa.");
        destinations.push(point);
      }
      const destination = destinations[0];
      const linkedCustomers = [...new Set(destinations.map(point => point.customer_party_id).filter(Boolean))];
      if (linkedCustomers.length > 1 || (item.customer_id && linkedCustomers.some(id => id !== item.customer_id))) fail(422, "TMS_DESTINATION_CUSTOMER_MISMATCH", "Los destinos deben corresponder al cliente del servicio.");
      const customerId = item.customer_id || linkedCustomers[0];
      const data = itemData({ ...item, guide_reference: item.guide_reference || (destination ? `LIQ-${pkg.id}-DEST-${destination.id}` : "") }, tenantId);
      delete data.metadata.delivery_point_ids; delete data.metadata.destination_snapshots;
      if (destination) {
        data.destination_name = destination.name; data.destination_city = destination.city;
        data.metadata.delivery_point_id = destination.id;
        data.metadata.delivery_point_ids = destinations.map(point => point.id);
        data.metadata.destination_snapshots = destinations.map(point => ({ id: point.id, code: point.code, name: point.name, address: point.address, city: point.city }));
        data.metadata.destination_snapshot = data.metadata.destination_snapshots[0];
      } else { delete data.metadata.delivery_point_id; delete data.metadata.destination_snapshot; }
      if (customerId != null) {
        const customer = await tx.party.findFirst({ where: { id: Number(customerId), tenant_id: String(tenantId), active: true, ...partyRoleWhere("customer") }, select: { id: true, name: true, tax_id: true } });
        if (!customer) fail(422, "TMS_CUSTOMER_INVALID", "Seleccione un cliente activo de la empresa.");
        data.service = customer.name;
        data.metadata.customer_id = customer.id;
        data.metadata.customer_snapshot = customer;
      } else if (editing) fail(400, "TMS_CUSTOMER_REQUIRED", "Asigne el cliente del servicio a cada documento.");
      else { delete data.metadata.customer_id; delete data.metadata.customer_snapshot; }

      if (vehicle) { data.vehicle_plate = vehicle.plate; data.vehicle_type = vehicle.type; }
      if (data.metadata.charge_criteria) {
        if (data.metadata.charge_criteria.some(entry => !entry.rate_card_id)) fail(400, "TMS_SETTLEMENT_CRITERIA_RATE_REQUIRED", "Asigne un tarifario parametrizado a cada criterio de flete.");
        const resolved = [];
        for (const entry of data.metadata.charge_criteria) resolved.push(entry.rate_card_id ? await resolveSettlementCriterion(tx, entry, { vehicle, currency: pkg.currency, service_date: data.service_date, checkPrice: true, lockTariff: pkg.metadata?.tariff_locked === true }) : entry);
        data.metadata.charge_criteria = resolved;
        data.route_description = [...new Set(resolved.map(entry => entry.rate_snapshot?.route_description).filter(Boolean))].join(" / ");
        const calc = E.calculateChargeCriteria(data.metadata.charge_criteria);
        data.calculated_amount = calc.amount;
        const previousAdjustments = editing ? (pkg.adjustments || []).filter(adjustment => adjustment.item_id === item.id).reduce((sum, adjustment) => sum + Number(adjustment.delta), 0) : 0;
        data.adjusted_amount = E.round2(calc.amount + previousAdjustments);
        if (data.adjusted_amount < 0) fail(409, "TMS_DOCUMENT_ADJUSTMENT_NEGATIVE", "Los ajustes existentes dejarían el documento con valor negativo.");
        data.calculation_trace = { source: "document_criteria", criteria: resolved };
      }
      prepared.push(data);
    }

    // RB-03: duplicidad intra-lote y contra otros paquetes vigentes del tenant.
    const localDupes = E.detectDuplicateGuides(prepared, pkg.items.filter(existing => !editing || !incoming.some(item => item.id === existing.id)).map((item) => item.guide_reference));
    if (localDupes.count) fail(409, "TMS_SETTLEMENT_DUPLICATE_GUIDE", "Hay guias duplicadas dentro del paquete.", { duplicates: localDupes.duplicates });
    if (!input.authorize_duplicate) {
      const otherGuides = await tx.transportSettlementItem.findMany({
        where: { guide_reference: { in: prepared.map((item) => item.guide_reference) }, package: { status: { notIn: ["cancelada", "reversada"] } }, package_id: { not: pkg.id } },
        select: { guide_reference: true, package_id: true }
      });
      const crossDupes = E.detectDuplicateGuides(prepared, otherGuides.map((row) => row.guide_reference));
      if (crossDupes.count) {
        await tx.transportSettlementIssue.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, category: "guia_duplicada", severity: "alta", blocking: true, blocks: "aprobacion", description: `Guias ya reconocidas en otro paquete: ${crossDupes.duplicates.join(", ")}`, created_by: user?.id ?? null } });
        fail(409, "TMS_SETTLEMENT_DUPLICATE_GUIDE_CROSS_PACKAGE", "Una o mas guias ya fueron reconocidas en otro paquete vigente. Autorice la excepcion o corrija el detalle.", { duplicates: crossDupes.duplicates });
      }
    }

    const created = [];
    for (const [index, data] of prepared.entries()) {
      const itemId = editing ? incoming[index].id : null;
      created.push(itemId ? await tx.transportSettlementItem.update({ where: { id: itemId }, data: { ...data, rate_card_id: null, rate_code: null, rate_version: null } }) : await tx.transportSettlementItem.create({ data: { ...data, package_id: pkg.id } }));
    }
    const totals = await recomputeTotals(tx, pkg.id);
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { version: { increment: 1 }, ...totals }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.items_added", ENTITY_PACKAGE, pkg.id, { item_count: pkg.items.length }, { item_count: updated.items.length, added: created.length });
    return packageView(updated);
}

async function recomputeTotals(tx, packageId) {
  const items = await tx.transportSettlementItem.findMany({ where: { package_id: packageId } });
  const totals = E.computeTotals(items.map((item) => ({ calculated_amount: Number(item.calculated_amount), adjusted_amount: Number(item.adjusted_amount) })));
  return { calculated_total: totals.calculated_total, adjusted_total: totals.adjusted_total };
}

async function activeRateCards(tx) {
  return tx.transportRateCard.findMany({ where: { status: "activa" }, include: { carrier: true } });
}

// ---- Validacion (RB-01/02/03) : borrador -> validando ----
async function validateSettlementPackage(tenantId, user, id, input = {}) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { items: true, issues: true } });
    E.assertPackageTransition(pkg.status, E.PACKAGE_STATUS.VALIDANDO);
    E.assertVersionMatch(input.version, pkg.version);
    const carrier = pkg.metadata?.vehicle_id ? await loadSettlementVehicle(tx, pkg.metadata.vehicle_id) : await loadCarrier(tx, pkg.carrier_id);
    const report = { carrier: null, documentary: null, duplicates: null, issues_created: [] };

    // RB-01
    const eligibility = E.carrierEligibility(carrier);
    report.carrier = eligibility;
    if (!eligibility.eligible) {
      const issue = await tx.transportSettlementIssue.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, category: "transportador_inhabilitado", severity: "critica", blocking: true, blocks: "aprobacion", description: "El transportador esta inactivo o bloqueado.", created_by: user?.id ?? null } });
      report.issues_created.push(issue.id);
    }

    // RB-02 (politica documental parametrizable por tipo; expediente adjunto en metadata.documents)
    const type = pkg.type_id ? await tx.transportSettlementType.findFirst({ where: { id: pkg.type_id } }) : null;
    const policy = type?.documentary_policy || "alerta";
    const required = Array.isArray(type?.required_documents) ? type.required_documents : [];
    const documents = Array.isArray(pkg.metadata?.documents) ? pkg.metadata.documents : [];
    const doc = E.documentaryEligibility({ policy, required, documents, referenceDate: new Date() });
    report.documentary = doc;
    if (required.length && (doc.missing.length || doc.expired.length)) {
      const issue = await tx.transportSettlementIssue.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, category: "documento_vencido", severity: doc.blocking ? "alta" : "media", blocking: doc.blocking, blocks: doc.blocking ? "aprobacion" : "ninguna", description: `Documentos faltantes: ${doc.missing.join(", ") || "ninguno"}; vencidos: ${doc.expired.join(", ") || "ninguno"}`, created_by: user?.id ?? null } });
      report.issues_created.push(issue.id);
    }

    // RB-03 (guia duplicada contra otros paquetes vigentes)
    if (pkg.items.length) {
      const otherGuides = await tx.transportSettlementItem.findMany({ where: { guide_reference: { in: pkg.items.map((item) => item.guide_reference) }, package_id: { not: pkg.id }, package: { status: { notIn: ["cancelada", "reversada"] } } }, select: { guide_reference: true } });
      const dupes = E.detectDuplicateGuides(pkg.items, otherGuides.map((row) => row.guide_reference));
      report.duplicates = dupes;
      if (dupes.count) {
        const issue = await tx.transportSettlementIssue.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, category: "guia_duplicada", severity: "alta", blocking: true, blocks: "aprobacion", description: `Guias duplicadas: ${dupes.duplicates.join(", ")}`, created_by: user?.id ?? null } });
        report.issues_created.push(issue.id);
      }
    }

    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: E.PACKAGE_STATUS.VALIDANDO, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.validated", ENTITY_PACKAGE, pkg.id, { status: pkg.status }, { status: updated.status, issues_created: report.issues_created.length, report });
    return { ...packageView(updated), validation: report };
  });
}

// ---- Preliquidacion (RB-04/05/06) : validando -> preliquidada | con_novedad ----
async function precalculateSettlementPackage(tenantId, user, id, input = {}) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { items: true, issues: true } });
    E.assertPackageTransition(pkg.status, E.PACKAGE_STATUS.PRELIQUIDADA);
    E.assertVersionMatch(input.version, pkg.version);
    if (!pkg.items.length) fail(400, "TMS_SETTLEMENT_NO_ITEMS", "El paquete no tiene detalles para preliquidar.");
    const rates = await activeRateCards(tx);
    const report = { resolved: [], rate_issues: [] };

    for (const item of pkg.items) {
      if (item.metadata?.charge_criteria) {
        const calc = E.calculateChargeCriteria(item.metadata.charge_criteria);
        await tx.transportSettlementItem.update({ where: { id: item.id }, data: { calculated_amount: calc.amount, adjusted_amount: Number(item.adjusted_amount), approved_amount: 0, calculation_trace: { source: "document_criteria", criteria: item.metadata.charge_criteria } } });
        report.resolved.push({ item_id: item.id, guide_reference: item.guide_reference, calculated_amount: calc.amount, source: "document_criteria" });
        continue;
      }
      const context = { carrier_id: pkg.carrier_id, service_date: item.service_date || new Date(), destination_city: item.destination_city, destination_municipality: item.destination_municipality, vehicle_type: item.vehicle_type, service_level: item.service_level };
      try {
        const { rate, trace } = E.resolveRate(rates, context);
        const calc = E.calculateItemAmount(rate, { quantity: Number(item.quantity), distance_km: item.distance_km, weight_kg: item.weight_kg, volume_m3: item.volume_m3, stop_count: item.stop_count });
        await tx.transportSettlementItem.update({
          where: { id: item.id },
          data: {
            rate_card_id: rate.id, rate_code: rate.code, rate_version: rate.version,
            rate_base: E.round2(rate.base_rate), rate_unit_value: E.round2(calc.unit_amount),
            calculation_trace: { ...trace, calculation: calc.components, formula: "base + distancia + peso + volumen + paradas + peajes + combustible%, aplicado minimo", snapshot: calc.snapshot },
            calculated_amount: calc.amount,
            // Un ajuste previo se conserva; si no, el ajustado arranca igual al calculado.
            adjusted_amount: Number(item.adjusted_amount) > 0 ? Number(item.adjusted_amount) : calc.amount,
            approved_amount: 0
          }
        });
        report.resolved.push({ item_id: item.id, guide_reference: item.guide_reference, rate_card_id: rate.id, rate_version: rate.version, calculated_amount: calc.amount, minimum_applied: calc.minimum_applied });
      } catch (error) {
        if (!(error instanceof E.SettlementError)) throw error;
        const issue = await tx.transportSettlementIssue.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, category: error.code === "TMS_SETTLEMENT_RATE_AMBIGUOUS" ? "tarifa_ambigua" : "tarifa_inexistente", severity: "alta", blocking: true, blocks: "aprobacion", description: `Guia ${item.guide_reference}: ${error.message}`, support: { item_id: item.id, code: error.code }, created_by: user?.id ?? null } });
        report.rate_issues.push({ item_id: item.id, guide_reference: item.guide_reference, code: error.code, issue_id: issue.id });
      }
    }

    const totals = await recomputeTotals(tx, pkg.id);
    const openIssues = await tx.transportSettlementIssue.findMany({ where: { package_id: pkg.id, blocking: true, status: { in: ["abierta", "en_gestion", "reabierta"] } } });
    const nextStatus = openIssues.length ? E.PACKAGE_STATUS.CON_NOVEDAD : E.PACKAGE_STATUS.PRELIQUIDADA;
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: nextStatus, version: { increment: 1 }, ...totals }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.precalculated", ENTITY_PACKAGE, pkg.id, { status: pkg.status, calculated_total: Number(pkg.calculated_total) }, { status: updated.status, calculated_total: Number(updated.calculated_total), adjusted_total: Number(updated.adjusted_total), resolved: report.resolved.length, rate_issues: report.rate_issues.length });
    return { ...packageView(updated), precalculation: report };
  });
}

// ---- Ajustes (RB-07) ----
async function addSettlementAdjustment(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { items: true } });
    if (pkg.metadata?.tariff_locked) fail(409, "TMS_TARIFF_LOCKED", "Los valores provienen del tarifario. Actualice la tarifa en Costos y tarifas.");
    if (!["preliquidada", "con_novedad"].includes(pkg.status)) fail(409, "TMS_SETTLEMENT_ADJUSTMENT_NOT_ALLOWED", "Los ajustes solo aplican sobre un paquete preliquidado o con novedad.", { status: pkg.status });
    E.assertVersionMatch(input.version, pkg.version);
    const reason = String(input.reason || "").trim();
    if (!reason) fail(400, "TMS_SETTLEMENT_ADJUSTMENT_REASON_REQUIRED", "El ajuste exige un motivo.");
    const delta = E.round2(input.delta);
    if (!Number.isFinite(delta) || delta === 0) fail(400, "TMS_SETTLEMENT_ADJUSTMENT_DELTA_INVALID", "El ajuste debe ser un valor distinto de cero.");
    const item = input.item_id ? pkg.items.find((row) => row.id === Number(input.item_id)) : null;
    if (input.item_id && !item) fail(404, "TMS_SETTLEMENT_ITEM_NOT_FOUND", "El detalle a ajustar no existe en el paquete.");
    const before = item ? Number(item.adjusted_amount) : Number(pkg.adjusted_total);
    const after = E.round2(before + delta);
    if (after < 0) fail(400, "TMS_SETTLEMENT_ADJUSTMENT_NEGATIVE_RESULT", "El ajuste no puede dejar un valor negativo.");
    const adjustment = await tx.transportSettlementAdjustment.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, item_id: item ? item.id : null, before_value: before, delta, after_value: after, reason, support: input.support && typeof input.support === "object" ? input.support : {}, created_by: user?.id ?? null } });
    if (item) await tx.transportSettlementItem.update({ where: { id: item.id }, data: { adjusted_amount: after } });
    const totals = await recomputeTotals(tx, pkg.id);
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { version: { increment: 1 }, ...totals }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.adjusted", ENTITY_PACKAGE, pkg.id, { before, item_id: item ? item.id : null }, { after, delta, reason, adjustment_id: adjustment.id });
    return { ...packageView(updated), adjustment: adjustmentView(adjustment) };
  });
}

// ---- Novedades ----
async function createSettlementIssue(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) } });
    if (E.isClosed(pkg.status)) fail(409, "TMS_SETTLEMENT_CLOSED", "El paquete esta cerrado; no admite novedades.");
    const category = String(input.category || "").trim();
    const description = String(input.description || "").trim();
    if (!category || !description) fail(400, "TMS_SETTLEMENT_ISSUE_REQUIRED", "Categoria y descripcion son obligatorias.");
    const blocking = input.blocking === true;
    const issue = await tx.transportSettlementIssue.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, category, severity: input.severity || "media", blocking, blocks: blocking ? (input.blocks || "aprobacion") : "ninguna", description, responsible_id: input.responsible_id ? Number(input.responsible_id) : null, due_date: dateOrNull(input.due_date), support: input.support && typeof input.support === "object" ? input.support : {}, created_by: user?.id ?? null } });
    await audit(tx, user, "transport.settlement_issue.created", "TransportSettlementIssue", issue.id, null, { package_id: pkg.id, category, blocking });
    return issue;
  });
}

async function resolveSettlementIssue(tenantId, user, issueId, input) {
  return write(tenantId, async (tx) => {
    const issue = await tx.transportSettlementIssue.findFirstOrThrow({ where: { id: Number(issueId) } });
    if (["resuelta", "cerrada"].includes(issue.status)) fail(409, "TMS_SETTLEMENT_ISSUE_ALREADY_RESOLVED", "La novedad ya esta resuelta.");
    const resolution = String(input.resolution || "").trim();
    if (!resolution) fail(400, "TMS_SETTLEMENT_ISSUE_RESOLUTION_REQUIRED", "La resolucion es obligatoria.");
    const updated = await tx.transportSettlementIssue.update({ where: { id: issue.id }, data: { status: input.close ? "cerrada" : "resuelta", resolution, resolved_by: user?.id ?? null, resolved_at: new Date() } });
    await audit(tx, user, "transport.settlement_issue.resolved", "TransportSettlementIssue", issue.id, { status: issue.status }, { status: updated.status, resolution });
    return updated;
  });
}

async function reopenSettlementIssue(tenantId, user, issueId, input) {
  return write(tenantId, async (tx) => {
    const issue = await tx.transportSettlementIssue.findFirstOrThrow({ where: { id: Number(issueId) } });
    const updated = await tx.transportSettlementIssue.update({ where: { id: issue.id }, data: { status: "reabierta", resolution: null, resolved_by: null, resolved_at: null, reopen_count: { increment: 1 }, ...(input.reason ? { support: { ...(issue.support || {}), reopen_reason: input.reason } } : {}) } });
    await audit(tx, user, "transport.settlement_issue.reopened", "TransportSettlementIssue", issue.id, { status: issue.status, reopen_count: issue.reopen_count }, { status: updated.status, reopen_count: updated.reopen_count });
    return updated;
  });
}

// ---- Workflow: enviar a revision, decidir, contabilizar ----
async function submitSettlementPackage(tenantId, user, id, input = {}) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { issues: true } });
    E.assertPackageTransition(pkg.status, E.PACKAGE_STATUS.EN_REVISION);
    E.assertVersionMatch(input.version, pkg.version);
    if (!["preliquidada", "con_novedad", "rechazada"].includes(pkg.status)) fail(409, "TMS_SETTLEMENT_NOT_SUBMITTABLE", "Solo un paquete preliquidado, con novedad resuelta o devuelto puede enviarse a revision.", { status: pkg.status });
    E.assertNoOpenBlockingIssues(pkg.issues, "enviar a revision"); // RB-08
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: E.PACKAGE_STATUS.EN_REVISION, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.submitted", ENTITY_PACKAGE, pkg.id, { status: pkg.status }, { status: updated.status });
    return packageView(updated);
  });
}

async function decideSettlementPackage(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { issues: true, items: true } });
    const decision = String(input.decision || "").trim();
    if (!DECISIONS.has(decision)) fail(400, "TMS_SETTLEMENT_DECISION_INVALID", "La decision debe ser aprobada, rechazada o con_novedad.");
    E.assertPackageTransition(pkg.status, decision);
    E.assertVersionMatch(input.version, pkg.version);
    E.assertDecisionComment(decision === "rechazada" ? "rechazada" : "aprobada", input.comment);

    const type = pkg.type_id ? await tx.transportSettlementType.findFirst({ where: { id: pkg.type_id } }) : null;
    if (decision === "aprobada") {
      if (!pkg.items.length) fail(409, "TMS_SETTLEMENT_NO_ITEMS", "No puede aprobar un paquete sin documentos.");
      E.assertNoOpenBlockingIssues(pkg.issues, "aprobar"); // RB-08
      if (type?.requires_reinforced_approval) E.assertSegregation({ createdBy: pkg.created_by, actorId: user?.id, enforce: true }); // RB-09
    }

    const fromStatus = pkg.status;
    const data = { status: decision, version: { increment: 1 } };
    if (decision === "aprobada") {
      data.approved_by = user?.id ?? null;
      data.approved_at = new Date();
      data.approved_total = Number(pkg.adjusted_total);
      for (const item of pkg.items) await tx.transportSettlementItem.update({ where: { id: item.id }, data: { approved_amount: Number(item.adjusted_amount) } });
    }
    const approval = await tx.transportSettlementApproval.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, level: numberOr(input.level, 1), actor_id: user?.id ?? null, actor_role: input.actor_role || null, decision, from_status: fromStatus, to_status: decision, comment: input.comment || null } });
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data, include: PACKAGE_INCLUDE });
    await audit(tx, user, `transport.settlement_package.${decision}`, ENTITY_PACKAGE, pkg.id, { status: fromStatus, approved_total: Number(pkg.approved_total) }, { status: updated.status, approved_total: Number(updated.approved_total), decision, comment: input.comment || null, approval_id: approval.id });
    return packageView(updated);
  });
}

async function accountSettlementPackage(tenantId, user, id, input = {}) {

  const result = await write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { issues: true, accountings: true, items: true } });
    const accountingPeriod = pkg.metadata?.accounting_period || currentAccountingMonth();
    if (pkg.metadata?.tariff_locked && input.accounting_period && input.accounting_period !== accountingPeriod) fail(409, "TMS_PERIOD_LOCKED", "El periodo contable es automático y no puede modificarse.");
    const key = String(input.idempotency_key || "").trim() || E.accountingIdempotencyKey(pkg.code, accountingPeriod);
    // RB-10: idempotencia. Un reintento con la misma clave devuelve el resultado existente.
    const existingByKey = await tx.transportSettlementAccounting.findFirst({ where: { idempotency_key: key } });
    if (existingByKey) {
      if (existingByKey.package_id !== pkg.id) fail(409, "TMS_SETTLEMENT_ACCOUNT_KEY_CONFLICT", "La clave contable pertenece a otro paquete.");
      return { ...packageView(pkg), accounting: accountingView(existingByKey), idempotent_replay: true };
    }
    const existingForPackage = pkg.accountings[0];
    if (existingForPackage) return { ...packageView(pkg), accounting: accountingView(existingForPackage), idempotent_replay: true };

    E.assertAccountingAllowed({ status: pkg.status, issues: pkg.issues }); // RB-08 + RB-10
    E.assertVersionMatch(input.version, pkg.version);
    E.assertPackageTransition(pkg.status, E.PACKAGE_STATUS.CONTABILIZADA);
    const amount = Number(pkg.approved_total);
    const posting = await postSettlementIncomeTx(tx, tenantId, user, pkg, input, accountingPeriod);
    const accounting = await tx.transportSettlementAccounting.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, reference: posting.documents.map(document => document.number).join(", "), accounting_period: accountingPeriod, amount, idempotency_key: key, payload: posting, created_by: user?.id ?? null } });
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: E.PACKAGE_STATUS.CONTABILIZADA, accounted_total: amount, metadata: { ...pkg.metadata, cost_center: posting.cost_center }, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.accounted", ENTITY_PACKAGE, pkg.id, { status: pkg.status, accounted_total: Number(pkg.accounted_total) }, { status: updated.status, accounted_total: amount, reference: accounting.reference, accounting_period: accountingPeriod, idempotency_key: key });
    return { ...packageView(updated), accounting: accountingView(accounting), idempotent_replay: false };
  });
  await invalidateVehicleAccounting(tenantId);
  return result;
}

async function freezeSettlementTariffs(tx, tenantId, packageId) {
  const items = await tx.transportSettlementItem.findMany({ where: { tenant_id: String(tenantId), package_id: packageId } });
  for (const item of items) {
    if (item.metadata?.charge_criteria?.length) {
      let changed = false;
      const criteria = [];
      for (const entry of item.metadata.charge_criteria) {
        const snapshot = entry.rate_snapshot || {};
        let definition = snapshot.definition;
        if (!definition && entry.rate_card_id) {
          const rate = await tx.transportRateCard.findFirst({ where: { tenant_id: String(tenantId), id: Number(entry.rate_card_id), version: Number(entry.rate_version || snapshot.rate_version || 1) } });
          if (rate) { definition = JSON.parse(JSON.stringify(rate)); changed = true; }
        }
        criteria.push(definition && !snapshot.definition ? { ...entry, rate_snapshot: { ...snapshot, definition, freeze_stage: "liquidation" } } : entry);
      }
      if (changed) await tx.transportSettlementItem.update({ where: { id: item.id }, data: { metadata: { ...item.metadata, charge_criteria: criteria } } });
    } else if (item.rate_card_id && !item.metadata?.report_rate_snapshot?.definition) {
      const rate = await tx.transportRateCard.findFirst({ where: { tenant_id: String(tenantId), id: item.rate_card_id, version: item.rate_version || 1 } });
      if (rate) await tx.transportSettlementItem.update({ where: { id: item.id }, data: { metadata: { ...item.metadata, report_rate_snapshot: { ...(item.calculation_trace?.snapshot || {}), definition: JSON.parse(JSON.stringify(rate)), freeze_stage: "liquidation" } } } });
    }
  }
}

async function closeSettlementPackage(tenantId, user, id, input = {}) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { issues: true } });
    const to = input.status === "reversada" ? E.PACKAGE_STATUS.REVERSADA : E.PACKAGE_STATUS.LIQUIDADA;
    E.assertPackageTransition(pkg.status, to);
    E.assertVersionMatch(input.version, pkg.version);
    if (to === E.PACKAGE_STATUS.LIQUIDADA) { E.assertNoOpenBlockingIssues(pkg.issues, "liquidar"); await freezeSettlementTariffs(tx, tenantId, pkg.id); }
    if (to === E.PACKAGE_STATUS.REVERSADA && !String(input.reference || "").trim()) fail(400, "TMS_SETTLEMENT_REVERSAL_REFERENCE_REQUIRED", "La reversion formal exige una referencia del comprobante de reversa.");
    const reversals = to === E.PACKAGE_STATUS.REVERSADA ? await reverseSettlementIncomeTx(tx, tenantId, user, pkg, input.reference) : [];
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: to, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, `transport.settlement_package.${to}`, ENTITY_PACKAGE, pkg.id, { status: pkg.status }, { status: updated.status, reference: input.reference || null, reversals });
    return packageView(updated);
  });
}

async function cancelSettlementPackage(tenantId, user, id, input = {}) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) } });
    E.assertPackageTransition(pkg.status, E.PACKAGE_STATUS.CANCELADA);
    E.assertVersionMatch(input.version, pkg.version);
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: E.PACKAGE_STATUS.CANCELADA, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.cancelled", ENTITY_PACKAGE, pkg.id, { status: pkg.status }, { status: updated.status, reason: input.reason || null });
    return packageView(updated);
  });
}

async function getSettlementAudit(tenantId, id) {
  return read(tenantId, async (db) => {
    const pkg = await db.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { approvals: { orderBy: { id: "asc" } } } });
    const events = await db.auditLog.findMany({ where: { module: MODULE, entity_id: String(pkg.id), entity: { in: [ENTITY_PACKAGE, "TransportSettlementIssue"] } }, orderBy: { timestamp: "asc" } });
    return { package_id: pkg.id, code: pkg.code, status: pkg.status, version: pkg.version, approvals: pkg.approvals, timeline: events.map((event) => ({ id: String(event.id), action: event.action, user_id: event.user_id, at: event.timestamp, old_value: event.old_value, new_value: event.new_value })) };
  });
}

// ---- Simulador de tarifa (POST /rates/simulate) sin alterar la liquidacion ----
async function simulateRate(tenantId, input) {
  return read(tenantId, async (db) => {
    const rates = await db.transportRateCard.findMany({ where: { status: "activa" }, include: { carrier: true } });
    const context = { carrier_id: input.carrier_id ?? null, service_date: dateOrNull(input.service_date) || new Date(), destination_city: input.destination_city, destination_department: input.destination_department, destination_municipality: input.destination_municipality, vehicle_type: input.vehicle_type, service_level: input.service_level };
    const { rate, trace } = E.resolveRate(rates, context);
    const calc = E.calculateItemAmount(rate, { quantity: numberOr(input.quantity, 1), distance_km: numberOr(input.distance_km), weight_kg: numberOr(input.weight_kg), volume_m3: numberOr(input.volume_m3), stop_count: numberOr(input.stop_count, 1) });
    return { rate: { id: rate.id, code: rate.code, version: rate.version, priority: numberOr(rate.priority, 100), currency: rate.currency }, amount: calc.amount, unit_amount: calc.unit_amount, minimum_applied: calc.minimum_applied, components: calc.components, trace };
  });
}

module.exports = {
  withSettlementTransaction: write,
  listSettlementAccountingOptions,
  currentAccountingMonth, listSettlementDestinations, listSettlementCustomers, saveSettlementDocuments, listSettlementRateOptions, quoteSettlementCriterion,
  listSettlementTypes, saveSettlementType,
  listSettlementPeriods, saveSettlementPeriod,
  listSettlementPackages, getSettlementPackage, getSettlementControlTower,
  getSettlementVehicleConsolidation,
  createSettlementPackage, updateSettlementPackage, addSettlementItems,
  validateSettlementPackage, precalculateSettlementPackage, addSettlementAdjustment,
  createSettlementIssue, resolveSettlementIssue, reopenSettlementIssue,
  submitSettlementPackage, decideSettlementPackage, accountSettlementPackage,
  closeSettlementPackage, cancelSettlementPackage, getSettlementAudit, simulateRate
};
