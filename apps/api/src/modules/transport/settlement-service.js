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
const E = require("./settlement-engine");

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
  return basePrisma.runWithTenant(tenantId, () => fn(basePrisma, tenantId));
}

function write(tenantId, fn) {
  if (!tenantId) fail(401, "TMS_TENANT_REQUIRED", "Empresa requerida.");
  return basePrisma.runWithTenant(tenantId, () =>
    basePrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `transport:${tenantId}`);
      return fn(tx, tenantId);
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
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.period_id ? { period_id: Number(query.period_id) } : {}),
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

async function loadCarrier(tx, carrierId) {
  return tx.transportCarrier.findFirst({ where: { id: Number(carrierId), __includeInactive: true } });
}

async function createSettlementPackage(tenantId, user, input) {
  return write(tenantId, async (tx) => {
    const code = String(input.code || "").trim().toUpperCase();
    if (!code) fail(400, "TMS_SETTLEMENT_PACKAGE_CODE_REQUIRED", "El codigo del paquete es obligatorio.");
    if (!input.carrier_id) fail(400, "TMS_SETTLEMENT_CARRIER_REQUIRED", "El transportador es obligatorio.");
    const carrier = await loadCarrier(tx, input.carrier_id);
    if (!carrier) fail(404, "TMS_SETTLEMENT_CARRIER_NOT_FOUND", "El transportador no existe en la empresa activa.");
    E.assertCarrierEligible(carrier); // RB-01
    const period = input.period_id ? await tx.transportSettlementPeriod.findFirst({ where: { id: Number(input.period_id) } }) : null;
    if (input.period_id && !period) fail(404, "TMS_SETTLEMENT_PERIOD_NOT_FOUND", "El periodo no existe en la empresa activa.");
    if (period && period.status === "cerrado") fail(409, "TMS_SETTLEMENT_PERIOD_CLOSED", "El periodo esta cerrado; no admite paquetes nuevos.");
    const typeCode = String(input.type_code || "TRANSPORTADOR").trim().toUpperCase();
    const type = await tx.transportSettlementType.findFirst({ where: { code: typeCode } });
    const pkg = await tx.transportSettlementPackage.create({
      data: {
        code,
        period_id: period ? period.id : null,
        carrier_id: carrier.id,
        carrier_code: carrier.code,
        carrier_name: carrier.legal_name,
        type_id: type ? type.id : null,
        type_code: typeCode,
        currency: String(input.currency || "COP").toUpperCase(),
        responsible_id: input.responsible_id ? Number(input.responsible_id) : (user?.id ?? null),
        observation: input.observation || null,
        status: E.PACKAGE_STATUS.BORRADOR,
        version: 0,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
        created_by: user?.id ?? null
      },
      include: PACKAGE_INCLUDE
    });
    await audit(tx, user, "transport.settlement_package.created", ENTITY_PACKAGE, pkg.id, null, { code: pkg.code, carrier_id: carrier.id, type_code: typeCode, status: pkg.status });
    return packageView(pkg);
  });
}

async function updateSettlementPackage(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) } });
    E.assertEditable(pkg.status); // RB-11
    E.assertVersionMatch(input.version, pkg.version); // RB-12
    const before = { responsible_id: pkg.responsible_id, observation: pkg.observation, period_id: pkg.period_id, currency: pkg.currency };
    const data = { version: { increment: 1 } };
    if (input.responsible_id !== undefined) data.responsible_id = input.responsible_id ? Number(input.responsible_id) : null;
    if (input.observation !== undefined) data.observation = input.observation || null;
    if (input.currency !== undefined) data.currency = String(input.currency).toUpperCase();
    if (input.period_id !== undefined) {
      const period = input.period_id ? await tx.transportSettlementPeriod.findFirst({ where: { id: Number(input.period_id) } }) : null;
      if (input.period_id && !period) fail(404, "TMS_SETTLEMENT_PERIOD_NOT_FOUND", "El periodo no existe en la empresa activa.");
      data.period_id = period ? period.id : null;
    }
    if (input.metadata && typeof input.metadata === "object") data.metadata = { ...(pkg.metadata || {}), ...input.metadata };
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
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

