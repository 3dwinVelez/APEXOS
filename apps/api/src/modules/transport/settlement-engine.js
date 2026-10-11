// Motor puro de Liquidacion de Transporte (paquetes por transportador).
//
// Toda la logica critica de negocio vive aqui como funciones puras sin I/O ni Prisma,
// de modo que el motor tarifario, la maquina de estados, la deteccion de duplicados,
// los ajustes, la idempotencia de contabilizacion y el control de concurrencia sean
// reproducibles y testeables de forma determinista (ver apps/api/test/transport-settlement-engine.test.js).
//
// Principios de la especificacion que se materializan:
//   - RB-04/RB-05: tarifa vigente y determinista; la ambiguedad produce error, nunca una eleccion silenciosa.
//   - RB-06: snapshot tarifario (id + version + parametros + componentes) congelado en la linea.
//   - RB-10: contabilizacion idempotente por clave determinista.
//   - RB-11/RB-12: inmutabilidad por estado y versionado para concurrencia.
//   - Importes monetarios en centavos enteros: jamas se usa float para el total financiero.

const RESERVED_TYPE_CODES = ["TRANSPORTADOR", "TIENDA_LEJANA", "CAJA_MENOR", "ESPECIAL"];

// Maquina de estados del paquete (spec seccion 5). Claves/valores en minuscula, coherentes
// con la convencion del TMS existente (borrador/aprobada).
const PACKAGE_STATUS = {
  BORRADOR: "borrador",
  VALIDANDO: "validando",
  PRELIQUIDADA: "preliquidada",
  CON_NOVEDAD: "con_novedad",
  EN_REVISION: "en_revision",
  RECHAZADA: "rechazada",
  APROBADA: "aprobada",
  CONTABILIZADA: "contabilizada",
  LIQUIDADA: "liquidada",
  REVERSADA: "reversada",
  CANCELADA: "cancelada"
};

const PACKAGE_TRANSITIONS = {
  borrador: ["validando", "cancelada"],
  validando: ["preliquidada", "con_novedad"],
  preliquidada: ["en_revision", "con_novedad"],
  con_novedad: ["preliquidada", "en_revision"],
  en_revision: ["aprobada", "rechazada", "con_novedad"],
  rechazada: ["en_revision", "cancelada"],
  aprobada: ["contabilizada"],
  contabilizada: ["liquidada", "reversada"],
  liquidada: [],
  reversada: [],
  cancelada: []
};

// Estados en los que el detalle sigue siendo editable (RB-11: aprobada/contabilizada/liquidada no lo son).
const EDITABLE_STATUSES = new Set(["borrador", "validando", "preliquidada", "con_novedad", "rechazada"]);
// Estados terminales de consulta.
const CLOSED_STATUSES = new Set(["liquidada", "cancelada", "reversada"]);

const ISSUE_STATUS = { ABIERTA: "abierta", EN_GESTION: "en_gestion", RESUELTA: "resuelta", CERRADA: "cerrada", REABIERTA: "reabierta" };
const OPEN_ISSUE_STATUSES = new Set(["abierta", "en_gestion", "reabierta"]);

class SettlementError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "SettlementError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details || undefined;
  }
}

function fail(statusCode, code, message, details) {
  throw new SettlementError(statusCode, code, message, details);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cents(value) {
  return Math.round(numberValue(value) * 100);
}

function fromCents(value) {
  return Math.round(numberValue(value)) / 100;
}

function round2(value) {
  return fromCents(cents(value));
}

function normalizeMatch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ---- RB-12: concurrencia por versionado optimista ----
function assertVersionMatch(expectedVersion, currentVersion) {
  if (expectedVersion === undefined || expectedVersion === null) return;
  if (numberValue(expectedVersion) !== numberValue(currentVersion)) {
    fail(409, "TMS_SETTLEMENT_VERSION_CONFLICT", "El paquete fue modificado por otro usuario. Recargue y reintente.", {
      expected_version: numberValue(expectedVersion),
      current_version: numberValue(currentVersion)
    });
  }
}

// ---- Maquina de estados ----
function assertPackageTransition(from, to) {
  const allowed = PACKAGE_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    fail(409, "TMS_SETTLEMENT_INVALID_TRANSITION", `Transicion no permitida de ${from} a ${to}.`, { from, to, allowed });
  }
  return { from, to };
}

function isEditable(status) {
  return EDITABLE_STATUSES.has(status);
}

function assertEditable(status) {
  if (!isEditable(status)) {
    fail(409, "TMS_SETTLEMENT_NOT_EDITABLE", `El paquete en estado ${status} no admite edicion operativa del detalle.`, { status });
  }
}

function isClosed(status) {
  return CLOSED_STATUSES.has(status);
}

// ---- RB-01: transportador habilitado ----
function carrierEligibility(carrier) {
  const active = carrier?.active !== false;
  const status = normalizeMatch(carrier?.status);
  const statusOk = !status || ["activo", "active", "habilitado", "disponible"].includes(status);
  const blocked = ["bloqueado", "bloqueada", "suspendido", "suspendida", "inactivo", "inactiva"].includes(status);
  return { eligible: Boolean(active && statusOk && !blocked), active, status: carrier?.status || null, blocked };
}

function assertCarrierEligible(carrier) {
  const eligibility = carrierEligibility(carrier);
  if (!eligibility.eligible) {
    fail(409, "TMS_SETTLEMENT_CARRIER_INELIGIBLE", "El transportador esta inactivo o bloqueado y no puede preliquidarse.", eligibility);
  }
  return eligibility;
}

// ---- RB-02: elegibilidad documental (politica parametrizable: bloqueo o alerta) ----
// `required` = tipos de documento exigidos; `documents` = [{ type, status }] del expediente.
// Un documento VENCIDO bajo politica "bloqueo" impide; bajo "alerta" solo reporta.
function documentaryEligibility({ policy = "alerta", required = [], documents = [], referenceDate = new Date() } = {}) {
  const ref = toDate(referenceDate) || new Date();
  const byType = new Map();
  for (const doc of documents) {
    const key = normalizeMatch(doc?.type);
    if (!key) continue;
    const existing = byType.get(key);
    if (!existing || toDate(doc?.valid_to) > toDate(existing?.valid_to)) byType.set(key, doc);
  }
  const missing = [];
  const expired = [];
  const expiring = [];
  for (const type of required) {
    const key = normalizeMatch(type);
    const doc = byType.get(key);
    if (!doc) { missing.push(String(type)); continue; }
    const status = normalizeMatch(doc.status);
    const validTo = toDate(doc.valid_to);
    if (status === "rechazado" || status === "vencido" || (validTo && validTo < ref)) expired.push(String(type));
    else if (validTo && validTo.getTime() - ref.getTime() <= 30 * 24 * 3600 * 1000) expiring.push(String(type));
  }
  const blocking = policy === "bloqueo" && (missing.length > 0 || expired.length > 0);
  return { ok: !blocking, blocking, policy, missing, expired, expiring };
}

// ---- RB-03: guia duplicada (alcance tenant + guia) ----
// `existing` = guias ya reconocidas en OTROS paquetes vigentes del tenant; dentro del paquete
// la unicidad la garantiza la restriccion @@unique([tenant_id, package_id, guide_reference]).
function detectDuplicateGuides(items, existingGuides = []) {
  const seen = new Set(existingGuides.map(normalizeMatch).filter(Boolean));
  const local = new Set();
  const duplicates = [];
  for (const item of items || []) {
    const key = normalizeMatch(item?.guide_reference);
    if (!key) continue;
    if (seen.has(key) || local.has(key)) duplicates.push(item.guide_reference);
    local.add(key);
  }
  return { duplicates: Array.from(new Set(duplicates)), count: duplicates.length };
}

// ---- RB-04/RB-05: resolucion determinista de tarifa con traza explicable ----
function rateIsValidOn(rate, date) {
  const from = toDate(rate?.valid_from);
  const to = toDate(rate?.valid_to);
  if (from && date && date < from) return false;
  if (to && date && date > to) return false;
  return true;
}

function rateMatchesContext(rate, context) {
  if (rate.carrier_id != null && context.carrier_id != null && numberValue(rate.carrier_id) !== numberValue(context.carrier_id)) return false;
  if (rate.origin_department && context.origin_department && normalizeMatch(rate.origin_department) !== normalizeMatch(context.origin_department)) return false;
  if (rate.origin_city && context.origin_city && normalizeMatch(rate.origin_city) !== normalizeMatch(context.origin_city)) return false;
  if (rate.origin_municipality && context.origin_municipality && normalizeMatch(rate.origin_municipality) !== normalizeMatch(context.origin_municipality)) return false;
  if (rate.destination_city && context.destination_city && normalizeMatch(rate.destination_city) !== normalizeMatch(context.destination_city)) return false;
  if (rate.destination_municipality && context.destination_municipality && normalizeMatch(rate.destination_municipality) !== normalizeMatch(context.destination_municipality)) return false;
  if (rate.destination_department && context.destination_department && normalizeMatch(rate.destination_department) !== normalizeMatch(context.destination_department)) return false;
  if (rate.vehicle_type && context.vehicle_type && normalizeMatch(rate.vehicle_type) !== normalizeMatch(context.vehicle_type)) return false;
  if (rate.service_level && context.service_level && normalizeMatch(rate.service_level) !== normalizeMatch(context.service_level)) return false;
  return true;
}