async function addSettlementItems(tenantId, user, id, input) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { items: true, issues: true } });
    E.assertEditable(pkg.status); // RB-11
    E.assertVersionMatch(input.version, pkg.version); // RB-12
    const incoming = Array.isArray(input.items) ? input.items : [];
    if (!incoming.length) fail(400, "TMS_SETTLEMENT_ITEMS_REQUIRED", "Debe aportar al menos un detalle.");
    if (incoming.length > 500) fail(400, "TMS_SETTLEMENT_ITEMS_TOO_MANY", "Maximo 500 detalles por operacion.");
    const prepared = incoming.map((item) => itemData(item, tenantId));

    // RB-03: duplicidad intra-lote y contra otros paquetes vigentes del tenant.
    const localDupes = E.detectDuplicateGuides(prepared, pkg.items.map((item) => item.guide_reference));
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
    for (const data of prepared) {
      created.push(await tx.transportSettlementItem.create({ data: { ...data, package_id: pkg.id } }));
    }
    const totals = await recomputeTotals(tx, pkg.id);
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { version: { increment: 1 }, ...totals }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.items_added", ENTITY_PACKAGE, pkg.id, { item_count: pkg.items.length }, { item_count: updated.items.length, added: created.length });
    return packageView(updated);
  });
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
    const carrier = await loadCarrier(tx, pkg.carrier_id);
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
      const context = { carrier_id: pkg.carrier_id, service_date: item.service_date || new Date(), destination_city: item.destination_city, vehicle_type: item.vehicle_type, service_level: item.service_level };
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
  const accountingPeriod = input.accounting_period || null;
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) }, include: { issues: true, accountings: true } });
    const key = String(input.idempotency_key || "").trim() || E.accountingIdempotencyKey(pkg.code, accountingPeriod);
    // RB-10: idempotencia. Un reintento con la misma clave devuelve el resultado existente.
    const existingByKey = await tx.transportSettlementAccounting.findFirst({ where: { idempotency_key: key } });
    if (existingByKey) return { ...packageView(pkg), accounting: accountingView(existingByKey), idempotent_replay: true };
    const existingForPackage = pkg.accountings[0];
    if (existingForPackage) return { ...packageView(pkg), accounting: accountingView(existingForPackage), idempotent_replay: true };

    E.assertAccountingAllowed({ status: pkg.status, issues: pkg.issues }); // RB-08 + RB-10
    E.assertPackageTransition(pkg.status, E.PACKAGE_STATUS.CONTABILIZADA);
    const amount = Number(pkg.approved_total);
    let accounting;
    try {
      accounting = await tx.transportSettlementAccounting.create({ data: { tenant_id: String(tenantId), package_id: pkg.id, reference: input.reference || null, accounting_period: accountingPeriod, amount, idempotency_key: key, payload: input.payload && typeof input.payload === "object" ? input.payload : {}, created_by: user?.id ?? null } });
    } catch (error) {
      if (error?.code === "P2002") {
        const raced = await tx.transportSettlementAccounting.findFirst({ where: { idempotency_key: key } });
        return { ...packageView(pkg), accounting: raced ? accountingView(raced) : null, idempotent_replay: true };
      }
      throw error;
    }
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: E.PACKAGE_STATUS.CONTABILIZADA, accounted_total: amount, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, "transport.settlement_package.accounted", ENTITY_PACKAGE, pkg.id, { status: pkg.status, accounted_total: Number(pkg.accounted_total) }, { status: updated.status, accounted_total: amount, reference: accounting.reference, accounting_period: accountingPeriod, idempotency_key: key });
    return { ...packageView(updated), accounting: accountingView(accounting), idempotent_replay: false };
  });
}

async function closeSettlementPackage(tenantId, user, id, input = {}) {
  return write(tenantId, async (tx) => {
    const pkg = await tx.transportSettlementPackage.findFirstOrThrow({ where: { id: Number(id) } });
    const to = input.status === "reversada" ? E.PACKAGE_STATUS.REVERSADA : E.PACKAGE_STATUS.LIQUIDADA;
    E.assertPackageTransition(pkg.status, to);
    E.assertVersionMatch(input.version, pkg.version);
    if (to === E.PACKAGE_STATUS.REVERSADA && !String(input.reference || "").trim()) fail(400, "TMS_SETTLEMENT_REVERSAL_REFERENCE_REQUIRED", "La reversion formal exige una referencia del comprobante de reversa.");
    const updated = await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { status: to, version: { increment: 1 } }, include: PACKAGE_INCLUDE });
    await audit(tx, user, `transport.settlement_package.${to}`, ENTITY_PACKAGE, pkg.id, { status: pkg.status }, { status: updated.status, reference: input.reference || null });
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
    const context = { carrier_id: input.carrier_id ?? null, service_date: dateOrNull(input.service_date) || new Date(), destination_city: input.destination_city, vehicle_type: input.vehicle_type, service_level: input.service_level };
    const { rate, trace } = E.resolveRate(rates, context);
    const calc = E.calculateItemAmount(rate, { quantity: numberOr(input.quantity, 1), distance_km: numberOr(input.distance_km), weight_kg: numberOr(input.weight_kg), volume_m3: numberOr(input.volume_m3), stop_count: numberOr(input.stop_count, 1) });
    return { rate: { id: rate.id, code: rate.code, version: rate.version, priority: numberOr(rate.priority, 100), currency: rate.currency }, amount: calc.amount, unit_amount: calc.unit_amount, minimum_applied: calc.minimum_applied, components: calc.components, trace };
  });
}

module.exports = {
  listSettlementTypes, saveSettlementType,
  listSettlementPeriods, saveSettlementPeriod,
  listSettlementPackages, getSettlementPackage, getSettlementControlTower,
  createSettlementPackage, updateSettlementPackage, addSettlementItems,
  validateSettlementPackage, precalculateSettlementPackage, addSettlementAdjustment,
  createSettlementIssue, resolveSettlementIssue, reopenSettlementIssue,
  submitSettlementPackage, decideSettlementPackage, accountSettlementPackage,
  closeSettlementPackage, cancelSettlementPackage, getSettlementAudit, simulateRate
};