// Devuelve { rate, trace } o lanza TMS_SETTLEMENT_RATE_NOT_FOUND / TMS_SETTLEMENT_RATE_AMBIGUOUS.
// Nunca asume valor cero ni elige en silencio entre tarifas de igual prioridad.
function resolveRate(candidates, context = {}) {
  const serviceDate = toDate(context.service_date) || new Date();
  const trace = { context: { carrier_id: context.carrier_id ?? null, service_date: serviceDate.toISOString(), origin_department: context.origin_department ?? null, origin_city: context.origin_city ?? null, origin_municipality: context.origin_municipality ?? null, destination_city: context.destination_city ?? null, destination_department: context.destination_department ?? null, destination_municipality: context.destination_municipality ?? null, vehicle_type: context.vehicle_type ?? null, service_level: context.service_level ?? null }, evaluated: [], rejected: [] };

  const active = (candidates || []).filter((rate) => normalizeMatch(rate.status) === "activa" && rate.active !== false);
  for (const rate of candidates || []) {
    if (!active.includes(rate)) trace.rejected.push({ id: rate.id, code: rate.code, reason: "inactiva" });
  }

  const inVigor = active.filter((rate) => {
    const ok = rateIsValidOn(rate, serviceDate);
    if (!ok) trace.rejected.push({ id: rate.id, code: rate.code, version: rate.version, reason: "fuera_de_vigencia" });
    return ok;
  });

  const matching = inVigor.filter((rate) => {
    const ok = rateMatchesContext(rate, context);
    if (!ok) trace.rejected.push({ id: rate.id, code: rate.code, version: rate.version, reason: "contexto_no_aplica" });
    return ok;
  });

  trace.evaluated = matching.map((rate) => ({ id: rate.id, code: rate.code, version: rate.version, priority: numberValue(rate.priority, 100) }));

  if (!matching.length) {
    fail(422, "TMS_SETTLEMENT_RATE_NOT_FOUND", "No existe tarifa vigente aplicable al detalle; registre la tarifa o abra una novedad. No se asume valor cero.", { trace });
  }

  const minPriority = Math.min(...matching.map((rate) => numberValue(rate.priority, 100)));
  const top = matching.filter((rate) => numberValue(rate.priority, 100) === minPriority);
  if (top.length > 1) {
    fail(409, "TMS_SETTLEMENT_RATE_AMBIGUOUS", "Multiples tarifas con igual prioridad coinciden; ajuste prioridades o vigencias. No se elige una tarifa ambigua.", {
      candidates: top.map((rate) => ({ id: rate.id, code: rate.code, version: rate.version, priority: numberValue(rate.priority, 100) })), trace
    });
  }

  const rate = top[0];
  trace.selected = { id: rate.id, code: rate.code, version: rate.version, priority: numberValue(rate.priority, 100), matched_by: "vigencia+contexto+prioridad" };
  return { rate, trace };
}

// ---- RB-06: calculo explicable + snapshot de la tarifa ----
// Replica la aritmetica de calculateRateQuote del TMS (componentes + recargo combustible + minimo)
// en centavos enteros, y multiplica por la cantidad/base del detalle.
function calculateItemAmount(rate, item = {}) {
  const quantity = numberValue(item.quantity, 1) || 1;
  const metrics = {
    distance_km: numberValue(item.distance_km),
    weight_kg: numberValue(item.weight_kg),
    volume_m3: numberValue(item.volume_m3),
    stop_count: numberValue(item.stop_count, 1)
  };
  const components = {
    base: numberValue(rate.base_rate),
    distance: numberValue(rate.price_per_km) * metrics.distance_km,
    weight: numberValue(rate.price_per_kg) * metrics.weight_kg,
    volume: numberValue(rate.price_per_m3) * metrics.volume_m3,
    stops: numberValue(rate.price_per_stop) * metrics.stop_count,
    tolls: numberValue(rate.tolls_flat)
  };
  const beforeFuelCents = Object.values(components).reduce((sum, value) => sum + cents(value), 0);
  const fuelCents = Math.round((beforeFuelCents / 100) * numberValue(rate.fuel_surcharge_pct) );
  const calculatedCents = beforeFuelCents + fuelCents;
  const minimumCents = cents(rate.minimum_charge);
  const unitCents = Math.max(calculatedCents, minimumCents);
  const amountCents = Math.round(unitCents * quantity);

  const roundedComponents = Object.fromEntries(Object.entries({ ...components, fuel: fromCents(fuelCents) }).map(([key, value]) => [key, round2(value)]));
  return {
    amount: fromCents(amountCents),
    unit_amount: fromCents(unitCents),
    quantity,
    currency: rate.currency || "COP",
    minimum_applied: unitCents > calculatedCents,
    components: roundedComponents,
    snapshot: {
      rate_card_id: rate.id ?? null,
      rate_code: rate.code ?? null,
      rate_version: rate.version ?? null,
      carrier_id: rate.carrier_id ?? null,
      base: round2(rate.base_rate),
      unit_value: round2(quantity),
      currency: rate.currency || "COP",
      priority: numberValue(rate.priority, 100),
      components: roundedComponents,
      minimum_applied: unitCents > calculatedCents
    }
  };
}

// ---- RB-07: totales separando calculado vs ajustado (nunca un unico campo opaco) ----
function computeTotals(items = []) {
  let calculatedCents = 0;
  let adjustedCents = 0;
  for (const item of items) {
    calculatedCents += cents(item.calculated_amount);
    const adjusted = item.adjusted_amount === null || item.adjusted_amount === undefined ? item.calculated_amount : item.adjusted_amount;
    adjustedCents += cents(adjusted);
  }
  return {
    calculated_total: fromCents(calculatedCents),
    adjusted_total: fromCents(adjustedCents),
    adjustment_delta: fromCents(adjustedCents - calculatedCents),
    line_count: items.length
  };
}

// ---- RB-08: novedades bloqueantes abiertas impiden la transicion configurada ----
function openBlockingIssues(issues = []) {
  return issues.filter((issue) => issue.blocking === true && OPEN_ISSUE_STATUSES.has(normalizeMatch(issue.status)));
}

function assertNoOpenBlockingIssues(issues, action = "continuar") {
  const blocking = openBlockingIssues(issues);
  if (blocking.length) {
    fail(409, "TMS_SETTLEMENT_BLOCKING_ISSUE_OPEN", `Existen novedades bloqueantes abiertas que impiden ${action}.`, {
      issues: blocking.map((issue) => ({ id: issue.id, category: issue.category, severity: issue.severity, blocks: issue.blocks }))
    });
  }
  return blocking;
}

// ---- RB-09: segregacion de funciones (creador no aprueba su propio paquete cuando la politica lo exige) ----
function assertSegregation({ createdBy, actorId, enforce = true }) {
  if (!enforce) return;
  if (createdBy != null && actorId != null && numberValue(createdBy) === numberValue(actorId)) {
    fail(403, "TMS_SETTLEMENT_SEGREGATION_VIOLATION", "Por segregacion de funciones el creador no puede aprobar su propio paquete.", { created_by: createdBy, actor_id: actorId });
  }
}

// ---- RB-10: contabilizacion idempotente ----
function accountingIdempotencyKey(packageCode, accountingPeriod) {
  const base = `${normalizeMatch(packageCode)}|${normalizeMatch(accountingPeriod || "sin-periodo")}`;
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
  }
  return `tms-set:${base}:${hash.toString(36)}`;
}

function assertAccountingAllowed({ status, issues = [] }) {
  if (status !== PACKAGE_STATUS.APROBADA) {
    fail(409, "TMS_SETTLEMENT_NOT_APPROVED", "Solo un paquete aprobado puede contabilizarse.", { status });
  }
  assertNoOpenBlockingIssues(issues, "contabilizar");
}

// ---- Regla de rechazo: exige comentario (spec 6.7) ----
function assertDecisionComment(decision, comment) {
  if (decision === "rechazada" && !String(comment || "").trim()) {
    fail(400, "TMS_SETTLEMENT_REJECTION_REQUIRES_COMMENT", "El rechazo exige una observacion.");
  }
}

// ---- Consolidacion de ingresos por vehiculo (vista torre de liquidacion) ----
// Agrupa las lineas de los paquetes por placa normalizada para exponer el ingreso que
// genera cada vehiculo. Es pura: recibe paquetes ya serializados (items con montos numericos).
// Los montos se acumulan en centavos enteros, jamas en float.
function consolidateByVehicle(packages = []) {
  const buckets = new Map();
  for (const pkg of packages) {
    for (const item of pkg.items || []) {
      const plate = String(item.vehicle_plate || "").trim();
      const key = normalizeMatch(plate) || "sin-placa";
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          vehicle_key: key,
          vehicle_plate: plate ? plate.toUpperCase() : "SIN PLACA",
          vehicle_type: null,
          line_count: 0,
          calculated_cents: 0,
          adjusted_cents: 0,
          approved_cents: 0,
          weight_kg: 0,
          volume_m3: 0,
          distance_km: 0,
          package_map: new Map(),
          guides: new Set(),
          lines: []
        };
        buckets.set(key, bucket);
      }
      if (!bucket.vehicle_type && item.vehicle_type) bucket.vehicle_type = item.vehicle_type;
      bucket.line_count += 1;
      const guideKey = normalizeMatch(item.guide_reference);
      if (guideKey) bucket.guides.add(guideKey);
      bucket.weight_kg += numberValue(item.weight_kg);
      bucket.volume_m3 += numberValue(item.volume_m3);
      bucket.distance_km += numberValue(item.distance_km);
      bucket.calculated_cents += cents(item.calculated_amount);
      bucket.adjusted_cents += cents(item.adjusted_amount);
      bucket.approved_cents += cents(item.approved_amount);
      if (!bucket.package_map.has(pkg.id)) {
        bucket.package_map.set(pkg.id, {
          id: pkg.id,
          code: pkg.code,
          carrier_name: pkg.carrier_name || null,
          status: pkg.status,
          period_code: pkg.period_code || pkg.period?.code || null
        });
      }
      bucket.lines.push({
        package_id: pkg.id,
        package_code: pkg.code,
        carrier_name: pkg.carrier_name || null,
        package_status: pkg.status,
        guide_reference: item.guide_reference || null,
        route_description: item.route_description || null,
        origin_name: item.origin_name || null,
        destination_city: item.destination_city || null,
        service_date: item.service_date || null,
        calculated_amount: fromCents(cents(item.calculated_amount)),
        adjusted_amount: fromCents(cents(item.adjusted_amount)),
        approved_amount: fromCents(cents(item.approved_amount))
      });
    }
  }
  return Array.from(buckets.values())
    .map((bucket) => ({
      vehicle_key: bucket.vehicle_key,
      vehicle_plate: bucket.vehicle_plate,
      vehicle_type: bucket.vehicle_type,
      line_count: bucket.line_count,
      guide_count: bucket.guides.size,
      weight_kg: round2(bucket.weight_kg),
      volume_m3: round2(bucket.volume_m3),
      distance_km: round2(bucket.distance_km),
      calculated_total: fromCents(bucket.calculated_cents),
      adjusted_total: fromCents(bucket.adjusted_cents),
      approved_total: fromCents(bucket.approved_cents),
      packages: Array.from(bucket.package_map.values()),
      lines: bucket.lines
    }))
    .sort((a, b) => b.adjusted_total - a.adjusted_total || a.vehicle_plate.localeCompare(b.vehicle_plate));
}

module.exports = {
  RESERVED_TYPE_CODES,
  PACKAGE_STATUS,
  PACKAGE_TRANSITIONS,
  EDITABLE_STATUSES,
  CLOSED_STATUSES,
  ISSUE_STATUS,
  OPEN_ISSUE_STATUSES,
  SettlementError,
  fail,
  numberValue,
  cents,
  fromCents,
  round2,
  normalizeMatch,
  toDate,
  assertVersionMatch,
  assertPackageTransition,
  isEditable,
  assertEditable,
  isClosed,
  carrierEligibility,
  assertCarrierEligible,
  documentaryEligibility,
  detectDuplicateGuides,
  rateIsValidOn,
  rateMatchesContext,
  resolveRate,
  calculateItemAmount,
  computeTotals,
  openBlockingIssues,
  assertNoOpenBlockingIssues,
  assertSegregation,
  accountingIdempotencyKey,
  assertAccountingAllowed,
  assertDecisionComment,
  consolidateByVehicle
};
