const prisma = require("../../core/prisma");
const { Prisma } = require("@prisma/client");
const { randomUUID } = require("crypto");
const { getTenantConfig, invalidateTenantCache } = require("../../core/tenantCache");
const { MAX_EVIDENCE_BYTES, assertSafeFile, normalizeFileName, secureStoragePath } = require("../../security/policy");
const { buildRouteEventSummaries } = require("./routeEventSummaries");
const { normalizePunchType, processWorkday } = require("./timeLogic");
const hrPolicy = require("./policy");
const { resolveTenantEmployeeOrganization, organizationTreeFromConfig } = require("./organization");
const { resolveExplicitParty, partyCommonFields, partyMatchesSearch, compactTaxId, normalizeTaxId } = require("./laborEntityPartyMatcher");

const DEFAULT_PARAMS = {
  ordinary_hours_day: 8,
  lunch_minutes: 60,
  night_start: "21:00",
  night_end: "06:00"
};

const DEFAULT_PAYROLL_CONFIG = {
  parameters: {
    country: "CO",
    ordinary_hours_day: 8,
    ordinary_hours_week: 42,
    night_start: "19:00",
    night_end: "06:00",
    health_employee_percent: 4,
    pension_employee_percent: 4,
    health_employer_percent: 8.5,
    pension_employer_percent: 12,
    transport_allowance_enabled: true,
    transport_allowance_payment: "ambas",
    arl_default_percent: 0.522
  },
  overtime_rates: [
    { code: "HORA_DIURNA", name: "Hora ordinaria diurna", percent: 0, multiplier: 1, starts_at: "06:00", ends_at: "19:00", active: true },
    { code: "RECARGO_NOCTURNO", name: "Recargo nocturno ordinario", percent: 35, multiplier: 1.35, starts_at: "19:00", ends_at: "06:00", active: true },
    { code: "HED", name: "Hora extra diurna", percent: 25, multiplier: 1.25, active: true },
    { code: "HEN", name: "Hora extra nocturna", percent: 75, multiplier: 1.75, active: true },
    { code: "DOM_FEST_2026_H1", name: "Dominical/festivo hasta junio 2026", percent: 80, multiplier: 1.8, active: true },
    { code: "DOM_FEST_2026_H2", name: "Dominical/festivo desde julio 2026", percent: 90, multiplier: 1.9, active: true },
    { code: "HEDD", name: "Hora extra diurna dominical/festiva", percent: 105, multiplier: 2.05, active: true },
    { code: "HEND", name: "Hora extra nocturna dominical/festiva", percent: 155, multiplier: 2.55, active: true }
  ],
  concepts: [
    { code: "SALARIO_BASICO", name: "Salario basico", type: "earning", basis: "salary", account_code: "", active: true },
    { code: "AUX_TRANSPORTE", name: "Auxilio de transporte", type: "earning", basis: "transport_allowance", account_code: "", active: true },
    { code: "HORA_DIURNA", name: "Hora diurna", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "RECARGO_NOCTURNO", name: "Recargo nocturno", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "HED", name: "Hora extra diurna", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "HEN", name: "Hora extra nocturna", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "DOM_FEST", name: "Dominical / festivo", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "DED_SALUD", name: "Deduccion salud empleado", type: "deduction", basis: "ibc", account_code: "", active: true },
    { code: "DED_PENSION", name: "Deduccion pension empleado", type: "deduction", basis: "ibc", account_code: "", active: true },
    { code: "APORTE_SALUD", name: "Aporte salud empleador", type: "employer_cost", basis: "ibc", account_code: "", active: true },
    { code: "APORTE_PENSION", name: "Aporte pension empleador", type: "employer_cost", basis: "ibc", account_code: "", active: true },
    { code: "APORTE_ARL", name: "Aporte ARL", type: "employer_cost", basis: "ibc", account_code: "", active: true },
    { code: "CAJA_COMPENSACION", name: "Caja de compensacion", type: "employer_cost", basis: "ibc", account_code: "", active: true }
  ]
};

const OPERATING_TIMEZONE = "America/Bogota";
const OPERATING_OFFSET = "-05:00";

function startOfDay(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00${OPERATING_OFFSET}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value)).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00${OPERATING_OFFSET}`);
}

function endOfDay(value = new Date()) {
  const date = startOfDay(value);
  return new Date(date.getTime() + 86400000);
}

function boundedReportRange(query = {}, { defaultToday = true, maxDays = 92 } = {}) {
  const fromValue = query.fecha_inicio || query.from || query.date || query.fecha;
  const toValue = query.fecha_fin || query.to || query.date || query.fecha;
  if (!fromValue && !toValue && !defaultToday) return null;
  const start = startOfDay(fromValue || toValue || new Date());
  const end = endOfDay(toValue || fromValue || new Date());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw validationError("El rango de fechas no es valido.", 400, "INVALID_REPORT_DATE_RANGE");
  }
  if (end <= start) throw validationError("La fecha final debe ser igual o posterior a la inicial.", 400, "INVALID_REPORT_DATE_RANGE");
  if ((end.getTime() - start.getTime()) / 86400000 > maxDays) {
    throw validationError(`El rango maximo permitido es de ${maxDays} dias.`, 400, "REPORT_DATE_RANGE_TOO_LARGE");
  }
  return { start, end };
}

function timeString(date) {
  return new Intl.DateTimeFormat("es-CO", { timeZone: OPERATING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

function minutesFromTime(value) {
  return hrPolicy.minutesFromTime(value);
}

function validationError(message, statusCode = 400, code = "VALIDATION_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeExtraEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const base64 = String(value.base64 || value.base64_data || "").trim();
  if (!base64) return null;
  return {
    base64,
    name: value.name || value.file_name || "",
    type: value.type || value.mime_type || "image/jpeg",
    size: value.size || value.file_size || null
  };
}

const monitorEvidenceSelect = {
  id: true,
  evidence_type: true,
  file_name: true,
  mime_type: true,
  file_size: true,
  storage_path: true,
  metadata: true
};

function monitorEvidenceSummary(evidence = {}, context = {}) {
  const base64 = evidence.base64_data || evidence.base64 || "";
  const fileUrl = evidence.file_url || evidence.url || evidence.metadata?.file_url || "";
  const fileName = evidence.file_name || evidence.name || "";
  const evidenceId = evidence.id || context.id;
  const available = Boolean(base64 || fileUrl || fileName || evidence.storage_path || evidenceId);
  if (!available) return {};
  return {
    ...(evidenceId ? { id: evidenceId } : {}),
    ...(context.source ? { source: context.source } : {}),
    ...(evidence.evidence_type ? { evidence_type: evidence.evidence_type } : {}),
    ...(fileName ? { file_name: fileName } : {}),
    ...(fileUrl ? { file_url: fileUrl } : {}),
    ...(evidence.mime_type || evidence.type ? { mime_type: evidence.mime_type || evidence.type } : {}),
    ...(evidence.file_size || evidence.size ? { file_size: evidence.file_size || evidence.size } : {}),
    ...(evidence.storage_path ? { storage_path: evidence.storage_path } : {}),
    has_base64_data: Boolean(base64),
    available
  };
}

function monitorEvidencePayload(evidence = {}) {
  const summary = monitorEvidenceSummary(evidence);
  const base64 = String(evidence.base64_data || evidence.base64 || "").trim();
  return {
    ...summary,
    ...(base64 ? { base64_data: base64 } : {})
  };
}

async function getMonitorEvidence(tenantId, source, id) {
  const evidenceId = optionalNumericId(id);
  if (!evidenceId || !["activity", "punch"].includes(String(source))) {
    throw validationError("Evidencia de monitor invalida.", 400, "EVIDENCIA_MONITOR_INVALIDA");
  }
  return prisma.runWithTenant(tenantId, async () => {
    let evidence;
    if (source === "activity") {
      evidence = await prisma.activityEvidence.findFirst({
        where: { id: evidenceId, tenant_id: tenantId, activity: { tenant_id: tenantId } }
      });
    } else {
      const punch = await prisma.timePunch.findFirst({ where: { id: evidenceId, tenant_id: tenantId } });
      evidence = punch?.extra_evidence || punch?.metadata?.extra_evidence || null;
    }
    const payload = monitorEvidencePayload(evidence || {});
    if (!payload.base64_data && !payload.file_url) {
      throw validationError("La evidencia solicitada no existe o no contiene un archivo disponible.", 404, "EVIDENCIA_MONITOR_NO_ENCONTRADA");
    }
    return { ...payload, id: evidenceId, source };
  });
}

async function getMonitorEvidenceBatch(tenantId, routeId) {
  const routeNumericId = optionalNumericId(routeId);
  if (!routeNumericId) {
    throw validationError("Identificador de ruta invalido para las evidencias del monitor.", 400, "EVIDENCIA_MONITOR_RUTA_INVALIDA");
  }
  return prisma.runWithTenant(tenantId, async () => {
    const [punches, activities] = await Promise.all([
      prisma.timePunch.findMany({
        where: { route_id: routeNumericId, tenant_id: tenantId },
        orderBy: { punched_at: "asc" }
      }),
      prisma.workActivity.findMany({
        where: { route_id: routeNumericId, tenant_id: tenantId },
        include: { evidence: true },
        orderBy: { occurred_at: "asc" }
      })
    ]);
    const punchEvidence = {};
    for (const punch of punches) {
      const source = punch.extra_evidence || punch.metadata?.extra_evidence || {};
      punchEvidence[String(punch.id)] = { ...monitorEvidencePayload(source), id: punch.id, source: "punch" };
    }
    const activityEvidence = {};
    for (const activity of activities) {
      activityEvidence[String(activity.id)] = (activity.evidence || []).map((evidence) => ({ ...monitorEvidencePayload(evidence), id: evidence.id, source: "activity" }));
    }
    return {
      route_id: routeNumericId,
      generated_at: new Date().toISOString(),
      punch_evidence: punchEvidence,
      activity_evidence: activityEvidence,
      counts: {
        punches: punches.length,
        punch_evidence: Object.values(punchEvidence).filter((payload) => payload.base64_data || payload.file_url).length,
        activities: activities.length,
        activity_evidence: Object.values(activityEvidence).reduce((sum, items) => sum + items.filter((item) => item.base64_data || item.file_url).length, 0)
      }
    };
  });
}

function employeeDisplayName(employee) {
  const metadataName = String(employee?.metadata?.name || "").trim();
  const genericMetadata = isGenericEmployeeAlias(metadataName);
  return (!genericMetadata && metadataName) || employee?.user?.name || employee?.code || metadataName || "";
}

function isGenericEmployeeAlias(value) {
  return /^(usuario[-\s]\d+|usr-\d+)$/i.test(String(value || "").trim());
}

function employeeUserName(employee, fallback = "") {
  const code = String(employee?.code || "").trim();
  const metadataName = String(employee?.metadata?.name || "").trim();
  const safeFallback = !isGenericEmployeeAlias(fallback) ? fallback : "";
  return (!isGenericEmployeeAlias(code) && code)
    || (!isGenericEmployeeAlias(metadataName) && metadataName)
    || employee?.user?.name
    || safeFallback
    || employee?.user?.email
    || employeeDisplayName(employee)
    || code
    || "";
}

function aliasesForEmployee(employee) {
  const metadataAliases = Array.isArray(employee?.metadata?.identity_aliases) ? employee.metadata.identity_aliases : [];
  return Array.from(new Set([
    employee?.id,
    employee?.code,
    employee?.metadata?.name,
    employee?.metadata?.document,
    employee?.metadata?.employee_code,
    employee?.metadata?.employee_name,
    employee?.metadata?.supplied_user_name,
    employee?.metadata?.supabase_employee_id,
    employee?.metadata?.supabase_user_id,
    employee?.user?.name,
    employee?.user?.email,
    ...metadataAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function aliasesForOperationalRow(row) {
  const metadataAliases = Array.isArray(row?.metadata?.identity_aliases) ? row.metadata.identity_aliases : [];
  return Array.from(new Set([
    row?.employee_id,
    row?.user_name,
    row?.metadata?.employee_code,
    row?.metadata?.employee_name,
    row?.metadata?.supplied_user_name,
    row?.metadata?.user_email,
    ...metadataAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function inputIdentityAliases(input = {}) {
  const metadataAliases = Array.isArray(input.metadata?.identity_aliases) ? input.metadata.identity_aliases : [];
  return Array.from(new Set([
    input.user_name,
    input.employee_id,
    input.metadata?.supplied_user_name,
    input.metadata?.employee_code,
    input.metadata?.employee_name,
    input.metadata?.user_email,
    ...metadataAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function operationalRouteKey(row) {
  return String(row?.route_id || row?.metadata?.display_route_id || row?.metadata?.legacy_route_id || "").trim();
}

function displayNameForOperationalRow(row, fallback = "") {
  const metadataName = String(row?.metadata?.employee_name || row?.metadata?.name || "").trim();
  const supplied = String(row?.metadata?.supplied_user_name || "").trim();
  const userName = String(row?.user_name || "").trim();
  return (!isGenericEmployeeAlias(metadataName) && metadataName)
    || (!isGenericEmployeeAlias(supplied) && supplied)
    || (!isGenericEmployeeAlias(userName) && userName)
    || fallback
    || userName;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function numericId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function optionalNumericId(value) {
  return value == null || value === "" ? null : numericId(value);
}

function operationalRouteNumericId(input = {}) {
  return optionalNumericId(input.route_id)
    || optionalNumericId(input.metadata?.display_route_id)
    || optionalNumericId(input.metadata?.route_code)
    || optionalNumericId(input.metadata?.legacy_route_id);
}

function routeEventMetadata(input = {}, routeId = null) {
  const metadata = input.metadata || {};
  const displayRouteId = metadata.display_route_id || metadata.route_code || input.route_id || routeId || "";
  return {
    ...metadata,
    display_route_id: displayRouteId ? String(displayRouteId) : "",
    route_code: metadata.route_code ? String(metadata.route_code) : (displayRouteId ? String(displayRouteId) : ""),
    source_route_id: metadata.source_route_id ? String(metadata.source_route_id) : "",
    legacy_route_id: metadata.legacy_route_id ? String(metadata.legacy_route_id) : ""
  };
}

const ROUTE_TRACKING_PREFIX = "Control de marcacion:";

const GPS_UNAVAILABLE_NOVELTY_CODE = "GPS_INACTIVO_SIN_SENAL";

// El operario marca sin senal: la marcacion se acepta con su hora real y se deja la
// novedad para que el supervisor sepa que no existe traza GPS que validar.
function gpsUnavailableFromInput(input = {}) {
  const flag = input.metadata?.gps_unavailable ?? input.gps_unavailable;
  if (flag !== true && flag !== "true") return null;
  return {
    reason: String(input.metadata?.gps_unavailable_reason || input.gps_unavailable_reason || "sin_senal").slice(0, 120),
    queued_at: String(input.metadata?.queued_at || "").slice(0, 40)
  };
}

async function recordHrNovelty(tx, { tenantId, employeeId, routeId, moment, segment, typeCode, catalog, requiresReview, metadata }) {
  const at = moment instanceof Date && !Number.isNaN(moment.getTime()) ? moment : new Date();
  const day = startOfDay(at);
  if (catalog) {
    // Los tenants creados despues de la migracion de sembrado no tienen el catalogo de
    // tipos; se asegura aqui para que la novedad sea clasificable en cualquier tenant.
    await tx.$executeRaw`
      INSERT INTO th_tipos_novedad (tenant_id, code, name, description, category, severity, origin, requires_justification, requires_approval, affects_payroll)
      SELECT ${tenantId}, ${catalog.code}, ${catalog.name}, ${catalog.description}, ${catalog.category}, ${catalog.severity}, 'automatico', false, false, false
      WHERE NOT EXISTS (
        SELECT 1 FROM th_tipos_novedad x WHERE x.tenant_id = ${tenantId} AND x.code = ${catalog.code}
      )
    `.catch(() => null);
  }
  await tx.$executeRaw`
    INSERT INTO th_novedades_jornada (
      tenant_id, logical_key, employee_id, route_id, date, type_code, status, origin, minutes, hours, requires_review, metadata
    )
    VALUES (
      ${tenantId},
      ${hrPolicy.noveltyLogicalKey({ tenantId, employeeId, date: day.toISOString().slice(0, 10), routeId, typeCode, segment: segment || "dia" })},
      ${employeeId}, ${routeId || null}, ${day}, ${typeCode}, 'pendiente', 'automatico', 0, 0, ${requiresReview === true},
      ${JSON.stringify(metadata || {})}::jsonb
    )
    ON CONFLICT (tenant_id, logical_key)
    DO UPDATE SET updated_at = now(), metadata = EXCLUDED.metadata
  `.catch(() => null);
}

const GPS_UNAVAILABLE_NOVELTY_CATALOG = {
  code: GPS_UNAVAILABLE_NOVELTY_CODE,
  name: "GPS inactivo por falta de senal",
  description: "El operario marco sin senal: la marcacion conserva su hora real pero no hay traza GPS que validar.",
  category: "gps",
  severity: "media"
};

async function recordGpsUnavailableNovelty(tx, { tenantId, employeeId, routeId, moment, segment, detail }) {
  const at = moment instanceof Date && !Number.isNaN(moment.getTime()) ? moment : new Date();
  await recordHrNovelty(tx, {
    tenantId,
    employeeId,
    routeId,
    moment: at,
    segment,
    typeCode: GPS_UNAVAILABLE_NOVELTY_CODE,
    catalog: GPS_UNAVAILABLE_NOVELTY_CATALOG,
    requiresReview: true,
    metadata: {
      reason: detail?.reason || "sin_senal",
      queued_at: detail?.queued_at || null,
      marked_at: at.toISOString(),
      source: "marcacion_sin_senal"
    }
  });
}

const MANUAL_ADJUSTMENT_NOVELTY_CODE = "AJUSTE_MANUAL_MARCACION";

// La ruta administrativa puede marcar en cualquier fecha; sin esta novedad esa
// correccion quedaba invisible para el supervisor.
async function recordManualAdjustmentNovelty(tx, { tenantId, employeeId, routeId, moment, segment, detail }) {
  const at = moment instanceof Date && !Number.isNaN(moment.getTime()) ? moment : new Date();
  await recordHrNovelty(tx, {
    tenantId,
    employeeId,
    routeId,
    moment: at,
    segment,
    typeCode: MANUAL_ADJUSTMENT_NOVELTY_CODE,
    catalog: null,
    requiresReview: true,
    metadata: {
      reason: String(detail?.reason || "").slice(0, 300),
      detail: String(detail?.detail || "").slice(0, 500),
      corrected_by: detail?.userId || null,
      marked_at: at.toISOString(),
      recorded_at: new Date().toISOString(),
      source: "correccion_administrativa"
    }
  });
}

// Algunas notas de horario quedaron guardadas con el escape literal "\n" en vez de saltos
// de linea reales; normalizar antes de parsear para no malinterpretar el modo de seguimiento.
function normalizeRouteNotes(notes = "") {
  return String(notes || "").replace(/\\n/g, "\n");
}

function routeGpsRequiredFromInput(input = {}) {
  return input.gps_required !== false && String(input.tracking_mode || "gps") !== "punch_only";
}

function routeGpsRequired(route = {}) {
  const notes = normalizeRouteNotes(route.notes);
  if (notes.split("\n").some((line) => line.trim() === `${ROUTE_TRACKING_PREFIX} punch_only`)) return false;
  return true;
}

function routeTrackingMode(route = {}) {
  return routeGpsRequired(route) ? "gps" : "punch_only";
}

function routeNotesWithTracking(notes = "", gpsRequired = true) {
  const visibleNotes = normalizeRouteNotes(notes).split("\n").filter((line) => !line.trim().startsWith(ROUTE_TRACKING_PREFIX)).join("\n").trim();
  const trackingLine = `${ROUTE_TRACKING_PREFIX} ${gpsRequired ? "gps" : "punch_only"}`;
  return [trackingLine, visibleNotes].filter(Boolean).join("\n");
}

function routeVisibleNotes(notes = "") {
  return normalizeRouteNotes(notes).split("\n").filter((line) => !line.trim().startsWith(ROUTE_TRACKING_PREFIX)).join("\n").trim();
}

function routeScopeWhere(routeId = null) {
  if (!routeId) return {};
  const routeKey = String(routeId);
  const routeNumericId = optionalNumericId(routeId);
  return {
    OR: [
      ...(routeNumericId ? [{ route_id: routeNumericId }] : []),
      { metadata: { path: ["display_route_id"], equals: routeKey } },
      { metadata: { path: ["route_code"], equals: routeKey } },
      { metadata: { path: ["legacy_route_id"], equals: routeKey } },
      { metadata: { path: ["source_route_id"], equals: routeKey } }
    ]
  };
}

function employeeType(employee) {
  return normalizeKey(employee?.user_type || employee?.position || employee?.metadata?.user_type || employee?.metadata?.classification);
}

function isDriver(employee) {
  return ["conductor", "driver", "chofer", "operador de ruta", "operador_ruta", "transportador"].includes(employeeType(employee));
}

function mergePayrollConfig(config = {}) {
  return {
    ...DEFAULT_PAYROLL_CONFIG,
    ...config,
    parameters: { ...DEFAULT_PAYROLL_CONFIG.parameters, ...(config.parameters || {}) },
    overtime_rates: Array.isArray(config.overtime_rates) && config.overtime_rates.length ? config.overtime_rates : DEFAULT_PAYROLL_CONFIG.overtime_rates,
    concepts: Array.isArray(config.concepts) && config.concepts.length ? config.concepts : DEFAULT_PAYROLL_CONFIG.concepts
  };
}

async function getPayrollConfig(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const config = await getTenantConfig(tenantId);
    return mergePayrollConfig(config.payroll || {});
  });
}

async function savePayrollConfig(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const config = await getTenantConfig(tenantId);
    const current = mergePayrollConfig(config.payroll || {});
    const next = mergePayrollConfig({
      ...current,
      ...(input || {}),
      parameters: { ...current.parameters, ...((input || {}).parameters || {}) },
      overtime_rates: Array.isArray(input?.overtime_rates) ? input.overtime_rates : current.overtime_rates,
      concepts: Array.isArray(input?.concepts) ? input.concepts : current.concepts
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { config: { ...config, payroll: next } } });
    return next;
  });
}

function punchStatus(type) {
  const labels = {
    entrada: "En ruta",
    inicio_almuerzo: "Almuerzo",
    fin_almuerzo: "Trabajando",
    salida: "Finalizo"
  };
  return labels[type] || "Sin iniciar";
}

const PREOP_TEMPLATE = [
  { section: "Documental", item_key: "soat_vigente", label: "SOAT vigente", severity: "critica", blocks_route: true, evidence_required: false },
  { section: "Documental", item_key: "tecnicomecanica_vigente", label: "Revision tecnico-mecanica vigente", severity: "critica", blocks_route: true, evidence_required: false },
  { section: "Documental", item_key: "licencia_conductor_vigente", label: "Licencia del conductor vigente", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Documental", item_key: "tarjeta_propiedad", label: "Licencia de transito / tarjeta disponible", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Exterior", item_key: "llantas_estado", label: "Llantas en buen estado", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Exterior", item_key: "placas_visibles", label: "Placas visibles y legibles", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Exterior", item_key: "sin_fugas_visibles", label: "Sin fugas visibles de aceite, combustible, refrigerante o aire", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Luces", item_key: "luces_freno", label: "Luces de freno funcionando", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Luces", item_key: "direccionales", label: "Direccionales funcionando", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Luces", item_key: "luces_delanteras_traseras", label: "Luces delanteras y traseras funcionando", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Seguridad", item_key: "frenos", label: "Frenos funcionando correctamente", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Seguridad", item_key: "direccion", label: "Direccion sin fallas", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Seguridad", item_key: "cinturon", label: "Cinturon de seguridad en buen estado", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Seguridad", item_key: "tablero_testigos", label: "Tablero sin testigos criticos encendidos", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Fluidos", item_key: "niveles_fluidos", label: "Aceite, refrigerante, frenos e hidraulico en nivel aceptable", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Emergencia", item_key: "extintor", label: "Extintor vigente y cargado", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Emergencia", item_key: "kit_carretera", label: "Botiquin, gato, cruceta, tacos y senalizacion disponibles", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Precargue", item_key: "zona_carga_segura", label: "Zona de carga segura y vehiculo apto para cargar", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Precargue", item_key: "carga_asegurada", label: "Carga distribuida, asegurada y sin sobrepeso aparente", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Conductor", item_key: "conductor_apto", label: "Conductor apto, sin fatiga extrema ni condicion insegura", severity: "critica", blocks_route: true, evidence_required: false },
  { section: "Conductor", item_key: "declaracion_responsable", label: "Acepta responsabilidad de inspeccion y no estar bajo efectos de alcohol o sustancias", severity: "critica", blocks_route: true, evidence_required: false }
];

const DEFAULT_ACTIVITY_TYPES = [
  "Cargue de mercancia en bodega",
  "Inicio de ruta",
  "Entrega en tienda",
  "Entrega en cliente",
  "Recogida de mercancia",
  "Devolucion de mercancia",
  "Novedad en ruta",
  "Vehiculo varado",
  "Espera en punto",
  "Reintento de entrega",
  "Finalizacion de ruta",
  "Apoyo operativo"
];

const safeUserSelect = { id: true, name: true, email: true };

function getPreoperationalTemplate() {
  return { sections: Array.from(new Set(PREOP_TEMPLATE.map((item) => item.section))), items: PREOP_TEMPLATE };
}

function routeElapsedMinutes(route, latestPunch) {
  if (latestPunch?.type === "salida") return null;
  const start = latestPunch?.type ? minutesFromTime(latestPunch.time) : minutesFromTime(route.start_time);
  if (start == null) return null;
  const now = new Date();
  return Math.max(0, now.getHours() * 60 + now.getMinutes() - start);
}

async function listSchedules(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.workSchedule.findMany({
    where: query.active == null ? {} : { active: query.active === "true" || query.active === true },
    orderBy: { name: "asc" }
  }));
}

async function createSchedule(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.workSchedule.create({
    data: {
      name: input.name,
      start_time: input.start_time,
      end_time: input.end_time,
      lunch_start_time: input.lunch_start_time || "",
      lunch_end_time: input.lunch_end_time || "",
      workable_days: input.workable_days || [0, 1, 2, 3, 4],
      active: input.active !== false
    }
  }));
}

async function updateSchedule(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.workSchedule.update({
    where: { id: Number(id) },
    data: {
      name: input.name,
      start_time: input.start_time,
      end_time: input.end_time,
      lunch_start_time: input.lunch_start_time || "",
      lunch_end_time: input.lunch_end_time || "",
      workable_days: input.workable_days || [0, 1, 2, 3, 4],
      active: input.active !== false
    }
  }));
}

async function listRoutes(tenantId, query = {}) {
  const range = boundedReportRange(query, { defaultToday: false });
  // Tope gobernado: sin rango el listado general puede pedir hasta 500 filas explicitas
  // (query.limit); el frontend compara rows.length contra el limite para avisar truncamiento.
  const limit = Math.min(Math.max(Number(query.limit) || (range ? 500 : 100), 50), 500);
  return prisma.runWithTenant(tenantId, async () => {
    const [rows, employees] = await Promise.all([
      prisma.timeRoute.findMany({
        where: range ? { date: { gte: range.start, lt: range.end } } : {},
        orderBy: { date: "desc" },
        take: limit
      }),
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 500 })
    ]);
    const employeeByAlias = new Map();
    for (const employee of employees) {
      for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
    }
    const resolveAssignedEmployee = (value) => employeeByAlias.get(normalizeKey(value));
    return rows.map((route) => ({
      ...route,
      employee_ids: (Array.isArray(route.employees) ? route.employees : []).map((value) => String(resolveAssignedEmployee(value)?.id || value)),
      employee_names: (Array.isArray(route.employees) ? route.employees : []).map((value) => employeeDisplayName(resolveAssignedEmployee(value)) || String(value)),
      placa: route.vehicle_plate,
      equipo: route.employees,
      h_inicio: route.start_time,
      h_fin: route.end_time,
      viaticos: route.per_diem,
      tolerancia_minutos: route.tolerance_minutes,
      notes: routeVisibleNotes(route.notes),
      gps_required: routeGpsRequired(route),
      tracking_mode: routeTrackingMode(route),
      metadata: { gps_required: routeGpsRequired(route), tracking_mode: routeTrackingMode(route) }
    }));
  });
}

function routeAssignedToEmployee(route, employee) {
  if (!route || !employee) return false;
  const aliases = new Set(aliasesForEmployee(employee).map(normalizeKey));
  return (Array.isArray(route.employees) ? route.employees : [])
    .some((value) => aliases.has(normalizeKey(value)));
}

function routeIsOperational(route) {
  return !["closed", "cerrada", "completed", "completada", "cancelled", "cancelada", "inactive", "inactiva"]
    .includes(String(route?.status || "active").trim().toLowerCase());
}

async function resolveOwnRouteForToday(tenantId, employee) {
  const dayStart = startOfDay();
  const dayEnd = endOfDay(dayStart);
  const routes = (await listRoutes(tenantId, { date: dayStart.toISOString().slice(0, 10) }))
    .filter((route) => routeIsOperational(route) && routeAssignedToEmployee(route, employee))
    .sort((left, right) => Number(right.id) - Number(left.id));
  if (routes.length <= 1) return routes[0] || null;

  const routeIds = routes.map((route) => Number(route.id));
  const [activeSession, latestPunch] = await prisma.runWithTenant(tenantId, () => Promise.all([
    prisma.workSession.findFirst({
      where: {
        employee_id: employee.id,
        route_id: { in: routeIds },
        date: { gte: dayStart, lt: dayEnd },
        status: { in: ["activa", "active"] }
      },
      orderBy: { updated_at: "desc" },
      select: { route_id: true }
    }),
    prisma.timePunch.findFirst({
      where: {
        employee_id: employee.id,
        route_id: { in: routeIds },
        date: { gte: dayStart, lt: dayEnd }
      },
      orderBy: { punched_at: "desc" },
      select: { route_id: true }
    })
  ]));
  const selectedId = Number(activeSession?.route_id || latestPunch?.route_id || routes[0].id);
  return routes.find((route) => Number(route.id) === selectedId) || routes[0];
}

// Una marcacion encolada sin senal llega despues de su instante real y puede cruzar
// medianoche antes de sincronizarse. La regla del dia se evalua contra el timestamp
// declarado por el cliente, acotado por esta ventana para que no sirva de coladero
// para marcar en dias arbitrarios. El default cubre el caso real: el operario pierde
// senal durante la jornada y sincroniza a la manana siguiente.
const DEFERRED_MARKING_MAX_AGE_HOURS = Math.max(1, Math.min(Number(process.env.HR_DEFERRED_MARKING_MAX_AGE_HOURS || 24), 72));
const DEFERRED_MARKING_FUTURE_TOLERANCE_MINUTES = 15;

function markingReferenceMoment(input = {}) {
  const raw = input.punched_at || input.occurred_at || input.recorded_at || input.captured_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function assertDeferredMarkingWindow(moment, now) {
  const futureLimit = now.getTime() + DEFERRED_MARKING_FUTURE_TOLERANCE_MINUTES * 60000;
  if (moment.getTime() > futureLimit) {
    const err = new Error("La marcacion tiene una fecha y hora posteriores al momento actual.");
    err.statusCode = 409;
    err.code = "MARCACION_EN_EL_FUTURO";
    err.details = { marked_at: moment.toISOString(), now: now.toISOString() };
    throw err;
  }
  const ageHours = (now.getTime() - moment.getTime()) / 3600000;
  if (ageHours > DEFERRED_MARKING_MAX_AGE_HOURS) {
    const err = new Error(`La marcacion diferida supero las ${DEFERRED_MARKING_MAX_AGE_HOURS} horas permitidas y debe corregirla un administrador.`);
    err.statusCode = 409;
    err.code = "MARCACION_DIFERIDA_EXPIRADA";
    err.details = { marked_at: moment.toISOString(), now: now.toISOString(), max_age_hours: DEFERRED_MARKING_MAX_AGE_HOURS };
    throw err;
  }
}

async function assertOwnAssignedRoute(tenantId, employee, input = {}) {
  const routeId = operationalRouteNumericId(input);
  if (!routeId) return null;
  const route = await prisma.timeRoute.findFirst({ where: { tenant_id: tenantId, id: routeId } });
  if (!route || !routeAssignedToEmployee(route, employee)) {
    const err = new Error("El horario indicado no esta asignado al empleado conectado.");
    err.statusCode = 403;
    err.code = "HORARIO_AJENO_DENEGADO";
    throw err;
  }
  const now = new Date();
  const deferredMoment = markingReferenceMoment(input);
  if (deferredMoment) assertDeferredMarkingWindow(deferredMoment, now);
  const activeRoute = await resolveOwnRouteForToday(tenantId, employee);
  const today = startOfDay(now).toISOString().slice(0, 10);
  const expectedDay = startOfDay(deferredMoment || now).toISOString().slice(0, 10);
  const routeDate = startOfDay(route.date).toISOString().slice(0, 10);
  if (routeDate !== expectedDay) {
    const err = new Error("Solo puedes operar el horario asignado para el dia de la marcacion.");
    err.statusCode = 409;
    err.code = "HORARIO_FUERA_DEL_DIA";
    err.details = { route_date: routeDate, expected_day: expectedDay, today, active_route_id: activeRoute ? Number(activeRoute.id) : null };
    throw err;
  }
  // El horario activo solo tiene sentido cuando se marca el dia en curso; una marcacion
  // diferida de un dia anterior ya cerrado se valida contra la ruta de ese dia.
  if (expectedDay === today && (!activeRoute || Number(activeRoute.id) !== Number(route.id))) {
    const err = new Error("Este horario no es el horario activo del empleado para hoy.");
    err.statusCode = 409;
    err.code = "HORARIO_NO_ACTIVO";
    err.details = { route_date: routeDate, expected_day: expectedDay, today, active_route_id: activeRoute ? Number(activeRoute.id) : null };
    throw err;
  }
  return route;
}

async function listOwnRoutes(tenantId, user) {
  const employee = await getCurrentEmployee(tenantId, user);
  const route = await resolveOwnRouteForToday(tenantId, employee);
  return route ? [route] : [];
}

async function listRouteEventSummaries(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const SUMMARY_LIMIT = 100;
    const [summaryRows, employees] = await Promise.all([
      prisma.timeRoute.findMany({
        select: { id: true, date: true, employees: true },
        orderBy: { date: "desc" },
        take: SUMMARY_LIMIT + 1
      }),
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 500 })
    ]);
    // Senal explicita de truncamiento: sin ella la pantalla muestra 100 rutas como si
    // fueran todas. Se consulta limite+1 solo para detectar el desborde.
    const summaryTruncated = summaryRows.length > SUMMARY_LIMIT;
    const routes = summaryTruncated ? summaryRows.slice(0, SUMMARY_LIMIT) : summaryRows;
    const truncation = {
      truncated: summaryTruncated,
      limit: SUMMARY_LIMIT,
      returned: routes.length,
      hint: summaryTruncated
        ? "El resumen cubre las 100 rutas mas recientes; acota el rango de fechas en el listado de horarios para revisar rutas antiguas."
        : ""
    };
    const routeIds = routes.map((route) => route.id);
    if (!routeIds.length) return { generated_at: new Date().toISOString(), routes: [], truncation };

    const employeeByAlias = new Map();
    for (const employee of employees) {
      for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
    }
    const routeContexts = routes.map((route) => ({
      route_id: route.id,
      date: route.date,
      assigned_aliases: Array.from(new Set((Array.isArray(route.employees) ? route.employees : []).flatMap((value) => {
        const employee = employeeByAlias.get(normalizeKey(value));
        return [value, ...(employee ? aliasesForEmployee(employee) : [])];
      }).map(normalizeKey).filter(Boolean)))
    }));
    const dateWindows = Array.from(new Set(routes.map((route) => startOfDay(route.date).toISOString()))).map((value) => {
      const from = new Date(value);
      return { gte: from, lt: endOfDay(from) };
    });

    const [punchGroups, activityGroups, closedGroups, evidenceRows, punchEvidenceRows, unlinkedPunches, unlinkedActivities] = await Promise.all([
      prisma.timePunch.groupBy({
        by: ["route_id"],
        where: { route_id: { in: routeIds } },
        _count: { _all: true },
        _max: { punched_at: true }
      }),
      prisma.workActivity.groupBy({
        by: ["route_id"],
        where: { route_id: { in: routeIds } },
        _count: { _all: true },
        _max: { occurred_at: true }
      }),
      prisma.timePunch.groupBy({
        by: ["route_id"],
        where: { route_id: { in: routeIds }, type: "salida" },
        _count: { _all: true }
      }),
      prisma.activityEvidence.findMany({
        where: { activity: { route_id: { in: routeIds } } },
        select: { activity: { select: { route_id: true } } }
      }),
      prisma.timePunch.findMany({
        where: { route_id: { in: routeIds } },
        select: { route_id: true, extra_evidence: true }
      }),
      prisma.timePunch.findMany({
        where: { route_id: null, OR: dateWindows.map((date) => ({ date })) },
        select: { employee_id: true, user_name: true, type: true, punched_at: true, date: true, metadata: true },
        orderBy: { punched_at: "desc" },
        take: 2000
      }),
      prisma.workActivity.findMany({
        where: { route_id: null, OR: dateWindows.map((occurred_at) => ({ occurred_at })) },
        select: { employee_id: true, user_name: true, occurred_at: true, metadata: true, _count: { select: { evidence: true } } },
        orderBy: { occurred_at: "desc" },
        take: 2000
      })
    ]);

    return {
      generated_at: new Date().toISOString(),
      routes: buildRouteEventSummaries({ routeContexts, punchGroups, activityGroups, closedGroups, evidenceRows, punchEvidenceRows, unlinkedPunches, unlinkedActivities }),
      truncation
    };
  });
}

async function listEmployees(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.employee.findMany({
    where: {
      ...(query.position ? { position: query.position } : {}),
      ...(query.active == null ? {} : { active: query.active === "true" || query.active === true })
    },
    include: { user: { select: safeUserSelect } },
    orderBy: { id: "desc" },
    take: 500
  }));
}

async function listEmployeeOrganizationOptions(tenantId) {
  const config = await getTenantConfig(tenantId);
  const tree = organizationTreeFromConfig(config);
  return {
    societies: tree.societies.filter((row) => row && row.active !== false),
    branches: tree.branches.filter((row) => row && row.active !== false),
    cost_centers: tree.cost_centers.filter((row) => row && row.active !== false)
  };
}

function normalizeContractType(value) {
  const raw = String(value || "").trim();
  if (raw === "obra_labor" || raw === "fixed" || raw === "indefinite") return raw;
  if (raw === "service" || raw === "temporary") return raw;
  return "indefinite";
}

function validateEmployeeLaborInput(input = {}, current = {}) {
  const contractType = normalizeContractType(input.contract_type ?? current.contract_type);
  const endDate = input.end_date === undefined ? current.end_date : input.end_date;
  const salary = input.salary_base === undefined ? current.salary_base : Number(input.salary_base || 0);
  if (contractType === "fixed" && !endDate) {
    throw validationError("La fecha de vencimiento del contrato es obligatoria para termino fijo.", 422, "FECHA_FIN_CONTRATO_REQUERIDA");
  }
  if (input.hire_date && endDate && new Date(endDate) < new Date(input.hire_date)) {
    throw validationError("La fecha fin de contrato no puede ser anterior a la fecha de ingreso.", 422, "FECHA_FIN_CONTRATO_INVALIDA");
  }
  if (salary < 0 || !Number.isFinite(salary)) {
    throw validationError("El salario mensual debe ser un valor positivo.", 422, "SALARIO_INVALIDO");
  }
}

function employeeCodeFromDocument(input = {}) {
  const document = normalizeDocument(input.document);
  if (document) return `EMP-${document}`;
  return `EMP-${Date.now()}`;
}

async function assertEmployeeDocumentAvailable(tx, tenantId, input = {}, currentId = null) {
  const document = normalizeDocument(input.document);
  if (!document) throw validationError("El numero de documento del empleado es obligatorio.", 422, "DOCUMENTO_EMPLEADO_REQUERIDO");
  const documentType = String(input.document_type || "DOC").trim().toUpperCase();
  const rows = await tx.$queryRaw`
    SELECT id, code, metadata->>'name' AS name
    FROM "Employee"
    WHERE tenant_id = ${tenantId}
      AND id <> ${Number(currentId || 0)}
      AND regexp_replace(COALESCE(metadata->>'document', ''), '[^0-9A-Za-z]', '', 'g') = ${document}
      AND UPPER(COALESCE(metadata->>'document_type', 'DOC')) = ${documentType}
    LIMIT 1
  `;
  if (rows.length) {
    throw validationError("Ya existe un empleado con ese tipo y numero de documento.", 409, "DOCUMENTO_EMPLEADO_DUPLICADO", { employee_id: rows[0].id, employee_code: rows[0].code });
  }
}

async function syncEmployeeSalaryHistory(tx, tenantId, employeeId, input = {}, actorId = null) {
  if (input.salary_base === undefined) return;
  const salary = Number(input.salary_base || 0);
  if (!(salary > 0)) return;
  const validFrom = input.hire_date ? new Date(input.hire_date) : new Date();
  const reason = input.salary_reason || "Actualizacion maestro empleado";
  await tx.$executeRaw`
    UPDATE th_empleado_salarios
    SET valid_to = (${validFrom}::date - INTERVAL '1 day')::date
    WHERE tenant_id = ${tenantId}
      AND employee_id = ${employeeId}
      AND (valid_to IS NULL OR valid_to >= ${validFrom}::date)
      AND valid_from < ${validFrom}::date
  `;
  const existing = await tx.$queryRaw`
    SELECT id FROM th_empleado_salarios
    WHERE tenant_id = ${tenantId}
      AND employee_id = ${employeeId}
      AND valid_from = ${validFrom}::date
    LIMIT 1
  `;
  if (existing.length) {
    await tx.$executeRaw`
      UPDATE th_empleado_salarios
      SET monthly_salary = ${salary}, currency = ${input.currency || "COP"}, reason = ${reason}, created_by = ${actorId}
      WHERE tenant_id = ${tenantId} AND id = ${existing[0].id}
    `;
    return;
  }
  await tx.$executeRaw`
    INSERT INTO th_empleado_salarios (tenant_id, employee_id, monthly_salary, currency, valid_from, valid_to, reason, created_by)
    VALUES (${tenantId}, ${employeeId}, ${salary}, ${input.currency || "COP"}, ${validFrom}::date, NULL, ${reason}, ${actorId})
  `;
}

function employeeContractPayload(input = {}, employee = {}) {
  const metadata = employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {};
  const accounting = metadata.accounting && typeof metadata.accounting === "object" ? metadata.accounting : {};
  return {
    contract_type: normalizeContractType(input.contract_type || employee.contract_type),
    valid_from: dateOnly(input.valid_from || input.hire_date || employee.hire_date || new Date()),
    valid_to: input.end_date || input.valid_to ? dateOnly(input.end_date || input.valid_to) : null,
    salary_base: Number(input.salary_base ?? employee.salary_base ?? 0),
    cost_center: input.cost_center ?? metadata.cost_center ?? "",
    society_code: input.society_code ?? accounting.society_code ?? metadata.society_code ?? null,
    branch_code: input.branch_code ?? accounting.branch_code ?? metadata.branch_code ?? null,
    cost_center_code: input.cost_center_code ?? accounting.cost_center_code ?? metadata.cost_center_code ?? input.cost_center ?? metadata.cost_center ?? null
  };
}

async function syncEmployeeFromContract(tx, employee, contract) {
  const metadata = employee?.metadata && typeof employee.metadata === "object" ? employee.metadata : {};
  const accounting = {
    ...(metadata.accounting && typeof metadata.accounting === "object" ? metadata.accounting : {}),
    society_code: contract.society_code || null,
    branch_code: contract.branch_code || null,
    cost_center_code: contract.cost_center_code || null
  };
  return tx.employee.update({
    where: { id: employee.id },
    data: {
      ...(contract.contract_type ? { contract_type: contract.contract_type } : {}),
      ...(contract.salary_base != null ? { salary_base: contract.salary_base } : {}),
      ...(contract.valid_to !== undefined ? { end_date: contract.valid_to ? new Date(contract.valid_to) : null } : {}),
      metadata: {
        ...metadata,
        cost_center: contract.cost_center || contract.cost_center_code || metadata.cost_center || "",
        branch_code: contract.branch_code || metadata.branch_code || "",
        society_code: contract.society_code || metadata.society_code || "",
        cost_center_code: contract.cost_center_code || metadata.cost_center_code || "",
        labor_status: contract.status === "activo" ? "activo" : (metadata.labor_status || "activo"),
        accounting
      }
    }
  });
}

async function ensureEmployeeContractFoundation(tx, tenantId, employee, user = {}) {
  const existing = await tx.$queryRaw`
    SELECT *
    FROM th_empleado_contratos
    WHERE tenant_id = ${tenantId} AND employee_id = ${employee.id}
    ORDER BY valid_from DESC, id DESC
    LIMIT 1
  `;
  if (existing[0]) return existing[0];
  const payload = employeeContractPayload({}, employee);
  const continuityGroupId = randomUUID();
  const rows = await tx.$queryRaw`
    INSERT INTO th_empleado_contratos (
      tenant_id, employee_id, continuity_group_id, contract_type, status, reason, valid_from, valid_to, salary_base,
      society_code, branch_code, cost_center_code, cost_center, metadata, created_by
    )
    VALUES (
      ${tenantId}, ${employee.id}, ${continuityGroupId}, ${payload.contract_type}, ${employee.active === false ? "cerrado" : "activo"}, 'ingreso',
      ${payload.valid_from}::date, ${payload.valid_to}::date, ${payload.salary_base}, ${payload.society_code}, ${payload.branch_code},
      ${payload.cost_center_code}, ${payload.cost_center}, ${JSON.stringify({ seeded_from_employee_master: true })}::jsonb, ${user?.id || null}
    )
    RETURNING *
  `;
  return rows[0];
}

async function activeEmployeeContract(tx, tenantId, employeeId) {
  const rows = await tx.$queryRaw`
    SELECT *
    FROM th_empleado_contratos
    WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND status = 'activo'
    ORDER BY valid_from DESC, id DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function listEmployeeContracts(tenantId, employeeId, query = {}) {
  const id = numericId(employeeId || query.employee_id);
  if (!id) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
    SELECT *
    FROM th_empleado_contratos
    WHERE tenant_id = ${tenantId} AND employee_id = ${id}
    ORDER BY valid_from DESC, id DESC
    LIMIT ${Math.min(Number(query.limit || 100), 500)}
    `;
    return rows.map((row) => ({
      ...row,
      id: Number(row.id),
      previous_contract_id: row.previous_contract_id == null ? null : Number(row.previous_contract_id),
      termination_document_id: row.termination_document_id == null ? null : Number(row.termination_document_id)
    }));
  });
}

async function createEmployeeContractAddendum(tenantId, employeeId, input = {}, user = {}) {
  const id = numericId(employeeId || input.employee_id);
  if (!id) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({ where: { tenant_id: tenantId, id } });
    if (!employee) throw validationError("Empleado no encontrado.", 404, "EMPLEADO_NO_ENCONTRADO");
    if (employee.active === false) throw validationError("No se puede crear otrosi sobre un empleado retirado. Use recontratacion.", 409, "EMPLEADO_RETIRADO");
    await ensureEmployeeContractFoundation(tx, tenantId, employee, user);
    const active = await activeEmployeeContract(tx, tenantId, id);
    const organization = await resolveTenantEmployeeOrganization(tenantId, input, employee, { allowEmpty: true });
    const payload = employeeContractPayload(organization ? { ...input, ...organization } : input, employee);
    if (!payload.valid_from) throw validationError("La fecha de vigencia del otrosi es obligatoria.", 400, "OTROSI_FECHA_REQUERIDA");
    if (payload.contract_type === "fixed" && !payload.valid_to) throw validationError("La fecha de vencimiento del contrato es obligatoria para termino fijo.", 422, "FECHA_FIN_CONTRATO_REQUERIDA");
    if (active?.valid_from && new Date(payload.valid_from) <= new Date(active.valid_from)) {
      throw validationError("La vigencia del otrosi debe ser posterior al contrato vigente.", 409, "OTROSI_VIGENCIA_INVALIDA");
    }
    await tx.$executeRaw`
      UPDATE th_empleado_contratos
      SET status = 'cerrado', valid_to = (${payload.valid_from}::date - INTERVAL '1 day')::date, updated_at = now(),
          metadata = metadata || ${JSON.stringify({ closed_by: "otrosi", notes: input.notes || "" })}::jsonb
      WHERE tenant_id = ${tenantId} AND employee_id = ${id} AND status = 'activo'
    `;
    const rows = await tx.$queryRaw`
      INSERT INTO th_empleado_contratos (
        tenant_id, employee_id, continuity_group_id, contract_type, status, reason, valid_from, valid_to, salary_base,
        society_code, branch_code, cost_center_code, cost_center, previous_contract_id, metadata, created_by
      )
      VALUES (
        ${tenantId}, ${id}, ${active?.continuity_group_id || randomUUID()}, ${payload.contract_type}, 'activo', ${input.reason || "otrosi"},
        ${payload.valid_from}::date, ${payload.valid_to}::date, ${payload.salary_base}, ${payload.society_code}, ${payload.branch_code},
        ${payload.cost_center_code}, ${payload.cost_center}, ${active?.id || null}, ${JSON.stringify({ notes: input.notes || "", source: "otrosi" })}::jsonb, ${user?.id || null}
      )
      RETURNING *
    `;
    await syncEmployeeFromContract(tx, employee, rows[0]);
    await syncEmployeeSalaryHistory(tx, tenantId, id, { salary_base: payload.salary_base, hire_date: payload.valid_from, salary_reason: input.reason || "Otrosi contractual" }, user?.id || null);
    return rows[0];
  }));
}

async function createEmployeeRehire(tenantId, employeeId, input = {}, user = {}) {
  const id = numericId(employeeId || input.employee_id);
  if (!id) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({ where: { tenant_id: tenantId, id } });
    if (!employee) throw validationError("Empleado no encontrado.", 404, "EMPLEADO_NO_ENCONTRADO");
    await ensureEmployeeContractFoundation(tx, tenantId, employee, user);
    const active = await activeEmployeeContract(tx, tenantId, id);
    if (active && employee.active !== false) throw validationError("El empleado ya tiene un contrato activo.", 409, "CONTRATO_ACTIVO_EXISTE");
    if (active) {
      await tx.$executeRaw`
        UPDATE th_empleado_contratos
        SET status = 'cerrado', valid_to = COALESCE(valid_to, CURRENT_DATE), updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${active.id}
      `;
    }
    const organization = await resolveTenantEmployeeOrganization(tenantId, input, employee, { allowEmpty: true });
    const payload = employeeContractPayload({ ...(organization ? { ...input, ...organization } : input), valid_from: input.valid_from || input.hire_date || input.new_hire_date }, employee);
    if (!payload.valid_from) throw validationError("La fecha de recontratacion es obligatoria.", 400, "RECONTRATACION_FECHA_REQUERIDA");
    if (payload.contract_type === "fixed" && !payload.valid_to) throw validationError("La fecha de vencimiento del contrato es obligatoria para termino fijo.", 422, "FECHA_FIN_CONTRATO_REQUERIDA");
    const rows = await tx.$queryRaw`
      INSERT INTO th_empleado_contratos (
        tenant_id, employee_id, continuity_group_id, contract_type, status, reason, valid_from, valid_to, salary_base,
        society_code, branch_code, cost_center_code, cost_center, previous_contract_id, metadata, created_by
      )
      VALUES (
        ${tenantId}, ${id}, ${randomUUID()}, ${payload.contract_type}, 'activo', 'recontratacion', ${payload.valid_from}::date,
        ${payload.valid_to}::date, ${payload.salary_base}, ${payload.society_code}, ${payload.branch_code}, ${payload.cost_center_code},
        ${payload.cost_center}, ${active?.id || null}, ${JSON.stringify({ notes: input.notes || "", reason: input.reason || "Recontratacion" })}::jsonb, ${user?.id || null}
      )
      RETURNING *
    `;
    await tx.employee.update({ where: { id }, data: { active: true, hire_date: new Date(payload.valid_from) } });
    await syncEmployeeFromContract(tx, { ...employee, active: true }, rows[0]);
    await syncEmployeeSalaryHistory(tx, tenantId, id, { salary_base: payload.salary_base, hire_date: payload.valid_from, salary_reason: "Recontratacion" }, user?.id || null);
    return rows[0];
  }));
}

async function listEmployeeSalaryHistory(tenantId, employeeId, query = {}) {
  const id = numericId(employeeId || query.employee_id);
  if (!id) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT *
    FROM th_empleado_salarios
    WHERE tenant_id = ${tenantId}
      AND employee_id = ${id}
    ORDER BY valid_from DESC
    LIMIT ${Math.min(Number(query.limit || 100), 500)}
  `);
}

async function createEmployeeSalaryHistory(tenantId, employeeId, input = {}, user = {}) {
  const id = numericId(employeeId || input.employee_id);
  const salary = Number(input.monthly_salary || input.salary_base || 0);
  const validFrom = dateOnly(input.valid_from);
  if (!id || !(salary > 0)) throw validationError("Empleado y salario son obligatorios.", 400, "SALARIO_HISTORICO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    await syncEmployeeSalaryHistory(tx, tenantId, id, { salary_base: salary, currency: input.currency || "COP", hire_date: validFrom, salary_reason: input.reason || "Cambio salarial" }, user?.id || null);
    await tx.employee.update({ where: { id }, data: { salary_base: salary } }).catch(() => null);
    const rows = await tx.$queryRaw`
      SELECT *
      FROM th_empleado_salarios
      WHERE tenant_id = ${tenantId} AND employee_id = ${id} AND valid_from = ${validFrom}::date
      LIMIT 1
    `;
    return rows[0];
  }));
}

async function createEmployee(tenantId, input) {
  const fullName = input.name || [input.first_name, input.middle_name, input.last_name, input.second_last_name].filter(Boolean).join(" ").trim();
  validateEmployeeLaborInput(input);
  const organization = await resolveTenantEmployeeOrganization(tenantId, input);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    await assertEmployeeDocumentAvailable(tx, tenantId, input);
    const employee = await tx.employee.create({
      data: {
        code: String(input.code || "").trim() || employeeCodeFromDocument(input),
        user_type: input.user_type || input.position || "operario",
        position: input.position || input.user_type || "operario",
        department: input.department || input.area || "Operacion",
        salary_base: Number(input.salary_base || 0),
        salary_type: input.salary_type || "monthly",
        hire_date: input.hire_date ? new Date(input.hire_date) : new Date(),
        end_date: input.end_date ? new Date(input.end_date) : null,
        contract_type: normalizeContractType(input.contract_type),
        metadata: {
          name: fullName || "",
          document: input.document || "",
          document_type: input.document_type || "",
          first_name: input.first_name || "",
          middle_name: input.middle_name || "",
          last_name: input.last_name || "",
          second_last_name: input.second_last_name || "",
          birth_date: input.birth_date || "",
          email: input.email || "",
          phone: input.phone || "",
          company: input.company || "",
          company_id: input.company_id || "",
          site: input.site || "",
          area: input.area || input.department || "",
          cost_center: organization.cost_center,
          branch_code: organization.branch_code,
          society_code: organization.society_code,
          cost_center_code: organization.cost_center_code,
          accounting: organization,
          weekly_hours: input.weekly_hours ?? null,
          currency: input.currency || "COP",
          social_security: {
            eps_id: input.eps_id || null,
            pension_fund_id: input.pension_fund_id || null,
            arl_id: input.arl_id || null,
            arl_risk_class: Number(input.arl_risk_class || 1),
            compensation_fund_id: input.compensation_fund_id || null,
            icbf_entity_id: input.icbf_entity_id || null,
            exoneration_mode: "automatic_by_ibc_threshold"
          },
          labor_status: input.labor_status || "activo",
          user_type: input.user_type || input.position || "operario",
          classification: input.user_type || input.position || "operario",
          legacy: input.legacy || null
        }
      },
      include: { user: { select: safeUserSelect } }
    });
    await syncEmployeeSalaryHistory(tx, tenantId, employee.id, input);
    await ensureEmployeeContractFoundation(tx, tenantId, employee, {});
    return employee;
  }));
}

async function updateEmployee(tenantId, id, input = {}) {
  const employeeId = numericId(id);
  if (!employeeId) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.employee.findFirst({ where: { tenant_id: tenantId, id: employeeId } });
    if (!current) throw validationError("Empleado no encontrado.", 404, "EMPLEADO_NO_ENCONTRADO");
    validateEmployeeLaborInput(input, current);
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const organization = await resolveTenantEmployeeOrganization(tenantId, input, current, { allowEmpty: true });
    const nextDocument = input.document !== undefined ? input.document : metadata.document;
    const nextDocumentType = input.document_type !== undefined ? input.document_type : metadata.document_type;
    await assertEmployeeDocumentAvailable(prisma, tenantId, { document: nextDocument, document_type: nextDocumentType }, employeeId);
    const fullName = input.name || [input.first_name, input.middle_name, input.last_name, input.second_last_name].filter(Boolean).join(" ").trim();
    const nextMetadata = {
      ...metadata,
      ...(fullName ? { name: fullName } : {}),
      ...(input.document !== undefined ? { document: input.document || "" } : {}),
      ...(input.document_type !== undefined ? { document_type: input.document_type || "" } : {}),
      ...(input.first_name !== undefined ? { first_name: input.first_name || "" } : {}),
      ...(input.middle_name !== undefined ? { middle_name: input.middle_name || "" } : {}),
      ...(input.last_name !== undefined ? { last_name: input.last_name || "" } : {}),
      ...(input.second_last_name !== undefined ? { second_last_name: input.second_last_name || "" } : {}),
      ...(input.email !== undefined ? { email: input.email || "" } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || "" } : {}),
      ...(input.site !== undefined ? { site: input.site || "" } : {}),
      ...(input.area !== undefined ? { area: input.area || "" } : {}),
      ...(organization ? { cost_center: organization.cost_center, branch_code: organization.branch_code, society_code: organization.society_code, cost_center_code: organization.cost_center_code, accounting: organization } : {}),
      ...(input.weekly_hours !== undefined ? { weekly_hours: input.weekly_hours === "" || input.weekly_hours == null ? null : Number(input.weekly_hours) } : {}),
      ...(input.labor_status !== undefined ? { labor_status: input.labor_status || "activo" } : {}),
      ...(input.currency !== undefined ? { currency: input.currency || "COP" } : {}),
      social_security: {
        ...(metadata.social_security || {}),
        ...(input.eps_id !== undefined ? { eps_id: input.eps_id || null } : {}),
        ...(input.pension_fund_id !== undefined ? { pension_fund_id: input.pension_fund_id || null } : {}),
        ...(input.arl_id !== undefined ? { arl_id: input.arl_id || null } : {}),
        ...(input.arl_risk_class !== undefined ? { arl_risk_class: Number(input.arl_risk_class || 1) } : {}),
        ...(input.compensation_fund_id !== undefined ? { compensation_fund_id: input.compensation_fund_id || null } : {}),
        ...(input.icbf_entity_id !== undefined ? { icbf_entity_id: input.icbf_entity_id || null } : {}),
        exoneration_mode: "automatic_by_ibc_threshold"
      }
    };
    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
      where: { id: employeeId },
      data: {
        ...(input.code !== undefined ? { code: input.code || current.code } : {}),
        ...(input.position !== undefined ? { position: input.position || current.position } : {}),
        ...(input.department !== undefined || input.area !== undefined ? { department: input.department || input.area || current.department } : {}),
        ...(input.contract_type !== undefined ? { contract_type: normalizeContractType(input.contract_type) } : {}),
        ...(input.salary_base !== undefined ? { salary_base: input.salary_base === "" || input.salary_base == null ? 0 : Number(input.salary_base) } : {}),
        ...(input.salary_type !== undefined ? { salary_type: input.salary_type || current.salary_type || "monthly" } : {}),
        ...(input.hire_date !== undefined ? { hire_date: input.hire_date ? new Date(input.hire_date) : current.hire_date } : {}),
        ...(input.end_date !== undefined ? { end_date: input.end_date ? new Date(input.end_date) : null } : {}),
        ...(input.active !== undefined ? { active: input.active !== false } : {}),
        metadata: nextMetadata
      },
      include: { user: { select: safeUserSelect } }
      });
      await syncEmployeeSalaryHistory(tx, tenantId, employee.id, input);
      await ensureEmployeeContractFoundation(tx, tenantId, employee, {});
      return employee;
    });
  });
}

async function createRoute(tenantId, input) {
  validateRouteInput(input);
  const kind = normalizeRouteKind(input.kind);
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await normalizeRouteEmployees(input.employees);
    if (kind !== "descanso") {
      await assertRouteAssignmentAvailable(tenantId, {
        date: input.date,
        start_time: input.start_time || "08:00",
        end_time: input.end_time || "17:00",
        employees
      });
    }
    const gpsRequired = routeGpsRequiredFromInput(input);
    return prisma.$transaction(async (tx) => {
      await lockRouteAssignmentScopes(tx, tenantId, employees, [input.date]);
      // El chequeo de solapamiento debe respetar el mismo criterio que el pre-chequeo:
      // una jornada de descanso no bloquea ni es bloqueada por mallas de trabajo.
      if (kind !== "descanso") {
        await assertRouteAssignmentAvailable(tenantId, {
          date: input.date,
          start_time: input.start_time || "08:00",
          end_time: input.end_time || "17:00",
          employees
        }, tx);
      }
      return tx.timeRoute.create({
        data: {
          date: startOfDay(input.date),
          vehicle_plate: input.vehicle_plate || "",
          employees,
          start_time: input.start_time || "08:00",
          end_time: input.end_time || "17:00",
          tolerance_minutes: input.tolerance_minutes ?? 15,
          per_diem: 0,
          notes: routeNotesWithTracking(input.notes || "", gpsRequired),
          status: input.status || "active",
          kind
        }
      });
    });
  });
}

async function updateRoute(tenantId, id, input) {
  validateRouteInput(input);
  const kind = normalizeRouteKind(input.kind);
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await normalizeRouteEmployees(input.employees);
    if (kind !== "descanso") {
      await assertRouteAssignmentAvailable(tenantId, {
        date: input.date,
        start_time: input.start_time || "08:00",
        end_time: input.end_time || "17:00",
        employees,
        excludeRouteId: Number(id)
      });
    }
    const gpsRequired = routeGpsRequiredFromInput(input);
    return prisma.$transaction(async (tx) => {
      await lockRouteAssignmentScopes(tx, tenantId, employees, [input.date]);
      if (kind !== "descanso") {
        await assertRouteAssignmentAvailable(tenantId, {
          date: input.date,
          start_time: input.start_time || "08:00",
          end_time: input.end_time || "17:00",
          employees,
          excludeRouteId: Number(id)
        }, tx);
      }
      return tx.timeRoute.update({
        where: { id: Number(id) },
        data: {
          date: startOfDay(input.date),
          vehicle_plate: input.vehicle_plate || "",
          employees,
          start_time: input.start_time || "08:00",
          end_time: input.end_time || "17:00",
          tolerance_minutes: input.tolerance_minutes ?? 15,
          per_diem: 0,
          notes: routeNotesWithTracking(input.notes || "", gpsRequired),
          status: input.status || "active",
          kind
        }
      });
    });
  });
}

// Borrado fisico controlado de horarios. Exige el permiso especial
// delete_physical_records, que no se entrega por defecto (Manual de Administrador NYVORA).
const ROUTE_DELETE_BLOCKING_STATUSES = ["pendiente", "en_proceso"];
const ROUTE_DELETE_REASON_MIN = 12;

function routeDeletionActor(user = {}) {
  const role = user?.role || {};
  return {
    id: optionalNumericId(user?.id) || null,
    name: String(user?.name || user?.email || "").trim() || "usuario_sin_nombre",
    role: String(role.name || "").trim() || "sin_rol"
  };
}

function routeDeletionFailure(message, code, details = {}, statusCode = 409) {
  const error = validationError(message, statusCode, code);
  error.details = details;
  return error;
}

async function findRouteForDeletion(db, id) {
  const routeId = optionalNumericId(id);
  if (!routeId) return null;
  return db.timeRoute.findFirst({ where: { id: routeId } });
}

function routeDeletionSummary(route) {
  const employees = Array.isArray(route.employees) ? route.employees : [];
  return {
    id: route.id,
    date: new Date(route.date).toISOString().slice(0, 10),
    vehicle_plate: route.vehicle_plate,
    status: route.status,
    start_time: route.start_time,
    end_time: route.end_time,
    tolerance_minutes: route.tolerance_minutes,
    employees,
    employee_count: employees.length
  };
}

async function collectRouteDeletionImpact(db, route) {
  const routeId = route.id;
  const routeScope = routeScopeWhere(routeId);
  const checklists = await db.routePreoperationalChecklist.findMany({
    where: { route_id: routeId },
    select: { id: true, checklist_status: true }
  });
  const checklistIds = checklists.map((item) => item.id);
  const checklistScope = checklistIds.length ? { checklist_id: { in: checklistIds } } : null;
  const [answers, evidence, findings, startAuthorizations, blockEvents, timePunches, gpsPings, workSessions, workActivities, processedWorkdays] = await Promise.all([
    checklistScope ? db.routePreoperationalChecklistAnswer.count({ where: checklistScope }) : 0,
    checklistScope ? db.routePreoperationalChecklistEvidence.count({ where: checklistScope }) : 0,
    db.routePreoperationalFinding.count({
      where: checklistScope ? { OR: [checklistScope, { route_id: routeId }] } : { route_id: routeId }
    }),
    db.routeStartAuthorization.count({ where: { route_id: routeId } }),
    db.routeBlockEvent.count({ where: { route_id: routeId } }),
    db.timePunch.count({ where: routeScope }),
    db.gpsPing.count({ where: routeScope }),
    db.workSession.count({ where: routeScope }),
    db.workActivity.count({ where: routeScope }),
    // ProcessedWorkday no expone metadata, se cuenta por route_id directo
    db.processedWorkday.count({ where: { route_id: routeId } })
  ]);

  const openChecklists = checklists.filter((item) => ROUTE_DELETE_BLOCKING_STATUSES.includes(String(item.checklist_status || "").trim()));
  const blockers = openChecklists.length
    ? [{
      code: "ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST",
      message: `El horario tiene ${openChecklists.length} checklist(s) preoperacional(es) sin cerrar. Cierralas antes de eliminar el horario.`,
      detail: { checklist_ids: openChecklists.map((item) => item.id), statuses: [...new Set(openChecklists.map((item) => item.checklist_status))] }
    }]
    : [];

  const preservedTrace = {
    time_punches: timePunches,
    gps_pings: gpsPings,
    work_sessions: workSessions,
    work_activities: workActivities,
    processed_workdays: processedWorkdays,
    total: timePunches + gpsPings + workSessions + workActivities + processedWorkdays
  };

  return {
    route_id: routeId,
    blockers,
    can_delete: blockers.length === 0,
    will_delete: {
      checklists: checklists.length,
      checklist_statuses: [...new Set(checklists.map((item) => String(item.checklist_status || "").trim()))],
      checklist_answers: answers,
      checklist_evidence: evidence,
      checklist_findings: findings,
      start_authorizations: startAuthorizations,
      block_events: blockEvents,
      total: checklists.length + answers + evidence + findings + startAuthorizations + blockEvents
    },
    preserved_trace: preservedTrace,
    requires_trace_acknowledgement: preservedTrace.total > 0
  };
}

async function routeDeletionImpact(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const route = await findRouteForDeletion(prisma, id);
    if (!route) {
      throw routeDeletionFailure("El horario no existe o pertenece a otra empresa.", "ROUTE_NOT_FOUND", { route_id: optionalNumericId(id) }, 404);
    }
    const impact = await collectRouteDeletionImpact(prisma, route);
    return { ...impact, route: routeDeletionSummary(route) };
  });
}

async function deleteRoute(tenantId, id, input = {}, context = {}) {
  const reason = String(input.reason || "").trim();
  if (reason.length < ROUTE_DELETE_REASON_MIN) {
    throw validationError(`El motivo de la eliminacion es obligatorio (minimo ${ROUTE_DELETE_REASON_MIN} caracteres).`, 400, "ROUTE_DELETE_REASON_REQUIRED");
  }
  if (input.confirmed !== true) {
    throw validationError("La eliminacion definitiva requiere confirmacion explicita del responsable.", 400, "ROUTE_DELETE_NOT_CONFIRMED");
  }
  const actor = routeDeletionActor(context.actor);

  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const route = await findRouteForDeletion(tx, id);
    if (!route) {
      throw routeDeletionFailure("El horario no existe o pertenece a otra empresa.", "ROUTE_NOT_FOUND", { route_id: optionalNumericId(id) }, 404);
    }
    const impact = await collectRouteDeletionImpact(tx, route);
    if (!impact.can_delete) throw routeDeletionFailure(impact.blockers[0].message, impact.blockers[0].code, impact.blockers[0].detail);

    const snapshot = routeDeletionSummary(route);
    if (input.expected_employees != null && Number(input.expected_employees) !== snapshot.employee_count) {
      throw routeDeletionFailure(
        "El horario cambio desde que se reviso el impacto. Vuelve a validar antes de eliminar.",
        "ROUTE_DELETE_STALE_PREVIEW",
        { expected_employees: Number(input.expected_employees), current_employees: snapshot.employee_count }
      );
    }

    if (impact.requires_trace_acknowledgement && input.acknowledge_trace !== true) {
      throw routeDeletionFailure(
        `El horario conserva ${impact.preserved_trace.total} registro(s) operativo(s) del dia (marcaciones, GPS, sesiones, actividades o jornales) que quedaran desacoplados como historial. Confirma que lo entiendes para continuar.`,
        "ROUTE_DELETE_TRACE_NOT_ACKNOWLEDGED",
        { preserved_trace: impact.preserved_trace }
      );
    }

    const checklistIds = (await tx.routePreoperationalChecklist.findMany({ where: { route_id: route.id }, select: { id: true } })).map((item) => item.id);
    const checklistScope = checklistIds.length ? { checklist_id: { in: checklistIds } } : null;
    let deleted = { checklists: 0, checklist_answers: 0, checklist_evidence: 0, checklist_findings: 0, start_authorizations: 0, block_events: 0, total: 0 };

    if (checklistScope) {
      const [answers, evidence, findings] = await Promise.all([
        tx.routePreoperationalChecklistAnswer.deleteMany({ where: { ...checklistScope, tenant_id: tenantId } }),
        tx.routePreoperationalChecklistEvidence.deleteMany({ where: { ...checklistScope, tenant_id: tenantId } }),
        tx.routePreoperationalFinding.deleteMany({ where: { tenant_id: tenantId, OR: [checklistScope, { route_id: route.id }] } })
      ]);
      deleted.checklist_answers = answers.count;
      deleted.checklist_evidence = evidence.count;
      deleted.checklist_findings = findings.count;
    }

    const [checklists, startAuthorizations, blockEvents] = await Promise.all([
      tx.routePreoperationalChecklist.deleteMany({ where: { route_id: route.id, tenant_id: tenantId } }),
      tx.routeStartAuthorization.deleteMany({ where: { route_id: route.id, tenant_id: tenantId } }),
      tx.routeBlockEvent.deleteMany({ where: { route_id: route.id, tenant_id: tenantId } })
    ]);
    deleted.checklists = checklists.count;
    deleted.start_authorizations = startAuthorizations.count;
    deleted.block_events = blockEvents.count;
    deleted.total = deleted.checklists + deleted.checklist_answers + deleted.checklist_evidence + deleted.checklist_findings + deleted.start_authorizations + deleted.block_events;

    await tx.timeRoute.delete({ where: { id: route.id } });

    await tx.auditLog.create({
      data: {
        user_id: actor.id,
        session_id: context.session_id || null,
        action: "route.physical_deletion.applied",
        module: "hr",
        entity: "TimeRoute",
        entity_id: String(route.id),
        old_value: { route: snapshot, reason, deleted, preserved_trace: impact.preserved_trace },
        new_value: { deleted_at: new Date().toISOString(), actor, request_id: context.request_id || null },
        ip: context.ip || null,
        user_agent: context.user_agent || null
      }
    });

    return {
      ok: true,
      route_id: route.id,
      route: snapshot,
      reason,
      deleted,
      preserved_trace: impact.preserved_trace,
      approved_by: actor
    };
  }, { maxWait: 5_000, timeout: 20_000 }));
}

function normalizeRouteKind(kind) {
  return String(kind || "trabajo").trim().toLowerCase() === "descanso" ? "descanso" : "trabajo";
}

function validateRouteInput(input = {}) {
  if (!input.date) throw validationError("La fecha del horario es obligatoria.");
  if (!Array.isArray(input.employees) || !input.employees.filter((item) => String(item || "").trim()).length) {
    throw validationError("Selecciona al menos una persona para asignar el horario.");
  }
  try {
    hrPolicy.assertSameDayShift({ startTime: input.start_time || "08:00", endTime: input.end_time || "17:00" });
  } catch (error) {
    throw validationError(error.message, 400, error.code || "HORARIO_INVALIDO");
  }
  const tolerance = Number(input.tolerance_minutes ?? 15);
  if (!Number.isInteger(tolerance) || tolerance < 0) throw validationError("La tolerancia debe ser numerica, entera y no negativa.", 400, "TOLERANCIA_INVALIDA");
}

async function normalizeRouteEmployees(inputEmployees = []) {
  const values = Array.isArray(inputEmployees) ? inputEmployees.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!values.length) return [];
  const employees = await prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 1000 });
  const employeeByAlias = new Map();
  for (const employee of employees) {
    for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
  }
  return values.map((value) => {
    const employee = employeeByAlias.get(normalizeKey(value));
    return employee ? employeeUserName(employee, value) : value;
  });
}

function routeEmployeeSet(route) {
  return new Set((Array.isArray(route?.employees) ? route.employees : []).map((item) => normalizeKey(item)));
}

async function lockRouteAssignmentScopes(db, tenantId, employees, dates) {
  const scopes = new Set();
  for (const date of dates) {
    const day = startOfDay(date).toISOString();
    for (const employee of employees) {
      const key = normalizeKey(employee);
      if (key) scopes.add(`${tenantId}:asignacion:${key}:${day}`);
    }
  }
  for (const scope of scopes) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  }
}

async function findRouteAssignmentConflicts(tenantId, { date, start_time, end_time, employees = [], excludeRouteId = null }, db = prisma) {
  const { start, end } = hrPolicy.assertSameDayShift({ startTime: start_time || "08:00", endTime: end_time || "17:00" });
  const employeeKeys = new Set((employees || []).map((employee) => normalizeKey(employee)).filter(Boolean));
  if (!employeeKeys.size) return [];
  const day = startOfDay(date);
  const routes = await db.timeRoute.findMany({
    where: {
      tenant_id: tenantId,
      date: { gte: day, lt: endOfDay(day) },
      ...(excludeRouteId ? { id: { not: Number(excludeRouteId) } } : {}),
      status: { notIn: ["cancelled", "cancelada", "inactive", "inactiva"] }
    }
  });
  const conflicts = [];
  for (const route of routes) {
    const routeStart = minutesFromTime(route.start_time || "08:00");
    const routeEnd = minutesFromTime(route.end_time || "17:00");
    if (routeStart == null || routeEnd == null || !hrPolicy.rangesOverlap({ start, end }, { start: routeStart, end: routeEnd })) continue;
    const assigned = routeEmployeeSet(route);
    const overlappingEmployees = Array.from(employeeKeys).filter((employee) => assigned.has(employee));
    if (overlappingEmployees.length) {
      conflicts.push({
        route_id: route.id,
        date: day.toISOString().slice(0, 10),
        start_time: route.start_time,
        end_time: route.end_time,
        employees: overlappingEmployees
      });
    }
  }
  return conflicts;
}

async function assertRouteAssignmentAvailable(tenantId, input, db = prisma) {
  const conflicts = await findRouteAssignmentConflicts(tenantId, input, db);
  if (conflicts.length) {
    const error = validationError("Ya existe una malla superpuesta para al menos una persona en la misma fecha.", 409, "MALLA_SOLAPADA");
    error.details = { conflicts };
    throw error;
  }
}

async function prevalidateRoutes(tenantId, input = {}) {
  validateRouteInput({ ...input, date: input.date || input.start_date });
  const dates = input.start_date && input.end_date ? datesForRouteRange(input) : [startOfDay(input.date)];
  const employees = await normalizeRouteEmployees(input.employees);
  const results = [];
  for (const date of dates) {
    const dateText = date.toISOString().slice(0, 10);
    const conflicts = await findRouteAssignmentConflicts(tenantId, {
      date: dateText,
      start_time: input.start_time || "08:00",
      end_time: input.end_time || "17:00",
      employees,
      excludeRouteId: input.exclude_route_id
    });
    results.push({
      date: dateText,
      status: conflicts.length ? "conflict" : "ready",
      conflicts
    });
  }
  return {
    ok: results.every((item) => item.status === "ready"),
    dates: results.length,
    employees: employees.length,
    created: results.filter((item) => item.status === "ready").length,
    omitted: results.filter((item) => item.status !== "ready").length,
    results
  };
}

async function listDateAssignments(tenantId, query = {}) {
  const dateText = String(query.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw validationError("La fecha consultada debe tener formato YYYY-MM-DD.", 400, "FECHA_INVALIDA");
  }
  const day = startOfDay(dateText);
  // Mismo ventaneo y filtro de estado que findRouteAssignmentConflicts: lo que aqui se
  // informa como "ya tiene malla" debe coincidir exactamente con lo que luego bloquearia
  // el 409 MALLA_SOLAPADA, o el formulario avisaria de mas o de menos.
  const routes = await prisma.runWithTenant(tenantId, () => prisma.timeRoute.findMany({
    where: {
      tenant_id: tenantId,
      date: { gte: day, lt: endOfDay(day) },
      status: { notIn: ["cancelled", "cancelada", "inactive", "inactiva"] }
    },
    select: { id: true, employees: true, start_time: true, end_time: true, status: true, vehicle_plate: true },
    orderBy: { id: "asc" },
    take: 2000
  }));
  return routes.map((route) => ({
    route_id: route.id,
    date: dateText,
    start_time: route.start_time,
    end_time: route.end_time,
    status: route.status,
    vehicle_plate: route.vehicle_plate,
    employees: Array.isArray(route.employees) ? route.employees : []
  }));
}

function datesForRouteRange(input) {
  const start = startOfDay(input.start_date);
  const end = startOfDay(input.end_date);
  if (end < start) {
    const error = new Error("La fecha final no puede ser menor que la fecha inicial.");
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(input.weekdays) || !input.weekdays.length) {
    throw validationError("Selecciona al menos un dia de la semana para crear mallas por rango.", 400, "DIAS_RANGO_REQUERIDOS");
  }
  const weekdays = Array.isArray(input.weekdays) && input.weekdays.length
    ? new Set(input.weekdays.map((day) => Number(day)))
    : new Set([1, 2, 3, 4, 5]);
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (weekdays.has(cursor.getDay())) dates.push(new Date(cursor));
  }
  return dates;
}

async function createRoutesBulk(tenantId, input) {
  validateRouteInput({ ...input, date: input.start_date });
  const dates = datesForRouteRange(input);
  if (!dates.length) return { created: 0, routes: [] };
  const kind = normalizeRouteKind(input.kind);
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await normalizeRouteEmployees(input.employees);
    if (kind !== "descanso") {
      for (const date of dates) {
        await assertRouteAssignmentAvailable(tenantId, {
          date: date.toISOString().slice(0, 10),
          start_time: input.start_time || "08:00",
          end_time: input.end_time || "17:00",
          employees
        });
      }
    }
    const gpsRequired = routeGpsRequiredFromInput(input);
    return prisma.$transaction(async (tx) => {
      await lockRouteAssignmentScopes(tx, tenantId, employees, dates);
      if (kind !== "descanso") {
        for (const date of dates) {
          await assertRouteAssignmentAvailable(tenantId, {
            date: date.toISOString().slice(0, 10),
            start_time: input.start_time || "08:00",
            end_time: input.end_time || "17:00",
            employees
          }, tx);
        }
      }
      const routes = [];
      for (const date of dates) {
        routes.push(await tx.timeRoute.create({
          data: {
            date,
            vehicle_plate: input.vehicle_plate || "",
            employees,
            start_time: input.start_time || "08:00",
            end_time: input.end_time || "17:00",
            tolerance_minutes: input.tolerance_minutes ?? 15,
            per_diem: 0,
            notes: routeNotesWithTracking(input.notes || "", gpsRequired),
            status: input.status || "active",
            kind
          }
        }));
      }
      return { created: routes.length, routes };
    });
  });
}

async function findEmployee(input) {
  if (input.employee_id) {
    const id = numericId(input.employee_id);
    if (id) return prisma.employee.findFirst({ where: { id } });
    const key = String(input.employee_id).trim();
    // Supabase sessions can send UUIDs; Prisma employee/user ids are numeric, so only match stable aliases here.
    return prisma.employee.findFirst({
      where: {
        OR: [
          { code: key },
          { metadata: { path: ["supabase_employee_id"], equals: key } },
          { metadata: { path: ["supabase_user_id"], equals: key } }
        ]
      }
    });
  }
  const name = String(input.user_name || "").trim();
  if (!name) return null;
  const aliases = [
    name,
    input.metadata?.employee_code,
    input.metadata?.employee_name,
    input.metadata?.supplied_user_name,
    input.metadata?.user_email
  ].filter(Boolean).map((value) => String(value).trim());
  return prisma.employee.findFirst({
    where: {
      OR: [
        ...aliases.map((alias) => ({ code: alias })),
        ...aliases.map((alias) => ({ metadata: { path: ["name"], equals: alias } })),
        ...aliases.map((alias) => ({ metadata: { path: ["employee_code"], equals: alias } })),
        ...aliases.map((alias) => ({ metadata: { path: ["employee_name"], equals: alias } })),
        ...aliases.map((alias) => ({ user: { name: alias } })),
        ...aliases.map((alias) => ({ user: { email: alias } }))
      ]
    }
  });
}

async function resolveEmployeeForPunch(tenantId, input) {
  const employee = await findEmployee(input);
  if (employee) return employee;
  const name = input.user_name?.trim();
  if (!name) {
    const err = new Error("Usuario requerido para registrar marcacion");
    err.statusCode = 400;
    throw err;
  }
  return prisma.employee.create({
    data: {
      tenant_id: tenantId,
      code: name,
      user_type: input.user_type || "operario",
      position: input.position || "operario",
      department: "Operacion",
      salary_base: 0,
      salary_type: "monthly",
      hire_date: new Date(),
      contract_type: "indefinite",
      metadata: { name, document: "", company: "APEX", labor_status: "activo", user_type: input.user_type || "operario", classification: input.user_type || "operario", legacy: { autocreated_from: "marcacion" } }
    }
  });
}

async function getCurrentEmployee(tenantId, user) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { user_id: user?.id },
          { user: { email: user?.email || "" } },
          { user: { name: user?.name || "" } }
        ]
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    if (employee) return employee;
    if (!user?.id) {
      const err = new Error("El usuario conectado no tiene empleado asociado.");
      err.statusCode = 404;
      err.code = "EMPLEADO_NO_ASOCIADO";
      throw err;
    }
    const roleName = String(user.role?.name || "").toLowerCase();
    const inferredType = roleName.includes("conductor") || roleName.includes("driver")
      ? "conductor"
      : roleName.includes("transport")
        ? "transportador"
        : "operario";
    return prisma.employee.create({
      data: {
        tenant_id: tenantId,
        user_id: user.id,
        code: user.name || user.email || `usuario-${user.id}`,
        user_type: inferredType,
        position: inferredType,
        department: "Operacion",
        salary_base: 0,
        salary_type: "monthly",
        hire_date: new Date(),
        contract_type: "indefinite",
        metadata: {
          name: user.name || user.email || `Usuario ${user.id}`,
          document: "",
          company: "APEX",
          labor_status: "activo",
          user_type: inferredType,
          classification: inferredType,
          legacy: { autocreated_from: "hr_current_employee" }
        }
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  });
}

async function resolveVehicleForRoute(plate, db = prisma) {
  if (!plate) return null;
  return db.vehicle.findFirst({ where: { plate } }).catch(() => null);
}

async function ensurePreoperationalChecklist({ tenantId, user, employee, route, punch, input, db = prisma }) {
  if (!isDriver(employee) || !route?.vehicle_plate || normalizePunchType(input.type || input.tipo_marca) !== "entrada") return null;
  const existing = await db.routePreoperationalChecklist.findFirst({
    where: {
      route_id: route.id,
      driver_id: employee.id,
      checklist_status: { in: ["pendiente", "en_proceso", "aprobado", "aprobado_con_novedad", "bloqueado"] }
    },
    include: { answers: true, evidence: true, findings: true },
    orderBy: { created_at: "desc" }
  });
  if (existing) return existing;

  const vehicle = await resolveVehicleForRoute(route.vehicle_plate, db);
  const checklist = await db.routePreoperationalChecklist.create({
    data: {
      route_id: route.id,
      punch_id: punch?.id || null,
      driver_id: employee.id,
      driver_name: employeeDisplayName(employee),
      user_id: user?.id || null,
      vehicle_id: vehicle?.id || null,
      plate: route.vehicle_plate,
      sede: vehicle?.base_site || "",
      checklist_status: "pendiente",
      risk_level: "pendiente",
      created_by: user?.id || null,
      location_lat: input.latitude,
      location_lng: input.longitude,
      metadata: {
        source: "time_punch",
        pesv_reference: "Resolucion 20223040040595 de 2022",
        vehicle_master: vehicle ? {
          master_status: vehicle.master_status,
          document_status: vehicle.document_status,
          master_score: vehicle.master_score,
          type: vehicle.type,
          capacity: vehicle.capacity_value || vehicle.load_capacity,
          base_site: vehicle.base_site
        } : null
      }
    }
  });
  await db.routeStartAuthorization.create({
    data: {
      route_id: route.id,
      checklist_id: checklist.id,
      driver_id: employee.id,
      plate: route.vehicle_plate,
      status: "bloqueada",
      reason: "Checklist preoperacional pendiente"
    }
  });
  return db.routePreoperationalChecklist.findFirst({
    where: { id: checklist.id },
    include: { answers: true, evidence: true, findings: true }
  });
}

async function getActivePreoperationalChecklist(tenantId, user, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await getCurrentEmployee(tenantId, user).catch(() => null);
    const where = {
      ...(query.route_id ? { route_id: Number(query.route_id) } : {}),
      ...(employee ? { driver_id: employee.id } : {}),
      checklist_status: { in: ["pendiente", "en_proceso", "bloqueado"] }
    };
    const checklist = await prisma.routePreoperationalChecklist.findFirst({
      where,
      include: { answers: true, evidence: true, findings: true },
      orderBy: { created_at: "desc" }
    });
    return { checklist, template: getPreoperationalTemplate() };
  });
}

async function getOwnPreoperationalChecklist(tenantId, user, query = {}) {
  const employee = await getCurrentEmployee(tenantId, user);
  await prisma.runWithTenant(tenantId, () => assertOwnAssignedRoute(tenantId, employee, query));
  return getActivePreoperationalChecklist(tenantId, user, { route_id: query.route_id });
}

function answerIsFailure(answer) {
  return ["no_cumple", "no cumple", "fail", "falla"].includes(normalizeKey(answer));
}

async function submitPreoperationalChecklist(tenantId, user, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const checklist = await prisma.routePreoperationalChecklist.findFirstOrThrow({ where: { id: Number(id) } });
    const templateByKey = new Map(PREOP_TEMPLATE.map((item) => [item.item_key, item]));
    const answers = input.answers || [];
    if (answers.length < PREOP_TEMPLATE.length) {
      const err = new Error("Debes responder todo el checklist preoperacional.");
      err.statusCode = 422;
      throw err;
    }
    const failures = [];
    const evidenceRows = [];
    for (const answer of answers) {
      const item = templateByKey.get(answer.item_key);
      if (!item) continue;
      if (answerIsFailure(answer.answer)) {
        const hasEvidence = Array.isArray(answer.evidence) && answer.evidence.length > 0;
        if (!String(answer.observations || "").trim()) {
          const err = new Error(`La novedad "${item.label}" requiere observacion.`);
          err.statusCode = 422;
          throw err;
        }
        if ((item.blocks_route || item.evidence_required) && !hasEvidence) {
          const err = new Error(`La novedad "${item.label}" requiere evidencia.`);
          err.statusCode = 422;
          throw err;
        }
        failures.push({ item, answer });
      }
      for (const evidence of answer.evidence || []) {
        assertSafeFile(evidence, { maxBytes: MAX_EVIDENCE_BYTES });
        const fileName = normalizeFileName(evidence.file_name || `${answer.item_key}.jpg`);
        evidenceRows.push({
          checklist_id: checklist.id,
          item_key: answer.item_key,
          evidence_type: evidence.evidence_type || "photo",
          file_name: fileName,
          file_url: evidence.file_url || "",
          base64_data: evidence.base64_data || "",
          mime_type: evidence.mime_type || "",
          file_size: evidence.file_size || null,
          storage_path: evidence.storage_path || secureStoragePath({ tenantId, module: "hr", entity: "preoperational", entityId: checklist.id, fileName }),
          uploaded_by: user?.id || null
        });
      }
    }
    const criticalFailures = failures.filter((failure) => failure.item.blocks_route || failure.item.severity === "critica");
    const mediumFailures = failures.filter((failure) => !criticalFailures.includes(failure));
    const status = criticalFailures.length ? "bloqueado" : mediumFailures.length ? "aprobado_con_novedad" : "aprobado";
    const riskLevel = criticalFailures.length ? "critica" : mediumFailures.length ? "media" : "sin_riesgo";

    await prisma.routePreoperationalChecklistAnswer.deleteMany({ where: { checklist_id: checklist.id } });
    await prisma.routePreoperationalChecklistEvidence.deleteMany({ where: { checklist_id: checklist.id } });
    await prisma.routePreoperationalFinding.deleteMany({ where: { checklist_id: checklist.id } });
    await prisma.routePreoperationalChecklistAnswer.createMany({
      data: answers.map((answer) => {
        const item = templateByKey.get(answer.item_key) || {};
        return {
          checklist_id: checklist.id,
          section: item.section || "General",
          item_key: answer.item_key,
          label: item.label || answer.item_key,
          answer: answer.answer,
          severity: item.severity || "baja",
          blocks_route: Boolean(item.blocks_route),
          evidence_required: Boolean(item.evidence_required),
          observations: answer.observations || ""
        };
      })
    });
    if (evidenceRows.length) await prisma.routePreoperationalChecklistEvidence.createMany({ data: evidenceRows });
    if (failures.length) {
      await prisma.routePreoperationalFinding.createMany({
        data: failures.map(({ item, answer }) => ({
          checklist_id: checklist.id,
          route_id: checklist.route_id,
          plate: checklist.plate,
          driver_id: checklist.driver_id,
          item_key: item.item_key,
          finding_type: item.section,
          severity: item.severity,
          description: answer.observations || item.label,
          action_taken: criticalFailures.some((failure) => failure.item.item_key === item.item_key) ? "Ruta bloqueada automaticamente" : "Continua con novedad registrada",
          status: criticalFailures.some((failure) => failure.item.item_key === item.item_key) ? "bloqueada" : "abierta"
        }))
      });
    }

    const updated = await prisma.routePreoperationalChecklist.update({
      where: { id: checklist.id },
      data: {
        checklist_status: status,
        risk_level: riskLevel,
        completed_at: new Date(),
        approved_at: status !== "bloqueado" ? new Date() : null,
        blocked_at: status === "bloqueado" ? new Date() : null,
        mileage_initial: input.mileage_initial,
        fuel_level: input.fuel_level || "",
        location_lat: input.location_lat,
        location_lng: input.location_lng,
        digital_signature: input.digital_signature || "",
        observations: input.observations || ""
      },
      include: { answers: true, evidence: true, findings: true }
    });
    await prisma.routeStartAuthorization.updateMany({
      where: { checklist_id: checklist.id },
      data: {
        status: status === "bloqueado" ? "bloqueada" : "autorizada",
        reason: status === "bloqueado" ? "Falla critica en checklist preoperacional" : "Checklist preoperacional aprobado",
        authorized_by: status === "bloqueado" ? null : user?.id || null,
        authorized_at: status === "bloqueado" ? null : new Date()
      }
    });
    if (status === "bloqueado") {
      await prisma.routeBlockEvent.create({
        data: {
          route_id: checklist.route_id,
          checklist_id: checklist.id,
          driver_id: checklist.driver_id,
          plate: checklist.plate,
          reason: criticalFailures.map((failure) => failure.item.label).join("; "),
          severity: "critica",
          created_by: user?.id || null
        }
      });
    }
    return { checklist: updated, route_authorized: status !== "bloqueado", status, risk_level: riskLevel };
  });
}

async function submitOwnPreoperationalChecklist(tenantId, user, id, input) {
  const employee = await getCurrentEmployee(tenantId, user);
  await prisma.runWithTenant(tenantId, async () => {
    const checklist = await prisma.routePreoperationalChecklist.findFirst({
      where: { id: Number(id), driver_id: employee.id },
      select: { id: true, route_id: true }
    });
    if (!checklist) {
      const err = new Error("El checklist indicado no pertenece al empleado conectado.");
      err.statusCode = 403;
      err.code = "CHECKLIST_AJENO_DENEGADO";
      throw err;
    }
    await assertOwnAssignedRoute(tenantId, employee, { route_id: checklist.route_id });
  });
  return submitPreoperationalChecklist(tenantId, user, id, input);
}

async function ensureActivityTypes() {
  const current = await prisma.activityType.findMany({ take: 1 });
  if (current.length) return;
  await prisma.activityType.createMany({
    data: DEFAULT_ACTIVITY_TYPES.map((name, index) => ({
      name,
      description: "Catalogo operativo inicial APEXOS",
      sort_order: (index + 1) * 10,
      active: true,
      metadata: { source: "apexos_operational_traceability" }
    })),
    skipDuplicates: true
  });
}

async function listActivityTypes(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    await ensureActivityTypes();
    const rows = await prisma.activityType.findMany({
      where: query.active == null ? {} : { active: query.active === "true" || query.active === true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }]
    });
    return rows.map((row) => ({
      ...row,
      code: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) && row.metadata.code ? row.metadata.code : String(row.id)
    }));
  });
}

async function createActivityType(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.activityType.create({
    data: {
      name: input.name,
      description: input.description || "",
      active: input.active !== false,
      sort_order: Number(input.sort_order || 100),
      metadata: input.metadata || {}
    }
  }));
}

async function updateActivityType(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.activityType.update({
    where: { id: Number(id) },
    data: {
      name: input.name,
      description: input.description || "",
      active: input.active !== false,
      sort_order: Number(input.sort_order || 100),
      metadata: input.metadata || {}
    }
  }));
}

async function findOrCreateActivityType(input) {
  await ensureActivityTypes();
  const requested = String(input.activity_type_id || "").trim();
  const requestedId = Number(requested);
  if (Number.isInteger(requestedId) && requestedId > 0) {
    const byId = await prisma.activityType.findFirst({ where: { id: requestedId, active: true } });
    if (byId) return byId;
  }
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  const requestedCode = String(metadata.activity_type_code || requested).trim();
  const requestedName = String(metadata.activity_type_name || "").trim();
  const rows = await prisma.activityType.findMany({ where: { __includeInactive: true } });
  const existing = rows.find((row) => {
    const rowMetadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
    return (requestedCode && String(rowMetadata.code || row.id) === requestedCode)
      || (requested && row.name === requested)
      || (requestedName && row.name === requestedName);
  });
  if (existing) {
    if (existing.active !== false) return existing;
    return prisma.activityType.update({
      where: { id: existing.id },
      data: { active: true }
    });
  }
  const name = requestedName || requested;
  if (!name) {
    const err = new Error("Tipo de actividad no encontrado.");
    err.statusCode = 422;
    throw err;
  }
  return prisma.activityType.create({
    data: {
      name,
      description: "Creado desde maestro de actividades",
      active: true,
      sort_order: Number(metadata.activity_type_sort_order || 100),
      metadata: { code: requestedCode || requested, source: "work_activity_master_sync" }
    }
  });
}

async function findCurrentWorkSession({ employee, userName, routeId = null, date = new Date() }) {
  const identityAliases = Array.from(new Set([
    ...(employee ? aliasesForEmployee(employee) : []),
    userName
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
  return prisma.workSession.findFirst({
    where: {
      ...operationalIdentityRouteWhere(employee, userName, routeId, identityAliases),
      date: { gte: startOfDay(date), lt: endOfDay(date) },
      status: "activa"
    },
    orderBy: { started_at: "desc" },
    include: { activities: { include: { activity_type: true, evidence: true }, orderBy: { occurred_at: "desc" }, take: 50 } }
  });
}

function punchIdentityWhere(employee, userName, extraAliases = []) {
  const aliases = Array.from(new Set([
    ...(employee ? aliasesForEmployee(employee) : []),
    userName,
    ...extraAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
  const OR = [
    ...(employee?.id ? [{ employee_id: employee.id }] : []),
    ...(aliases.length ? [{ user_name: { in: aliases } }] : [])
  ];
  return OR.length ? { OR } : { user_name: userName || "" };
}

function operationalIdentityRouteWhere(employee, userName, routeId = null, extraAliases = []) {
  return {
    AND: [
      punchIdentityWhere(employee, userName, extraAliases),
      routeScopeWhere(routeId)
    ].filter((item) => Object.keys(item).length)
  };
}

async function latestPunchesForEmployee(employee, userName, date = new Date(), routeId = null, extraAliases = []) {
  return prisma.timePunch.findMany({
    where: {
      ...operationalIdentityRouteWhere(employee, userName, routeId, extraAliases),
      date: { gte: startOfDay(date), lt: endOfDay(date) }
    },
    orderBy: { punched_at: "asc" }
  });
}

async function ensureWorkSessionFromPunches({ employee, userName, routeId = null, date = new Date(), vehiclePlate = "", extraAliases = [] }) {
  const punches = await latestPunchesForEmployee(employee, userName, date, routeId, extraAliases);
  if (!punches.length || !punches.some((punch) => punch.type === "entrada") || punches.some((punch) => punch.type === "salida")) return null;
  const entry = punches.find((punch) => punch.type === "entrada");
  const lunchStart = punches.find((punch) => punch.type === "inicio_almuerzo");
  const lunchEnd = punches.find((punch) => punch.type === "fin_almuerzo");
  const resolvedRouteId = routeId || entry?.route_id || null;
  const resolvedUserName = userName || entry?.user_name || employeeUserName(employee, "");
  const existing = await prisma.workSession.findFirst({
    where: {
      ...operationalIdentityRouteWhere(employee, resolvedUserName, resolvedRouteId, extraAliases),
      date: { gte: startOfDay(date), lt: endOfDay(date) },
      status: "activa"
    },
    orderBy: { started_at: "desc" },
    include: { activities: { include: { activity_type: true, evidence: true }, orderBy: { occurred_at: "desc" }, take: 50 } }
  });
  if (existing) return existing;
  const session = await prisma.workSession.create({
    data: {
      employee_id: employee?.id || entry?.employee_id || null,
      user_name: resolvedUserName,
      date: startOfDay(date),
      status: "activa",
      started_at: entry?.punched_at || new Date(),
      lunch_started_at: lunchStart?.punched_at || null,
      lunch_ended_at: lunchEnd?.punched_at || null,
      entry_punch_id: entry?.id || null,
      route_id: resolvedRouteId ? Number(resolvedRouteId) : null,
      vehicle_plate: vehiclePlate || entry?.vehicle_plate || "",
      metadata: {
        repaired_from: "time_punches",
        employee_name: employeeDisplayName(employee) || resolvedUserName,
        identity_aliases: employee ? aliasesForEmployee(employee) : [resolvedUserName].filter(Boolean)
      }
    },
    include: { activities: { include: { activity_type: true, evidence: true }, orderBy: { occurred_at: "desc" }, take: 50 } }
  });
  return session;
}

async function getCurrentWorkSession(tenantId, user, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await getCurrentEmployee(tenantId, user).catch(() => null);
    const userName = query.user_name || employeeUserName(employee, user?.name || user?.email || "");
    const routeId = optionalNumericId(query.route_id);
    const session = await findCurrentWorkSession({ employee, userName, routeId, date: query.date || new Date() })
      || await ensureWorkSessionFromPunches({ employee, userName, routeId, date: query.date || new Date() });
    const activities = session?.activities || [];
    return {
      session,
      active: Boolean(session),
      activities,
      alerts: buildSessionAlerts(session, activities)
    };
  });
}

async function getOwnWorkSession(tenantId, user, query = {}) {
  const employee = await getCurrentEmployee(tenantId, user);
  await prisma.runWithTenant(tenantId, () => assertOwnAssignedRoute(tenantId, employee, query));
  return getCurrentWorkSession(tenantId, user, {
    date: query.date,
    route_id: query.route_id
  });
}

function buildSessionAlerts(session, activities = []) {
  const alerts = [];
  if (session && !activities.length) alerts.push({ type: "sin_actividades", severity: "warning", message: "Jornada activa sin actividades registradas." });
  if (session && new Date().getTime() - new Date(session.started_at).getTime() > 12 * 3600000) alerts.push({ type: "jornada_sin_cierre", severity: "critica", message: "Jornada activa por mas de 12 horas sin cierre." });
  for (const activity of activities) {
    if (String(activity.activity_type_name || "").toLowerCase().includes("varado")) alerts.push({ type: "vehiculo_varado", severity: "critica", message: "Vehiculo varado reportado." });
    if (String(activity.activity_type_name || "").toLowerCase().includes("novedad")) alerts.push({ type: "novedad_ruta", severity: "warning", message: "Novedad en ruta registrada." });
    if (Number(activity.accuracy_meters || 0) > 80) alerts.push({ type: "gps_baja_precision", severity: "warning", message: "Actividad con baja precision GPS." });
    if (!activity.evidence?.length) alerts.push({ type: "evidencia_faltante", severity: "warning", message: "Actividad sin evidencia." });
  }
  return alerts.slice(0, 10);
}

async function listWorkActivities(tenantId, query = {}) {
  const range = boundedReportRange(query);
  return prisma.runWithTenant(tenantId, async () => prisma.workActivity.findMany({
    where: {
      occurred_at: { gte: range.start, lt: range.end },
      ...(query.user_name ? { user_name: query.user_name } : {}),
      ...(query.session_id ? { session_id: Number(query.session_id) } : {}),
      ...(query.activity_type_id ? { activity_type_id: Number(query.activity_type_id) } : {})
    },
    include: { activity_type: true, evidence: true },
    orderBy: { occurred_at: "desc" },
    take: Math.min(Number(query.limit || 200), 5000)
  }));
}

async function createWorkActivity(tenantId, user, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const gpsSkipped = input.gps_required === false || input.gps_skipped === true || input.latitude == null || input.longitude == null;
    const gpsUnavailable = gpsUnavailableFromInput(input);
    // gpsSkipped ya es verdadero cuando faltan las coordenadas, asi que la comprobacion
    // anterior nunca disparaba. Se exige GPS solo cuando el llamador lo declara requerido
    // y se admite la excepcion de marcacion sin senal, que deja novedad.
    if (input.gps_required === true && (input.latitude == null || input.longitude == null) && !gpsUnavailable) {
      const err = new Error("GPS obligatorio para registrar actividad.");
      err.statusCode = 422;
      err.code = "GPS_OBLIGATORIO_SIN_UBICACION";
      throw err;
    }
    if (!input.photo?.base64) {
      const err = new Error("La foto es obligatoria.");
      err.statusCode = 422;
      throw err;
    }
    assertSafeFile({ base64_data: input.photo.base64, file_name: input.photo.name, mime_type: input.photo.type, file_size: input.photo.size }, { maxBytes: MAX_EVIDENCE_BYTES });
    const employeeId = optionalNumericId(input.employee_id);
    const inputRouteId = operationalRouteNumericId(input);
    const employee = employeeId
      ? await prisma.employee.findFirst({ where: { id: employeeId, tenant_id: tenantId }, include: { user: { select: { name: true, email: true } } } })
      : await getCurrentEmployee(tenantId, user).catch(() => null);
    const requestAliases = inputIdentityAliases(input);
    const explicitUserName = String(input.user_name || "").trim();
    const userName = (!isGenericEmployeeAlias(explicitUserName) && explicitUserName) || employeeUserName(employee, user?.name || user?.email || "");
    // findCurrentWorkSession y ensureWorkSessionFromPunches ya aceptan date, pero aqui no se
    // les pasaba: resolvian siempre contra hoy. Una actividad registrada sin senal durante la
    // jornada y sincronizada al dia siguiente moria con 422 JORNADA_ACTIVA_REQUERIDA aunque la
    // marcacion diferida de esa misma jornada si se aceptara. La sesion se busca en el dia en
    // que la actividad ocurrio de verdad.
    const occurredAt = input.occurred_at ? new Date(input.occurred_at) : new Date();
    const sessionDay = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
    const session = await findCurrentWorkSession({ employee, userName, routeId: inputRouteId, date: sessionDay })
      || await ensureWorkSessionFromPunches({ employee, userName, routeId: inputRouteId, vehiclePlate: input.vehicle_plate || "", extraAliases: requestAliases, date: sessionDay });
    if (!session) {
      const err = new Error("No hay jornada activa. Marca Entrada antes de registrar actividades.");
      err.statusCode = 422;
      err.code = "JORNADA_ACTIVA_REQUERIDA";
      throw err;
    }
    if (session.closed_at || session.status === "cerrada") {
      const err = new Error("La jornada ya esta cerrada. No se pueden agregar actividades.");
      err.statusCode = 422;
      throw err;
    }
    const activityType = await findOrCreateActivityType(input);
    const activity = await prisma.workActivity.create({
      data: {
        session_id: session.id,
        activity_type_id: activityType.id,
        activity_type_name: activityType.name,
        employee_id: employee?.id || session.employee_id,
        user_name: userName || session.user_name,
        route_id: inputRouteId || session.route_id,
        vehicle_plate: input.vehicle_plate || session.vehicle_plate || "",
        occurred_at: input.occurred_at ? new Date(input.occurred_at) : new Date(),
        latitude: gpsSkipped ? 0 : Number(input.latitude),
        longitude: gpsSkipped ? 0 : Number(input.longitude),
        accuracy_meters: gpsSkipped ? null : input.accuracy_meters,
        approximate_address: input.approximate_address || "",
        observation: String(input.observation || ""),
        alert_level: !gpsSkipped && Number(input.accuracy_meters || 0) > 80 || activityType.name.toLowerCase().includes("varado") || activityType.name.toLowerCase().includes("novedad") ? "warning" : "normal",
        metadata: {
          ...routeEventMetadata(input, inputRouteId || session.route_id),
          gps_required: input.gps_required !== false,
          gps_skipped: gpsSkipped,
          tracking_mode: gpsSkipped ? "punch_only" : "gps",
          supplied_user_name: input.user_name || "",
          employee_code: employee?.code || "",
          employee_name: employeeDisplayName(employee) || userName || session.user_name,
          user_email: employee?.user?.email || user?.email || "",
          identity_aliases: Array.from(new Set([...(employee ? aliasesForEmployee(employee) : []), ...requestAliases, userName || session.user_name].filter(Boolean)))
        }
      }
    });
    if (gpsUnavailable) {
      const persistedOccurredAt = activity.occurred_at instanceof Date ? activity.occurred_at : new Date(activity.occurred_at);
      await recordGpsUnavailableNovelty(prisma, {
        tenantId,
        employeeId: activity.employee_id,
        routeId: activity.route_id || null,
        moment: persistedOccurredAt,
        segment: `actividad-${activity.id}:${timeString(persistedOccurredAt).slice(0, 5)}`,
        detail: gpsUnavailable
      });
    }
    const fileName = normalizeFileName(input.photo.name || `actividad-${activity.id}.jpg`);
    const uploaderKey = String(user?.id || session.employee_id || "operador").replace(/[^a-zA-Z0-9_-]/g, "");
    await prisma.activityEvidence.create({
      data: {
        activity_id: activity.id,
        evidence_type: "photo",
        file_name: fileName,
        base64_data: input.photo.base64,
        mime_type: input.photo.type,
        file_size: input.photo.size,
        storage_path: secureStoragePath({ tenantId, module: "hr", entity: `work-sessions/${session.id}/users/${uploaderKey}/activities`, entityId: activity.id, fileName }),
        uploaded_by: user?.id || null,
        metadata: { storage_hint: "company_id/module/work_session_id/user_id/activity_id/file" }
      }
    });
    if (!gpsSkipped) {
      await prisma.gpsPing.create({
        data: {
          employee_id: employee?.id || session.employee_id,
          user_name: userName || session.user_name,
          vehicle_plate: input.vehicle_plate || session.vehicle_plate || "",
          route_id: inputRouteId || session.route_id,
          latitude: Number(input.latitude),
          longitude: Number(input.longitude),
          accuracy_meters: input.accuracy_meters,
          source: "work_activity",
          captured_at: activity.occurred_at,
          metadata: {
            activity_id: activity.id,
            activity_type: activityType.name,
            ...routeEventMetadata(input, inputRouteId || session.route_id),
            supplied_user_name: input.user_name || "",
            employee_code: employee?.code || "",
            employee_name: employeeDisplayName(employee) || userName || session.user_name,
            user_email: employee?.user?.email || user?.email || "",
            identity_aliases: Array.from(new Set([...(employee ? aliasesForEmployee(employee) : []), ...requestAliases, userName || session.user_name].filter(Boolean)))
          }
        }
      });
    }
    return prisma.workActivity.findFirst({
      where: { id: activity.id },
      include: { activity_type: true, evidence: true }
    });
  });
}

async function createOwnWorkActivity(tenantId, user, input) {
  const employee = await getCurrentEmployee(tenantId, user);
  await prisma.runWithTenant(tenantId, () => assertOwnAssignedRoute(tenantId, employee, input));
  return createWorkActivity(tenantId, user, ownOperationalInput(input, employee, user));
}

async function getPreoperationalMetrics(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const from = query.date ? startOfDay(query.date) : startOfDay();
    const to = endOfDay(from);
    const [today, pending, blocked, findings, routes] = await Promise.all([
      prisma.routePreoperationalChecklist.findMany({ where: { created_at: { gte: from, lt: to } } }),
      prisma.routePreoperationalChecklist.count({ where: { checklist_status: { in: ["pendiente", "en_proceso"] } } }),
      prisma.routePreoperationalChecklist.count({ where: { checklist_status: "bloqueado", created_at: { gte: from, lt: to } } }),
      prisma.routePreoperationalFinding.findMany({ where: { created_at: { gte: from, lt: to } } }),
      prisma.timeRoute.findMany({ where: { date: { gte: from, lt: to } } })
    ]);
    const completed = today.filter((item) => ["aprobado", "aprobado_con_novedad", "bloqueado"].includes(item.checklist_status));
    const avgMinutes = completed.length
      ? Math.round(completed.reduce((sum, item) => sum + Math.max(0, ((item.completed_at || item.updated_at).getTime() - item.started_at.getTime()) / 60000), 0) / completed.length)
      : 0;
    const by = (field) => findings.reduce((acc, item) => ({ ...acc, [item[field] || "sin_dato"]: (acc[item[field] || "sin_dato"] || 0) + 1 }), {});
    return {
      checklists_today: today.length,
      checklists_pending: pending,
      routes_blocked: blocked,
      critical_vehicle_findings: findings.filter((item) => item.severity === "critica").length,
      drivers_without_route: 0,
      average_completion_minutes: avgMinutes,
      compliance_rate: routes.length ? Math.round((completed.length / routes.length) * 100) : 100,
      approved_with_findings: today.filter((item) => item.checklist_status === "aprobado_con_novedad").length,
      findings_by_type: by("finding_type"),
      findings_by_plate: by("plate"),
      findings_by_driver: by("driver_id")
    };
  });
}

async function createPunch(tenantId, input, user, options = {}) {
  // El ambito lo fija el servidor, no el payload: un cliente de la ruta administrativa
  // no puede declararse self-service para esquivar la novedad de ajuste manual.
  const ownScope = options.scope === "own";
  const idempotencyKey = String(input.idempotency_key || input.metadata?.idempotency_key || "").trim().slice(0, 120) || null;
  const attemptPunch = async (tx) => {
    const punchedAt = input.punched_at ? new Date(input.punched_at) : new Date();
    const currentEmployee = user?.id ? await tx.employee.findFirst({
      where: { tenant_id: tenantId, OR: [{ user_id: user.id }, { user: { email: user.email || "" } }] },
      include: { user: { select: { name: true, email: true } } }
    }) : null;
    // El ambito self-service queda anclado al usuario autenticado: es lo que impide marcar
    // por otra persona. En la ruta administrativa el destino lo declara el payload: un
    // employee_id que no existe en el tenant del solicitante era redirigido en silencio a la
    // propia ficha del admin, dejando la correccion y la novedad AJUSTE_MANUAL_MARCACION
    // sobre la persona equivocada sin error visible. Ahora falla explicitamente para que el
    // error se capture en el punto de origen en lugar de corromper el destino de la marca.
    const declaredEmployeeId = !ownScope && input.employee_id != null && input.employee_id !== ""
      ? Number(input.employee_id)
      : null;
    if (declaredEmployeeId != null && !Number.isInteger(declaredEmployeeId)) {
      throw validationError(`El empleado declarado no es un identificador valido: ${input.employee_id}.`, 422, "EMPLEADO_NO_ENCONTRADO");
    }
    const declaredEmployee = declaredEmployeeId != null
      ? await tx.employee.findFirst({
        where: { tenant_id: tenantId, id: declaredEmployeeId },
        include: { user: { select: { name: true, email: true } } }
      })
      : null;
    if (declaredEmployeeId != null && !declaredEmployee) {
      throw validationError(`El empleado ${input.employee_id} no existe o no pertenece a tu organizacion.`, 404, "EMPLEADO_NO_ENCONTRADO");
    }
    const employee = declaredEmployee || currentEmployee || await resolveEmployeeForPunch(tenantId, input);
    const type = normalizePunchType(input.type || input.tipo_marca);
    const inputRouteId = operationalRouteNumericId(input);
    const route = inputRouteId ? await tx.timeRoute.findFirst({ where: { tenant_id: tenantId, id: inputRouteId } }) : null;
    const lockScope = `${tenantId}:${employee.id}:${route?.id || inputRouteId || "sin-horario"}:${startOfDay(punchedAt).toISOString()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))`;
    if (idempotencyKey) {
      const replayedPunch = await tx.timePunch.findFirst({ where: { tenant_id: tenantId, idempotency_key: idempotencyKey } });
      if (replayedPunch && replayedPunch.employee_id !== employee.id) {
        throw validationError("La clave de idempotencia ya pertenece a otra marcacion.", 409, "IDEMPOTENCY_KEY_CONFLICT");
      }
      if (replayedPunch) {
        return { ok: true, replayed: true, hora: replayedPunch.time, punch: replayedPunch, next: null };
      }
    }
    const preopApproved = isDriver(employee) && route?.vehicle_plate && type === "entrada"
      ? await tx.routePreoperationalChecklist.findFirst({
        where: {
          tenant_id: tenantId,
          route_id: route.id,
          driver_id: employee.id,
          checklist_status: { in: ["aprobado", "aprobado_con_novedad"] }
        },
        orderBy: { completed_at: "desc" }
      })
      : null;
    if (isDriver(employee) && route?.vehicle_plate && type === "entrada" && !preopApproved) {
      const preop = await ensurePreoperationalChecklist({ tenantId, user, employee, route, punch: null, input, db: tx });
      return {
        ok: false,
        preoperational_required: true,
        preoperational_checklist: preop ? { ...preop, id: Number(preop.id) } : null,
        route_authorized: false,
        message: "Checklist preoperacional obligatorio antes de iniciar jornada."
      };
    }
    const requestAliases = inputIdentityAliases(input);
    const explicitUserName = String(input.user_name || "").trim();
    const resolvedUserName = (!isGenericEmployeeAlias(explicitUserName) && explicitUserName) || employeeUserName(employee, explicitUserName);
    const identityAliases = Array.from(new Set([...aliasesForEmployee(employee), ...requestAliases, resolvedUserName].filter(Boolean)));
    const punchesToday = await tx.timePunch.findMany({
      where: {
        tenant_id: tenantId,
        ...operationalIdentityRouteWhere(employee, resolvedUserName, route?.id || inputRouteId, identityAliases),
        date: { gte: startOfDay(punchedAt), lt: endOfDay(punchedAt) }
      },
      orderBy: { punched_at: "asc" }
    });
    const expectedType = nextPunchType(punchesToday);
    if (!expectedType) {
      throw validationError("La jornada ya esta completa para hoy.", 409, "JORNADA_COMPLETA");
    }
    if (type !== expectedType) {
      throw validationError(`La siguiente marcacion permitida es ${expectedType}.`, 409, "MARCACION_FUERA_DE_SECUENCIA");
    }
    const routeVehicle = String(route?.vehicle_plate || input.vehicle_plate || "").trim();
    const mileagePrecision = Number(input.metadata?.mileage_precision ?? input.metadata?.kilometraje_precision ?? 1);
    const dayMileage = type === "salida" && routeVehicle
      ? hrPolicy.validateMileage(input.kilometraje_dia ?? input.day_mileage_km ?? input.metadata?.kilometraje_dia, { precision: mileagePrecision })
      : null;
    const mileageThreshold = Number(input.metadata?.kilometraje_umbral_inusual ?? input.metadata?.unusual_mileage_threshold_km ?? 450);
    const mileageUnusual = dayMileage != null && Number.isFinite(mileageThreshold) && dayMileage > mileageThreshold;
    const extraMinutes = type === "salida" && route?.end_time
      ? (() => {
          const colParts = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(punchedAt);
          const currentMinutes = Number(colParts.find((p) => p.type === "hour")?.value || punchedAt.getHours()) * 60
            + Number(colParts.find((p) => p.type === "minute")?.value || punchedAt.getMinutes());
          return Math.max(0, currentMinutes - (Number(route.end_time.slice(0, 2)) * 60 + Number(route.end_time.slice(3, 5))) - Number(route.tolerance_minutes || 0));
      })()
      : 0;
    const extraEvidence = normalizeExtraEvidence(input.extra_evidence);
    if (extraMinutes > 0 && (!String(input.extra_reason || "").trim() || !String(input.extra_detail || "").trim())) {
      const err = new Error("Justifica por que estas marcando fuera de tu horario habitual.");
      err.statusCode = 422;
      err.code = "JUSTIFICACION_HORA_EXTRA_REQUERIDA";
      err.details = { extra_minutes: extraMinutes };
      throw err;
    }
    if (extraMinutes > 0 && !extraEvidence) {
      const err = new Error("Adjunta evidencia fotografica para sustentar la extension de horario.");
      err.statusCode = 422;
      err.code = "EVIDENCIA_HORA_EXTRA_REQUERIDA";
      err.details = { extra_minutes: extraMinutes };
      throw err;
    }
    if (extraEvidence) {
      assertSafeFile({
        base64_data: extraEvidence.base64,
        file_name: extraEvidence.name,
        mime_type: extraEvidence.type,
        file_size: extraEvidence.size
      }, { maxBytes: MAX_EVIDENCE_BYTES });
    }
    const punch = await tx.timePunch.create({
      data: {
        tenant_id: tenantId,
        employee_id: employee.id,
        user_name: resolvedUserName,
        type,
        punched_at: punchedAt,
        date: startOfDay(punchedAt),
        time: timeString(punchedAt),
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_meters: input.accuracy_meters,
        vehicle_plate: routeVehicle,
        route_id: route?.id || inputRouteId,
        extra_minutes: extraMinutes,
        extra_reason: input.extra_reason,
        extra_detail: input.extra_detail,
        extra_evidence: extraEvidence ? {
          name: normalizeFileName(extraEvidence.name || `extension-${employee.id}.jpg`),
          type: extraEvidence.type || "image/jpeg",
          size: extraEvidence.size || null,
          base64_data: extraEvidence.base64,
          storage_path: secureStoragePath({
            tenantId,
            module: "hr",
            entity: "overtime-extensions",
            entityId: employee.id,
            fileName: extraEvidence.name || `extension-${employee.id}.jpg`
          })
        } : {},
        metadata: {
          ...routeEventMetadata(input, route?.id || inputRouteId),
          supplied_user_name: input.user_name || "",
          employee_code: employee.code || "",
          employee_name: employeeDisplayName(employee) || resolvedUserName,
          user_email: employee.user?.email || user?.email || "",
          identity_aliases: identityAliases,
          ...(dayMileage != null ? {
            kilometraje_dia: dayMileage,
            mileage: {
              value: dayMileage,
              unit: "km",
              vehicle_plate: routeVehicle,
              unusual: mileageUnusual,
              threshold: mileageThreshold
            }
          } : {})
        },
        idempotency_key: idempotencyKey
      }
    });
    const gpsUnavailable = gpsUnavailableFromInput(input);
    if (gpsUnavailable) {
      await recordGpsUnavailableNovelty(tx, {
        tenantId,
        employeeId: employee.id,
        routeId: route?.id || inputRouteId || null,
        moment: punchedAt,
        segment: `${type}:${timeString(punchedAt).slice(0, 5)}`,
        detail: gpsUnavailable
      });
    }
    if (!ownScope && startOfDay(punchedAt).toISOString().slice(0, 10) !== startOfDay().toISOString().slice(0, 10)) {
      await recordManualAdjustmentNovelty(tx, {
        tenantId,
        employeeId: employee.id,
        routeId: route?.id || inputRouteId || null,
        moment: punchedAt,
        segment: `${type}:${timeString(punchedAt).slice(0, 5)}`,
        detail: { reason: input.extra_reason, detail: input.extra_detail, userId: user?.id || null }
      });
    }
    if (dayMileage != null) {
      const mileageRouteId = route?.id || inputRouteId || null;
      const mileageMetadata = JSON.stringify({ source: "time_punch", unusual: mileageUnusual, threshold: mileageThreshold });
      // El indice unico parcial de th_jornada_kilometrajes difiere entre ambientes
      // (columnas planas vs COALESCE), por lo que el upsert no puede inferirlo con
      // ON CONFLICT; se serializa el renglon activo con lock y se resuelve select/update/insert.
      const mileageLockScope = `${tenantId}:kilometraje:${mileageRouteId ?? "sin-ruta"}:${employee.id}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${mileageLockScope}, 0))`;
      const activeMileage = await tx.$queryRaw`
        SELECT id FROM th_jornada_kilometrajes
        WHERE tenant_id = ${tenantId}
          AND COALESCE(route_id, -1) = COALESCE(${mileageRouteId}::int, -1)
          AND COALESCE(employee_id, -1) = ${employee.id}
          AND active = true
        LIMIT 1
      `;
      if (activeMileage.length) {
        await tx.$executeRaw`
          UPDATE th_jornada_kilometrajes
          SET punch_id = ${punch.id}, vehicle_plate = ${routeVehicle}, value = ${dayMileage}, unit = 'km',
              reported_by = ${user?.id || null}, reported_at = ${punchedAt}, metadata = ${mileageMetadata}::jsonb
          WHERE id = ${activeMileage[0].id}
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO th_jornada_kilometrajes (
            tenant_id, employee_id, route_id, punch_id, vehicle_plate, value, unit, reported_by, reported_at, active, metadata
          )
          VALUES (
            ${tenantId}, ${employee.id}, ${mileageRouteId}, ${punch.id}, ${routeVehicle}, ${dayMileage}, 'km', ${user?.id || null}, ${punchedAt}, true,
            ${mileageMetadata}::jsonb
          )
        `;
      }
      if (mileageUnusual) {
        await tx.$executeRaw`
          INSERT INTO th_novedades_jornada (
            tenant_id, logical_key, employee_id, route_id, date, type_code, status, origin, minutes, hours, requires_review, metadata
          )
          VALUES (
            ${tenantId},
            ${hrPolicy.noveltyLogicalKey({ tenantId, employeeId: employee.id, date: punchedAt.toISOString().slice(0, 10), routeId: route?.id || inputRouteId, typeCode: "KILOMETRAJE_INCONSISTENTE" })},
            ${employee.id}, ${route?.id || inputRouteId || null}, ${startOfDay(punchedAt)}, 'KILOMETRAJE_INCONSISTENTE', 'pendiente', 'automatico', 0, 0, false,
            ${JSON.stringify({ value: dayMileage, unit: "km", threshold: mileageThreshold, vehicle_plate: routeVehicle })}::jsonb
          )
          ON CONFLICT (tenant_id, logical_key)
          DO UPDATE SET updated_at = now(), metadata = EXCLUDED.metadata
        `.catch(() => null);
      }
    }
    if (input.latitude != null && input.longitude != null) {
      await tx.gpsPing.create({
        data: {
          tenant_id: tenantId,
          employee_id: employee.id,
          user_name: resolvedUserName,
          vehicle_plate: input.vehicle_plate || "",
          route_id: route?.id || inputRouteId,
          latitude: Number(input.latitude),
          longitude: Number(input.longitude),
          accuracy_meters: input.accuracy_meters,
          source: "time_punch",
          captured_at: punchedAt,
          metadata: {
            type,
            ...routeEventMetadata(input, route?.id || inputRouteId),
            supplied_user_name: input.user_name || "",
            employee_code: employee.code || "",
            employee_name: employeeDisplayName(employee) || resolvedUserName,
            user_email: employee.user?.email || user?.email || "",
            identity_aliases: identityAliases
          }
        }
      });
    }
    const sessionData = {
      employee_id: employee.id,
      user_name: resolvedUserName,
      date: startOfDay(punchedAt),
      route_id: route?.id || inputRouteId,
      vehicle_plate: input.vehicle_plate || "",
      metadata: {
        source: "time_punch",
        ...routeEventMetadata(input, route?.id || inputRouteId),
        supplied_user_name: input.user_name || "",
        employee_code: employee.code || "",
        employee_name: employeeDisplayName(employee) || resolvedUserName,
        user_email: employee.user?.email || user?.email || "",
        identity_aliases: identityAliases
      }
    };
    if (type === "entrada") {
      const approvedChecklist = await tx.routePreoperationalChecklist.findFirst({
        where: {
          tenant_id: tenantId,
          route_id: route?.id || inputRouteId || undefined,
          driver_id: employee.id,
          checklist_status: { in: ["aprobado", "aprobado_con_novedad"] }
        },
        orderBy: { completed_at: "desc" }
      }).catch(() => null);
      const existing = await tx.workSession.findFirst({
        where: { tenant_id: tenantId, ...operationalIdentityRouteWhere(employee, resolvedUserName, route?.id || inputRouteId, identityAliases), date: { gte: startOfDay(punchedAt), lt: endOfDay(punchedAt) }, status: "activa" },
        orderBy: { started_at: "desc" }
      });
      if (existing) {
        await tx.workSession.update({
          where: { id: existing.id },
          data: { entry_punch_id: punch.id, started_at: punchedAt, route_id: route?.id || inputRouteId, vehicle_plate: input.vehicle_plate || existing.vehicle_plate, preop_checklist_id: approvedChecklist?.id || existing.preop_checklist_id }
        });
      } else {
        await tx.workSession.create({
          data: { tenant_id: tenantId, ...sessionData, status: "activa", started_at: punchedAt, entry_punch_id: punch.id, preop_checklist_id: approvedChecklist?.id || null }
        });
      }
    } else {
      const session = await tx.workSession.findFirst({
        where: { tenant_id: tenantId, ...operationalIdentityRouteWhere(employee, resolvedUserName, route?.id || inputRouteId, identityAliases), date: { gte: startOfDay(punchedAt), lt: endOfDay(punchedAt) }, status: "activa" },
        orderBy: { started_at: "desc" }
      });
      if (session) {
        const data = type === "inicio_almuerzo"
          ? { lunch_started_at: punchedAt }
          : type === "fin_almuerzo"
            ? { lunch_ended_at: punchedAt }
            : type === "salida"
              ? { closed_at: punchedAt, exit_punch_id: punch.id, status: "cerrada" }
              : {};
        if (Object.keys(data).length) await tx.workSession.update({ where: { id: session.id }, data });
      }
    }
    const preop = await ensurePreoperationalChecklist({ tenantId, user, employee, route, punch, input, db: tx });
    return {
      ok: true,
      hora: timeString(punchedAt),
      es_extra: extraMinutes > 0,
      minutos_extra: extraMinutes,
      alerta: extraMinutes > 0,
      punch,
      next: nextPunchType([...punchesToday, punch]),
      preoperational_required: Boolean(preop),
      preoperational_checklist: preop ? { ...preop, id: Number(preop.id) } : null,
      route_authorized: preop ? ["aprobado", "aprobado_con_novedad"].includes(preop.checklist_status) : true
    };
  };

  // Reintenta solo fallos transitorios de adquisicion/serializacion de transaccion.
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.runWithTenant(tenantId, () => prisma.$transaction((tx) => attemptPunch(tx), {
        maxWait: 10000,
        timeout: 20000
      }));
    } catch (error) {
      if (error.code === "P2002" && idempotencyKey) {
        const replayedPunch = await prisma.runWithTenant(tenantId, () => prisma.timePunch.findFirst({
          where: { tenant_id: tenantId, idempotency_key: idempotencyKey }
        }));
        const suppliedEmployeeId = numericId(input.employee_id);
        if (replayedPunch && suppliedEmployeeId && replayedPunch.employee_id !== suppliedEmployeeId) {
          throw validationError("La clave de idempotencia ya pertenece a otra marcacion.", 409, "IDEMPOTENCY_KEY_CONFLICT");
        }
        if (replayedPunch) return { ok: true, replayed: true, hora: replayedPunch.time, punch: replayedPunch, next: null };
      }
      const transientCodes = new Set(["P2024", "P2028", "P2034"]);
      if (!transientCodes.has(error.code || error.name)) throw error;
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  const unavailable = new Error("No fue posible confirmar la marcacion por alta concurrencia. Se reintentara automaticamente.");
  unavailable.statusCode = 503;
  unavailable.code = "MARCACION_CONCURRENCIA_TEMPORAL";
  unavailable.cause = lastError;
  throw unavailable;
}

function ownOperationalInput(input, employee, user) {
  const userName = employeeUserName(employee, user?.name || user?.email || "");
  return {
    ...input,
    employee_id: employee.id,
    user_name: userName,
    metadata: {
      ...(input.metadata || {}),
      current_user_only: true,
      supplied_employee_id: undefined,
      supplied_user_name: undefined
    }
  };
}

async function createOwnPunch(tenantId, user, input) {
  const employee = await getCurrentEmployee(tenantId, user);
  await prisma.runWithTenant(tenantId, () => assertOwnAssignedRoute(tenantId, employee, input));
  return createPunch(tenantId, ownOperationalInput(input, employee, user), user, { scope: "own" });
}

async function createGpsPing(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    // Solo buscar empleado existente — NO auto-crear. GPS pings son datos de presencia,
    // no deben contaminar el maestro de empleados con registros dummy.
    let employeeId = null;
    const employee = await findEmployee(input).catch(() => null);
    const resolvedName = employeeUserName(employee, input.user_name) || "desconocido";
    if (employee) employeeId = employee.id;
    return prisma.gpsPing.create({
      data: {
        employee_id: employeeId,
        user_name: resolvedName,
        vehicle_plate: input.vehicle_plate || "",
        route_id: operationalRouteNumericId(input),
        latitude: Number(input.latitude),
        longitude: Number(input.longitude),
        accuracy_meters: input.accuracy_meters,
        source: input.source || "mobile",
        captured_at: input.captured_at ? new Date(input.captured_at) : new Date(),
        metadata: {
          ...routeEventMetadata(input, operationalRouteNumericId(input)),
          supplied_user_name: input.user_name || "",
          employee_code: employee?.code || "",
          employee_name: employeeDisplayName(employee) || resolvedName,
          identity_aliases: employee ? aliasesForEmployee(employee) : [resolvedName].filter(Boolean)
        }
      }
    });
  });
}

async function createOwnGpsPing(tenantId, user, input) {
  const employee = await getCurrentEmployee(tenantId, user);
  await prisma.runWithTenant(tenantId, () => assertOwnAssignedRoute(tenantId, employee, input));
  return createGpsPing(tenantId, ownOperationalInput(input, employee, user));
}

async function listActiveGps(tenantId, query = {}) {
  const minutes = Math.min(Number(query.minutes || 30), 240);
  const since = new Date(Date.now() - minutes * 60000);
  return prisma.runWithTenant(tenantId, async () => {
    const pings = await prisma.gpsPing.findMany({
      where: { captured_at: { gte: since } },
      orderBy: { captured_at: "desc" },
      take: 500
    });
    const latest = new Map();
    for (const ping of pings) {
      if (!latest.has(ping.user_name)) latest.set(ping.user_name, ping);
    }
    return Array.from(latest.values()).map((ping) => ({
      ...ping,
      age_seconds: Math.max(0, Math.round((Date.now() - new Date(ping.captured_at).getTime()) / 1000))
    }));
  });
}

async function listGpsHistory(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : startOfDay();
  return prisma.runWithTenant(tenantId, async () => prisma.gpsPing.findMany({
    where: {
      ...(query.user_name ? { user_name: query.user_name } : {}),
      captured_at: { gte: day, lt: endOfDay(day) }
    },
    orderBy: { captured_at: "asc" },
    take: Math.min(Number(query.limit || 300), 1000)
  }));
}

async function getRouteTracking(tenantId, id, query = {}) {
  const day = query.date ? startOfDay(query.date) : null;
  return prisma.runWithTenant(tenantId, async () => {
    const route = await prisma.timeRoute.findFirstOrThrow({ where: { id: Number(id) } });
    const dateStart = day || startOfDay(route.date);
    const routeKey = String(Number(id));
    const routeScope = routeScopeWhere(id);
    // Buscar pings por route_id directo O por metadata route_id (backward compat)
    const pings = await prisma.gpsPing.findMany({
      where: {
        ...routeScope,
        captured_at: { gte: dateStart, lt: endOfDay(dateStart) }
      },
      orderBy: { captured_at: "asc" },
      take: Math.min(Number(query.limit || 800), 1500)
    });
    const punches = await prisma.timePunch.findMany({
      where: {
        ...routeScope,
        punched_at: { gte: dateStart, lt: endOfDay(dateStart) }
      },
      orderBy: { punched_at: "asc" },
      take: 500
    });
    const latestByUser = new Map();
    for (const ping of pings) latestByUser.set(ping.user_name, ping);
    const assigned = (Array.isArray(route.employees) ? route.employees : []).map((name) => ({ user_name: String(name), name: String(name) }));
    return {
      route: {
        ...route,
        employee_ids: assigned.map((person) => String(person.employee_id || person.user_name)).filter(Boolean),
        employee_names: assigned.map((person) => person.name || person.user_name).filter(Boolean),
        placa: route.vehicle_plate,
        equipo: route.employees,
        h_inicio: route.start_time,
        h_fin: route.end_time,
        viaticos: route.per_diem,
        tolerancia_minutos: route.tolerance_minutes
      },
      pings,
      punches,
      latest: Array.from(latestByUser.values()),
      totals: {
        pings: pings.length,
        punches: punches.length,
        active_users: latestByUser.size
      }
    };
  });
}

async function getOperationsMap(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : startOfDay();
  const activeMinutes = Math.min(Number(query.minutes || 30), 240);
  const footprintDays = Math.min(Number(query.footprint_days || 14), 60);
  const isLiveWindow = activeMinutes <= 60;
  const pingLimit = Math.min(Math.max(Number(query.ping_limit || (isLiveWindow ? 300 : 1000)), 100), 2000);
  const punchLimit = Math.min(Math.max(Number(query.punch_limit || (isLiveWindow ? 300 : 1000)), 100), 2000);
  const activityLimit = Math.min(Math.max(Number(query.activity_limit || (isLiveWindow ? 100 : 1000)), 100), 2000);
  const since = new Date(Date.now() - activeMinutes * 60000);
  return prisma.runWithTenant(tenantId, async () => {
    const [routes, employees, pings, punches, activities] = await Promise.all([
      prisma.timeRoute.findMany({
        where: {
          date: { gte: day, lt: endOfDay(day) },
          status: { not: "cancelled" }
        },
        orderBy: { start_time: "asc" },
        take: 200
      }),
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 500 }),
      prisma.gpsPing.findMany({
        where: { captured_at: { gte: day, lt: endOfDay(day) } },
        orderBy: { captured_at: "desc" },
        take: pingLimit
      }),
      prisma.timePunch.findMany({
        where: { date: { gte: day, lt: endOfDay(day) } },
        orderBy: { punched_at: "desc" },
        take: punchLimit
      }),
      prisma.workActivity.findMany({
        where: { occurred_at: { gte: day, lt: endOfDay(day) } },
        include: { activity_type: true, evidence: { select: monitorEvidenceSelect } },
        orderBy: { occurred_at: "desc" },
        take: activityLimit
      })
    ]);

    // Solo obtener huella extendida si es modo historico; en vivo los pings de hoy son suficientes
    const lastFootprints = footprintDays > 0 && !isLiveWindow && query.footprint_days !== "0"
      ? await prisma.gpsPing.findMany({
          where: { captured_at: { gte: new Date(day.getTime() - footprintDays * 86400000), lt: endOfDay(day) } },
          orderBy: { captured_at: "desc" },
          take: 1000
        })
      : pings;

    const employeeByAlias = new Map();
    for (const employee of employees) {
      for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
    }
    const resolveAssignedEmployee = (value) => employeeByAlias.get(normalizeKey(value));

    const locationPings = pings.filter((ping) => ping.metadata?.gps_skipped !== true);
    const latestPingByUser = new Map();
    const pingsByRoute = new Map();
    for (const ping of locationPings) {
      for (const alias of aliasesForOperationalRow(ping)) {
        const userKey = normalizeKey(alias);
        if (!latestPingByUser.has(userKey)) latestPingByUser.set(userKey, ping);
      }
      if (ping.route_id) {
        if (!pingsByRoute.has(Number(ping.route_id))) pingsByRoute.set(Number(ping.route_id), []);
        pingsByRoute.get(Number(ping.route_id)).push(ping);
      }
    }

    const lastFootprintByUser = new Map();
    for (const ping of lastFootprints.filter((item) => item.metadata?.gps_skipped !== true)) {
      for (const alias of aliasesForOperationalRow(ping)) {
        const userKey = normalizeKey(alias);
        if (!lastFootprintByUser.has(userKey)) lastFootprintByUser.set(userKey, ping);
      }
    }

    const latestPunchByUser = new Map();
    const punchesByRoute = new Map();
    for (const punch of punches) {
      for (const alias of aliasesForOperationalRow(punch)) {
        const userKey = normalizeKey(alias);
        if (!latestPunchByUser.has(userKey)) latestPunchByUser.set(userKey, punch);
      }
      if (punch.route_id && punch.latitude != null && punch.longitude != null) {
        if (!punchesByRoute.has(Number(punch.route_id))) punchesByRoute.set(Number(punch.route_id), []);
        punchesByRoute.get(Number(punch.route_id)).push(punch);
      }
    }

    const activitiesByRoute = new Map();
    const latestActivityByUser = new Map();
    for (const activity of activities) {
      for (const alias of aliasesForOperationalRow(activity)) {
        const userKey = normalizeKey(alias);
        if (!latestActivityByUser.has(userKey)) latestActivityByUser.set(userKey, activity);
      }
      if (activity.route_id && activity.latitude != null && activity.longitude != null) {
        if (!activitiesByRoute.has(Number(activity.route_id))) activitiesByRoute.set(Number(activity.route_id), []);
        activitiesByRoute.get(Number(activity.route_id)).push(activity);
      }
    }

    const people = [];
    for (const route of routes) {
      const assigned = Array.isArray(route.employees) ? route.employees : [];
      for (const assignedName of assigned) {
        const employee = resolveAssignedEmployee(assignedName);
        const aliases = employee ? aliasesForEmployee(employee) : [assignedName];
        const latestLivePing = aliases.map((alias) => latestPingByUser.get(normalizeKey(alias))).find(Boolean);
        const lastFootprint = aliases.map((alias) => lastFootprintByUser.get(normalizeKey(alias))).find(Boolean);
        const latestPing = latestLivePing || lastFootprint;
        const latestPunch = aliases.map((alias) => latestPunchByUser.get(normalizeKey(alias))).find(Boolean);
        const latestActivity = aliases.map((alias) => latestActivityByUser.get(normalizeKey(alias))).find(Boolean);
        const ageSeconds = latestPing ? Math.max(0, Math.round((Date.now() - new Date(latestPing.captured_at).getTime()) / 1000)) : null;
        const isOnline = Boolean(latestLivePing && new Date(latestLivePing.captured_at) >= since);
        const displayName = employeeDisplayName(employee)
          || displayNameForOperationalRow(latestPunch)
          || displayNameForOperationalRow(latestPing)
          || assignedName;
        const displayUserName = displayNameForOperationalRow(latestPunch)
          || displayNameForOperationalRow(latestPing)
          || (!isGenericEmployeeAlias(latestPing?.user_name) ? latestPing?.user_name : "")
          || (!isGenericEmployeeAlias(employee?.code) ? employee?.code : "")
          || displayName
          || assignedName;
        people.push({
          key: `${route.id}-${employee?.id || assignedName}`,
          employee_id: employee?.id || null,
          user_name: displayUserName,
          name: displayName,
          route_id: route.id,
          route_label: `Ruta ${route.id}`,
          vehicle_plate: route.vehicle_plate || latestPing?.vehicle_plate || latestPunch?.vehicle_plate || "",
          latitude: latestPing?.latitude || latestPunch?.latitude || null,
          longitude: latestPing?.longitude || latestPunch?.longitude || null,
          accuracy_meters: latestPing?.accuracy_meters || latestPunch?.accuracy_meters || null,
          captured_at: latestPing?.captured_at || latestPunch?.punched_at || null,
          age_seconds: ageSeconds,
          online: isOnline,
          footprint_source: isOnline ? "live" : latestPing ? "last_known" : latestPunch?.latitude != null ? "punch" : "none",
          last_punch_type: latestPunch?.type || "sin_marcar",
          last_punch_time: latestPunch?.time || "",
          last_activity_type: latestActivity?.activity_type_name || "",
          last_activity_time: latestActivity ? timeString(latestActivity.occurred_at) : "",
          status: latestPing ? (isOnline ? punchStatus(latestPunch?.type) : "Sin senal") : latestPunch?.latitude != null ? "Ultima marca" : "Sin GPS",
          time_in_route_minutes: routeElapsedMinutes(route, latestPunch),
          route_start_time: route.start_time || "",
          route_end_time: route.end_time || ""
        });
      }
    }

    const routeSummaries = routes.map((route) => {
      const assigned = people.filter((person) => person.route_id === route.id);
      const assignedAliases = new Set(assigned.flatMap((person) => [person.employee_id, person.user_name, person.name]).filter(Boolean).map((value) => normalizeKey(value)));
      const routeKey = String(route.id);
      const matchesAssigned = (row) => {
        const rowRouteKey = operationalRouteKey(row);
        if (rowRouteKey) return rowRouteKey === routeKey;
        return aliasesForOperationalRow(row).some((alias) => assignedAliases.has(normalizeKey(alias)));
      };
      const routePings = locationPings.filter(matchesAssigned).sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
      const routePunches = punches.filter((punch) => matchesAssigned(punch)).sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at));
      const routeActivities = activities.filter((activity) => matchesAssigned(activity)).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
      const marksByUser = new Map();
      for (const punch of routePunches) {
        const displayUserName = displayNameForOperationalRow(punch);
        if (!marksByUser.has(displayUserName)) marksByUser.set(displayUserName, []);
        marksByUser.get(displayUserName).push({
          id: punch.id,
          user_name: displayNameForOperationalRow(punch),
          type: punch.type,
          time: punch.time,
          punched_at: punch.punched_at,
          latitude: punch.latitude,
          longitude: punch.longitude,
          accuracy_meters: punch.accuracy_meters,
          vehicle_plate: punch.vehicle_plate,
          route_id: punch.route_id,
          extra_minutes: punch.extra_minutes,
          extra_reason: punch.extra_reason,
          extra_detail: punch.extra_detail,
          extra_evidence: monitorEvidenceSummary(punch.extra_evidence || {}, { id: punch.id, source: "punch" }),
          metadata: punch.metadata || {}
        });
      }
      const assignedCount = assigned.length;
      const closedUsers = Array.from(marksByUser.values()).filter((marks) => marks.some((mark) => mark.type === "salida")).length;
      const closedByPunches = assignedCount > 0 && closedUsers >= assignedCount;
      const routeStatus = ["closed", "cerrada", "completed"].includes(String(route.status || "").toLowerCase()) || closedByPunches
        ? "closed"
        : route.status || "active";
      return {
        ...route,
        employee_ids: assigned.map((person) => String(person.employee_id || person.user_name)).filter(Boolean),
        employee_names: assigned.map((person) => person.name || person.user_name).filter(Boolean),
        placa: route.vehicle_plate,
        equipo: route.employees,
        h_inicio: route.start_time,
        h_fin: route.end_time,
        gps_required: routeGpsRequired(route),
        tracking_mode: routeTrackingMode(route),
        metadata: { ...(route.metadata || {}), gps_required: routeGpsRequired(route), tracking_mode: routeTrackingMode(route) },
        status: routeStatus,
        assigned_count: assignedCount,
        closed_count: closedUsers,
        online_count: assigned.filter((person) => person.online).length,
        with_gps_count: assigned.filter((person) => person.latitude != null && person.longitude != null).length,
        pings: routePings,
        punch_points: routePunches.map((punch) => ({
          id: punch.id,
          user_name: displayNameForOperationalRow(punch),
          type: punch.type,
          time: punch.time,
          punched_at: punch.punched_at,
          latitude: punch.latitude,
          longitude: punch.longitude,
          accuracy_meters: punch.accuracy_meters,
          vehicle_plate: punch.vehicle_plate,
          route_id: punch.route_id,
          extra_minutes: punch.extra_minutes,
          extra_reason: punch.extra_reason,
          extra_detail: punch.extra_detail,
          extra_evidence: monitorEvidenceSummary(punch.extra_evidence || {}, { id: punch.id, source: "punch" }),
          metadata: punch.metadata || {}
        })),
        activity_points: routeActivities.map((activity) => ({
          id: activity.id,
          user_name: displayNameForOperationalRow(activity),
          type: activity.activity_type_name,
          time: timeString(activity.occurred_at),
          occurred_at: activity.occurred_at,
          latitude: activity.metadata?.gps_skipped ? null : activity.latitude,
          longitude: activity.metadata?.gps_skipped ? null : activity.longitude,
          accuracy_meters: activity.metadata?.gps_skipped ? null : activity.accuracy_meters,
          vehicle_plate: activity.vehicle_plate,
          route_id: activity.route_id,
          observation: activity.observation,
          evidence: (activity.evidence || []).map((evidence) => monitorEvidenceSummary(evidence, { source: "activity" })),
          metadata: activity.metadata || {}
        })),
        marks_by_user: Array.from(marksByUser.entries()).map(([user_name, marks]) => ({ user_name, marks }))
      };
    });

    // El mapa recorta por limites duros; sin esta senal la pantalla muestra un dia
    // incompleto como si estuviera completo.
    const truncationLimits = [
      { key: "routes", limit: 200, count: routes.length },
      { key: "people", limit: 500, count: employees.length },
      { key: "pings", limit: pingLimit, count: pings.length },
      { key: "punches", limit: punchLimit, count: punches.length },
      { key: "activities", limit: activityLimit, count: activities.length }
    ];
    const truncatedCollections = truncationLimits
      .filter((item) => item.count >= item.limit)
      .map((item) => ({ collection: item.key, limit: item.limit, returned: item.count }));

    return {
      date: day.toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      active_window_minutes: activeMinutes,
      footprint_window_days: footprintDays,
      people,
      routes: routeSummaries,
      truncation: {
        truncated: truncatedCollections.length > 0,
        collections: truncatedCollections,
        hint: truncatedCollections.length
          ? "El dia tiene mas registros que el limite de la ventana; amplie ping_limit/punch_limit/activity_limit o acote la fecha."
          : ""
      },
      totals: {
        routes: routes.length,
        planned_people: people.length,
        online: people.filter((person) => person.online).length,
        without_gps: people.filter((person) => person.latitude == null || person.longitude == null).length,
        offline: people.filter((person) => person.latitude != null && person.longitude != null && !person.online).length,
        truncated: truncatedCollections.length > 0
      }
    };
  });
}

async function latestPunchesForUser(userName, date = new Date(), routeId = null) {
  return prisma.timePunch.findMany({
    where: {
      user_name: userName,
      ...(routeId ? { route_id: Number(routeId) } : {}),
      date: { gte: startOfDay(date), lt: endOfDay(date) }
    },
    orderBy: { punched_at: "asc" }
  });
}

function nextPunchType(punches) {
  const order = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
  if (!punches.length) return "entrada";
  const last = punches[punches.length - 1].type;
  if (!last) return "entrada";
  const idx = order.indexOf(last);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}

async function listAttendance(tenantId, query = {}) {
  const range = boundedReportRange(query);
  return prisma.runWithTenant(tenantId, async () => {
    const punches = await prisma.timePunch.findMany({
      where: {
        date: { gte: range.start, lt: range.end },
        ...(query.user_name || query.usuario ? { user_name: query.user_name || query.usuario } : {})
      },
      orderBy: [{ user_name: "asc" }, { punched_at: "asc" }]
    });
    if (query.flat === "1" || query.legacy === "1") {
      return punches.map((punch) => ({
        usuario: punch.user_name,
        user_name: punch.user_name,
        placa: punch.vehicle_plate,
        vehiculo_placa: punch.vehicle_plate,
        tipo: punch.type,
        tipo_marca: punch.type,
        hora: punch.time,
        fecha: punch.date.toISOString().slice(0, 10),
        es_extra: punch.extra_minutes > 0,
        minutos_extra: punch.extra_minutes
      }));
    }
    const grouped = new Map();
    for (const punch of punches) {
      const key = `${punch.user_name}::${punch.route_id || "sin_horario"}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(punch);
    }
    return Array.from(grouped.values()).map((rows) => ({
      user_name: rows[0]?.user_name || "",
      route_id: rows[0]?.route_id || null,
      last_type: rows[rows.length - 1].type || "sin_marcar",
      next_type: nextPunchType(rows),
      punches: rows
    }));
  });
}

async function listOwnAttendance(tenantId, user, query = {}) {
  const employee = await getCurrentEmployee(tenantId, user);
  const day = query.date || query.fecha ? startOfDay(query.date || query.fecha) : startOfDay();
  const start = query.fecha_inicio ? startOfDay(query.fecha_inicio) : day;
  const end = query.fecha_fin ? endOfDay(query.fecha_fin) : endOfDay(day);
  const aliases = aliasesForEmployee(employee);
  return prisma.runWithTenant(tenantId, async () => {
    const punches = await prisma.timePunch.findMany({
      where: {
        date: { gte: start, lt: end },
        OR: [
          { employee_id: employee.id },
          ...(aliases.length ? [{ user_name: { in: aliases } }] : [])
        ]
      },
      orderBy: [{ punched_at: "asc" }]
    });
    if (query.flat === "1" || query.legacy === "1") {
      return punches.map((punch) => ({
        usuario: punch.user_name,
        user_name: punch.user_name,
        placa: punch.vehicle_plate,
        vehiculo_placa: punch.vehicle_plate,
        tipo: punch.type,
        tipo_marca: punch.type,
        hora: punch.time,
        fecha: punch.date.toISOString().slice(0, 10),
        es_extra: punch.extra_minutes > 0,
        minutos_extra: punch.extra_minutes
      }));
    }
    const grouped = new Map();
    for (const punch of punches) {
      const key = `${punch.user_name}::${punch.route_id || "sin_horario"}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(punch);
    }
    return Array.from(grouped.values()).map((rows) => ({
      user_name: rows[0]?.user_name || "",
      route_id: rows[0]?.route_id || null,
      last_type: rows[rows.length - 1].type || "sin_marcar",
      next_type: nextPunchType(rows),
      punches: rows
    }));
  });
}

async function processDay(tenantId, input = {}) {
  const day = startOfDay(input.date || new Date());
  return prisma.runWithTenant(tenantId, async () => {
    const [employees, schedules, punches] = await Promise.all([
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } } }),
      prisma.workSchedule.findMany({ where: { active: true } }),
      prisma.timePunch.findMany({ where: { date: { gte: day, lt: endOfDay(day) } }, orderBy: { punched_at: "asc" } })
    ]);
    const defaultSchedule = schedules[0];
    const holidays = new Set((input.holidays || []).map(String));
    const processed = [];
    for (const employee of employees) {
      const aliases = new Set([employee.code, employee.metadata?.name, employee.user?.name, employee.user?.email].filter(Boolean));
      const employeePunches = punches.filter((punch) => aliases.has(punch.user_name) || punch.employee_id === employee.id);
      const workday = processWorkday({ employee, schedule: defaultSchedule, punches: employeePunches, params: DEFAULT_PARAMS, holidays, date: day });
      if (!workday) continue;
      const row = await prisma.processedWorkday.upsert({
        where: { tenant_id_employee_id_date: { tenant_id: tenantId, employee_id: employee.id, date: day } },
        update: workday,
        create: { tenant_id: tenantId, ...workday }
      });
      processed.push(row);
    }
    return { ok: true, date: day.toISOString().slice(0, 10), processed: processed.length, data: processed };
  });
}

async function listWorkdays(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : null;
  return prisma.runWithTenant(tenantId, async () => prisma.processedWorkday.findMany({
    where: day ? { date: { gte: day, lt: endOfDay(day) } } : {},
    include: { employee: { include: { user: { select: safeUserSelect } } }, schedule: true },
    orderBy: { date: "desc" },
    take: 100
  }));
}

const LABOR_ENTITY_TYPES = new Set(["EPS", "PENSION", "FONDO_CESANTIAS", "ARL", "CAJA_COMPENSACION", "ICBF", "SENA"]);

function normalizeLaborEntityType(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "FONDO_PENSIONES" || normalized === "FONDO_DE_PENSIONES" || normalized === "PENSIONES") return "PENSION";
  if (normalized === "CESANTIAS" || normalized === "FONDO_CESANTIA" || normalized === "FONDO_DE_CESANTIAS") return "FONDO_CESANTIAS";
  if (normalized === "CAJA" || normalized === "CAJA_COMPENSACION_FAMILIAR") return "CAJA_COMPENSACION";
  if (!LABOR_ENTITY_TYPES.has(normalized)) throw validationError("Tipo de entidad laboral invalido.", 400, "TIPO_ENTIDAD_LABORAL_INVALIDO");
  return normalized;
}

function dateOnly(value, fallback = new Date()) {
  if (value == null || value === "") return fallback == null ? null : startOfDay(fallback);
  const date = startOfDay(value);
  if (Number.isNaN(date.getTime())) throw validationError("Fecha invalida.", 400, "FECHA_INVALIDA");
  return date;
}

function normalizeNit(value) {
  return String(value || "").replace(/[\s.-]/g, "").trim();
}

function laborEntityInternalCode(input = {}) {
  const supplied = String(input.internal_code || "").trim();
  if (supplied) return supplied.toUpperCase();
  const nit = normalizeNit(input.nit);
  if (nit) return `${String(input.entity_type || "ENT").trim().toUpperCase()}-${nit}`;
  return `${String(input.entity_type || "ENT").trim().toUpperCase()}-${String(input.legal_name || "ENTIDAD").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40)}`;
}

async function listLaborEntities(tenantId, query = {}) {
  const activeFilter = query.active == null ? null : query.active === true || query.active === "true";
  const typeFilter = query.entity_type || query.type ? normalizeLaborEntityType(query.entity_type || query.type) : null;
  const search = String(query.search || query.q || "").trim();
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT e.*,
      CASE WHEN e.accounting_party_id IS NULL THEN 'pendiente_enlace_contable' ELSE 'enlazada' END AS accounting_link_status,
      p.name AS accounting_party_name,
      p.legal_name AS accounting_party_legal_name,
      p.tax_id AS accounting_party_tax_id,
      CASE
        WHEN e.accounting_party_id IS NULL THEN false
        WHEN COALESCE(regexp_replace(p.tax_id, '[\\s.-]', '', 'g'), '') = COALESCE(regexp_replace(e.nit, '[\\s.-]', '', 'g'), '') THEN false
        ELSE true
      END AS nit_mismatch
    FROM th_entidades_laborales e
    LEFT JOIN "Party" p ON p.id = e.accounting_party_id AND p.tenant_id = e.tenant_id
    WHERE e.tenant_id = ${tenantId}
      AND (${typeFilter == null} OR e.entity_type = ${typeFilter || ""})
      AND (${activeFilter == null} OR e.active = ${activeFilter ?? true})
      AND (${!search} OR (
        e.internal_code ILIKE ${`%${search}%`}
        OR e.nit ILIKE ${`%${search}%`}
        OR e.legal_name ILIKE ${`%${search}%`}
        OR COALESCE(e.trade_name, '') ILIKE ${`%${search}%`}
      ))
    ORDER BY e.entity_type ASC, e.legal_name ASC
    LIMIT ${Math.min(Number(query.limit || 200), 500)}
  `);
}

async function listLaborEntityPartyCandidates(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const search = String(query.search || query.q || "").trim();
    const normalizedSearch = normalizeNit(search);
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const parties = await prisma.$queryRaw`
      SELECT *
      FROM "Party"
      WHERE tenant_id = ${tenantId}
        AND active = true
        AND (
          ${!search}
          OR name ILIKE ${`%${search}%`}
          OR COALESCE(legal_name, '') ILIKE ${`%${search}%`}
          OR regexp_replace(COALESCE(tax_id, '') || COALESCE(metadata->>'verification_digit', ''), '[\\s.-]', '', 'g') ILIKE ${`%${normalizedSearch}%`}
        )
      ORDER BY COALESCE(legal_name, name) ASC
      LIMIT ${limit}
    `;
    const explicitDv = /[-]/.test(search) && normalizeTaxId(search).verification_digit != null;
    return parties
      .filter((party) => partyMatchesSearch(party, search)
        || (!explicitDv && normalizedSearch && (() => {
          const base = compactTaxId(party.tax_id);
          const knownDv = compactTaxId(party.metadata?.verification_digit || "");
          const combined = knownDv ? `${base}${knownDv}` : base;
          return normalizedSearch === base || (knownDv && normalizedSearch === combined) || (normalizedSearch.length < base.length && base.startsWith(normalizedSearch));
        })()))
      .slice(0, limit)
      .map(partyCommonFields);
  });
}

async function createLaborEntity(tenantId, input = {}, user = {}) {
  const entityType = normalizeLaborEntityType(input.entity_type || input.type);
  const validFrom = dateOnly(input.valid_from || new Date());
  const validTo = input.valid_to ? dateOnly(input.valid_to) : null;
  if (validTo && validTo < validFrom) throw validationError("La fecha final de vigencia no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const party = input.accounting_party_id ? await prisma.party.findFirst({ where: { tenant_id: tenantId, id: Number(input.accounting_party_id), active: true } }) : null;
    if (input.accounting_party_id && !party) throw validationError("El tercero contable no existe o no esta activo.", 404, "TERCERO_CONTABLE_NO_ENCONTRADO");
    const partyResolution = resolveExplicitParty({ parties: party ? [party] : [], accounting_party_id: input.accounting_party_id, nit: input.nit });
    if (!partyResolution.ok) throw validationError(
      partyResolution.code === "TERCERO_NIT_NO_COINCIDE" ? "El NIT no coincide con el tercero contable seleccionado." : "El tercero contable no existe o no esta activo.",
      partyResolution.code === "TERCERO_NIT_NO_COINCIDE" ? 422 : 404,
      partyResolution.code
    );
    if (!party && !String(input.nit || "").trim()) throw validationError("El NIT es obligatorio si no se selecciona un tercero contable.", 422, "NIT_ENTIDAD_REQUERIDO");
    if (!party && !String(input.legal_name || "").trim()) throw validationError("La razon social es obligatoria si no se selecciona un tercero contable.", 422, "RAZON_SOCIAL_ENTIDAD_REQUERIDA");
    const common = party ? partyCommonFields(party) : {};
    const entityInput = {
      ...input,
      nit: String(input.nit || common.tax_id || "").trim(),
      verification_digit: input.verification_digit || common.verification_digit || null,
      legal_name: String(input.legal_name || common.legal_name || common.name || "").trim(),
      trade_name: input.trade_name || common.trade_name || null,
      metadata: { ...(input.metadata || {}), accounting_party_common: common }
    };
    const nitMismatch = false;
    const rows = await prisma.$queryRaw`
      INSERT INTO th_entidades_laborales (
        tenant_id, entity_type, internal_code, nit, verification_digit, legal_name, trade_name, official_code,
        active, valid_from, valid_to, accounting_party_id, notes, metadata
      )
      VALUES (
        ${tenantId}, ${entityType}, ${laborEntityInternalCode({ ...entityInput, entity_type: entityType })}, ${entityInput.nit},
        ${entityInput.verification_digit}, ${entityInput.legal_name}, ${entityInput.trade_name}, ${entityInput.official_code || null},
        ${input.active !== false}, ${validFrom}, ${validTo}, ${party?.id || null}, ${input.notes || null},
        ${JSON.stringify({ ...(entityInput.metadata || {}), audit: [{ action: "created", user_id: user?.id || null, at: new Date().toISOString() }], nit_mismatch: nitMismatch })}::jsonb
      )
      RETURNING *
    `;
    return { ...rows[0], accounting_link_status: party ? "enlazada" : "pendiente_enlace_contable", nit_mismatch: nitMismatch };
  });
}

async function updateLaborEntity(tenantId, id, input = {}, user = {}) {
  const entityId = numericId(id);
  if (!entityId) throw validationError("Entidad laboral invalida.", 400, "ENTIDAD_LABORAL_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_entidades_laborales WHERE tenant_id = ${tenantId} AND id = ${entityId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Entidad laboral no encontrada.", 404, "ENTIDAD_LABORAL_NO_ENCONTRADA");
    const entityType = input.entity_type || input.type ? normalizeLaborEntityType(input.entity_type || input.type) : current.entity_type;
    const validFrom = input.valid_from !== undefined ? dateOnly(input.valid_from) : current.valid_from;
    const validTo = input.valid_to !== undefined ? (input.valid_to ? dateOnly(input.valid_to) : null) : current.valid_to;
    if (validTo && validTo < validFrom) throw validationError("La fecha final de vigencia no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const rows = await prisma.$queryRaw`
      UPDATE th_entidades_laborales
      SET entity_type = ${entityType},
          internal_code = ${input.internal_code !== undefined ? String(input.internal_code).trim() : current.internal_code},
          nit = ${input.nit !== undefined ? String(input.nit).trim() : current.nit},
          verification_digit = ${input.verification_digit !== undefined ? input.verification_digit || null : current.verification_digit},
          legal_name = ${input.legal_name !== undefined ? String(input.legal_name).trim() : current.legal_name},
          trade_name = ${input.trade_name !== undefined ? input.trade_name || null : current.trade_name},
          official_code = ${input.official_code !== undefined ? input.official_code || null : current.official_code},
          active = ${input.active !== undefined ? input.active !== false : current.active},
          valid_from = ${validFrom},
          valid_to = ${validTo},
          notes = ${input.notes !== undefined ? input.notes || null : current.notes},
          metadata = ${JSON.stringify({
            ...metadata,
            ...(input.metadata || {}),
            audit: [...(Array.isArray(metadata.audit) ? metadata.audit : []), { action: "updated", user_id: user?.id || null, at: new Date().toISOString() }]
          })}::jsonb,
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${entityId}
      RETURNING *
    `;
    return rows[0];
  });
}

async function linkLaborEntityAccountingParty(tenantId, id, input = {}, user = {}) {
  const entityId = numericId(id);
  if (!entityId) throw validationError("Entidad laboral invalida.", 400, "ENTIDAD_LABORAL_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_entidades_laborales WHERE tenant_id = ${tenantId} AND id = ${entityId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Entidad laboral no encontrada.", 404, "ENTIDAD_LABORAL_NO_ENCONTRADA");
    const partyId = input.unlink ? null : numericId(input.accounting_party_id);
    if (!input.unlink && !partyId) throw validationError("Selecciona un tercero contable valido.", 400, "TERCERO_CONTABLE_INVALIDO");
    const party = partyId ? await prisma.party.findFirst({ where: { tenant_id: tenantId, id: partyId, active: true } }) : null;
    if (partyId && !party) throw validationError("El tercero contable no existe o no esta activo.", 404, "TERCERO_CONTABLE_NO_ENCONTRADO");
    const partyResolution = resolveExplicitParty({ parties: party ? [party] : [], accounting_party_id: partyId, nit: current.nit });
    if (!partyResolution.ok) throw validationError("El NIT no coincide con el tercero contable seleccionado.", 422, partyResolution.code);
    const nitMismatch = false;
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const rows = await prisma.$queryRaw`
      UPDATE th_entidades_laborales
      SET accounting_party_id = ${party?.id || null},
          metadata = ${JSON.stringify({
            ...metadata,
            nit_mismatch: nitMismatch,
            audit: [...(Array.isArray(metadata.audit) ? metadata.audit : []), {
              action: party ? "linked_accounting_party" : "unlinked_accounting_party",
              user_id: user?.id || null,
              at: new Date().toISOString(),
              party_id: party?.id || null,
              observation: input.observation || ""
            }]
          })}::jsonb,
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${entityId}
      RETURNING *
    `;
    return {
      ...rows[0],
      accounting_link_status: party ? "enlazada" : "pendiente_enlace_contable",
      accounting_party_name: party?.legal_name || party?.name || null,
      accounting_party_tax_id: party?.tax_id || null,
      nit_mismatch: nitMismatch
    };
  });
}

async function listEmployeeAffiliations(tenantId, employeeId, query = {}) {
  const employee = numericId(employeeId || query.employee_id);
  if (!employee) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  const activeOnly = query.active == null ? null : query.active === true || query.active === "true";
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT a.*, e.entity_type AS entity_entity_type, e.legal_name AS entity_legal_name, e.nit AS entity_nit, e.internal_code AS entity_internal_code
    FROM th_empleado_afiliaciones a
    INNER JOIN th_entidades_laborales e ON e.id = a.entity_id AND e.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId}
      AND a.employee_id = ${employee}
      AND (${activeOnly == null} OR a.status = ${activeOnly ? "activa" : "inactiva"})
    ORDER BY a.entity_type ASC, a.valid_from DESC
  `);
}

async function assertAffiliationDoesNotOverlap(tenantId, { employeeId, entityType, validFrom, validTo, excludeId = null }) {
  const conflicts = await prisma.$queryRaw`
    SELECT id
    FROM th_empleado_afiliaciones
    WHERE tenant_id = ${tenantId}
      AND employee_id = ${employeeId}
      AND entity_type = ${entityType}
      AND (${excludeId == null} OR id <> ${excludeId || 0})
      AND daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') && daterange(${validFrom}::date, COALESCE(${validTo}::date, 'infinity'::date), '[]')
    LIMIT 1
  `;
  if (conflicts.length) throw validationError("Ya existe una afiliacion superpuesta del mismo tipo para este empleado.", 409, "AFILIACION_SUPERPUESTA");
}

async function createEmployeeAffiliation(tenantId, employeeId, input = {}) {
  const employee = numericId(employeeId || input.employee_id);
  const entityId = numericId(input.entity_id);
  if (!employee) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  if (!entityId) throw validationError("Entidad laboral invalida.", 400, "ENTIDAD_LABORAL_INVALIDA");
  const entityType = normalizeLaborEntityType(input.entity_type);
  const validFrom = dateOnly(input.valid_from);
  const validTo = input.valid_to ? dateOnly(input.valid_to) : null;
  if (validTo && validTo < validFrom) throw validationError("La fecha final de afiliacion no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const [employeeRow, entityRows] = await Promise.all([
      prisma.employee.findFirst({ where: { tenant_id: tenantId, id: employee, active: true } }),
      prisma.$queryRaw`SELECT * FROM th_entidades_laborales WHERE tenant_id = ${tenantId} AND id = ${entityId} AND active = true LIMIT 1`
    ]);
    if (!employeeRow) throw validationError("Empleado no encontrado o inactivo.", 404, "EMPLEADO_NO_ENCONTRADO");
    const entity = entityRows[0];
    if (!entity) throw validationError("Entidad laboral no encontrada o inactiva.", 404, "ENTIDAD_LABORAL_NO_ENCONTRADA");
    if (entity.entity_type !== entityType) throw validationError("El tipo de afiliacion no coincide con el tipo de entidad.", 400, "TIPO_AFILIACION_INCONSISTENTE");
    await assertAffiliationDoesNotOverlap(tenantId, { employeeId: employee, entityType, validFrom, validTo });
    const rows = await prisma.$queryRaw`
      INSERT INTO th_empleado_afiliaciones (tenant_id, employee_id, entity_type, entity_id, valid_from, valid_to, status, metadata)
      VALUES (${tenantId}, ${employee}, ${entityType}, ${entityId}, ${validFrom}, ${validTo}, ${input.status || "activa"}, ${JSON.stringify(input.metadata || {})}::jsonb)
      RETURNING *
    `;
    return rows[0];
  });
}

async function updateEmployeeAffiliation(tenantId, id, input = {}) {
  const affiliationId = numericId(id);
  if (!affiliationId) throw validationError("Afiliacion invalida.", 400, "AFILIACION_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_empleado_afiliaciones WHERE tenant_id = ${tenantId} AND id = ${affiliationId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Afiliacion no encontrada.", 404, "AFILIACION_NO_ENCONTRADA");
    const entityType = input.entity_type ? normalizeLaborEntityType(input.entity_type) : current.entity_type;
    const entityId = input.entity_id !== undefined ? numericId(input.entity_id) : current.entity_id;
    const validFrom = input.valid_from !== undefined ? dateOnly(input.valid_from) : current.valid_from;
    const validTo = input.valid_to !== undefined ? (input.valid_to ? dateOnly(input.valid_to) : null) : current.valid_to;
    if (validTo && validTo < validFrom) throw validationError("La fecha final de afiliacion no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
    const entityRows = await prisma.$queryRaw`SELECT * FROM th_entidades_laborales WHERE tenant_id = ${tenantId} AND id = ${entityId} AND active = true LIMIT 1`;
    const entity = entityRows[0];
    if (!entity) throw validationError("Entidad laboral no encontrada o inactiva.", 404, "ENTIDAD_LABORAL_NO_ENCONTRADA");
    if (entity.entity_type !== entityType) throw validationError("El tipo de afiliacion no coincide con el tipo de entidad.", 400, "TIPO_AFILIACION_INCONSISTENTE");
    await assertAffiliationDoesNotOverlap(tenantId, { employeeId: current.employee_id, entityType, validFrom, validTo, excludeId: affiliationId });
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const rows = await prisma.$queryRaw`
      UPDATE th_empleado_afiliaciones
      SET entity_type = ${entityType},
          entity_id = ${entityId},
          valid_from = ${validFrom},
          valid_to = ${validTo},
          status = ${input.status || current.status},
          metadata = ${JSON.stringify({ ...metadata, ...(input.metadata || {}) })}::jsonb
      WHERE tenant_id = ${tenantId} AND id = ${affiliationId}
      RETURNING *
    `;
    return rows[0];
  });
}

async function listNoveltyTypes(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT code, name, description, category, severity, origin, requires_justification, requires_approval, affects_payroll, active, valid_from, valid_to
    FROM th_tipos_novedad
    WHERE tenant_id = ${tenantId}
      AND (${query.active == null} OR active = ${query.active === "true" || query.active === true})
    ORDER BY category ASC, name ASC
  `.catch(() => []));
}

async function listWorkdayNovelties(tenantId, query = {}) {
  const range = boundedReportRange(query, { defaultToday: false, maxDays: 366 });
  // th_novedades_jornada.date es DATE y la sesion de Postgres corre en UTC: comparar ese DATE
  // contra el TIMESTAMPTZ de startOfDay castea la fila a medianoche UTC, cinco horas despues
  // del inicio del dia operativo, y un filtro por un solo dia no devolvia ninguna novedad.
  // Se acota con claves YYYY-MM-DD del dia operativo, que es el tipo real de la columna.
  // El centinela evita que el cast ::date reciba una cadena vacia cuando no hay rango.
  const operatingDayKey = (value) => startOfDay(value).toISOString().slice(0, 10);
  const startKey = range ? operatingDayKey(range.start) : "1970-01-01";
  const endKey = range ? operatingDayKey(range.end) : "1970-01-01";
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT n.*, e.code AS employee_code, e.metadata AS employee_metadata
    FROM th_novedades_jornada n
    LEFT JOIN "Employee" e ON e.id = n.employee_id AND e.tenant_id = n.tenant_id
    WHERE n.tenant_id = ${tenantId}
      AND (${range == null} OR (n.date >= ${startKey}::date AND n.date < ${endKey}::date))
      AND (${query.status == null} OR n.status = ${query.status || ""})
      AND (${query.type == null} OR n.type_code = ${query.type || ""})
    ORDER BY n.updated_at DESC
    LIMIT ${Math.min(Number(query.limit || 100), 500)}
  `.catch(() => []));
}

function uniqueLaborConfigurationRows(rows = []) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [row.tenant_id || "", row.company_id || "", row.country || "", row.code || "", String(row.valid_from || "").slice(0, 10)].join("|");
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

async function getLaborConfiguration(tenantId, query = {}) {
  const effectiveDate = startOfDay(query.date || new Date());
  const country = String(query.country || "CO").toUpperCase();
  return prisma.runWithTenant(tenantId, async () => {
    if (query.all === "1" || query.all === "true" || query.all === true) {
      const [allParameters, concepts, payrollConcepts, calendars] = await Promise.all([
        prisma.$queryRaw`
          SELECT *
          FROM th_parametros_laborales
          WHERE tenant_id = ${tenantId}
            AND country = ${country}
          ORDER BY code ASC, valid_from DESC, priority DESC
        `.catch(() => []),
        prisma.$queryRaw`
          SELECT *
          FROM th_conceptos_recargo
          WHERE tenant_id = ${tenantId}
            AND country = ${country}
          ORDER BY code ASC, valid_from DESC, priority DESC
        `.catch(() => []),
        prisma.$queryRaw`
          SELECT *
          FROM th_nomina_conceptos
          WHERE tenant_id IN (${tenantId}, 'default')
            AND country = ${country}
          ORDER BY code ASC, valid_from DESC, priority DESC
        `.catch(() => []),
        prisma.$queryRaw`
          SELECT date, name, day_type, country, territory, source
          FROM th_calendario_dias
          WHERE tenant_id = ${tenantId}
            AND country = ${country}
          ORDER BY date DESC
          LIMIT ${Math.min(Number(query.calendar_limit || 100), 500)}
        `.catch(() => [])
      ]);
      const uniqueParameters = uniqueLaborConfigurationRows(allParameters);
      const deductions = uniqueParameters.filter((row) => row.metadata?.category === "deduction");
      const parameters = uniqueParameters.filter((row) => row.metadata?.category !== "deduction");
      return { country, mode: "all", parameters, deductions, concepts: uniqueLaborConfigurationRows(concepts), payroll_concepts: uniqueLaborConfigurationRows(payrollConcepts), calendars };
    }
    const [parameters, concepts, calendars] = await Promise.all([
      prisma.$queryRaw`
        SELECT code, name, value, unit, country, valid_from, valid_to, priority, active, source_note
        FROM th_parametros_laborales
        WHERE tenant_id = ${tenantId}
          AND country = ${country}
          AND active = true
          AND valid_from <= ${effectiveDate}
          AND (valid_to IS NULL OR valid_to >= ${effectiveDate})
        ORDER BY code ASC, priority DESC
      `.catch(() => []),
      prisma.$queryRaw`
        SELECT code, name, value_type, factor, percent, country, valid_from, valid_to, active, source_note
        FROM th_conceptos_recargo
        WHERE tenant_id = ${tenantId}
          AND country = ${country}
          AND active = true
          AND valid_from <= ${effectiveDate}
          AND (valid_to IS NULL OR valid_to >= ${effectiveDate})
        ORDER BY code ASC, valid_from DESC
      `.catch(() => []),
      prisma.$queryRaw`
        SELECT date, name, day_type, country, territory, source
        FROM th_calendario_dias
        WHERE tenant_id = ${tenantId}
          AND country = ${country}
          AND date >= ${startOfDay(query.from || effectiveDate)}
          AND date < ${endOfDay(query.to || effectiveDate)}
        ORDER BY date ASC
      `.catch(() => [])
    ]);
    return { country, effective_date: effectiveDate.toISOString().slice(0, 10), parameters, concepts, calendars };
  });
}

function calendarDayInput(input = {}) {
  const dayType = String(input.day_type || "festivo").trim();
  if (!["ordinario", "festivo", "dominical", "no_laboral", "especial"].includes(dayType)) throw validationError("Tipo de dia calendario invalido.", 400, "TIPO_DIA_CALENDARIO_INVALIDO");
  return {
    country: String(input.country || "CO").toUpperCase(),
    territory: input.territory ? String(input.territory).trim() : null,
    companyId: input.company_id ? String(input.company_id).trim() : null,
    date: dateOnly(input.date),
    name: String(input.name || "").trim(),
    dayType,
    source: input.source || "manual",
    active: input.active !== false,
    metadata: input.metadata || {}
  };
}

async function createCalendarDay(tenantId, input = {}, user = {}) {
  const data = calendarDayInput(input);
  if (!data.name) throw validationError("El nombre del dia es obligatorio.", 400, "NOMBRE_DIA_CALENDARIO_REQUERIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      INSERT INTO th_calendario_dias (tenant_id, country, territory, company_id, date, name, day_type, source, active, metadata)
      VALUES (${tenantId}, ${data.country}, ${data.territory}, ${data.companyId}, ${data.date}, ${data.name}, ${data.dayType}, ${data.source}, ${data.active}, ${JSON.stringify({ ...data.metadata, created_by: user?.id || null })}::jsonb)
      ON CONFLICT (tenant_id, country, date, day_type)
      DO UPDATE SET territory = EXCLUDED.territory, company_id = EXCLUDED.company_id, name = EXCLUDED.name, source = EXCLUDED.source, active = EXCLUDED.active, metadata = EXCLUDED.metadata
      RETURNING *
    `;
    return rows[0];
  });
}

async function updateCalendarDay(tenantId, id, input = {}) {
  const calendarId = numericId(id);
  if (!calendarId) throw validationError("Dia calendario invalido.", 400, "DIA_CALENDARIO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_calendario_dias WHERE tenant_id = ${tenantId} AND id = ${calendarId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Dia calendario no encontrado.", 404, "DIA_CALENDARIO_NO_ENCONTRADO");
    const data = calendarDayInput({ ...current, ...input });
    const rows = await prisma.$queryRaw`
      UPDATE th_calendario_dias
      SET country = ${data.country}, territory = ${data.territory}, company_id = ${data.companyId}, date = ${data.date}, name = ${data.name}, day_type = ${data.dayType}, source = ${data.source}, active = ${data.active}, metadata = ${JSON.stringify({ ...(current.metadata || {}), ...(input.metadata || {}) })}::jsonb
      WHERE tenant_id = ${tenantId} AND id = ${calendarId}
      RETURNING *
    `;
    return rows[0];
  });
}

function normalizeLaborCode(value) {
  const code = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!code) throw validationError("El codigo es obligatorio.", 400, "CODIGO_LABORAL_REQUERIDO");
  return code;
}

function decimalOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw validationError("El valor numerico no es valido.", 400, "VALOR_NUMERICO_INVALIDO");
  return number;
}

async function assertNoLaborValidityOverlap(table, tenantId, { companyId, country, code, validFrom, validTo, excludeId = null }) {
  const rows = table === "parameters"
    ? await prisma.$queryRaw`
      SELECT id FROM th_parametros_laborales
      WHERE tenant_id = ${tenantId}
        AND COALESCE(company_id, '') = COALESCE(${companyId || null}, '')
        AND country = ${country}
        AND code = ${code}
        AND (${excludeId == null} OR id <> ${excludeId || 0})
        AND daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') && daterange(${validFrom}::date, COALESCE(${validTo}::date, 'infinity'::date), '[]')
      LIMIT 1
    `
    : table === "concepts" ? await prisma.$queryRaw`
      SELECT id FROM th_conceptos_recargo
      WHERE tenant_id = ${tenantId}
        AND COALESCE(company_id, '') = COALESCE(${companyId || null}, '')
        AND country = ${country}
        AND code = ${code}
        AND (${excludeId == null} OR id <> ${excludeId || 0})
        AND daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') && daterange(${validFrom}::date, COALESCE(${validTo}::date, 'infinity'::date), '[]')
      LIMIT 1
    `
    : await prisma.$queryRaw`
      SELECT id FROM th_nomina_conceptos
      WHERE tenant_id = ${tenantId}
        AND country = ${country}
        AND code = ${code}
        AND (${excludeId == null} OR id <> ${excludeId || 0})
        AND daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') && daterange(${validFrom}::date, COALESCE(${validTo}::date, 'infinity'::date), '[]')
      LIMIT 1
    `;
  if (rows.length) throw validationError("Ya existe una vigencia superpuesta para el mismo codigo, empresa y pais.", 409, "VIGENCIA_LABORAL_SUPERPUESTA");
}

async function createLaborParameter(tenantId, input = {}, user = {}) {
  const country = String(input.country || "CO").toUpperCase();
  const code = normalizeLaborCode(input.code);
  const validFrom = dateOnly(input.valid_from);
  const validTo = input.valid_to ? dateOnly(input.valid_to) : null;
  if (validTo && validTo < validFrom) throw validationError("La fecha final no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
  const value = decimalOrNull(input.value);
  if (value == null) throw validationError("El valor del parametro es obligatorio.", 400, "VALOR_PARAMETRO_REQUERIDO");
  return prisma.runWithTenant(tenantId, async () => {
    await assertNoLaborValidityOverlap("parameters", tenantId, { companyId: input.company_id || null, country, code, validFrom, validTo });
    const rows = await prisma.$queryRaw`
      INSERT INTO th_parametros_laborales (
        tenant_id, company_id, country, code, name, value, unit, valid_from, valid_to, priority, active, source_note, metadata, created_by
      )
      VALUES (
        ${tenantId}, ${input.company_id || null}, ${country}, ${code}, ${String(input.name || "").trim()}, ${value}, ${String(input.unit || "").trim()},
        ${validFrom}, ${validTo}, ${Number(input.priority || 100)}, ${input.active !== false}, ${input.source_note || null},
        ${JSON.stringify(input.metadata || {})}::jsonb, ${user?.id || null}
      )
      RETURNING *
    `;
    return rows[0];
  });
}

async function updateLaborParameter(tenantId, id, input = {}) {
  const parameterId = numericId(id);
  if (!parameterId) throw validationError("Parametro laboral invalido.", 400, "PARAMETRO_LABORAL_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_parametros_laborales WHERE tenant_id = ${tenantId} AND id = ${parameterId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Parametro laboral no encontrado.", 404, "PARAMETRO_LABORAL_NO_ENCONTRADO");
    const country = input.country ? String(input.country).toUpperCase() : current.country;
    const code = input.code ? normalizeLaborCode(input.code) : current.code;
    const companyId = input.company_id !== undefined ? input.company_id || null : current.company_id;
    const validFrom = input.valid_from !== undefined ? dateOnly(input.valid_from) : current.valid_from;
    const validTo = input.valid_to !== undefined ? (input.valid_to ? dateOnly(input.valid_to) : null) : current.valid_to;
    if (validTo && validTo < validFrom) throw validationError("La fecha final no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
    await assertNoLaborValidityOverlap("parameters", tenantId, { companyId, country, code, validFrom, validTo, excludeId: parameterId });
    const rows = await prisma.$queryRaw`
      UPDATE th_parametros_laborales
      SET company_id = ${companyId},
          country = ${country},
          code = ${code},
          name = ${input.name !== undefined ? String(input.name).trim() : current.name},
          value = ${input.value !== undefined ? decimalOrNull(input.value) : current.value},
          unit = ${input.unit !== undefined ? String(input.unit).trim() : current.unit},
          valid_from = ${validFrom},
          valid_to = ${validTo},
          priority = ${input.priority !== undefined ? Number(input.priority) : current.priority},
          active = ${input.active !== undefined ? input.active !== false : current.active},
          source_note = ${input.source_note !== undefined ? input.source_note || null : current.source_note},
          metadata = ${JSON.stringify({ ...(current.metadata || {}), ...(input.metadata || {}) })}::jsonb
      WHERE tenant_id = ${tenantId} AND id = ${parameterId}
      RETURNING *
    `;
    return rows[0];
  });
}

function deductionInput(input = {}) {
  return {
    ...input,
    unit: input.unit || "percent",
    metadata: { ...(input.metadata || {}), category: "deduction", basis: input.basis || input.metadata?.basis || "ibc" }
  };
}

async function createLaborDeduction(tenantId, input = {}, user = {}) {
  return createLaborParameter(tenantId, deductionInput(input), user);
}

async function updateLaborDeduction(tenantId, id, input = {}) {
  return updateLaborParameter(tenantId, id, deductionInput(input));
}

async function createSurchargeConcept(tenantId, input = {}) {
  const country = String(input.country || "CO").toUpperCase();
  const code = normalizeLaborCode(input.code);
  const valueType = String(input.value_type || "").trim();
  if (!["porcentaje_adicional", "factor_total", "informativo"].includes(valueType)) {
    throw validationError("Tipo de valor invalido.", 400, "TIPO_VALOR_RECARGO_INVALIDO");
  }
  const validFrom = dateOnly(input.valid_from);
  const validTo = input.valid_to ? dateOnly(input.valid_to) : null;
  if (validTo && validTo < validFrom) throw validationError("La fecha final no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    await assertNoLaborValidityOverlap("concepts", tenantId, { companyId: input.company_id || null, country, code, validFrom, validTo });
    const rows = await prisma.$queryRaw`
      INSERT INTO th_conceptos_recargo (
        tenant_id, company_id, country, code, name, value_type, percent, factor, unit, valid_from, valid_to, priority, active, source_note, metadata
      )
      VALUES (
        ${tenantId}, ${input.company_id || null}, ${country}, ${code}, ${String(input.name || "").trim()}, ${valueType},
        ${decimalOrNull(input.percent)}, ${decimalOrNull(input.factor)}, ${input.unit || "hour"}, ${validFrom}, ${validTo},
        ${Number(input.priority || 100)}, ${input.active !== false}, ${input.source_note || null}, ${JSON.stringify(input.metadata || {})}::jsonb
      )
      RETURNING *
    `;
    return rows[0];
  });
}

async function updateSurchargeConcept(tenantId, id, input = {}) {
  const conceptId = numericId(id);
  if (!conceptId) throw validationError("Concepto laboral invalido.", 400, "CONCEPTO_LABORAL_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_conceptos_recargo WHERE tenant_id = ${tenantId} AND id = ${conceptId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Concepto laboral no encontrado.", 404, "CONCEPTO_LABORAL_NO_ENCONTRADO");
    const country = input.country ? String(input.country).toUpperCase() : current.country;
    const code = input.code ? normalizeLaborCode(input.code) : current.code;
    const companyId = input.company_id !== undefined ? input.company_id || null : current.company_id;
    const valueType = input.value_type !== undefined ? String(input.value_type || "").trim() : current.value_type;
    if (!["porcentaje_adicional", "factor_total", "informativo"].includes(valueType)) throw validationError("Tipo de valor invalido.", 400, "TIPO_VALOR_RECARGO_INVALIDO");
    const validFrom = input.valid_from !== undefined ? dateOnly(input.valid_from) : current.valid_from;
    const validTo = input.valid_to !== undefined ? (input.valid_to ? dateOnly(input.valid_to) : null) : current.valid_to;
    if (validTo && validTo < validFrom) throw validationError("La fecha final no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
    await assertNoLaborValidityOverlap("concepts", tenantId, { companyId, country, code, validFrom, validTo, excludeId: conceptId });
    const rows = await prisma.$queryRaw`
      UPDATE th_conceptos_recargo
      SET company_id = ${companyId},
          country = ${country},
          code = ${code},
          name = ${input.name !== undefined ? String(input.name).trim() : current.name},
          value_type = ${valueType},
          percent = ${input.percent !== undefined ? decimalOrNull(input.percent) : current.percent},
          factor = ${input.factor !== undefined ? decimalOrNull(input.factor) : current.factor},
          unit = ${input.unit !== undefined ? input.unit || "hour" : current.unit},
          valid_from = ${validFrom},
          valid_to = ${validTo},
          priority = ${input.priority !== undefined ? Number(input.priority) : current.priority},
          active = ${input.active !== undefined ? input.active !== false : current.active},
          source_note = ${input.source_note !== undefined ? input.source_note || null : current.source_note},
          metadata = ${JSON.stringify({ ...(current.metadata || {}), ...(input.metadata || {}) })}::jsonb
      WHERE tenant_id = ${tenantId} AND id = ${conceptId}
      RETURNING *
    `;
    return rows[0];
  });
}

function payrollConceptInput(input = {}) {
  const conceptType = String(input.concept_type || "devengo").trim();
  if (!["devengo", "deduccion", "aporte_empleador", "informativo"].includes(conceptType)) throw validationError("Tipo de concepto de nomina invalido.", 400, "TIPO_CONCEPTO_NOMINA_INVALIDO");
  const metadata = { ...(input.metadata || {}) };
  if (input.debit_account_code !== undefined) metadata.debit_account_code = String(input.debit_account_code || "").trim();
  if (input.credit_account_code !== undefined) metadata.credit_account_code = String(input.credit_account_code || "").trim();
  return {
    country: String(input.country || "CO").toUpperCase(),
    code: normalizeLaborCode(input.code),
    name: String(input.name || "").trim(),
    conceptType,
    salaryConstitutive: input.salary_constitutive !== false,
    affectsIbc: input.affects_ibc !== false,
    defaultOperation: String(input.default_operation || "manual").trim(),
    validFrom: dateOnly(input.valid_from),
    validTo: input.valid_to ? dateOnly(input.valid_to) : null,
    priority: Number(input.priority || 100),
    active: input.active !== false,
    sourceNote: input.source_note || null,
    metadata
  };
}

async function assertPayrollConceptAccounts(tenantId, metadata = {}) {
  const accountCodes = [metadata.debit_account_code, metadata.credit_account_code].map((value) => String(value || "").trim()).filter(Boolean);
  if (!accountCodes.length) return;
  const rows = await prisma.account.findMany({
    where: { tenant_id: tenantId, code: { in: accountCodes }, active: true, allows_tx: true },
    select: { code: true }
  });
  const found = new Set(rows.map((row) => row.code));
  const missing = accountCodes.filter((code) => !found.has(code));
  if (missing.length) throw validationError(`Cuenta contable invalida: ${missing.join(", ")}`, 400, "CUENTA_CONTABLE_NOMINA_INVALIDA");
}

async function createPayrollConcept(tenantId, input = {}, user = {}) {
  const data = payrollConceptInput(input);
  if (data.validTo && data.validTo < data.validFrom) throw validationError("La fecha final no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    await assertPayrollConceptAccounts(tenantId, data.metadata);
    await assertNoLaborValidityOverlap("payroll_concepts", tenantId, { country: data.country, code: data.code, validFrom: data.validFrom, validTo: data.validTo });
    const rows = await prisma.$queryRaw`
      INSERT INTO th_nomina_conceptos (
        tenant_id, country, code, name, concept_type, salary_constitutive, affects_ibc, default_operation, active, valid_from, valid_to, priority, source_note, metadata, created_by
      )
      VALUES (
        ${tenantId}, ${data.country}, ${data.code}, ${data.name}, ${data.conceptType}, ${data.salaryConstitutive}, ${data.affectsIbc}, ${data.defaultOperation},
        ${data.active}, ${data.validFrom}, ${data.validTo}, ${data.priority}, ${data.sourceNote}, ${JSON.stringify(data.metadata)}::jsonb, ${user?.id || null}
      )
      RETURNING *
    `;
    return rows[0];
  });
}

async function updatePayrollConcept(tenantId, id, input = {}) {
  const conceptId = numericId(id);
  if (!conceptId) throw validationError("Concepto de nomina invalido.", 400, "CONCEPTO_NOMINA_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_nomina_conceptos WHERE tenant_id = ${tenantId} AND id = ${conceptId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Concepto de nomina no encontrado.", 404, "CONCEPTO_NOMINA_NO_ENCONTRADO");
    const data = payrollConceptInput({ ...current, ...input });
    if (data.validTo && data.validTo < data.validFrom) throw validationError("La fecha final no puede ser anterior a la inicial.", 400, "VIGENCIA_INVALIDA");
    await assertNoLaborValidityOverlap("payroll_concepts", tenantId, { country: data.country, code: data.code, validFrom: data.validFrom, validTo: data.validTo, excludeId: conceptId });
    await assertPayrollConceptAccounts(tenantId, data.metadata);
    const rows = await prisma.$queryRaw`
      UPDATE th_nomina_conceptos
      SET country = ${data.country},
          code = ${data.code},
          name = ${data.name},
          concept_type = ${data.conceptType},
          salary_constitutive = ${data.salaryConstitutive},
          affects_ibc = ${data.affectsIbc},
          default_operation = ${data.defaultOperation},
          active = ${data.active},
          valid_from = ${data.validFrom},
          valid_to = ${data.validTo},
          priority = ${data.priority},
          source_note = ${data.sourceNote},
          metadata = ${JSON.stringify({ ...(current.metadata || {}), ...(input.metadata || {}) })}::jsonb,
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${conceptId}
      RETURNING *
    `;
    return rows[0];
  });
}

function libranzaConceptInput(input = {}) {
  return {
    code: normalizeLaborCode(input.code),
    name: String(input.name || "").trim(),
    description: input.description ? String(input.description).trim() : null,
    entityId: input.entity_id ? numericId(input.entity_id) : null,
    debitAccountCode: String(input.debit_account_code || "").trim() || null,
    creditAccountCode: String(input.credit_account_code || "").trim() || null,
    active: input.active !== false,
    metadata: input.metadata || {}
  };
}

async function assertLibranzaAccounts(tenantId, input = {}) {
  return assertPayrollConceptAccounts(tenantId, { debit_account_code: input.debitAccountCode, credit_account_code: input.creditAccountCode });
}

async function listLibranzaConcepts(tenantId, query = {}) {
  const active = query.active;
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT c.*, e.legal_name AS entity_name, e.nit AS entity_nit
    FROM th_libranza_conceptos c
    LEFT JOIN th_entidades_laborales e ON e.id = c.entity_id AND e.tenant_id = c.tenant_id
    WHERE c.tenant_id = ${tenantId}
      AND (${active == null} OR c.active = ${active === "true" || active === true})
    ORDER BY c.active DESC, c.code ASC
    LIMIT ${Math.min(Number(query.limit || 200), 500)}
  `);
}

async function createLibranzaConcept(tenantId, input = {}, user = {}) {
  const data = libranzaConceptInput(input);
  if (!data.name) throw validationError("El nombre del concepto es obligatorio.", 400, "LIBRANZA_CONCEPTO_NOMBRE_REQUERIDO");
  return prisma.runWithTenant(tenantId, async () => {
    await assertLibranzaAccounts(tenantId, data);
    const rows = await prisma.$queryRaw`
      INSERT INTO th_libranza_conceptos (tenant_id, code, name, description, entity_id, debit_account_code, credit_account_code, active, metadata, created_by)
      VALUES (${tenantId}, ${data.code}, ${data.name}, ${data.description}, ${data.entityId}, ${data.debitAccountCode}, ${data.creditAccountCode}, ${data.active}, ${JSON.stringify(data.metadata)}::jsonb, ${user?.id || null})
      ON CONFLICT (tenant_id, code)
      DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, entity_id = EXCLUDED.entity_id, debit_account_code = EXCLUDED.debit_account_code, credit_account_code = EXCLUDED.credit_account_code, active = EXCLUDED.active, metadata = EXCLUDED.metadata, updated_at = now()
      RETURNING *
    `;
    return rows[0];
  });
}

async function updateLibranzaConcept(tenantId, id, input = {}) {
  const conceptId = numericId(id);
  if (!conceptId) throw validationError("Concepto de libranza invalido.", 400, "LIBRANZA_CONCEPTO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_libranza_conceptos WHERE tenant_id = ${tenantId} AND id = ${conceptId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Concepto de libranza no encontrado.", 404, "LIBRANZA_CONCEPTO_NO_ENCONTRADO");
    const data = libranzaConceptInput({ ...current, ...input });
    await assertLibranzaAccounts(tenantId, data);
    const rows = await prisma.$queryRaw`
      UPDATE th_libranza_conceptos
      SET code = ${data.code}, name = ${data.name}, description = ${data.description}, entity_id = ${data.entityId}, debit_account_code = ${data.debitAccountCode}, credit_account_code = ${data.creditAccountCode}, active = ${data.active}, metadata = ${JSON.stringify({ ...(current.metadata || {}), ...(input.metadata || {}) })}::jsonb, updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${conceptId}
      RETURNING *
    `;
    return rows[0];
  });
}

function employeeLibranzaInput(input = {}) {
  const mode = String(input.mode || "cuotas").trim();
  const frequency = String(input.frequency || "quincena").trim();
  if (!["cuotas", "perpetua"].includes(mode)) throw validationError("Modo de libranza invalido.", 400, "LIBRANZA_MODO_INVALIDO");
  if (!["quincena", "mes"].includes(frequency)) throw validationError("Frecuencia de libranza invalida.", 400, "LIBRANZA_FRECUENCIA_INVALIDA");
  const originalAmount = mode === "perpetua" ? null : money(input.original_amount || 0);
  const installmentsTotal = mode === "perpetua" ? null : Number(input.installments_total || 0);
  const installmentAmount = money(input.installment_amount || (originalAmount && installmentsTotal ? originalAmount / installmentsTotal : 0));
  if (mode === "cuotas" && (!originalAmount || !installmentsTotal || !installmentAmount)) throw validationError("Las libranzas por cuotas requieren monto, numero de cuotas y valor de cuota.", 400, "LIBRANZA_CUOTAS_INCOMPLETAS");
  if (mode === "perpetua" && !installmentAmount) throw validationError("La deduccion perpetua requiere valor por periodo.", 400, "LIBRANZA_PERPETUA_SIN_VALOR");
  return {
    employeeId: numericId(input.employee_id),
    conceptId: numericId(input.concept_id),
    description: input.description ? String(input.description).trim() : null,
    frequency,
    mode,
    originalAmount,
    installmentAmount,
    installmentsTotal,
    startDate: dateOnly(input.start_date),
    endDate: input.end_date ? dateOnly(input.end_date) : null,
    inactiveAt: input.inactive_at ? new Date(input.inactive_at) : null,
    status: String(input.status || "activa").trim(),
    metadata: input.metadata || {}
  };
}

async function listEmployeeLibranzas(tenantId, query = {}) {
  const employeeId = query.employee_id ? numericId(query.employee_id) : null;
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT l.*, c.code AS concept_code, c.name AS concept_name, c.debit_account_code, c.credit_account_code, c.entity_id,
           e.code AS employee_code, e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name
    FROM th_libranza_empleados l
    INNER JOIN th_libranza_conceptos c ON c.id = l.concept_id AND c.tenant_id = l.tenant_id
    LEFT JOIN "Employee" e ON e.id = l.employee_id AND e.tenant_id = l.tenant_id
    WHERE l.tenant_id = ${tenantId}
      AND (${employeeId == null} OR l.employee_id = ${employeeId || 0})
      AND (${!query.status} OR l.status = ${query.status || ""})
    ORDER BY l.status ASC, l.created_at DESC
    LIMIT ${Math.min(Number(query.limit || 300), 500)}
  `);
}

async function createEmployeeLibranza(tenantId, input = {}, user = {}) {
  const data = employeeLibranzaInput(input);
  if (!data.employeeId || !data.conceptId) throw validationError("Empleado y concepto son obligatorios.", 400, "LIBRANZA_DATOS_REQUERIDOS");
  const balance = data.mode === "perpetua" ? null : data.originalAmount;
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      INSERT INTO th_libranza_empleados (tenant_id, employee_id, concept_id, description, frequency, mode, original_amount, installment_amount, installments_total, balance_amount, start_date, end_date, inactive_at, status, metadata, created_by)
      VALUES (${tenantId}, ${data.employeeId}, ${data.conceptId}, ${data.description}, ${data.frequency}, ${data.mode}, ${data.originalAmount}, ${data.installmentAmount}, ${data.installmentsTotal}, ${balance}, ${data.startDate}, ${data.endDate}, ${data.inactiveAt}, ${data.status}, ${JSON.stringify(data.metadata)}::jsonb, ${user?.id || null})
      RETURNING *
    `;
    return rows[0];
  });
}

async function updateEmployeeLibranza(tenantId, id, input = {}) {
  const libranzaId = numericId(id);
  if (!libranzaId) throw validationError("Libranza invalida.", 400, "LIBRANZA_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const currentRows = await prisma.$queryRaw`SELECT * FROM th_libranza_empleados WHERE tenant_id = ${tenantId} AND id = ${libranzaId} LIMIT 1`;
    const current = currentRows[0];
    if (!current) throw validationError("Libranza no encontrada.", 404, "LIBRANZA_NO_ENCONTRADA");
    const data = employeeLibranzaInput({ ...current, ...input });
    const rows = await prisma.$queryRaw`
      UPDATE th_libranza_empleados
      SET employee_id = ${data.employeeId}, concept_id = ${data.conceptId}, description = ${data.description}, frequency = ${data.frequency}, mode = ${data.mode}, original_amount = ${data.originalAmount}, installment_amount = ${data.installmentAmount}, installments_total = ${data.installmentsTotal}, start_date = ${data.startDate}, end_date = ${data.endDate}, inactive_at = ${data.inactiveAt}, status = ${data.status}, metadata = ${JSON.stringify({ ...(current.metadata || {}), ...(input.metadata || {}) })}::jsonb, updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${libranzaId}
      RETURNING *
    `;
    return rows[0];
  });
}

async function activeEmployeeLibranzas(tenantId, employeeIds = [], { start, end, periodType }) {
  if (!employeeIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT l.*, c.code AS concept_code, c.name AS concept_name, c.debit_account_code, c.credit_account_code, c.entity_id
    FROM th_libranza_empleados l
    INNER JOIN th_libranza_conceptos c ON c.id = l.concept_id AND c.tenant_id = l.tenant_id
    WHERE l.tenant_id = ${tenantId}
      AND l.employee_id IN (${Prisma.join(employeeIds)})
      AND l.status = 'activa'
      AND c.active = true
      AND l.frequency = ${periodType}
      AND l.start_date <= ${end}::date
      AND (l.end_date IS NULL OR l.end_date >= ${start}::date)
      AND (l.mode = 'perpetua' OR COALESCE(l.balance_amount, l.original_amount, 0) > 0)
  `.catch(() => []);
  const byEmployee = new Map();
  for (const row of rows) {
    const list = byEmployee.get(row.employee_id) || [];
    list.push(row);
    byEmployee.set(row.employee_id, list);
  }
  return byEmployee;
}

function payrollLineFromLibranza(row) {
  const balance = row.mode === "perpetua" ? null : Number(row.balance_amount ?? row.original_amount ?? 0);
  const amount = row.mode === "perpetua" ? Number(row.installment_amount || 0) : Math.min(Number(row.installment_amount || 0), Math.max(balance || 0, 0));
  if (!amount) return null;
  return payrollLine(
    row.concept_code,
    row.concept_name,
    1,
    amount,
    -Math.abs(amount),
    "libranza",
    {
      concept_type: "deduccion",
      salary_constitutive: false,
      affects_ibc: false,
      metadata: {
        libranza_id: row.id,
        legal_group: "libranza",
        mode: row.mode,
        original_amount: row.original_amount == null ? null : Number(row.original_amount),
        installment_amount: Number(row.installment_amount || amount),
        balance_amount: balance,
        balance_after: row.mode === "perpetua" ? null : money(Math.max((balance || 0) - amount, 0)),
        debit_account_code: row.debit_account_code || "",
        credit_account_code: row.credit_account_code || ""
      }
    }
  );
}

async function applyPayrollLibranzaMovements(tx, tenantId, document) {
  const lines = (document.lines || []).filter((line) => line.source === "libranza" && line.metadata?.libranza_id);
  for (const line of lines) {
    const libranzaId = numericId(line.metadata.libranza_id);
    const currentRows = await tx.$queryRaw`SELECT * FROM th_libranza_empleados WHERE tenant_id = ${tenantId} AND id = ${libranzaId} FOR UPDATE`;
    const current = currentRows[0];
    if (!current || current.status !== "activa") continue;
    const amount = Math.abs(Number(line.amount || 0));
    const before = current.mode === "perpetua" ? null : Number(current.balance_amount ?? current.original_amount ?? 0);
    const applied = current.mode === "perpetua" ? amount : Math.min(amount, Math.max(before || 0, 0));
    const after = current.mode === "perpetua" ? null : money(Math.max((before || 0) - applied, 0));
    await tx.$executeRaw`
      INSERT INTO th_libranza_movimientos (tenant_id, employee_libranza_id, employee_id, period_key, payroll_document_id, amount, balance_before, balance_after, metadata)
      VALUES (${tenantId}, ${libranzaId}, ${document.employee_id}, ${document.period_key}, ${document.id}, ${applied}, ${before}, ${after}, ${JSON.stringify({ concept_code: line.code, concept_name: line.name })}::jsonb)
      ON CONFLICT (tenant_id, employee_libranza_id, period_key)
      DO UPDATE SET payroll_document_id = EXCLUDED.payroll_document_id, amount = EXCLUDED.amount, balance_before = EXCLUDED.balance_before, balance_after = EXCLUDED.balance_after, metadata = EXCLUDED.metadata, updated_at = now()
    `;
    if (current.mode !== "perpetua") {
      await tx.$executeRaw`
        UPDATE th_libranza_empleados
        SET deducted_amount = COALESCE((SELECT SUM(amount) FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND employee_libranza_id = ${libranzaId} AND status = 'aplicado'), 0),
            installments_paid = COALESCE((SELECT COUNT(*) FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND employee_libranza_id = ${libranzaId} AND status = 'aplicado'), 0),
            balance_amount = ${after},
            status = CASE WHEN ${after} <= 0 THEN 'finalizada' ELSE status END,
            updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${libranzaId}
      `;
    }
  }
}

async function reversePayrollLibranzaMovements(tx, tenantId, periodKey) {
  const affected = await tx.$queryRaw`
    DELETE FROM th_libranza_movimientos
    WHERE tenant_id = ${tenantId} AND period_key = ${periodKey}
    RETURNING employee_libranza_id
  `;
  const ids = Array.from(new Set(affected.map((row) => Number(row.employee_libranza_id)).filter(Boolean)));
  for (const id of ids) {
    await tx.$executeRaw`
      UPDATE th_libranza_empleados l
      SET deducted_amount = COALESCE((SELECT SUM(amount) FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND employee_libranza_id = ${id} AND status = 'aplicado'), 0),
          installments_paid = COALESCE((SELECT COUNT(*) FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND employee_libranza_id = ${id} AND status = 'aplicado'), 0),
          balance_amount = CASE WHEN l.mode = 'perpetua' THEN NULL ELSE GREATEST(COALESCE(l.original_amount, 0) - COALESCE((SELECT SUM(amount) FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND employee_libranza_id = ${id} AND status = 'aplicado'), 0), 0) END,
          status = CASE WHEN l.status = 'finalizada' THEN 'activa' ELSE l.status END,
          updated_at = now()
      WHERE l.tenant_id = ${tenantId} AND l.id = ${id}
    `;
  }
}

async function activePayrollConcepts(tenantId, effectiveDate, country = "CO") {
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM th_nomina_conceptos
    WHERE tenant_id IN (${tenantId}, 'default')
      AND country = ${country}
      AND active = true
      AND valid_from <= ${effectiveDate}
      AND (valid_to IS NULL OR valid_to >= ${effectiveDate})
    ORDER BY code ASC, CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END ASC, priority DESC, valid_from DESC
  `.catch(() => []);
  const byCode = new Map();
  for (const row of rows) if (!byCode.has(row.code)) byCode.set(row.code, row);
  return Object.fromEntries(byCode.entries());
}

function periodFromRange(input = {}) {
  const start = input.fecha_inicio || input.start_date || input.date_start;
  const end = input.fecha_fin || input.end_date || input.date_end;
  if (!start || !end) {
    const err = new Error("fecha_inicio y fecha_fin son requeridas");
    err.statusCode = 400;
    throw err;
  }
  const startDate = startOfDay(start);
  const endDate = startOfDay(end);
  if (endDate < startDate) {
    throw validationError("La fecha final del periodo no puede ser menor que la inicial.", 400, "PERIODO_RANGO_INVALIDO");
  }
  if (daysInclusive(startDate, endDate) > 31) {
    throw validationError("El periodo de nomina no puede abarcar mas de un mes.", 400, "PERIODO_RANGO_EXCEDIDO");
  }
  return { start: startDate, end: endDate, key: `${start}_${end}` };
}

// Valida el period_key 'tipo:inicio:fin' (formato, fechas y que no sea un rango invalido).
function assertValidPeriodKey(periodKey) {
  const raw = String(periodKey || "").trim();
  const parts = raw.split(":");
  if (parts.length !== 3) throw validationError("El periodo no tiene un formato valido (tipo:inicio:fin).", 400, "PERIODO_FORMATO_INVALIDO");
  const [, startStr, endStr] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    throw validationError("Las fechas del periodo deben tener formato AAAA-MM-DD.", 400, "PERIODO_FECHAS_INVALIDAS");
  }
  const start = startOfDay(startStr);
  const end = startOfDay(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw validationError("Las fechas del periodo no son validas.", 400, "PERIODO_FECHAS_INVALIDAS");
  }
  if (end < start) throw validationError("La fecha final del periodo no puede ser menor que la inicial.", 400, "PERIODO_RANGO_INVALIDO");
  if (daysInclusive(start, end) > 31) throw validationError("El periodo de nomina no puede abarcar mas de un mes.", 400, "PERIODO_RANGO_EXCEDIDO");
  return { start, end };
}

async function salarySnapshotsForEmployees(tenantId, employeeIds = [], start, end) {
  if (!employeeIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM th_empleado_salarios
    WHERE tenant_id = ${tenantId}
      AND employee_id IN (${Prisma.join(employeeIds)})
      AND valid_from <= ${end}::date
      AND (valid_to IS NULL OR valid_to >= ${start}::date)
    ORDER BY employee_id ASC, valid_from ASC
  `.catch(() => []);
  const byEmployee = new Map();
  for (const row of rows) {
    const list = byEmployee.get(row.employee_id) || [];
    list.push(row);
    byEmployee.set(row.employee_id, list);
  }
  return byEmployee;
}

function weightedSalaryForPeriod(employee, snapshots = [], start, end) {
  const totalDays = Math.max(daysInclusive(start, end), 1);
  if (!snapshots.length) {
    const salary = Number(employee.salary_base || 0);
    return { monthly_salary: salary, daily_salary: salary / 30, source: "employee_current", segments: [] };
  }
  let weighted = 0;
  const segments = [];
  for (const snap of snapshots) {
    const from = startOfDay(new Date(Math.max(new Date(snap.valid_from).getTime(), start.getTime())));
    const to = startOfDay(new Date(Math.min(new Date(snap.valid_to || end).getTime(), end.getTime())));
    if (to < from) continue;
    const days = daysInclusive(from, to);
    const monthly = Number(snap.monthly_salary || 0);
    weighted += monthly * days;
    segments.push({ valid_from: from.toISOString().slice(0, 10), valid_to: to.toISOString().slice(0, 10), days, monthly_salary: monthly });
  }
  const monthlySalary = weighted ? money(weighted / totalDays) : Number(employee.salary_base || 0);
  return { monthly_salary: monthlySalary, daily_salary: monthlySalary / 30, source: "salary_history", segments };
}

async function activeCalendarDaysByDate(tenantId, start, end, country = "CO") {
  const rows = await prisma.$queryRaw`
    SELECT date, name, day_type, source, metadata
    FROM th_calendario_dias
    WHERE tenant_id = ${tenantId}
      AND active = true
      AND country = ${country}
      AND date >= ${start}::date
      AND date <= ${end}::date
    ORDER BY date ASC
  `.catch(() => []);
  const byDate = new Map();
  for (const row of rows) {
    byDate.set(new Date(row.date).toISOString().slice(0, 10), row);
  }
  return byDate;
}

function calendarDayTypeForDate(date, calendarDays = new Map()) {
  const day = startOfDay(date);
  const key = day.toISOString().slice(0, 10);
  const configured = calendarDays.get(key);
  if (configured?.day_type) return String(configured.day_type);
  return day.getDay() === 0 ? "dominical" : "ordinario";
}

function calendarRestDayMinutes(day, calendarDays = new Map()) {
  const type = calendarDayTypeForDate(day.date, calendarDays);
  const isRestDay = ["festivo", "dominical", "no_laboral"].includes(type);
  if (!isRestDay) return { type, dayMinutes: 0, nightMinutes: 0 };
  const dayMinutes = Number(day.ordinary_day_minutes || 0);
  const nightMinutes = Number(day.ordinary_night_minutes || 0);
  return { type, dayMinutes, nightMinutes };
}

async function activeLaborDeductions(tenantId, effectiveDate) {
  const rows = await prisma.$queryRaw`
    SELECT code, name, value, unit, metadata
    FROM th_parametros_laborales
    WHERE tenant_id = ${tenantId}
      AND active = true
      AND COALESCE(metadata->>'category', '') = 'deduction'
      AND valid_from <= ${effectiveDate}
      AND (valid_to IS NULL OR valid_to >= ${effectiveDate})
    ORDER BY code ASC, priority DESC, valid_from DESC
  `.catch(() => []);
  const byCode = new Map();
  for (const row of rows) {
    if (!byCode.has(row.code)) byCode.set(row.code, row);
  }
  return Array.from(byCode.values());
}

async function processPayrollRange(tenantId, input = {}) {
  const { start, end, key } = periodFromRange(input);
  const endExclusive = endOfDay(end);
  return prisma.runWithTenant(tenantId, async () => {
    const deductionMasters = await activeLaborDeductions(tenantId, start);
    const laborParameterRows = await activeLaborParameterValues(tenantId, start, ["HORAS_MENSUALES_ORDINARIAS"]);
    const monthlyOrdinaryHours = Number(laborParameterRows.HORAS_MENSUALES_ORDINARIAS?.value || LEGAL_PARAMETER_FALLBACKS_CO_2026.HORAS_MENSUALES_ORDINARIAS) || 210;
    const employees = await prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } } });
    const workdays = await prisma.processedWorkday.findMany({
      where: { employee_id: { in: employees.map((employee) => employee.id) }, date: { gte: start, lt: endExclusive } },
      select: {
        employee_id: true,
        overtime_day_minutes: true,
        overtime_night_minutes: true,
        overtime_sunday_holiday_day_minutes: true,
        overtime_sunday_holiday_night_minutes: true
      }
    });
    const workdaysByEmployee = new Map();
    for (const day of workdays) {
      const list = workdaysByEmployee.get(day.employee_id) || [];
      list.push(day);
      workdaysByEmployee.set(day.employee_id, list);
    }

    const existing = await prisma.payroll.findMany({
      where: { period: key, employee_id: { in: employees.map((employee) => employee.id) } },
      select: { employee_id: true }
    });
    const existingIds = new Set(existing.map((row) => row.employee_id));

    const rows = employees.map((employee) => {
      const days = workdaysByEmployee.get(employee.id) || [];
      const daysWorked = days.length;
      const overtimeMinutes = days.reduce((sum, day) => sum +
        day.overtime_day_minutes +
        day.overtime_night_minutes +
        day.overtime_sunday_holiday_day_minutes +
        day.overtime_sunday_holiday_night_minutes, 0);
      const salaryBase = Number(employee.salary_base || 0);
      const base = Math.round(((salaryBase / 30) * daysWorked) * 100) / 100;
      const hourly = salaryBase ? salaryBase / monthlyOrdinaryHours : 0;
      const overtime = Math.round((overtimeMinutes / 60) * hourly * 1.25 * 100) / 100;
      const gross = Math.round((base + overtime) * 100) / 100;
      const deductionDetails = deductionMasters
        .filter((row) => String(row.code || "").startsWith("DED_"))
        .map((row) => {
          const percent = Number(row.value || 0);
          return { code: row.code, name: row.name, percent, amount: Math.round(gross * (percent / 100) * 100) / 100 };
        });
      const deductions = Math.round(deductionDetails.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
      const detail = {
        empleado: employee.metadata?.name || employee.user?.name || employee.code,
        fecha_inicio: start.toISOString().slice(0, 10),
        fecha_fin: end.toISOString().slice(0, 10),
        salario_proporcional: base,
        horas_extra: overtime,
        deducciones_parametrizadas: deductionDetails,
        alertas: daysWorked === 0 ? ["sin_jornadas"] : []
      };
      return {
        tenant_id: tenantId,
        employee_id: employee.id,
        period: key,
        days_worked: daysWorked,
        overtime_hrs: Math.round((overtimeMinutes / 60) * 100) / 100,
        absences: 0,
        gross,
        deductions,
        net: gross - deductions,
        employer_cost: gross,
        detail
      };
    });

    const toCreate = rows.filter((row) => !existingIds.has(row.employee_id));
    const toUpdate = rows.filter((row) => existingIds.has(row.employee_id));

    if (toCreate.length) await prisma.payroll.createMany({ data: toCreate });
    for (const row of toUpdate) {
      await prisma.payroll.updateMany({
        where: { employee_id: row.employee_id, period: key },
        data: {
          days_worked: row.days_worked,
          overtime_hrs: row.overtime_hrs,
          gross: row.gross,
          deductions: row.deductions,
          net: row.net,
          employer_cost: row.employer_cost,
          detail: row.detail
        }
      });
    }

    return { ok: true, fecha_inicio: start.toISOString().slice(0, 10), fecha_fin: end.toISOString().slice(0, 10), liquidaciones: rows.length };
  });
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function activeSurchargeConcepts(tenantId, effectiveDate) {
  const rows = await prisma.$queryRaw`
    SELECT code, name, value_type, factor, percent, unit
    FROM th_conceptos_recargo
    WHERE tenant_id = ${tenantId}
      AND active = true
      AND valid_from <= ${effectiveDate}
      AND (valid_to IS NULL OR valid_to >= ${effectiveDate})
    ORDER BY code ASC, priority DESC, valid_from DESC
  `.catch(() => []);
  const byCode = new Map();
  for (const row of rows) if (!byCode.has(row.code)) byCode.set(row.code, row);
  return Object.fromEntries(byCode.entries());
}

function periodKeyFromRange({ start, end, type }) {
  return `${type || "quincena"}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
}

async function assertPayrollPeriodOpen(tenantId, periodKey) {
  const key = String(periodKey || "").trim();
  if (!key) return;
  const rows = await prisma.$queryRaw`
    SELECT id
    FROM th_nomina_cierres_periodo
    WHERE tenant_id = ${tenantId}
      AND period_key = ${key}
      AND status = 'cerrado'
    LIMIT 1
  `.catch(() => []);
  if (rows[0]) throw validationError("El periodo de nomina esta cerrado. Reabre el cierre antes de modificarlo.", 409, "PERIODO_NOMINA_CERRADO");
}

function payrollLine(code, name, quantity, rate, amount, source = "system", concept = {}) {
  const metadata = concept.metadata || {};
  return {
    code,
    name,
    quantity: money(quantity),
    rate: money(rate),
    amount: money(amount),
    source,
    concept_type: concept.concept_type || (amount < 0 ? "deduccion" : "devengo"),
    salary_constitutive: concept.salary_constitutive !== false,
    affects_ibc: concept.affects_ibc !== false,
    legal_group: metadata.legal_group || "general",
    include_in_social_benefits_base: metadata.include_in_social_benefits_base === true,
    include_in_vacation_base: metadata.include_in_vacation_base === true,
    exclude_from_social_benefits_base: metadata.exclude_from_social_benefits_base === true,
    debit_account_code: metadata.debit_account_code || "",
    credit_account_code: metadata.credit_account_code || ""
  };
}

function payrollConceptFallback(code) {
  if (code === "JORNADA_ORDINARIA") {
    return { name: "Jornada ordinaria", concept_type: "devengo", salary_constitutive: true, affects_ibc: true, metadata: { legal_group: "salario" } };
  }
  const socialBenefits = {
    PRIMA_SERVICIOS: "Prima de servicios",
    CESANTIAS: "Cesantias",
    INTERESES_CESANTIAS: "Intereses a las cesantias",
    VACACIONES: "Vacaciones"
  };
  if (socialBenefits[code]) {
    return { name: socialBenefits[code], concept_type: "devengo", salary_constitutive: false, affects_ibc: false, metadata: { legal_group: "prestaciones_sociales", exclude_from_social_benefits_base: true } };
  }
  if (code === "AUX_TRANSPORTE") {
    return { name: "Auxilio de transporte", concept_type: "devengo", salary_constitutive: false, affects_ibc: false, metadata: { legal_group: "auxilio", include_in_social_benefits_base: true, include_in_vacation_base: false } };
  }
  return {};
}

function daysInclusive(start, end) {
  return Math.max(Math.floor((startOfDay(end) - startOfDay(start)) / 86400000) + 1, 0);
}

const SOCIAL_BENEFIT_CODES = new Set(["PRIMA_SERVICIOS", "CESANTIAS", "INTERESES_CESANTIAS", "VACACIONES"]);
const LEGAL_PARAMETER_FALLBACKS_CO_2026 = {
  SMMLV: 1750905,
  AUX_TRANSPORTE: 249095,
  AUX_TRANSPORTE_TOPE_SMMLV: 2,
  // Divisor mensual de horas ordinarias para liquidar hora extra/recargo. Con la jornada de
  // 42 horas semanales (Ley 2101) es 210 desde el 15-jul-2026 (42/6*30). Parametrizable y con
  // vigencia en th_parametros_laborales; 240 era el valor historico de la jornada de 48 horas.
  HORAS_MENSUALES_ORDINARIAS: 210
};

function payrollReceiptLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).filter((line) => {
    const code = String(line?.code || "").toUpperCase();
    return !SOCIAL_BENEFIT_CODES.has(code) && line?.legal_group !== "prestaciones_sociales";
  });
}

function socialBenefitBaseFromLines(lines, fallbackMonthlyBase, liquidationDays, { includeVacationBase = false } = {}) {
  const positiveBase = lines
    .filter((line) => {
      if (!line || Number(line.amount || 0) <= 0) return false;
      const code = String(line.code || "").toUpperCase();
      if (SOCIAL_BENEFIT_CODES.has(code) || line.legal_group === "prestaciones_sociales" || line.exclude_from_social_benefits_base) return false;
      if (includeVacationBase) return line.salary_constitutive !== false || line.include_in_vacation_base;
      return line.salary_constitutive !== false || line.include_in_social_benefits_base;
    })
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);
  if (positiveBase > 0 && liquidationDays > 0) return money((positiveBase / liquidationDays) * 30);
  return money(fallbackMonthlyBase || 0);
}

function addSocialBenefitLines(lines, payrollConcepts, { socialBenefitsBase, vacationBase, daysWorked, periodDays, socialBenefitDays }) {
  const vacationLiquidationDays = daysWorked || periodDays;
  const benefitLiquidationDays = socialBenefitDays ?? vacationLiquidationDays;
  if ((!socialBenefitsBase && !vacationBase) || (!benefitLiquidationDays && !vacationLiquidationDays)) return { prima: 0, cesantias: 0, interesesCesantias: 0, vacaciones: 0 };
  const benefits = {
    prima: money((socialBenefitsBase * benefitLiquidationDays) / 360),
    cesantias: money((socialBenefitsBase * benefitLiquidationDays) / 360),
    interesesCesantias: 0,
    vacaciones: money((vacationBase * vacationLiquidationDays) / 720)
  };
  benefits.interesesCesantias = money((benefits.cesantias * benefitLiquidationDays * 0.12) / 360);
  const definitions = [
    ["PRIMA_SERVICIOS", "Prima de servicios", benefits.prima, benefitLiquidationDays],
    ["CESANTIAS", "Cesantias", benefits.cesantias, benefitLiquidationDays],
    ["INTERESES_CESANTIAS", "Intereses a las cesantias", benefits.interesesCesantias, benefitLiquidationDays],
    ["VACACIONES", "Vacaciones", benefits.vacaciones, vacationLiquidationDays]
  ];
  for (const [code, label, amount, quantity] of definitions) {
    if (!amount) continue;
    const concept = payrollConcepts[code] || payrollConceptFallback(code);
    lines.push(payrollLine(code, concept.name || label, quantity, quantity ? amount / quantity : amount, amount, "prestaciones", concept));
  }
  return benefits;
}

function isWorkdayCorrection(adjustment = {}) {
  return ["jornada_ordinaria", "olvido_marcacion", "correccion_jornada"].includes(String(adjustment.adjustment_type || "").trim().toLowerCase())
    || normalizeLaborCode(adjustment.concept_code || "") === "JORNADA_ORDINARIA";
}

function isExternalWorkday(adjustment = {}) {
  return String(adjustment.adjustment_type || "").trim().toLowerCase() === "jornada_externa";
}

function adjustmentPayrollMinutes(adjustment = {}) {
  const minutes = Number(adjustment.minutes || 0);
  if (minutes > 0) return minutes;
  const days = Number(adjustment.metadata?.days || adjustment.metadata?.dias || 0);
  if (days > 0 && normalizeLaborCode(adjustment.concept_code || "") === "JORNADA_ORDINARIA") return days * 480;
  return 0;
}

function correctionMinutesFromInput(input = {}) {
  const explicitMinutes = Number(input.minutes || 0);
  if (explicitMinutes > 0) return Math.round(explicitMinutes);
  const start = minutesFromTime(input.start_time);
  const end = minutesFromTime(input.end_time);
  if (start == null || end == null) return 0;
  let total = end - start;
  if (total <= 0) total += 1440;
  return total;
}

function correctionDescription(input = {}) {
  const supplied = String(input.description || "").trim();
  if (supplied) return supplied;
  if (isWorkdayCorrection(input)) return "Jornada ordinaria";
  return "Ajuste";
}

function isVacationAdjustment(adjustment = {}) {
  return String(adjustment.adjustment_type || "").trim().toLowerCase() === "vacaciones"
    || normalizeLaborCode(adjustment.concept_code || "") === "VACACIONES";
}

function adjustmentDays(adjustment = {}) {
  const explicitDays = Number(adjustment.metadata?.days || adjustment.metadata?.dias || 0);
  if (explicitDays > 0) return explicitDays;
  const minutes = Number(adjustment.minutes || 0);
  if (minutes > 0) return minutes / 480;
  return 0;
}

const TERMINATION_BENEFIT_CODES = new Set(["PRIMA_SERVICIOS", "CESANTIAS", "INTERESES_CESANTIAS", "VACACIONES"]);

function benefitLine(code, amount, quantity, source = "retiro") {
  const concept = payrollConceptFallback(code);
  return payrollLine(code, concept.name || code, quantity, quantity ? amount / quantity : amount, amount, source, concept);
}

function indemnizationDaysForTermination({ contractType, salaryBase, serviceDays, remainingDays }) {
  const type = normalizeContractType(contractType);
  if (type === "fixed" || type === "obra_labor") return Math.max(Number(remainingDays || 0), type === "obra_labor" ? 15 : 0);
  if (!(serviceDays > 0)) return 0;
  const highSalary = Number(salaryBase || 0) >= 10 * Number(process.env.SMLV_CO || 0) && Number(process.env.SMLV_CO || 0) > 0;
  const firstYearDays = highSalary ? 20 : 30;
  const extraYearDays = highSalary ? 15 : 20;
  if (serviceDays <= 360) return firstYearDays;
  return money(firstYearDays + ((serviceDays - 360) / 360) * extraYearDays);
}

function buildTerminationBenefitLines({ salaryBase, startDate, terminationDate, paidBalances = [] }) {
  const serviceDays = daysInclusive(startDate, terminationDate);
  const paidByCode = Object.fromEntries(paidBalances.map((row) => [row.concept_code, Number(row.paid_amount || 0)]));
  const prima = money((salaryBase * serviceDays) / 360);
  const cesantias = money((salaryBase * serviceDays) / 360);
  const interesesCesantias = money((cesantias * serviceDays * 0.12) / 360);
  const vacaciones = money((salaryBase * serviceDays) / 720);
  return [
    ["PRIMA_SERVICIOS", prima, serviceDays],
    ["CESANTIAS", cesantias, serviceDays],
    ["INTERESES_CESANTIAS", interesesCesantias, serviceDays],
    ["VACACIONES", vacaciones, serviceDays]
  ].map(([code, accrued, quantity]) => {
    const paid = money(paidByCode[code] || 0);
    const balance = money(Math.max(Number(accrued) - paid, 0));
    return { ...benefitLine(code, balance, quantity), accrued_amount: money(accrued), paid_amount: paid, balance_amount: balance };
  }).filter((line) => line.amount > 0);
}

async function benefitBalancesForEmployee(tenantId, employeeId) {
  return prisma.$queryRaw`
    SELECT concept_code, SUM(accrued_amount) AS accrued_amount, SUM(paid_amount) AS paid_amount, SUM(balance_amount) AS balance_amount
    FROM th_prestaciones_saldos
    WHERE tenant_id = ${tenantId}
      AND employee_id = ${employeeId}
    GROUP BY concept_code
  `.catch(() => []);
}

async function updateBenefitBalancesFromPayroll(tx, tenantId, document) {
  const lines = Array.isArray(document.lines) ? document.lines : [];
  for (const line of lines.filter((row) => TERMINATION_BENEFIT_CODES.has(String(row.code || "").toUpperCase()))) {
    await tx.$executeRaw`
      INSERT INTO th_prestaciones_saldos (
        tenant_id, employee_id, concept_code, period_key, date_start, date_end, accrued_amount, paid_amount, balance_amount, source_document_type, source_document_id, metadata
      )
      VALUES (
        ${tenantId}, ${document.employee_id}, ${line.code}, ${document.period_key}, ${document.date_start}::date, ${document.date_end}::date,
        ${Number(line.amount || 0)}, ${Number(line.amount || 0)}, 0, 'nomina', ${document.id}, ${JSON.stringify({ source: line.source || "prestaciones" })}::jsonb
      )
      ON CONFLICT (tenant_id, employee_id, concept_code, period_key)
      DO UPDATE SET accrued_amount = EXCLUDED.accrued_amount, paid_amount = EXCLUDED.paid_amount, balance_amount = 0, source_document_id = EXCLUDED.source_document_id, updated_at = now()
    `;
  }
}

async function buildEmployeeTerminationLiquidation(tenantId, input = {}) {
  const employeeId = numericId(input.employee_id);
  if (!employeeId) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  const terminationDate = dateOnly(input.termination_date || input.fecha_retiro, null);
  if (!terminationDate) throw validationError("La fecha de retiro es obligatoria.", 400, "FECHA_RETIRO_REQUERIDA");
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await prisma.employee.findFirst({ where: { tenant_id: tenantId, id: employeeId }, include: { user: { select: safeUserSelect } } });
    if (!employee) throw validationError("Empleado no encontrado.", 404, "EMPLEADO_NO_ENCONTRADO");
    const startDate = startOfDay(input.hire_date || employee.hire_date || employee.created_at || terminationDate);
    const salarySnapshots = await salarySnapshotsForEmployees(tenantId, [employeeId], startDate, terminationDate);
    const salaryInfo = weightedSalaryForPeriod(employee, salarySnapshots.get(employee.id) || [], startDate, terminationDate);
    const salaryBase = Number(input.salary_base || salaryInfo.monthly_salary || employee.salary_base || 0);
    const benefitSalaryBase = Number(input.salary_base || salaryInfo.monthly_salary || employee.salary_base || 0);
    const contractType = normalizeContractType(input.contract_type || employee.contract_type);
    const serviceDays = daysInclusive(startDate, terminationDate);
    const remainingDays = input.remaining_days !== undefined
      ? Number(input.remaining_days || 0)
      : employee.end_date ? Math.max(daysInclusive(new Date(terminationDate.getTime() + 86400000), employee.end_date), 0) : 0;
    const terminationReason = String(input.termination_reason || "retiro_voluntario").trim();
    const balances = await benefitBalancesForEmployee(tenantId, employeeId);
    const benefitLines = buildTerminationBenefitLines({ salaryBase: benefitSalaryBase, startDate, terminationDate, paidBalances: balances });
    const indemnizationDays = terminationReason === "sin_justa_causa"
      ? indemnizationDaysForTermination({ contractType, salaryBase, serviceDays, remainingDays })
      : 0;
    const indemnizationAmount = money((salaryBase / 30) * indemnizationDays);
    const indemnizationLine = indemnizationAmount
      ? [payrollLine("INDEMNIZACION_SIN_JUSTA_CAUSA", "Indemnizacion por despido sin justa causa", indemnizationDays, salaryBase / 30, indemnizationAmount, "retiro", { concept_type: "devengo", salary_constitutive: false, affects_ibc: false, metadata: { legal_group: "indemnizacion" } })]
      : [];
    const salaryDays = Math.min(Number(input.pending_salary_days || 0), 30);
    const salaryLine = salaryDays > 0 ? [payrollLine("SALARIO_PENDIENTE", "Salario pendiente a la fecha de retiro", salaryDays, salaryBase / 30, (salaryBase / 30) * salaryDays, "retiro", { concept_type: "devengo", salary_constitutive: true, affects_ibc: true, metadata: { legal_group: "salario" } })] : [];
    const lines = [...salaryLine, ...benefitLines, ...indemnizationLine];
    const gross = money(lines.filter((line) => Number(line.amount || 0) > 0).reduce((sum, line) => sum + Number(line.amount || 0), 0));
    const benefitBalanceAmount = money(benefitLines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
    return {
      employee_id: employee.id,
      employee_name: employee.metadata?.name || employee.user?.name || employee.code || `Empleado ${employee.id}`,
      employee_code: employee.code,
      termination_date: terminationDate,
      termination_reason: terminationReason,
      contract_type: contractType,
      gross,
      deductions: 0,
      net: gross,
      indemnization_amount: indemnizationAmount,
      benefit_balance_amount: benefitBalanceAmount,
      lines,
      source_summary: {
        fecha_ingreso: startDate.toISOString().slice(0, 10),
        fecha_retiro: terminationDate.toISOString().slice(0, 10),
        dias_servicio: serviceDays,
        dias_faltantes_contrato: remainingDays,
        dias_indemnizacion: indemnizationDays,
        base_salarial: salaryBase,
        base_prestaciones_retiro: benefitSalaryBase,
        historial_salarial_retiro: salaryInfo.segments,
        saldos_previos_prestaciones: balances,
        regla_indemnizacion: terminationReason === "sin_justa_causa" ? "CST art. 64" : "No aplica indemnizacion por causal seleccionada"
      }
    };
  });
}

async function buildPayrollLiquidationRows(tenantId, input = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || input.tipo_periodo || "quincena";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  const endExclusive = endOfDay(end);
  const employeeFilter = input.employee_id ? { id: numericId(input.employee_id) } : {};
  const [deductionMasters, legalParameterRows, surchargeMasters, payrollConcepts, employees, payrollConfig] = await Promise.all([
    activeLaborDeductions(tenantId, start),
    activeLaborParameterValues(tenantId, start, ["SMMLV", "AUX_TRANSPORTE", "AUX_TRANSPORTE_TOPE_SMMLV", "HORAS_MENSUALES_ORDINARIAS"]),
    activeSurchargeConcepts(tenantId, start),
    activePayrollConcepts(tenantId, start, input.country || "CO"),
    prisma.employee.findMany({ where: { active: true, ...employeeFilter }, include: { user: { select: safeUserSelect } } }),
    getPayrollConfig(tenantId)
  ]);
  const transportAllowancePaymentRaw = String(payrollConfig?.parameters?.transport_allowance_payment || "ambas").toLowerCase();
  // Solo se admite prorrateo en ambas quincenas o pago en la ultima quincena.
  // Cualquier otro valor (incluido "primera", retirado) se trata como "ambas".
  const transportAllowancePayment = transportAllowancePaymentRaw === "ultima" ? "ultima" : "ambas";
  const isQuincenaPeriod = periodType === "quincena";
  const transportQuincenaIsFirstHalf = Number(startOfDay(start).toISOString().slice(8, 10)) <= 15;
  const smmlv = Number(legalParameterRows.SMMLV?.value || LEGAL_PARAMETER_FALLBACKS_CO_2026.SMMLV);
  const transportAllowanceMonthly = Number(legalParameterRows.AUX_TRANSPORTE?.value || LEGAL_PARAMETER_FALLBACKS_CO_2026.AUX_TRANSPORTE);
  const transportAllowanceThresholdSmmlv = Number(legalParameterRows.AUX_TRANSPORTE_TOPE_SMMLV?.value || LEGAL_PARAMETER_FALLBACKS_CO_2026.AUX_TRANSPORTE_TOPE_SMMLV);
  // Divisor mensual de horas ordinarias (jornada 42h => 210; configurable y con vigencia).
  const monthlyOrdinaryHours = Number(legalParameterRows.HORAS_MENSUALES_ORDINARIAS?.value || LEGAL_PARAMETER_FALLBACKS_CO_2026.HORAS_MENSUALES_ORDINARIAS) || 210;
  const pensionSolidarityParameter = deductionMasters.find((row) => row.code === "DED_FONDO_SOLIDARIDAD_PENSIONAL");
  // Multiplicador por hora de un concepto de recargo/hora extra, segun su value_type
  // configurable en Configuracion laboral -> Conceptos de recargo:
  //   - "porcentaje_adicional": paga SOLO el porcentaje adicional (recargo nocturno = 0.35).
  //   - "factor_total": paga el factor completo (horas extra, p.ej. 1.25).
  //   - "informativo": no liquida valor (0).
  // Codigos sin concepto de recargo (JORNADA_ORDINARIA, conceptos manuales) devuelven 1.
  // El mismo helper se usa en marcaciones y en jornadas externas para que el valor liquidado
  // sea identico por la misma cantidad de horas, sin reglas quemadas en el codigo.
  const surchargeMultiplierFor = (code) => {
    const concept = surchargeMasters[code];
    if (!concept) return 1;
    const valueType = String(concept.value_type || "").toLowerCase();
    if (valueType === "informativo") return 0;
    if (valueType === "porcentaje_adicional") return Number(concept.percent || 0) / 100;
    if (valueType === "factor_total") return Number(concept.factor || 1);
    // Compatibilidad si el concepto no declara value_type: usa el factor total disponible.
    return Number(concept.factor || (1 + Number(concept.percent || 0) / 100) || 1);
  };
  const employeeIds = employees.map((employee) => employee.id);
  const [workdays, adjustments, libranzasByEmployee, salarySnapshots, calendarDays, scheduleRoutes] = await Promise.all([
    employeeIds.length ? prisma.processedWorkday.findMany({
      where: { employee_id: { in: employeeIds }, date: { gte: start, lt: endExclusive } },
      orderBy: { date: "asc" }
    }) : [],
    employeeIds.length ? prisma.$queryRaw`
      SELECT *
      FROM th_nomina_ajustes
      WHERE tenant_id = ${tenantId}
        AND period_key = ${periodKey}
        AND status = 'activo'
      ORDER BY created_at ASC
    `.then((rows) => rows.filter((row) => employeeIds.includes(Number(row.employee_id)))).catch(() => []) : [],
    activeEmployeeLibranzas(tenantId, employeeIds, { start, end, periodType }),
    salarySnapshotsForEmployees(tenantId, employeeIds, start, end),
    activeCalendarDaysByDate(tenantId, start, end, input.country || "CO"),
    employeeIds.length ? prisma.timeRoute.findMany({ where: { date: { gte: start, lt: endExclusive } }, select: { date: true, employees: true, kind: true } }).catch(() => []) : []
  ]);
  // Descanso explicito desde la malla (TimeRoute con kind='descanso'). Un dia se paga solo si
  // tiene marcacion, descanso explicito o licencia remunerada; cualquier otro dia no se paga.
  const employeeAliasKeys = new Map();
  for (const employee of employees) {
    employeeAliasKeys.set(employee.id, new Set(aliasesForEmployee(employee).map((alias) => normalizeKey(alias)).filter(Boolean)));
  }
  const restDatesByEmployee = new Map();
  for (const route of scheduleRoutes) {
    if (normalizeRouteKind(route.kind) !== "descanso") continue;
    const routeKeys = routeEmployeeSet(route);
    if (!routeKeys.size) continue;
    const dateKey = new Date(route.date).toISOString().slice(0, 10);
    for (const employee of employees) {
      const aliases = employeeAliasKeys.get(employee.id);
      let assigned = false;
      for (const alias of aliases) { if (routeKeys.has(alias)) { assigned = true; break; } }
      if (!assigned) continue;
      const set = restDatesByEmployee.get(employee.id) || new Set();
      set.add(dateKey);
      restDatesByEmployee.set(employee.id, set);
    }
  }
  const PAID_LEAVE_CODES = new Set(["LICENCIA_REMUNERADA", "VACACIONES"]);
  const daysByEmployee = new Map();
  for (const day of workdays) {
    const list = daysByEmployee.get(day.employee_id) || [];
    list.push(day);
    daysByEmployee.set(day.employee_id, list);
  }
  const adjustmentsByEmployee = new Map();
  for (const adjustment of adjustments) {
    const list = adjustmentsByEmployee.get(adjustment.employee_id) || [];
    list.push(adjustment);
    adjustmentsByEmployee.set(adjustment.employee_id, list);
  }

  // Cuando el auxilio de transporte se paga en una sola quincena, la proporcionalidad
  // legal debe calcularse sobre los dias efectivamente trabajados del MES completo
  // (marcaciones reales, que ya excluyen vacaciones/incapacidades porque esos dias no
  // tienen marcacion). Asi el monto mensual queda proporcional sin importar en que
  // quincena se entregue.
  const transportNeedsMonthScope = isQuincenaPeriod && transportAllowancePayment === "ultima" && employeeIds.length > 0;
  const transportMonthWorkedDaysByEmployee = new Map();
  let transportMonthPeriodDays = 0;
  if (transportNeedsMonthScope) {
    const year = Number(startOfDay(start).toISOString().slice(0, 4));
    const month = Number(startOfDay(start).toISOString().slice(5, 7));
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const monthStart = startOfDay(`${monthPrefix}-01`);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const monthEndExclusive = startOfDay(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
    transportMonthPeriodDays = daysInclusive(monthStart, new Date(monthEndExclusive.getTime() - 86400000));
    const [monthWorkdays, monthAdjustments] = await Promise.all([
      prisma.processedWorkday.findMany({
        where: { employee_id: { in: employeeIds }, date: { gte: monthStart, lt: monthEndExclusive } },
        select: { employee_id: true, date: true }
      }).catch(() => []),
      prisma.$queryRaw`
        SELECT employee_id, period_key, adjustment_type, concept_code, minutes, metadata
        FROM th_nomina_ajustes
        WHERE tenant_id = ${tenantId}
          AND status = 'activo'
      `.then((rows) => rows.filter((row) => employeeIds.includes(Number(row.employee_id)))).catch(() => [])
    ]);
    // Dia calendario trabajado por marcacion (base).
    const workedDatesByEmployee = new Map();
    for (const day of monthWorkdays) {
      const set = workedDatesByEmployee.get(day.employee_id) || new Set();
      set.add(new Date(day.date).toISOString().slice(0, 10));
      workedDatesByEmployee.set(day.employee_id, set);
    }
    // Dias externos del mes (jornadas externas se registran como ajuste, no como marcacion).
    const externalDaysByEmployee = new Map();
    const adjustmentInMonth = (adjustment) => {
      const refDate = String(adjustment.metadata?.work_date || adjustment.metadata?.date_start || "").slice(0, 10);
      if (refDate) return refDate.startsWith(monthPrefix);
      return String(adjustment.period_key || "").split(":")[1]?.startsWith(monthPrefix) || false;
    };
    for (const adjustment of monthAdjustments) {
      if (!adjustmentInMonth(adjustment)) continue;
      const employeeId = Number(adjustment.employee_id);
      if (isExternalWorkday(adjustment) && normalizeLaborCode(adjustment.concept_code || "") === "JORNADA_ORDINARIA") {
        externalDaysByEmployee.set(employeeId, (externalDaysByEmployee.get(employeeId) || 0) + adjustmentDays(adjustment));
      } else if (isWorkdayCorrection(adjustment)) {
        const refDate = String(adjustment.metadata?.work_date || adjustment.metadata?.date_start || "").slice(0, 10);
        if (refDate) {
          const set = workedDatesByEmployee.get(employeeId) || new Set();
          set.add(refDate);
          workedDatesByEmployee.set(employeeId, set);
        }
      }
    }
    for (const employeeId of employeeIds) {
      const workedDates = workedDatesByEmployee.get(employeeId)?.size || 0;
      const externalDays = externalDaysByEmployee.get(employeeId) || 0;
      const total = workedDates + externalDays;
      if (total > 0) transportMonthWorkedDaysByEmployee.set(employeeId, total);
    }
  }

  return employees.map((employee) => {
    const salaryInfo = weightedSalaryForPeriod(employee, salarySnapshots.get(employee.id) || [], start, end);
    const salaryBase = Number(salaryInfo.monthly_salary || 0);
    const hourly = salaryBase ? salaryBase / monthlyOrdinaryHours : 0;
    const periodDays = daysInclusive(start, end);
    const days = daysByEmployee.get(employee.id) || [];
    const employeeAdjustments = adjustmentsByEmployee.get(employee.id) || [];
    const correctionDates = new Set(employeeAdjustments
      .filter((adjustment) => isWorkdayCorrection(adjustment) && !isExternalWorkday(adjustment))
      .map((adjustment) => String(adjustment.metadata?.work_date || "").slice(0, 10))
      .filter(Boolean));
    const externalOrdinaryAdjustments = employeeAdjustments.filter((adjustment) => isExternalWorkday(adjustment) && normalizeLaborCode(adjustment.concept_code || "") === "JORNADA_ORDINARIA");
    const externalWorkedDays = externalOrdinaryAdjustments.reduce((sum, adjustment) => sum + adjustmentDays(adjustment), 0);
    const correctedOrdinaryMinutes = employeeAdjustments.filter(isWorkdayCorrection).reduce((sum, adjustment) => sum + adjustmentPayrollMinutes(adjustment), 0);
    const daysWorked = days.length + correctionDates.size + externalWorkedDays;
    const calendarRestDays = days
      .map((day) => ({ date: new Date(day.date).toISOString().slice(0, 10), ...calendarRestDayMinutes(day, calendarDays) }))
      .filter((day) => day.dayMinutes || day.nightMinutes);
    const ordinaryMinutes = days.reduce((sum, day) => {
      const restDay = calendarRestDayMinutes(day, calendarDays);
      return sum +
        (Number(day.ordinary_day_minutes || 0) - restDay.dayMinutes) +
        (Number(day.ordinary_night_minutes || 0) - restDay.nightMinutes) +
        Number(day.ordinary_sunday_holiday_day_minutes || 0) +
        Number(day.ordinary_sunday_holiday_night_minutes || 0);
    }, 0);
    const overtimeMap = {
      HED: days.reduce((sum, day) => sum + Number(day.overtime_day_minutes || 0), 0),
      HEN: days.reduce((sum, day) => sum + Number(day.overtime_night_minutes || 0), 0),
      HEDD: days.reduce((sum, day) => sum + Number(day.overtime_sunday_holiday_day_minutes || 0), 0),
      HEND: days.reduce((sum, day) => sum + Number(day.overtime_sunday_holiday_night_minutes || 0), 0),
      RECARGO_NOCTURNO: days.reduce((sum, day) => sum + Math.max(Number(day.ordinary_night_minutes || 0) - calendarRestDayMinutes(day, calendarDays).nightMinutes, 0), 0),
      DOM_FEST_DIURNO: days.reduce((sum, day) => {
        const restDay = calendarRestDayMinutes(day, calendarDays);
        return sum + restDay.dayMinutes + Number(day.ordinary_sunday_holiday_day_minutes || 0);
      }, 0),
      DOM_FEST_NOCTURNO: days.reduce((sum, day) => {
        const restDay = calendarRestDayMinutes(day, calendarDays);
        return sum + restDay.nightMinutes + Number(day.ordinary_sunday_holiday_night_minutes || 0);
      }, 0)
    };
    // Mes comercial de 30 dias (quincena = 15): el salario base se liquida siempre sobre esa base,
    // sin importar que el mes calendario tenga 28, 29, 30 o 31 dias.
    //  - Un dia se paga solo si tiene marcacion, descanso explicito en la malla (kind='descanso')
    //    o licencia remunerada / vacaciones. Cualquier otro dia no se paga (ausencia).
    //  - Dias pagados = base comercial - ausencias; el dia extra de meses de 31 es neutro y en
    //    febrero los dias faltantes se completan hasta la base.
    // Ref. norma: salario proporcional = salario mensual * dias trabajados / 30.
    const commercialBaseDays = periodType === "mes" ? 30 : 15;
    const workedCalendarDays = days.length;
    const restDates = restDatesByEmployee.get(employee.id) || new Set();
    const paidLeaveDates = new Set(
      employeeAdjustments
        .filter((adjustment) => PAID_LEAVE_CODES.has(normalizeLaborCode(adjustment.concept_code || "")) || isVacationAdjustment(adjustment))
        .map((adjustment) => String(adjustment.metadata?.work_date || adjustment.metadata?.date_start || adjustment.date_start || "").slice(0, 10))
        .filter(Boolean)
    );
    // Dias cubiertos (pagables): marcacion + correccion de jornada + descanso explicito + licencia remunerada.
    const coveredDates = new Set();
    for (const day of days) coveredDates.add(new Date(day.date).toISOString().slice(0, 10));
    for (const dateKey of correctionDates) coveredDates.add(dateKey);
    for (const dateKey of restDates) coveredDates.add(dateKey);
    for (const dateKey of paidLeaveDates) coveredDates.add(dateKey);
    const uncoveredDays = Math.max(0, periodDays - coveredDates.size);
    const freeCommercialDays = Math.max(0, periodDays - commercialBaseDays);
    const computableAbsenceDays = Math.max(0, uncoveredDays - freeCommercialDays);
    const paidBaseDays = Math.max(0, commercialBaseDays - computableAbsenceDays);
    const base = money((salaryBase / 30) * paidBaseDays);
    // El salario base solo se muestra cuando hay dias pagados por marcacion/descanso. Las jornadas
    // ordinarias cargadas como externas se muestran igualmente como "Salario" mas abajo.
    const lines = base > 0
      ? [payrollLine("SALARIO_BASICO", "Salario basico", paidBaseDays, salaryBase / 30, base, "marcaciones", payrollConcepts.SALARIO_BASICO)]
      : [];
    // Linea informativa de trazabilidad: diferencia entre dias pagados (base comercial) y dias
    // realmente marcados, para que se entienda por que el sueldo cuadra a 30/15 dias.
    const commercialAdjustmentDays = money(paidBaseDays - workedCalendarDays);
    if (commercialAdjustmentDays !== 0) {
      lines.push(payrollLine(
        "AJUSTE_MES_COMERCIAL",
        "Ajuste mes comercial",
        commercialAdjustmentDays,
        0,
        0,
        "parametros",
        { concept_type: "informativo", salary_constitutive: false, affects_ibc: false, metadata: { legal_group: "ajuste", commercial_month: true, dias_pagados: paidBaseDays, dias_marcados: workedCalendarDays, dias_descanso: restDates.size, dias_ausencia: computableAbsenceDays, dias_calendario: periodDays } }
      ));
    }
    for (const [code, minutes] of Object.entries(overtimeMap)) {
      if (!minutes) continue;
      const concept = surchargeMasters[code] || {};
      const factor = surchargeMultiplierFor(code);
      const hours = minutes / 60;
      lines.push(payrollLine(code, concept.name || payrollConcepts[code]?.name || code, hours, hourly * factor, hours * hourly * factor, "marcaciones", payrollConcepts[code] || concept));
    }
    for (const adjustment of employeeAdjustments) {
      const adjustmentDate = adjustment.metadata?.work_date || adjustment.metadata?.date_start || adjustment.date_start;
      const adjustmentCalendarType = adjustmentDate ? calendarDayTypeForDate(adjustmentDate, calendarDays) : "ordinario";
      const calendarConceptCode = adjustment.concept_code === "JORNADA_ORDINARIA" && ["festivo", "dominical", "no_laboral"].includes(adjustmentCalendarType)
        ? "DOM_FEST_DIURNO"
        : adjustment.concept_code;
      const concept = payrollConcepts[calendarConceptCode] || payrollConceptFallback(calendarConceptCode);
      const payrollMinutes = adjustmentPayrollMinutes(adjustment);
      // Aplica el mismo multiplicador (segun value_type) que la ruta de marcaciones, para que una
      // hora extra diurna o un recargo nocturno importados por jornada externa se liquiden igual.
      const factor = surchargeMultiplierFor(calendarConceptCode);
      // Una jornada ordinaria cargada como externa es salario de dias laborados: se muestra como
      // "Salario" (codigo SALARIO_BASICO) en vez del codigo tecnico JORNADA_ORDINARIA.
      const isOrdinaryWorkedDay = calendarConceptCode === "JORNADA_ORDINARIA";
      const ordinaryDays = isOrdinaryWorkedDay ? adjustmentDays(adjustment) : 0;
      let quantity;
      let unitRate;
      let amount;
      if (isOrdinaryWorkedDay && ordinaryDays > 0) {
        // Salario ordinario se paga por DIA (salario/30), no por hora. El divisor por hora (210)
        // es solo para horas extra/recargos, que van por encima del salario diario.
        quantity = ordinaryDays;
        unitRate = salaryBase / 30;
        amount = Number(adjustment.amount || 0) || money(ordinaryDays * unitRate);
      } else {
        quantity = payrollMinutes / 60;
        unitRate = hourly * factor;
        amount = Number(adjustment.amount || 0) || (quantity * unitRate);
      }
      const signedAmount = concept.concept_type === "deduccion" ? -Math.abs(amount) : amount;
      const source = isWorkdayCorrection(adjustment) ? "jornada" : adjustment.adjustment_type;
      const displayCode = isOrdinaryWorkedDay ? "SALARIO_BASICO" : calendarConceptCode;
      const displayName = isOrdinaryWorkedDay ? "Salario" : adjustment.description;
      const displayConcept = isOrdinaryWorkedDay ? (payrollConcepts.SALARIO_BASICO || concept) : concept;
      lines.push({
        ...payrollLine(displayCode, displayName, quantity, unitRate, signedAmount, source, displayConcept),
        metadata: { ...(displayConcept.metadata || {}), calendar_day_type: adjustmentCalendarType, original_concept_code: adjustment.concept_code }
      });
    }
    for (const libranza of libranzasByEmployee.get(employee.id) || []) {
      const line = payrollLineFromLibranza(libranza);
      if (line) lines.push(line);
    }
    const vacationAdjustmentDays = money(employeeAdjustments.filter(isVacationAdjustment).reduce((sum, adjustment) => sum + adjustmentDays(adjustment), 0));
    const liquidationDays = daysWorked || periodDays;
    const socialBenefitDays = Math.max(liquidationDays - vacationAdjustmentDays, 0);
    const qualifiesForTransportAllowance = Boolean(transportAllowanceMonthly > 0 && smmlv > 0 && salaryBase <= smmlv * transportAllowanceThresholdSmmlv);
    let transportAllowanceDays = qualifiesForTransportAllowance ? socialBenefitDays : 0;
    // Pago del auxilio de transporte segun configuracion del modulo (solo aplica a quincenas):
    // "ambas" -> se prorratea en cada quincena (comportamiento por defecto).
    // "ultima" -> se paga el mes completo en la ultima quincena y 0 en la primera,
    //   proporcional a los dias realmente trabajados del mes (blindaje legal).
    if (qualifiesForTransportAllowance && isQuincenaPeriod && transportAllowancePayment === "ultima") {
      const paysThisQuincena = !transportQuincenaIsFirstHalf;
      const monthWorkedDays = transportMonthWorkedDaysByEmployee.get(employee.id) || 0;
      const effectiveMonthDays = monthWorkedDays > 0 ? monthWorkedDays : transportMonthPeriodDays;
      transportAllowanceDays = paysThisQuincena ? Math.min(effectiveMonthDays, 30) : 0;
    }
    const transportAllowanceAmount = money((transportAllowanceMonthly / 30) * transportAllowanceDays);
    if (transportAllowanceAmount > 0) {
      const concept = payrollConcepts.AUX_TRANSPORTE || payrollConceptFallback("AUX_TRANSPORTE");
      lines.push(payrollLine("AUX_TRANSPORTE", concept.name || "Auxilio de transporte", transportAllowanceDays, transportAllowanceMonthly / 30, transportAllowanceAmount, "parametros", concept));
    }
    const socialBenefitsBase = socialBenefitBaseFromLines(lines, salaryBase, socialBenefitDays || liquidationDays);
    const vacationBase = socialBenefitBaseFromLines(lines, salaryBase, liquidationDays, { includeVacationBase: true });
    const salaryBaseForDeductions = money(lines.filter((line) => line.amount > 0 && line.affects_ibc !== false).reduce((sum, line) => sum + line.amount, 0));
    const nonSalaryEarnings = money(lines.filter((line) => line.amount > 0 && line.salary_constitutive === false).reduce((sum, line) => sum + line.amount, 0));
    const legalSalaryEarnings = money(lines.filter((line) => line.amount > 0 && line.salary_constitutive !== false).reduce((sum, line) => sum + line.amount, 0));
    const gross = money(lines.filter((line) => line.amount > 0).reduce((sum, line) => sum + line.amount, 0));
    const deductionLines = deductionMasters.filter((row) => String(row.code || "").startsWith("DED_") && row.code !== "DED_FONDO_SOLIDARIDAD_PENSIONAL").map((row) => {
      const percent = Number(row.value || 0);
      const basis = row.metadata?.basis === "gross" ? gross : salaryBaseForDeductions;
      return payrollLine(row.code, row.name, percent, basis, basis * (percent / 100), "parametros", payrollConcepts[row.code] || { concept_type: "deduccion", salary_constitutive: false, affects_ibc: false, metadata: { legal_group: "seguridad_social" } });
    });
    const pensionSolidarityPercent = pensionSolidarityRate(salaryBaseForDeductions, smmlv, pensionSolidarityParameter);
    if (pensionSolidarityPercent > 0) {
      deductionLines.push(payrollLine(
        "DED_FONDO_SOLIDARIDAD_PENSIONAL",
        pensionSolidarityParameter?.name || "Fondo de solidaridad pensional",
        pensionSolidarityPercent,
        salaryBaseForDeductions,
        salaryBaseForDeductions * (pensionSolidarityPercent / 100),
        "parametros",
        payrollConcepts.DED_FONDO_SOLIDARIDAD_PENSIONAL || { concept_type: "deduccion", salary_constitutive: false, affects_ibc: false, metadata: { legal_group: "seguridad_social", smmlv, threshold_basis: "ibc" } }
      ));
    }
    const deductions = money(Math.abs(lines.filter((line) => line.amount < 0).reduce((sum, line) => sum + line.amount, 0)) + deductionLines.reduce((sum, line) => sum + line.amount, 0));
    const allLines = [...lines, ...deductionLines.map((line) => ({ ...line, amount: -Math.abs(line.amount) }))];
    return {
      tenant_id: tenantId,
      employee_id: employee.id,
      employee_name: employee.metadata?.name || employee.user?.name || employee.code || `Empleado ${employee.id}`,
      period_key: periodKey,
      period_type: periodType,
      date_start: start,
      date_end: end,
      days_worked: daysWorked,
      ordinary_hours: money((ordinaryMinutes + correctedOrdinaryMinutes) / 60),
      overtime_hrs: money(Object.values(overtimeMap).reduce((sum, minutes) => sum + minutes, 0) / 60),
      gross,
      deductions,
      net: money(gross - deductions),
      employer_cost: gross,
      lines: allLines,
      source_summary: { days_worked: daysWorked, workdays: daysWorked, adjustments: employeeAdjustments.length, ordinary_hours: money((ordinaryMinutes + correctedOrdinaryMinutes) / 60), period_key: periodKey, ibc: salaryBaseForDeductions, salario_base_periodo: salaryBase, historial_salarial: salaryInfo.segments, calendario_laboral: calendarRestDays, devengos_salariales: legalSalaryEarnings, devengos_no_salariales: nonSalaryEarnings, auxilio_transporte: { aplica: qualifiesForTransportAllowance, valor_mensual: transportAllowanceMonthly, tope_smmlv: transportAllowanceThresholdSmmlv, dias: transportAllowanceDays, valor_periodo: transportAllowanceAmount }, base_prestaciones_sociales: socialBenefitsBase, base_vacaciones: vacationBase, dias_prestaciones_sociales: socialBenefitDays, dias_vacaciones_excluidos: vacationAdjustmentDays, fondo_solidaridad_pensional: { smmlv, percent: pensionSolidarityPercent } }
    };
  });
}

async function validatePayrollPeriod(tenantId, input = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || input.tipo_periodo || "quincena";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await buildPayrollLiquidationRows(tenantId, { ...input, period_key: periodKey, period_type: periodType });
    const existing = await listPayrollDocuments(tenantId, { period_key: periodKey, limit: 500 });
    const issues = [];
    if (!rows.length) issues.push({ severity: "error", code: "SIN_EMPLEADOS", message: "No hay empleados activos para liquidar." });
    if (existing.length) issues.push({ severity: "warning", code: "DOCUMENTOS_EXISTENTES", message: `Ya existen ${existing.length} documentos para este periodo.` });
    for (const row of rows) {
      if (!row.gross) issues.push({ severity: "warning", code: "SIN_DEVENGOS", employee_id: row.employee_id, employee_name: row.employee_name, message: "Empleado sin devengos calculados." });
      if (!row.source_summary?.workdays) issues.push({ severity: "warning", code: "SIN_MARCACIONES", employee_id: row.employee_id, employee_name: row.employee_name, message: "Empleado sin marcaciones procesadas en el periodo." });
      if (!row.source_summary?.ibc) issues.push({ severity: "warning", code: "SIN_IBC", employee_id: row.employee_id, employee_name: row.employee_name, message: "Empleado sin base IBC para deducciones." });
    }
    return { period_key: periodKey, ok: !issues.some((issue) => issue.severity === "error"), issues, employees: rows.length };
  });
}

async function previewPayrollLiquidation(tenantId, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await buildPayrollLiquidationRows(tenantId, input);
    return { mode: "preview", period_key: rows[0]?.period_key || null, documents: rows };
  });
}

async function runPayrollLiquidation(tenantId, input = {}, user = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || input.tipo_periodo || "quincena";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  await assertPayrollPeriodOpen(tenantId, periodKey);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const rows = await buildPayrollLiquidationRows(tenantId, input);
    if (input.recalculate === true || input.recalculate === "true") {
      await reversePayrollLibranzaMovements(tx, tenantId, rows[0]?.period_key || input.period_key || "");
      await tx.$executeRaw`DELETE FROM th_nomina_documentos WHERE tenant_id = ${tenantId} AND period_key = ${rows[0]?.period_key || input.period_key || ""}`;
    }
    const documents = [];
    for (const row of rows) {
      const payroll = await tx.payroll.upsert({
        where: { employee_id_period: { employee_id: row.employee_id, period: row.period_key } },
        update: { days_worked: row.days_worked, overtime_hrs: row.overtime_hrs, gross: row.gross, deductions: row.deductions, net: row.net, employer_cost: row.employer_cost, detail: { empleado: row.employee_name, lines: row.lines, source_summary: row.source_summary }, status: "draft" },
        create: { tenant_id: tenantId, employee_id: row.employee_id, period: row.period_key, days_worked: row.days_worked, overtime_hrs: row.overtime_hrs, absences: 0, gross: row.gross, deductions: row.deductions, net: row.net, employer_cost: row.employer_cost, detail: { empleado: row.employee_name, lines: row.lines, source_summary: row.source_summary }, status: "draft" }
      });
      const inserted = await tx.$queryRaw`
        INSERT INTO th_nomina_documentos (tenant_id, employee_id, payroll_id, period_key, period_type, date_start, date_end, status, gross, deductions, net, employer_cost, lines, source_summary, created_by)
        VALUES (${tenantId}, ${row.employee_id}, ${payroll.id}, ${row.period_key}, ${row.period_type}, ${row.date_start}::date, ${row.date_end}::date, 'draft', ${row.gross}, ${row.deductions}, ${row.net}, ${row.employer_cost}, ${JSON.stringify(row.lines)}::jsonb, ${JSON.stringify({ ...row.source_summary, employee_name: row.employee_name })}::jsonb, ${user?.id || null})
        ON CONFLICT (tenant_id, employee_id, period_key)
        DO UPDATE SET payroll_id = EXCLUDED.payroll_id, gross = EXCLUDED.gross, deductions = EXCLUDED.deductions, net = EXCLUDED.net, employer_cost = EXCLUDED.employer_cost, lines = EXCLUDED.lines, source_summary = EXCLUDED.source_summary, updated_at = now()
        RETURNING *
      `;
      await applyPayrollLibranzaMovements(tx, tenantId, inserted[0]);
      documents.push(inserted[0]);
    }
    return { ok: true, period_key: rows[0]?.period_key || null, documents: documents.length };
  }, PAYROLL_BATCH_TRANSACTION_OPTIONS));
}

// Nombre legible de cada concepto segun su codigo interno (para el reporte), en vez de la
// descripcion del movimiento (que en los ajustes puede venir como "Ejemplo" o "ajuste").
const CONCEPT_REPORT_LABELS = {
  SALARIO_BASICO: "Salario basico",
  AUX_TRANSPORTE: "Auxilio de transporte",
  HORA_DIURNA: "Hora ordinaria diurna",
  RECARGO_NOCTURNO: "Recargo nocturno",
  HED: "Hora extra diurna",
  HEN: "Hora extra nocturna",
  HEDD: "Hora extra diurna dominical/festiva",
  HEND: "Hora extra nocturna dominical/festiva",
  DOM_FEST_DIURNO: "Dominical/festivo diurno",
  DOM_FEST_NOCTURNO: "Dominical/festivo nocturno",
  JORNADA_ORDINARIA: "Salario",
  AJUSTE_MES_COMERCIAL: "Ajuste mes comercial",
  COMISION: "Comision",
  BONIFICACION_SALARIAL: "Bonificacion salarial",
  BONIFICACION_NO_SALARIAL: "Bonificacion no salarial",
  AJUSTE_MANUAL: "Ajuste manual",
  LICENCIA_REMUNERADA: "Licencia remunerada",
  LICENCIA_NO_REMUNERADA: "Licencia no remunerada",
  INCAPACIDAD_GENERAL: "Incapacidad general",
  INCAPACIDAD_LABORAL: "Incapacidad laboral",
  VACACIONES: "Vacaciones",
  DED_SALUD: "Deduccion salud empleado",
  DED_PENSION: "Deduccion pension empleado",
  DED_FONDO_SOLIDARIDAD_PENSIONAL: "Fondo de solidaridad pensional"
};
function conceptReportLabel(code, fallbackName) {
  const upper = String(code || "").toUpperCase();
  if (CONCEPT_REPORT_LABELS[upper]) return CONCEPT_REPORT_LABELS[upper];
  if (upper.startsWith("DED_")) return fallbackName || upper;
  if (upper.startsWith("LIBRANZA")) return fallbackName || "Libranza";
  return upper; // Evita mostrar descripciones del movimiento como "Ejemplo"/"ajuste".
}

// Reporte historico de nomina por empleado y concepto en un rango de fechas libre.
// Incluye todos los documentos cuyo periodo se solapa con el rango y suma las lineas por
// concepto, separando devengos (valor > 0) de deducciones (valor < 0).
async function payrollConceptReport(tenantId, query = {}) {
  const from = String(query.fecha_inicio || query.from || "").slice(0, 10);
  const to = String(query.fecha_fin || query.to || "").slice(0, 10);
  if (!from || !to) throw validationError("fecha_inicio y fecha_fin son obligatorias.", 400, "REPORTE_RANGO_REQUERIDO");
  if (to < from) throw validationError("La fecha final no puede ser menor que la inicial.", 400, "PERIODO_RANGO_INVALIDO");
  const employeeFilter = numericId(query.employee_id);
  return prisma.runWithTenant(tenantId, async () => {
    const documents = await prisma.$queryRaw`
      SELECT d.employee_id, d.period_key, d.date_start, d.date_end, d.lines,
             e.code AS employee_code, e.metadata->>'name' AS employee_name
      FROM th_nomina_documentos d
      LEFT JOIN "Employee" e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
      WHERE d.tenant_id = ${tenantId}
        AND d.date_start <= ${startOfDay(to)}
        AND d.date_end >= ${startOfDay(from)}
        AND (${!employeeFilter} OR d.employee_id = ${employeeFilter || 0})
      ORDER BY e.metadata->>'name' ASC, d.date_start ASC
    `;
    const conceptMeta = new Map(); // code -> { code, name, type }
    const byEmployee = new Map();
    for (const doc of documents) {
      const key = doc.employee_id;
      let row = byEmployee.get(key);
      if (!row) {
        row = { employee_id: doc.employee_id, employee_code: doc.employee_code, employee_name: doc.employee_name || doc.employee_code || `Empleado ${doc.employee_id}`, periods: 0, concepts: {}, total_devengado: 0, total_deducido: 0 };
        byEmployee.set(key, row);
      }
      row.periods += 1;
      for (const line of payrollReceiptLines(doc.lines)) {
        const amount = Number(line.amount || 0);
        if (!amount) continue;
        const rawCode = String(line.code || "").trim();
        if (!rawCode) continue;
        // La jornada ordinaria externa es salario: se consolida con SALARIO_BASICO en el reporte,
        // sin importar si documentos antiguos la guardaron como JORNADA_ORDINARIA.
        const code = rawCode.toUpperCase() === "JORNADA_ORDINARIA" ? "SALARIO_BASICO" : rawCode;
        const type = amount < 0 ? "deduccion" : "devengo";
        if (!conceptMeta.has(code)) conceptMeta.set(code, { code, name: conceptReportLabel(code, line.name), type });
        row.concepts[code] = money((row.concepts[code] || 0) + amount);
        if (amount < 0) row.total_deducido = money(row.total_deducido + Math.abs(amount));
        else row.total_devengado = money(row.total_devengado + amount);
      }
    }
    const employees = Array.from(byEmployee.values()).map((row) => ({ ...row, neto: money(row.total_devengado - row.total_deducido) }));
    const concepts = Array.from(conceptMeta.values()).sort((a, b) => (a.type === b.type ? a.code.localeCompare(b.code) : a.type === "devengo" ? -1 : 1));
    const totalsByConcept = {};
    for (const row of employees) for (const [code, value] of Object.entries(row.concepts)) totalsByConcept[code] = money((totalsByConcept[code] || 0) + value);
    const totalDevengado = money(employees.reduce((sum, row) => sum + row.total_devengado, 0));
    const totalDeducido = money(employees.reduce((sum, row) => sum + row.total_deducido, 0));
    return {
      fecha_inicio: from,
      fecha_fin: to,
      concepts,
      employees,
      totals: { by_concept: totalsByConcept, devengado: totalDevengado, deducido: totalDeducido, neto: money(totalDevengado - totalDeducido) }
    };
  });
}

// Reporte consolidado de saldos de prestaciones sociales por empleado y concepto
// (causado, pagado y saldo), filtrado por la fecha de inicio del periodo.
const SOCIAL_BENEFIT_REPORT_ORDER = ["PRIMA_SERVICIOS", "CESANTIAS", "INTERESES_CESANTIAS", "VACACIONES"];
async function benefitBalanceReport(tenantId, query = {}) {
  const from = String(query.fecha_inicio || query.from || "").slice(0, 10);
  const to = String(query.fecha_fin || query.to || "").slice(0, 10);
  if (!from || !to) throw validationError("fecha_inicio y fecha_fin son obligatorias.", 400, "REPORTE_RANGO_REQUERIDO");
  if (to < from) throw validationError("La fecha final no puede ser menor que la inicial.", 400, "PERIODO_RANGO_INVALIDO");
  const employeeFilter = numericId(query.employee_id);
  return prisma.runWithTenant(tenantId, async () => {
    const balances = await prisma.$queryRaw`
      SELECT b.employee_id, b.concept_code, b.accrued_amount, b.paid_amount, b.balance_amount, b.source_document_type, b.metadata,
             e.code AS employee_code, e.metadata->>'name' AS employee_name, e.metadata->>'document' AS employee_document
      FROM th_prestaciones_saldos b
      LEFT JOIN "Employee" e ON e.id = b.employee_id AND e.tenant_id = b.tenant_id
        WHERE b.tenant_id = ${tenantId}
          AND b.date_start >= ${from}::date
          AND b.date_start <= ${to}::date
        AND b.source_document_type <> 'nomina'
        AND (${!employeeFilter} OR b.employee_id = ${employeeFilter || 0})
      ORDER BY e.metadata->>'name' ASC, b.concept_code ASC
    `;
    const conceptCodes = new Set();
    const byEmployee = new Map();
    for (const row of balances) {
      const code = String(row.concept_code || "").trim();
      if (!code) continue;
      conceptCodes.add(code);
      let employee = byEmployee.get(row.employee_id);
      if (!employee) {
        employee = { employee_id: row.employee_id, employee_code: row.employee_code, employee_document: row.employee_document || row.employee_code, employee_name: row.employee_name || row.employee_code || `Empleado ${row.employee_id}`, concepts: {}, total_causado: 0, total_pagado: 0, total_saldo: 0 };
        byEmployee.set(row.employee_id, employee);
      }
      const current = employee.concepts[code] || { causado: 0, pagado: 0, saldo: 0 };
      const causedAmount = Number(row.accrued_amount || 0);
      const paidAmount = row.source_document_type === "provision" ? 0 : Number(row.paid_amount || 0);
      const balanceAmount = row.source_document_type === "provision" ? causedAmount : Number(row.balance_amount || 0);
      const quantity = Number(row.metadata?.quantity || 0);
      const vacationEarnedDays = quantity * 15 / 360;
      const pendingDays = code === "VACACIONES" && causedAmount > 0 ? vacationEarnedDays * (balanceAmount / causedAmount) : 0;
      current.causado = money(current.causado + causedAmount);
      current.pagado = money(current.pagado + paidAmount);
      current.saldo = money(current.saldo + balanceAmount);
      if (code === "VACACIONES") current.dias_pendientes = money((current.dias_pendientes || 0) + pendingDays);
      employee.concepts[code] = current;
      employee.total_causado = money(employee.total_causado + causedAmount);
      employee.total_pagado = money(employee.total_pagado + paidAmount);
      employee.total_saldo = money(employee.total_saldo + balanceAmount);
    }
    const concepts = Array.from(new Set([...SOCIAL_BENEFIT_REPORT_ORDER, ...conceptCodes])).sort((a, b) => {
      const ia = SOCIAL_BENEFIT_REPORT_ORDER.indexOf(a);
      const ib = SOCIAL_BENEFIT_REPORT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    const employees = Array.from(byEmployee.values());
    const totals = { causado: 0, pagado: 0, saldo: 0, by_concept: {} };
    for (const employee of employees) {
      totals.causado = money(totals.causado + employee.total_causado);
      totals.pagado = money(totals.pagado + employee.total_pagado);
      totals.saldo = money(totals.saldo + employee.total_saldo);
      for (const [code, value] of Object.entries(employee.concepts)) {
        const current = totals.by_concept[code] || { causado: 0, pagado: 0, saldo: 0 };
        current.causado = money(current.causado + value.causado);
        current.pagado = money(current.pagado + value.pagado);
        current.saldo = money(current.saldo + value.saldo);
        if (value.dias_pendientes != null) current.dias_pendientes = money((current.dias_pendientes || 0) + value.dias_pendientes);
        totals.by_concept[code] = current;
      }
    }
    return { fecha_inicio: from, fecha_fin: to, concepts, employees, totals };
  });
}

async function deleteLibranzaConcept(tenantId, id) {
  const conceptId = numericId(id);
  if (!conceptId) throw validationError("Concepto de libranza invalido.", 400, "LIBRANZA_CONCEPTO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const usageRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM th_libranza_empleados
      WHERE tenant_id = ${tenantId} AND concept_id = ${conceptId}
    `;
    if (Number(usageRows[0]?.count || 0) > 0) {
      throw validationError("No se puede borrar el concepto porque ya tiene libranzas asociadas. Inactivalo para que no se use en nuevas asignaciones.", 409, "LIBRANZA_CONCEPTO_EN_USO");
    }
    const rows = await prisma.$queryRaw`
      DELETE FROM th_libranza_conceptos
      WHERE tenant_id = ${tenantId} AND id = ${conceptId}
      RETURNING *
    `;
    if (!rows[0]) throw validationError("Concepto de libranza no encontrado.", 404, "LIBRANZA_CONCEPTO_NO_ENCONTRADO");
    return rows[0];
  });
}

const PAYROLL_AUXILIARY_TYPES = new Set(["todos", "nomina", "prestaciones", "aportes", "libranzas"]);
const AUXILIARY_BENEFIT_NAMES = {
  PRIMA_SERVICIOS: "Prima de servicios",
  CESANTIAS: "Cesantias",
  INTERESES_CESANTIAS: "Intereses a las cesantias",
  VACACIONES: "Vacaciones"
};

function auxiliaryEmployeeCostCenter(metadata = {}) {
  return metadata.cost_center_code || metadata.cost_center || metadata.centro_costo || metadata.centro_de_costos || metadata.costCenter || "";
}

function auxiliaryPeriodFields(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value || "");
    return { year: Number(raw.slice(0, 4)) || "", month: Number(raw.slice(5, 7)) || "" };
  }
  return {
    year: Number(new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TIMEZONE, year: "numeric" }).format(date)),
    month: Number(new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TIMEZONE, month: "numeric" }).format(date))
  };
}

function auxiliaryBaseRow(row, type, concept, amount, nature, entity = {}) {
  const period = auxiliaryPeriodFields(row.date_start || row.created_at);
  const metadata = row.employee_metadata || {};
  return {
    year: period.year,
    month: period.month,
    concept,
    document: row.employee_document || row.employee_code || "",
    employee_name: row.employee_name || row.employee_code || "",
    cost_center: auxiliaryEmployeeCostCenter(metadata),
    amount: money(Math.abs(Number(amount || 0))),
    nature,
    entity_nit: entity.nit || "",
    entity_name: entity.name || "",
    type
  };
}

async function payrollAuxiliaryReport(tenantId, query = {}) {
  const from = String(query.fecha_inicio || query.from || "").slice(0, 10);
  const to = String(query.fecha_fin || query.to || "").slice(0, 10);
  if (!from || !to) throw validationError("fecha_inicio y fecha_fin son obligatorias.", 400, "AUXILIAR_RANGO_REQUERIDO");
  if (to < from) throw validationError("La fecha final no puede ser menor que la inicial.", 400, "AUXILIAR_RANGO_INVALIDO");
  const employeeFilter = numericId(query.employee_id);
  const type = String(query.tipo || query.type || "todos").trim().toLowerCase();
  if (!PAYROLL_AUXILIARY_TYPES.has(type)) throw validationError("Tipo de auxiliar invalido.", 400, "AUXILIAR_TIPO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const rows = [];
    if (type === "todos" || type === "nomina") {
      const payrollRows = await prisma.$queryRaw`
        SELECT d.date_start, d.lines, d.net, e.code AS employee_code, e.metadata AS employee_metadata,
               e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name
        FROM th_nomina_documentos d
        LEFT JOIN "Employee" e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
        WHERE d.tenant_id = ${tenantId}
          AND d.date_start >= ${from}::date
          AND d.date_start <= ${to}::date
          AND (${!employeeFilter} OR d.employee_id = ${employeeFilter || 0})
        ORDER BY d.date_start ASC, e.metadata->>'name' ASC
      `;
      for (const doc of payrollRows) {
        for (const line of Array.isArray(doc.lines) ? doc.lines : []) {
          const amount = Number(line.amount || 0);
          if (!amount) continue;
          rows.push(auxiliaryBaseRow(doc, "Nomina", conceptReportLabel(line.code, line.name || "Concepto nomina"), amount, amount < 0 || line.concept_type === "deduccion" ? "Credito" : "Debito"));
        }
        const netPayable = Number(doc.net || 0);
        if (netPayable) {
          rows.push(auxiliaryBaseRow(doc, "Nomina", "Nomina por pagar", netPayable, netPayable > 0 ? "Credito" : "Debito"));
        }
      }
    }
    if (type === "todos" || type === "prestaciones") {
      const benefitRows = await prisma.$queryRaw`
        SELECT b.date_start, b.concept_code, b.accrued_amount, e.code AS employee_code, e.metadata AS employee_metadata,
               e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name
        FROM th_prestaciones_saldos b
        LEFT JOIN "Employee" e ON e.id = b.employee_id AND e.tenant_id = b.tenant_id
        WHERE b.tenant_id = ${tenantId}
          AND b.date_start >= ${from}::date
          AND b.date_start <= ${to}::date
          AND b.source_document_type <> 'nomina'
          AND (${!employeeFilter} OR b.employee_id = ${employeeFilter || 0})
        ORDER BY b.date_start ASC, e.metadata->>'name' ASC, b.concept_code ASC
      `;
      for (const row of benefitRows) {
        const amount = Number(row.accrued_amount || 0);
        if (!amount) continue;
        rows.push(auxiliaryBaseRow(row, "Prestaciones sociales", AUXILIARY_BENEFIT_NAMES[row.concept_code] || row.concept_code, amount, "Debito"));
      }
      const paymentRows = await prisma.$queryRaw`
        SELECT d.payment_date AS date_start, l.concept_code, l.amount, l.entity_nit, l.entity_name,
               e.code AS employee_code, e.metadata AS employee_metadata,
               e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name
        FROM th_prestaciones_pagos_lineas l
        INNER JOIN th_prestaciones_pagos_documentos d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
        LEFT JOIN "Employee" e ON e.id = l.employee_id AND e.tenant_id = l.tenant_id
        WHERE l.tenant_id = ${tenantId}
          AND d.status <> 'anulado'
          AND d.payment_date >= ${from}::date
          AND d.payment_date <= ${to}::date
          AND (${!employeeFilter} OR l.employee_id = ${employeeFilter || 0})
        ORDER BY d.payment_date ASC, e.metadata->>'name' ASC, l.concept_code ASC
      `.catch(() => []);
      for (const row of paymentRows) {
        const amount = Number(row.amount || 0);
        if (!amount) continue;
        rows.push(auxiliaryBaseRow(row, "Prestaciones sociales", `Pago ${AUXILIARY_BENEFIT_NAMES[row.concept_code] || row.concept_code}`, amount, "Debito", { nit: row.entity_nit, name: row.entity_name }));
      }
    }
    if (type === "todos" || type === "aportes") {
      const contributionRows = await prisma.$queryRaw`
        SELECT d.date_start, l.concept_name, l.employee_amount, l.employer_amount, le.nit AS entity_nit, le.legal_name AS entity_name,
               e.code AS employee_code, e.metadata AS employee_metadata, e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name
        FROM th_aportes_sociales_lineas l
        INNER JOIN th_aportes_sociales_documentos d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
        LEFT JOIN th_entidades_laborales le ON le.id = l.entity_id AND le.tenant_id = l.tenant_id
        LEFT JOIN "Employee" e ON e.id = l.employee_id AND e.tenant_id = l.tenant_id
        WHERE l.tenant_id = ${tenantId}
          AND d.date_start >= ${from}::date
          AND d.date_start <= ${to}::date
          AND (${!employeeFilter} OR l.employee_id = ${employeeFilter || 0})
        ORDER BY d.date_start ASC, e.metadata->>'name' ASC, l.concept_code ASC
      `;
      for (const row of contributionRows) {
        if (Number(row.employee_amount || 0)) rows.push(auxiliaryBaseRow(row, "Aportes seguridad social", row.concept_name, row.employee_amount, "Credito", { nit: row.entity_nit, name: row.entity_name }));
        if (Number(row.employer_amount || 0)) rows.push(auxiliaryBaseRow(row, "Aportes seguridad social", row.concept_name, row.employer_amount, "Debito", { nit: row.entity_nit, name: row.entity_name }));
      }
    }
    if (type === "todos" || type === "libranzas") {
      const libranzaRows = await prisma.$queryRaw`
        SELECT m.created_at, m.amount, c.name AS concept_name, le.nit AS entity_nit, le.legal_name AS entity_name,
               e.code AS employee_code, e.metadata AS employee_metadata, e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name
        FROM th_libranza_movimientos m
        INNER JOIN th_libranza_empleados l ON l.id = m.employee_libranza_id AND l.tenant_id = m.tenant_id
        INNER JOIN th_libranza_conceptos c ON c.id = l.concept_id AND c.tenant_id = l.tenant_id
        LEFT JOIN th_entidades_laborales le ON le.id = c.entity_id AND le.tenant_id = c.tenant_id
        LEFT JOIN "Employee" e ON e.id = m.employee_id AND e.tenant_id = m.tenant_id
        WHERE m.tenant_id = ${tenantId}
          AND m.created_at::date >= ${from}::date
          AND m.created_at::date <= ${to}::date
          AND m.status = 'aplicado'
          AND (${!employeeFilter} OR m.employee_id = ${employeeFilter || 0})
        ORDER BY m.created_at ASC, e.metadata->>'name' ASC, c.name ASC
      `;
      for (const row of libranzaRows) {
        if (!Number(row.amount || 0)) continue;
        rows.push(auxiliaryBaseRow(row, "Libranzas", row.concept_name, row.amount, "Credito", { nit: row.entity_nit, name: row.entity_name }));
      }
    }
    return { fecha_inicio: from, fecha_fin: to, tipo: type, rows };
  });
}

async function deletePayrollLiquidation(tenantId, input = {}) {
  const periodKey = String(input.period_key || "").trim();
  if (!periodKey) throw validationError("period_key es obligatorio.", 400, "PERIODO_NOMINA_REQUERIDO");
  await assertPayrollPeriodOpen(tenantId, periodKey);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const docs = await tx.$queryRaw`SELECT payroll_id FROM th_nomina_documentos WHERE tenant_id = ${tenantId} AND period_key = ${periodKey}`;
    await reversePayrollLibranzaMovements(tx, tenantId, periodKey);
    await tx.$executeRaw`DELETE FROM th_nomina_documentos WHERE tenant_id = ${tenantId} AND period_key = ${periodKey}`;
    const payrollIds = docs.map((row) => row.payroll_id).filter(Boolean);
    if (payrollIds.length) {
      await tx.$executeRaw`
        DELETE FROM "Payroll"
        WHERE tenant_id = ${tenantId}
          AND period = ${periodKey}
      `;
    }
    return { ok: true, deleted_documents: docs.length };
  }));
}

async function listPayrollDocuments(tenantId, query = {}) {
  const periodKey = query.period_key || query.period;
  // Filtro opcional por rango de fechas (solapamiento), util para provisionar un mes que
  // abarca varias quincenas sin depender de una coincidencia exacta de period_key.
  const dateFrom = query.date_from ? startOfDay(query.date_from) : null;
  const dateTo = query.date_to ? startOfDay(query.date_to) : null;
  const useDateRange = Boolean(dateFrom && dateTo);
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
    SELECT d.*, e.code AS employee_code, e.metadata->>'name' AS employee_name, e.metadata->>'document' AS employee_document
    FROM th_nomina_documentos d
    LEFT JOIN "Employee" e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
    WHERE d.tenant_id = ${tenantId}
      AND (${!periodKey} OR d.period_key = ${periodKey || ""})
      AND (${!useDateRange} OR (d.date_start <= ${dateTo || new Date(0)} AND d.date_end >= ${dateFrom || new Date(0)}))
    ORDER BY d.created_at DESC
    LIMIT ${Math.min(Number(query.limit || 200), 500)}
  `;
    return rows.map((row) => ({ ...row, lines: payrollReceiptLines(row.lines) }));
  });
}

async function createPayrollAdjustment(tenantId, input = {}, user = {}) {
  const employeeId = numericId(input.employee_id);
  if (!employeeId) throw validationError("Empleado invalido.", 400, "EMPLEADO_INVALIDO");
  const periodKey = String(input.period_key || "").trim();
  if (!periodKey) throw validationError("period_key es obligatorio.", 400, "PERIODO_NOMINA_REQUERIDO");
  assertValidPeriodKey(periodKey);
  await assertPayrollPeriodOpen(tenantId, periodKey);
  const adjustmentType = String(input.adjustment_type || "manual").trim();
  const conceptCode = normalizeLaborCode(input.concept_code || (isWorkdayCorrection({ adjustment_type: adjustmentType }) ? "JORNADA_ORDINARIA" : "AJUSTE_MANUAL"));
  const metadata = { ...(input.metadata || {}) };
  if (input.date_start !== undefined) metadata.date_start = input.date_start || null;
  if (input.date_end !== undefined) metadata.date_end = input.date_end || null;
  if (input.days !== undefined) metadata.days = Number(input.days || 0);
  if (input.paid_by !== undefined) metadata.paid_by = input.paid_by || "";
  if (input.pila_ibc_amount !== undefined && input.pila_ibc_amount !== "") metadata.pila_ibc_amount = Number(input.pila_ibc_amount || 0);
  let minutes = Number(input.minutes || 0);
  if (!minutes && Number(metadata.days || 0) > 0) minutes = Number(metadata.days || 0) * 8 * 60;
  if (isWorkdayCorrection({ adjustment_type: adjustmentType, concept_code: conceptCode })) {
    const workDate = dateOnly(input.work_date || metadata.work_date || null, null);
    if (!workDate) throw validationError("La fecha de jornada es obligatoria.", 400, "FECHA_JORNADA_REQUERIDA");
    minutes = correctionMinutesFromInput(input);
    if (!minutes) throw validationError("Debes indicar horas validas para la jornada.", 400, "HORAS_JORNADA_INVALIDAS");
    metadata.work_date = workDate.toISOString().slice(0, 10);
    metadata.start_time = String(input.start_time || metadata.start_time || "").trim();
    metadata.end_time = String(input.end_time || metadata.end_time || "").trim();
  }
  return prisma.runWithTenant(tenantId, async () => {
    if (isWorkdayCorrection({ adjustment_type: adjustmentType, concept_code: conceptCode })) {
      const workDate = startOfDay(metadata.work_date);
      const existingWorkday = await prisma.processedWorkday.findFirst({
        where: { employee_id: employeeId, date: { gte: workDate, lt: endOfDay(workDate) }, inconsistent: false },
        select: { id: true }
      });
      if (existingWorkday) throw validationError("El empleado ya tiene una jornada procesada para esa fecha.", 409, "JORNADA_YA_PROCESADA");
      const duplicateRows = await prisma.$queryRaw`
        SELECT id
        FROM th_nomina_ajustes
        WHERE tenant_id = ${tenantId}
          AND employee_id = ${employeeId}
          AND status = 'activo'
          AND metadata->>'work_date' = ${metadata.work_date}
          AND (adjustment_type IN ('jornada_ordinaria', 'olvido_marcacion', 'correccion_jornada') OR concept_code = 'JORNADA_ORDINARIA')
        LIMIT 1
      `;
      if (duplicateRows[0]) throw validationError("Ya existe una jornada registrada para esa fecha.", 409, "JORNADA_DUPLICADA");
    }
    const rows = await prisma.$queryRaw`
      INSERT INTO th_nomina_ajustes (tenant_id, employee_id, period_key, adjustment_type, concept_code, description, minutes, amount, taxable, metadata, created_by)
      VALUES (${tenantId}, ${employeeId}, ${periodKey}, ${adjustmentType}, ${conceptCode}, ${correctionDescription({ ...input, adjustment_type: adjustmentType, concept_code: conceptCode })}, ${minutes}, ${Number(input.amount || 0)}, ${input.taxable !== false}, ${JSON.stringify(metadata)}::jsonb, ${user?.id || null})
      RETURNING *
    `;
    return rows[0];
  });
}

function normalizeDocument(value) {
  return String(value || "").replace(/\D/g, "");
}

async function importExternalWorkdays(tenantId, input = {}, user = {}) {
  const periodKey = String(input.period_key || "").trim();
  if (!periodKey) throw validationError("period_key es obligatorio.", 400, "PERIODO_NOMINA_REQUERIDO");
  assertValidPeriodKey(periodKey);
  await assertPayrollPeriodOpen(tenantId, periodKey);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw validationError("El archivo no contiene jornadas para importar.", 400, "JORNADAS_EXTERNAS_VACIAS");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({ where: { tenant_id: tenantId, active: true }, select: { id: true, code: true, metadata: true } });
    const byDocument = new Map();
    const byCode = new Map();
    for (const employee of employees) {
      byCode.set(String(employee.code || "").trim().toUpperCase(), employee);
      const doc = normalizeDocument(employee.metadata?.document);
      if (doc) byDocument.set(doc, employee);
    }
    // Deteccion de duplicados: evita cargar dos veces la misma jornada (mismo empleado, periodo,
    // concepto, fecha, dias y minutos). Aplica contra lo ya cargado y dentro del mismo archivo.
    const existingActive = await tx.$queryRaw`
      SELECT employee_id, concept_code, minutes, metadata->>'work_date' AS work_date, metadata->>'days' AS days
      FROM th_nomina_ajustes
      WHERE tenant_id = ${tenantId}
        AND period_key = ${periodKey}
        AND adjustment_type = 'jornada_externa'
        AND status = 'activo'
    `;
    const dedupKey = (employeeId, conceptCode, workDate, days, minutes) =>
      `${employeeId}|${conceptCode}|${workDate || ""}|${Number(days || 0)}|${Number(minutes || 0)}`;
    const seenKeys = new Set(existingActive.map((item) => dedupKey(item.employee_id, item.concept_code, item.work_date, item.days, item.minutes)));
    const imported = [];
    const issues = [];
    for (const [index, row] of rows.entries()) {
      const employee = byDocument.get(normalizeDocument(row.document)) || byCode.get(String(row.employee_code || "").trim().toUpperCase());
      if (!employee) {
        issues.push({ row: index + 2, code: "EMPLEADO_NO_ENCONTRADO", message: `No se encontro empleado para documento ${row.document || row.employee_code || ""}.` });
        continue;
      }
      const conceptCode = normalizeLaborCode(row.concept_code);
      const hours = Number(row.hours || 0);
      const minutes = Number(row.minutes || 0) || Math.round(hours * 60);
      const days = Number(row.days || 0);
      const amount = Number(row.amount || 0);
      const description = String(row.description || row.observation || `Jornada externa ${conceptCode}`).trim();
      const metadata = {
        source: "excel_jornadas_externas",
        document: row.document || "",
        date_start: row.date_start || row.work_date || null,
        date_end: row.date_end || row.work_date || null,
        work_date: row.work_date || row.date_start || null,
        days,
        hours,
        observation: row.observation || ""
      };
      const rowKey = dedupKey(employee.id, conceptCode, metadata.work_date, days, minutes);
      if (seenKeys.has(rowKey)) {
        issues.push({ row: index + 2, code: "JORNADA_DUPLICADA", message: `Jornada duplicada omitida (${conceptCode}) para ${row.document || row.employee_code || ""}.` });
        continue;
      }
      seenKeys.add(rowKey);
      const inserted = await tx.$queryRaw`
        INSERT INTO th_nomina_ajustes (tenant_id, employee_id, period_key, adjustment_type, concept_code, description, minutes, amount, status, taxable, metadata, created_by)
        VALUES (${tenantId}, ${employee.id}, ${periodKey}, 'jornada_externa', ${conceptCode}, ${description}, ${minutes}, ${amount}, 'activo', true, ${JSON.stringify(metadata)}::jsonb, ${user?.id || null})
        RETURNING *
      `;
      imported.push(inserted[0]);
    }
    return { ok: !issues.length, imported: imported.length, issues };
  }));
}

async function deleteExternalWorkdays(tenantId, input = {}) {
  const periodKey = String(input.period_key || "").trim();
  if (!periodKey) throw validationError("period_key es obligatorio.", 400, "PERIODO_NOMINA_REQUERIDO");
  await assertPayrollPeriodOpen(tenantId, periodKey);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const documents = await tx.$queryRaw`
      SELECT id
      FROM th_nomina_documentos
      WHERE tenant_id = ${tenantId}
        AND period_key = ${periodKey}
      LIMIT 1
    `;
    if (documents[0]) {
      throw validationError("No se pueden borrar jornadas importadas porque ya existen documentos de nomina para el periodo. Borra la liquidacion primero.", 409, "JORNADAS_EXTERNAS_CON_NOMINA");
    }
    const rows = await tx.$queryRaw`
      UPDATE th_nomina_ajustes
      SET status = 'anulado'
      WHERE tenant_id = ${tenantId}
        AND period_key = ${periodKey}
        AND adjustment_type = 'jornada_externa'
        AND status = 'activo'
      RETURNING id
    `;
    return { ok: true, deleted: rows.length, period_key: periodKey };
  }));
}

async function listPayrollAdjustments(tenantId, query = {}) {
  // Por defecto solo ajustes activos; el listado anulado solo si se pide status explicito.
  const requestedStatus = String(query.status || "activo").trim().toLowerCase();
  const includeAllStatuses = requestedStatus === "all" || requestedStatus === "todos";
  const statusFilter = includeAllStatuses ? "" : requestedStatus;
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT a.*, e.code AS employee_code, e.metadata->>'name' AS employee_name
    FROM th_nomina_ajustes a
    LEFT JOIN "Employee" e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId}
      AND (${!query.period_key} OR a.period_key = ${query.period_key || ""})
      AND (${includeAllStatuses} OR a.status = ${statusFilter})
    ORDER BY a.created_at DESC
    LIMIT ${Math.min(Number(query.limit || 200), 500)}
  `);
}

async function deletePayrollAdjustment(tenantId, id) {
  const adjustmentId = numericId(id);
  if (!adjustmentId) throw validationError("Ajuste invalido.", 400, "AJUSTE_NOMINA_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.$queryRaw`SELECT period_key FROM th_nomina_ajustes WHERE tenant_id = ${tenantId} AND id = ${adjustmentId} LIMIT 1`;
    if (!current[0]) throw validationError("Ajuste no encontrado.", 404, "AJUSTE_NOMINA_NO_ENCONTRADO");
    await assertPayrollPeriodOpen(tenantId, current[0].period_key);
    const rows = await prisma.$queryRaw`UPDATE th_nomina_ajustes SET status = 'anulado' WHERE tenant_id = ${tenantId} AND id = ${adjustmentId} RETURNING *`;
    if (!rows[0]) throw validationError("Ajuste no encontrado.", 404, "AJUSTE_NOMINA_NO_ENCONTRADO");
    return rows[0];
  });
}

function pdfEscape(value) {
  return String(value ?? "").replace(/[\\()]/g, "\\$&");
}

function simplePayrollPdf(document) {
  const name = document.employee_name || document.source_summary?.employee_name || `Empleado ${document.employee_id}`;
  const summary = document.source_summary || {};
  const receiptLines = payrollReceiptLines(document.lines).filter((line) => Number(line.amount || 0) !== 0);
  const positive = receiptLines.filter((line) => Number(line.amount) > 0);
  const deductions = receiptLines.filter((line) => Number(line.amount) < 0);
  const fmt = (value) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value || 0));
  const shortDate = (value) => {
    if (!value) return "-";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const raw = String(value);
    const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
  };
  const maskedAccount = summary.bank_account_code ? `***${String(summary.bank_account_code).slice(-4)}` : "No registrada";
  const paymentBenefit = (line) => line.salary_constitutive === false || line.legal_group === "auxilio" || line.metadata?.legal_group === "auxilio";
  const shouldShowQuantity = (line) => {
    const code = String(line.code || "").toUpperCase();
    const amount = Number(line.amount || 0);
    if (amount <= 0) return false;
    if (code === "AUX_TRANSPORTE" || code.includes("AUXILIO_TRANSPORTE")) return false;
    return Number(line.quantity || 0) > 0;
  };
  const content = [];
  const clipText = (value, max = 34) => {
    const text = String(value ?? "-");
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}.` : text;
  };
  const drawText = (text, x, y, size = 9, font = "F1") => content.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`);
  const drawLine = (x1, y1, x2, y2) => content.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const drawRect = (x, y, w, h) => content.push(`${x} ${y} ${w} ${h} re S`);
  const fillRect = (x, y, w, h, gray = 0.88) => content.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);
  const rightText = (text, x, y, width, size = 9, font = "F1") => {
    const approx = String(text).length * size * 0.48;
    drawText(text, x + Math.max(0, width - approx), y, size, font);
  };
  const labelValue = (label, value, x, y, width = 220, labelWidth = 130, maxChars = 32) => {
    drawText(label, x, y, 8.5, "F2");
    drawText(clipText(value || "-", maxChars), x + labelWidth, y, 8.5);
    drawLine(x + labelWidth, y - 3, x + width, y - 3);
  };
  const detailRow = (label, value, x, y, valueX, valueWidth, maxChars = 28) => {
    drawText(label, x, y, 7.8, "F2");
    drawText(clipText(value || "-", maxChars), valueX, y, 7.8);
    drawLine(valueX, y - 3, valueX + valueWidth, y - 3);
  };

  drawRect(24, 522, 564, 245);
  drawText("APEX OS", 32, 738, 12, "F2");
  drawText("NIT: __________________", 32, 724, 9, "F2");
  drawText("COMPROBANTE DE PAGO DE NOMINA", 390, 738, 10, "F2");
  fillRect(32, 690, 548, 16, 0.9);
  drawText("Datos del empleado", 40, 695, 8.5, "F2");
  drawText("Datos de liquidacion", 330, 695, 8.5, "F2");
  drawLine(318, 535, 318, 705);
  [
    ["Nomina", document.period_type === "mes" ? "Nomina mensual" : "Nomina quincenal", "Periodo de Liquidacion", `${shortDate(document.date_start)} a ${shortDate(document.date_end)}`],
    ["Empleado", name, "Salario", `$ ${fmt(summary.salario_base_periodo || summary.salary_base || 0)}`],
    ["Numero de Identificacion", document.employee_document || document.employee_code || String(document.employee_id), "Total", `$ ${fmt(summary.salario_base_periodo || summary.salary_base || 0)}`],
    ["Fecha Ingreso", shortDate(summary.fecha_ingreso || summary.hire_date), "Metodo Retencion", summary.retention_method || "-"],
    ["Cargo", summary.position || summary.cargo || "-", "% Retencion", String(summary.retention_percent || "0")],
    ["Centro de costos", summary.cost_center_code || summary.cost_center || "-", "Cuenta Bancaria", maskedAccount],
    ["Entidad Promotora de Salud", summary.eps_name || "-", "Codigo Empleado", document.employee_code || String(document.employee_id)],
    ["Entidad Bancaria", summary.bank_entity_name || "-", "", ""],
    ["Fondo Pensiones Obligatorias", summary.pension_name || "-", "", ""]
  ].forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    const rowY = 674 - index * 15;
    detailRow(leftLabel, leftValue, 40, rowY, 178, 126, 24);
    if (rightLabel) detailRow(rightLabel, rightValue, 330, rowY, 466, 108, 22);
  });

  drawRect(24, 310, 564, 203);
  fillRect(318, 495, 160, 12, 0.72);
  fillRect(482, 495, 82, 12, 0.72);
  drawText("Devengado", 376, 498, 8.5, "F2");
  drawText("Deducciones", 499, 498, 8.5, "F2");
  fillRect(28, 480, 184, 12, 0.82);
  fillRect(218, 480, 54, 12, 0.82);
  fillRect(278, 480, 54, 12, 0.82);
  fillRect(338, 480, 70, 12, 0.82);
  fillRect(414, 480, 70, 12, 0.82);
  fillRect(490, 480, 74, 12, 0.82);
  drawText("Conceptos Liquidados", 80, 483, 8, "F2");
  drawText("Cantidad", 226, 483, 8, "F2");
  drawText("Unidad", 290, 483, 8, "F2");
  drawText("Pagos", 360, 483, 8, "F2");
  drawText("Beneficios", 430, 483, 8, "F2");
  drawText("Descuentos", 502, 483, 8, "F2");
  let y = 466;
  const rowHeight = 10.8;
  for (const line of receiptLines.slice(0, 11)) {
    const amount = Number(line.amount || 0);
    drawText(String(line.name || line.code).slice(0, 36), 30, y, 7.7);
    if (shouldShowQuantity(line)) {
      rightText(String(line.quantity || ""), 218, y, 54, 7.7);
      drawText(line.unit || (String(line.code || "").includes("SALARIO") ? "DIA" : "HORA"), 286, y, 7.7);
    }
    if (amount > 0 && !paymentBenefit(line)) rightText(fmt(amount), 338, y, 70, 7.7);
    if (amount > 0 && paymentBenefit(line)) rightText(fmt(amount), 414, y, 70, 7.7);
    if (amount < 0) rightText(fmt(Math.abs(amount)), 490, y, 74, 7.7);
    drawLine(28, y - 4, 564, y - 4);
    y -= rowHeight;
  }
  const benefitTotal = positive.filter(paymentBenefit).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const payTotal = positive.filter((line) => !paymentBenefit(line)).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  fillRect(28, 333, 536, 12, 0.92);
  drawText("Totales", 280, 336, 8.5, "F2");
  rightText(fmt(payTotal), 338, 336, 70, 8.5, "F2");
  rightText(fmt(benefitTotal), 414, 336, 70, 8.5, "F2");
  rightText(fmt(document.deductions), 490, 336, 74, 8.5, "F2");
  drawLine(28, 329, 564, 329);
  drawText("Total Devengado", 248, 321, 8.5, "F2");
  rightText(fmt(document.gross), 338, 321, 146, 8.5, "F2");
  drawText("Neto a pagar en cuenta nomina", 210, 313, 8.5, "F2");
  rightText(fmt(document.net), 338, 313, 146, 8.5, "F2");

  drawRect(24, 222, 564, 78);
  fillRect(28, 282, 430, 12, 0.72);
  drawText("Detalle Prestamos", 220, 285, 8.5, "F2");
  fillRect(28, 266, 184, 12, 0.82);
  fillRect(222, 266, 80, 12, 0.82);
  fillRect(314, 266, 80, 12, 0.82);
  fillRect(406, 266, 80, 12, 0.82);
  drawText("Concepto", 95, 269, 8, "F2");
  drawText("Valor Prestamo", 230, 269, 8, "F2");
  drawText("Valor Cuota", 328, 269, 8, "F2");
  drawText("Saldo Actual", 418, 269, 8, "F2");
  const loanLines = receiptLines.filter((line) => String(line.source || "").toLowerCase().includes("libranza") || String(line.legal_group || "").toLowerCase().includes("libranza"));
  if (loanLines.length) {
    let loanY = 252;
    for (const line of loanLines.slice(0, 3)) {
      drawText(String(line.name || line.code).slice(0, 26), 30, loanY, 7.7);
      rightText(fmt(line.metadata?.original_amount || 0), 222, loanY, 80, 7.7);
      rightText(fmt(Math.abs(Number(line.amount || 0))), 314, loanY, 80, 7.7);
      rightText(fmt(line.metadata?.balance_after ?? line.metadata?.balance_amount ?? 0), 406, loanY, 80, 7.7);
      loanY -= 13;
    }
  } else {
    drawText("Sin prestamos o libranzas registradas en el comprobante.", 30, 252, 8);
  }

  drawRect(24, 142, 564, 74);
  fillRect(32, 198, 544, 12, 0.86);
  drawText("Bases para calculo de seguridad social", 38, 201, 8.2, "F2");
  fillRect(32, 184, 400, 10, 0.94);
  fillRect(438, 184, 138, 10, 0.94);
  drawText("Base", 38, 187, 7.4, "F2");
  drawText("Valor", 492, 187, 7.4, "F2");
  const ibc = Number(summary.ibc || 0);
  [
    ["Ingreso Base Cotizacion Salud Periodo", ibc],
    ["Ingreso Base Cotizacion Salud Mes", ibc],
    ["Ingreso Base Cotizacion Siguiente", 0],
    ["Ingreso Base Cotizacion Pension Periodo", ibc],
    ["Ingreso Base Cotizacion Pension Mes", ibc]
  ].forEach(([label, value], index) => {
    const rowY = 173 - index * 10.2;
    drawText(label, 38, rowY, 7.2);
    rightText(fmt(value), 456, rowY, 90, 7.2);
    if (index < 4) drawLine(32, rowY - 3.2, 576, rowY - 3.2);
  });

  drawRect(24, 78, 564, 50);
  fillRect(32, 111, 544, 12, 0.86);
  drawText("Mensaje Empresarial", 38, 114, 8.2, "F2");
  drawText("Documento generado por APEX OS. Sin QR.", 38, 99, 8);
  drawText("Pagina 1 de 1", 270, 55, 10);
  drawText("COLABORADOR", 32, 36, 8);
  drawText("Firma empleado", 125, 36, 7.5);
  drawText("Cedula o NIT", 32, 24, 7.5);
  drawLine(125, 28, 270, 28);
  drawText("LA EMPRESA", 330, 36, 8);
  drawText("NIT", 330, 24, 7.5);
  drawLine(410, 28, 560, 28);
  drawText(`Fecha de elaboracion: ${new Date().toISOString().slice(0, 10)}`, 390, 12, 7.5);
  const stream = content.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj"
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects.map((obj) => {
    xref.push(String(offset).padStart(10, "0") + " 00000 n ");
    offset += Buffer.byteLength(obj + "\n");
    return obj;
  }).join("\n") + "\n";
  const header = "%PDF-1.4\n";
  const xrefStart = Buffer.byteLength(header + body);
  const trailer = `xref\n0 ${xref.length}\n${xref.join("\n")}\ntrailer << /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(header + body + trailer);
}

async function getPayrollDocumentPdf(tenantId, id) {
  const documentId = numericId(id);
  if (!documentId) throw validationError("Documento invalido.", 400, "DOCUMENTO_NOMINA_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      SELECT d.*, e.metadata->>'name' AS employee_name, e.code AS employee_code,
             COALESCE(e.metadata->>'document', p.tax_id) AS employee_document,
             COALESCE(e.metadata->>'bank_entity_name', p.metadata->>'bank_entity_name') AS employee_bank_entity_name,
             COALESCE(e.metadata->>'bank_account_code', p.metadata->>'bank_account_code') AS employee_bank_account_code,
             e.position AS employee_position, e.metadata->>'cost_center_code' AS employee_cost_center_code,
             e.hire_date AS employee_hire_date,
             eps.entity_legal_name AS employee_eps_name,
             pension.entity_legal_name AS employee_pension_name
      FROM th_nomina_documentos d
      LEFT JOIN "Employee" e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
      LEFT JOIN "Party" p ON p.id = e.party_id AND p.tenant_id = e.tenant_id
      LEFT JOIN LATERAL (
        SELECT le.legal_name AS entity_legal_name
        FROM th_empleado_afiliaciones a
        INNER JOIN th_entidades_laborales le ON le.id = a.entity_id AND le.tenant_id = a.tenant_id
        WHERE a.tenant_id = d.tenant_id
          AND a.employee_id = d.employee_id
          AND a.status = 'activa'
          AND a.entity_type = 'EPS'
          AND a.valid_from <= d.date_end
          AND (a.valid_to IS NULL OR a.valid_to >= d.date_start)
        ORDER BY a.valid_from DESC, a.id DESC
        LIMIT 1
      ) eps ON true
      LEFT JOIN LATERAL (
        SELECT le.legal_name AS entity_legal_name
        FROM th_empleado_afiliaciones a
        INNER JOIN th_entidades_laborales le ON le.id = a.entity_id AND le.tenant_id = a.tenant_id
        WHERE a.tenant_id = d.tenant_id
          AND a.employee_id = d.employee_id
          AND a.status = 'activa'
          AND a.entity_type = 'PENSION'
          AND a.valid_from <= d.date_end
          AND (a.valid_to IS NULL OR a.valid_to >= d.date_start)
        ORDER BY a.valid_from DESC, a.id DESC
        LIMIT 1
      ) pension ON true
      WHERE d.tenant_id = ${tenantId} AND d.id = ${documentId}
      LIMIT 1
    `;
    if (!rows[0]) throw validationError("Documento de nomina no encontrado.", 404, "DOCUMENTO_NOMINA_NO_ENCONTRADO");
    const row = rows[0];
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const libranzaIds = Array.from(new Set(lines.map((line) => numericId(line.metadata?.libranza_id)).filter(Boolean)));
    let libranzaBalances = new Map();
    if (libranzaIds.length) {
      const balances = await prisma.$queryRaw`
        SELECT l.id, l.original_amount, l.balance_amount, m.balance_before, m.balance_after
        FROM th_libranza_empleados l
        LEFT JOIN th_libranza_movimientos m
          ON m.employee_libranza_id = l.id
          AND m.tenant_id = l.tenant_id
          AND m.period_key = ${row.period_key}
          AND m.status = 'aplicado'
        WHERE l.tenant_id = ${tenantId}
          AND l.id IN (${Prisma.join(libranzaIds)})
      `.catch(() => []);
      libranzaBalances = new Map(balances.map((item) => [Number(item.id), item]));
    }
    const enrichedLines = lines.map((line) => {
      const libranzaId = numericId(line.metadata?.libranza_id);
      if (!libranzaId || !libranzaBalances.has(libranzaId)) return line;
      const balance = libranzaBalances.get(libranzaId);
      return {
        ...line,
        metadata: {
          ...(line.metadata || {}),
          original_amount: line.metadata?.original_amount ?? Number(balance.original_amount || 0),
          balance_amount: line.metadata?.balance_amount ?? Number(balance.balance_before ?? balance.balance_amount ?? 0),
          balance_after: line.metadata?.balance_after ?? Number(balance.balance_after ?? balance.balance_amount ?? 0)
        }
      };
    });
    return simplePayrollPdf({
      ...row,
      lines: enrichedLines,
      source_summary: {
        ...(row.source_summary || {}),
        fecha_ingreso: row.source_summary?.fecha_ingreso || row.employee_hire_date,
        position: row.source_summary?.position || row.employee_position,
        cost_center_code: row.source_summary?.cost_center_code || row.employee_cost_center_code,
        bank_entity_name: row.source_summary?.bank_entity_name || row.employee_bank_entity_name,
        bank_account_code: row.source_summary?.bank_account_code || row.employee_bank_account_code,
        eps_name: row.source_summary?.eps_name || row.employee_eps_name,
        pension_name: row.source_summary?.pension_name || row.employee_pension_name
      }
    });
  });
}

async function previewEmployeeTerminationLiquidation(tenantId, input = {}) {
  const document = await buildEmployeeTerminationLiquidation(tenantId, input);
  return { mode: "preview", document };
}

async function runEmployeeTerminationLiquidation(tenantId, input = {}, user = {}) {
  const document = await buildEmployeeTerminationLiquidation(tenantId, input);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    if (input.recalculate === true || input.recalculate === "true") {
      await tx.$executeRaw`
        DELETE FROM th_liquidaciones_trabajador
        WHERE tenant_id = ${tenantId}
          AND employee_id = ${document.employee_id}
          AND termination_date = ${document.termination_date}::date
      `;
    }
    const rows = await tx.$queryRaw`
      INSERT INTO th_liquidaciones_trabajador (
        tenant_id, employee_id, termination_date, termination_reason, contract_type, status, gross, deductions, net, indemnization_amount, benefit_balance_amount, lines, source_summary, created_by
      )
      VALUES (
        ${tenantId}, ${document.employee_id}, ${document.termination_date}::date, ${document.termination_reason}, ${document.contract_type}, 'draft',
        ${document.gross}, ${document.deductions}, ${document.net}, ${document.indemnization_amount}, ${document.benefit_balance_amount},
        ${JSON.stringify(document.lines)}::jsonb, ${JSON.stringify({ ...document.source_summary, employee_name: document.employee_name })}::jsonb, ${user?.id || null}
      )
      ON CONFLICT (tenant_id, employee_id, termination_date)
      DO UPDATE SET termination_reason = EXCLUDED.termination_reason, contract_type = EXCLUDED.contract_type, gross = EXCLUDED.gross, deductions = EXCLUDED.deductions, net = EXCLUDED.net, indemnization_amount = EXCLUDED.indemnization_amount, benefit_balance_amount = EXCLUDED.benefit_balance_amount, lines = EXCLUDED.lines, source_summary = EXCLUDED.source_summary, updated_at = now()
      RETURNING *
    `;
    for (const line of document.lines.filter((row) => TERMINATION_BENEFIT_CODES.has(String(row.code || "").toUpperCase()))) {
      await tx.$executeRaw`
        INSERT INTO th_prestaciones_saldos (
          tenant_id, employee_id, concept_code, period_key, date_start, date_end, accrued_amount, paid_amount, balance_amount, source_document_type, source_document_id, metadata
        )
        VALUES (
          ${tenantId}, ${document.employee_id}, ${line.code}, ${`retiro:${document.termination_date.toISOString().slice(0, 10)}`},
          ${document.source_summary.fecha_ingreso}::date, ${document.termination_date}::date, ${Number(line.accrued_amount || line.amount || 0)}, ${Number(line.accrued_amount || line.amount || 0)}, 0, 'retiro', ${rows[0].id}, ${JSON.stringify({ paid_in_termination: true })}::jsonb
        )
        ON CONFLICT (tenant_id, employee_id, concept_code, period_key)
        DO UPDATE SET accrued_amount = EXCLUDED.accrued_amount, paid_amount = EXCLUDED.paid_amount, balance_amount = 0, source_document_id = EXCLUDED.source_document_id, updated_at = now()
      `;
    }
    if (input.mark_inactive === true || input.mark_inactive === "true") {
      const employee = await tx.employee.findFirst({ where: { tenant_id: tenantId, id: document.employee_id } });
      if (employee) {
        await ensureEmployeeContractFoundation(tx, tenantId, employee, user);
        await tx.$executeRaw`
          UPDATE th_empleado_contratos
          SET status = 'cerrado', valid_to = ${document.termination_date}::date, termination_reason = ${document.termination_reason},
              termination_document_id = ${rows[0].id}, updated_at = now(),
              metadata = metadata || ${JSON.stringify({ closed_by: "liquidacion_trabajador" })}::jsonb
          WHERE tenant_id = ${tenantId} AND employee_id = ${document.employee_id} AND status = 'activo'
        `;
        const metadata = employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {};
        await tx.employee.update({ where: { id: document.employee_id }, data: { active: false, end_date: document.termination_date, metadata: { ...metadata, labor_status: "retirado", termination_reason: document.termination_reason } } });
      }
    }
    return { ok: true, document: rows[0] };
  }));
}

async function listEmployeeTerminationLiquidations(tenantId, query = {}) {
  const employeeId = numericId(query.employee_id);
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT d.*, e.code AS employee_code, e.metadata->>'name' AS employee_name
    FROM th_liquidaciones_trabajador d
    LEFT JOIN "Employee" e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
    WHERE d.tenant_id = ${tenantId}
      AND (${!employeeId} OR d.employee_id = ${employeeId || 0})
    ORDER BY d.created_at DESC
    LIMIT ${Math.min(Number(query.limit || 200), 500)}
  `);
}

async function listEmployeeBenefitBalances(tenantId, query = {}) {
  const employeeId = numericId(query.employee_id);
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT b.*, e.code AS employee_code, e.metadata->>'name' AS employee_name
    FROM th_prestaciones_saldos b
    LEFT JOIN "Employee" e ON e.id = b.employee_id AND e.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId}
      AND (${!employeeId} OR b.employee_id = ${employeeId || 0})
    ORDER BY b.employee_id ASC, b.concept_code ASC, b.date_end DESC
    LIMIT ${Math.min(Number(query.limit || 500), 1000)}
  `);
}

async function deleteEmployeeTerminationLiquidation(tenantId, id) {
  const documentId = numericId(id);
  if (!documentId) throw validationError("Liquidacion invalida.", 400, "LIQUIDACION_TRABAJADOR_INVALIDA");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM th_prestaciones_saldos WHERE tenant_id = ${tenantId} AND source_document_type = 'retiro' AND source_document_id = ${documentId}`;
    const rows = await tx.$queryRaw`DELETE FROM th_liquidaciones_trabajador WHERE tenant_id = ${tenantId} AND id = ${documentId} RETURNING *`;
    if (!rows[0]) throw validationError("Liquidacion no encontrada.", 404, "LIQUIDACION_TRABAJADOR_NO_ENCONTRADA");
    return { ok: true, deleted: rows[0] };
  }));
}

async function getEmployeeTerminationLiquidationPdf(tenantId, id) {
  const documentId = numericId(id);
  if (!documentId) throw validationError("Documento invalido.", 400, "DOCUMENTO_RETIRO_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      SELECT d.*, e.metadata->>'name' AS employee_name, e.code AS employee_code
      FROM th_liquidaciones_trabajador d
      LEFT JOIN "Employee" e ON e.id = d.employee_id AND e.tenant_id = d.tenant_id
      WHERE d.tenant_id = ${tenantId} AND d.id = ${documentId}
      LIMIT 1
    `;
    if (!rows[0]) throw validationError("Liquidacion no encontrada.", 404, "LIQUIDACION_TRABAJADOR_NO_ENCONTRADA");
    return simplePayrollPdf({ ...rows[0], period_key: `retiro:${String(rows[0].termination_date).slice(0, 10)}`, period_type: "retiro", date_start: rows[0].source_summary?.fecha_ingreso || rows[0].termination_date, date_end: rows[0].termination_date });
  });
}

function socialContributionDefaults() {
  return [
    { code: "DED_SALUD", name: "Deduccion salud empleado", entity_type: "EPS", payer: "employee", value: 4 },
    { code: "APORTE_SALUD", name: "Aporte salud empleador", entity_type: "EPS", payer: "employer", value: 8.5, exonerable: true },
    { code: "DED_PENSION", name: "Deduccion pension empleado", entity_type: "PENSION", payer: "employee", value: 4 },
    { code: "APORTE_PENSION", name: "Aporte pension empleador", entity_type: "PENSION", payer: "employer", value: 12 },
    { code: "APORTE_ARL_RIESGO_1", name: "Aporte ARL riesgo I", entity_type: "ARL", payer: "employer", value: 0.522, arl_risk_class: 1 },
    { code: "APORTE_ARL_RIESGO_2", name: "Aporte ARL riesgo II", entity_type: "ARL", payer: "employer", value: 1.044, arl_risk_class: 2 },
    { code: "APORTE_ARL_RIESGO_3", name: "Aporte ARL riesgo III", entity_type: "ARL", payer: "employer", value: 2.436, arl_risk_class: 3 },
    { code: "APORTE_ARL_RIESGO_4", name: "Aporte ARL riesgo IV", entity_type: "ARL", payer: "employer", value: 4.35, arl_risk_class: 4 },
    { code: "APORTE_ARL_RIESGO_5", name: "Aporte ARL riesgo V", entity_type: "ARL", payer: "employer", value: 6.96, arl_risk_class: 5 },
    { code: "APORTE_CAJA", name: "Aporte caja de compensacion", entity_type: "CAJA_COMPENSACION", payer: "employer", value: 4 },
    { code: "APORTE_ICBF", name: "Aporte ICBF", entity_type: "ICBF", payer: "employer", value: 3, exonerable: true },
    { code: "APORTE_SENA", name: "Aporte SENA", entity_type: "SENA", payer: "employer", value: 2, exonerable: true }
  ];
}

async function activeSocialContributionParameters(tenantId, effectiveDate) {
  const rows = await activeLaborDeductions(tenantId, effectiveDate);
  const configured = rows
    .filter((row) => row.metadata?.social_contribution === true || ["DED_SALUD", "APORTE_SALUD", "DED_PENSION", "APORTE_PENSION"].includes(String(row.code || "")))
    .map((row) => ({
      code: row.code,
      name: row.name,
      entity_type: row.metadata?.entity_type || (String(row.code || "").includes("SALUD") ? "EPS" : String(row.code || "").includes("PENSION") ? "PENSION" : "GENERAL"),
      payer: row.metadata?.payer || (String(row.code || "").startsWith("DED_") ? "employee" : "employer"),
      value: Number(row.value || 0),
      exonerable: row.metadata?.exonerable === true,
      arl_risk_class: row.metadata?.arl_risk_class ? Number(row.metadata.arl_risk_class) : (String(row.code || "").match(/APORTE_ARL_RIESGO_(\d)/)?.[1] ? Number(String(row.code || "").match(/APORTE_ARL_RIESGO_(\d)/)?.[1]) : null),
      metadata: row.metadata || {}
    }));
  const byCode = new Map();
  for (const row of [...socialContributionDefaults(), ...configured]) byCode.set(row.code, row);
  return Array.from(byCode.values());
}

async function activeLaborParameterValues(tenantId, effectiveDate, codes = []) {
  if (!codes.length) return {};
  const rows = await prisma.$queryRaw`
    SELECT code, value, unit, metadata
    FROM th_parametros_laborales
    WHERE tenant_id = ${tenantId}
      AND active = true
      AND code IN (${Prisma.join(codes)})
      AND valid_from <= ${effectiveDate}
      AND (valid_to IS NULL OR valid_to >= ${effectiveDate})
    ORDER BY code ASC, priority DESC, valid_from DESC
  `.catch(() => []);
  const byCode = {};
  for (const row of rows) {
    if (!byCode[row.code]) byCode[row.code] = row;
  }
  return byCode;
}

function pensionSolidarityRate(ibc = 0, smmlv = 0, parameter = null) {
  if (!smmlv || ibc <= 0) return 0;
  const salaryMultiples = ibc / smmlv;
  const brackets = parameter?.metadata?.brackets || [
    { from_smmlv: 4, to_smmlv: 16, percent: 1 },
    { from_smmlv: 16, to_smmlv: 17, percent: 1.2 },
    { from_smmlv: 17, to_smmlv: 18, percent: 1.4 },
    { from_smmlv: 18, to_smmlv: 19, percent: 1.6 },
    { from_smmlv: 19, to_smmlv: 20, percent: 1.8 },
    { from_smmlv: 20, percent: 2 }
  ];
  const bracket = brackets.find((row) => {
    const from = Number(row.from_smmlv || 0);
    const to = row.to_smmlv == null ? Infinity : Number(row.to_smmlv);
    return salaryMultiples >= from && salaryMultiples < to;
  });
  return Number(bracket?.percent || 0);
}

function socialContributionExonerationConfig(parameterRows = {}) {
  const smmlv = Number(parameterRows.SMMLV?.value || 0);
  const thresholdMultiplier = Number(parameterRows.EXONERACION_APORTES_TOPE_SMMLV?.value || 10);
  return {
    smmlv,
    threshold_multiplier: thresholdMultiplier,
    threshold_amount: smmlv > 0 ? money(smmlv * thresholdMultiplier) : 0,
    comparison_basis: "ibc_periodo",
    source: "th_parametros_laborales"
  };
}

function affiliationForType(affiliations, entityType) {
  return affiliations.find((row) => row.entity_type === entityType || row.entity_entity_type === entityType) || null;
}

function pilaNoveltyFromAdjustment(adjustment = {}, dailySalary = 0) {
  const type = String(adjustment.adjustment_type || "").trim().toLowerCase();
  const code = normalizeLaborCode(adjustment.concept_code || "");
  const days = money(adjustmentDays(adjustment));
  if (!days) return null;
  const explicitIbc = adjustment.metadata?.pila_ibc_amount !== undefined ? Number(adjustment.metadata.pila_ibc_amount || 0) : null;
  const base = explicitIbc != null ? explicitIbc : dailySalary * days;
  if (type === "licencia_no_remunerada" || code === "LICENCIA_NO_REMUNERADA") return { code: "SLN", name: "Licencia no remunerada", days, ibc_delta: -money(base), affects_ibc: true };
  if (type === "licencia_remunerada" || code === "LICENCIA_REMUNERADA") return { code: "LRE", name: "Licencia remunerada", days, ibc_delta: 0, affects_ibc: false };
  if (type === "incapacidad_general" || code === "INCAPACIDAD_GENERAL") return { code: "IGE", name: "Incapacidad general", days, ibc_delta: explicitIbc != null ? money(explicitIbc - (dailySalary * days)) : 0, affects_ibc: explicitIbc != null };
  if (type === "incapacidad_laboral" || code === "INCAPACIDAD_LABORAL") return { code: "IRL", name: "Incapacidad laboral", days, ibc_delta: explicitIbc != null ? money(explicitIbc - (dailySalary * days)) : 0, affects_ibc: explicitIbc != null };
  if (type === "maternidad_paternidad" || code === "LICENCIA_MATERNIDAD_PATERNIDAD") return { code: "LMA", name: "Licencia maternidad/paternidad", days, ibc_delta: explicitIbc != null ? money(explicitIbc - (dailySalary * days)) : 0, affects_ibc: explicitIbc != null };
  return null;
}

async function buildSocialContributionRows(tenantId, input = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || "mes";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  const employeeFilter = input.employee_id ? { id: numericId(input.employee_id) } : {};
  const [parameters, exonerationParameterRows, employees, payrollDocs, adjustments] = await Promise.all([
    activeSocialContributionParameters(tenantId, start),
    activeLaborParameterValues(tenantId, start, ["SMMLV", "EXONERACION_APORTES_TOPE_SMMLV"]),
    prisma.employee.findMany({ where: { active: true, ...employeeFilter }, include: { user: { select: safeUserSelect } } }),
    prisma.$queryRaw`
      SELECT *
      FROM th_nomina_documentos
      WHERE tenant_id = ${tenantId}
        AND date_start >= ${start}::date
        AND date_end <= ${end}::date
    `.catch(() => []),
    prisma.$queryRaw`
      SELECT *
      FROM th_nomina_ajustes
      WHERE tenant_id = ${tenantId}
        AND period_key = ${periodKey}
        AND status = 'activo'
    `.catch(() => [])
  ]);
  const exonerationConfig = socialContributionExonerationConfig(exonerationParameterRows);
  const pensionSolidarityParameter = parameters.find((row) => row.code === "DED_FONDO_SOLIDARIDAD_PENSIONAL");
  const employeeIds = employees.map((row) => row.id);
  const affiliations = employeeIds.length ? await prisma.$queryRaw`
    SELECT a.*, e.entity_type AS entity_entity_type, e.legal_name AS entity_legal_name, e.nit AS entity_nit
    FROM th_empleado_afiliaciones a
    INNER JOIN th_entidades_laborales e ON e.id = a.entity_id AND e.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId}
      AND a.employee_id IN (${Prisma.join(employeeIds)})
      AND a.status = 'activa'
      AND a.valid_from <= ${end}::date
      AND (a.valid_to IS NULL OR a.valid_to >= ${start}::date)
  `.catch(() => []) : [];
  const docsByEmployee = new Map();
  for (const doc of payrollDocs) {
    const list = docsByEmployee.get(doc.employee_id) || [];
    list.push(doc);
    docsByEmployee.set(doc.employee_id, list);
  }
  const affiliationsByEmployee = new Map();
  for (const row of affiliations) {
    const list = affiliationsByEmployee.get(row.employee_id) || [];
    list.push(row);
    affiliationsByEmployee.set(row.employee_id, list);
  }
  const adjustmentsByEmployee = new Map();
  for (const row of adjustments) {
    const list = adjustmentsByEmployee.get(row.employee_id) || [];
    list.push(row);
    adjustmentsByEmployee.set(row.employee_id, list);
  }

  const employeeRows = [];
  const lines = [];
  for (const employee of employees) {
    const docs = docsByEmployee.get(employee.id) || [];
    const baseIbc = money(docs.reduce((sum, doc) => sum + Number(doc.source_summary?.ibc || 0), 0) || Number(employee.salary_base || 0));
    const dailySalary = Number(employee.salary_base || 0) / 30;
    const noveltySummary = (adjustmentsByEmployee.get(employee.id) || []).map((adjustment) => pilaNoveltyFromAdjustment(adjustment, dailySalary)).filter(Boolean);
    const ibcDelta = money(noveltySummary.reduce((sum, novelty) => sum + Number(novelty.ibc_delta || 0), 0));
    const ibc = money(Math.max(baseIbc + ibcDelta, 0));
    const employeeName = employee.metadata?.name || employee.user?.name || employee.code || `Empleado ${employee.id}`;
    const employeeAffiliations = affiliationsByEmployee.get(employee.id) || [];
    const socialSecurity = employee.metadata?.social_security || {};
    const arlRiskClass = Math.min(Math.max(Number(socialSecurity.arl_risk_class || 1), 1), 5);
    const appliesByThreshold = exonerationConfig.threshold_amount > 0 && ibc < exonerationConfig.threshold_amount;
    const exoneratedSena = appliesByThreshold;
    const exoneratedIcbf = appliesByThreshold;
    const exoneratedHealthEmployer = appliesByThreshold;
    const exonerationSummary = {
      ...exonerationConfig,
      mode: "automatic_by_ibc_threshold",
      eligible_by_employee: true,
      applies_by_threshold: appliesByThreshold,
      salud_empleador: exoneratedHealthEmployer,
      icbf: exoneratedIcbf,
      sena: exoneratedSena
    };
    let employeeTotal = 0;
    let employerTotal = 0;
    for (const parameter of parameters) {
      if (parameter.code === "DED_FONDO_SOLIDARIDAD_PENSIONAL") continue;
      if (parameter.entity_type === "ARL" && Number(parameter.arl_risk_class || 1) !== arlRiskClass) continue;
      if (parameter.code === "APORTE_SENA" && exoneratedSena) continue;
      if (parameter.code === "APORTE_ICBF" && exoneratedIcbf) continue;
      if (parameter.code === "APORTE_SALUD" && exoneratedHealthEmployer) continue;
      const affiliation = affiliationForType(employeeAffiliations, parameter.entity_type);
      const amount = money(ibc * (Number(parameter.value || 0) / 100));
      if (!amount) continue;
      const employeeAmount = parameter.payer === "employee" ? amount : 0;
      const employerAmount = parameter.payer === "employer" ? amount : 0;
      employeeTotal += employeeAmount;
      employerTotal += employerAmount;
      lines.push({
        employee_id: employee.id,
        employee_name: employeeName,
        employee_code: employee.code,
        entity_type: parameter.entity_type,
        entity_id: affiliation?.entity_id || null,
        entity_name: affiliation?.entity_legal_name || "Sin entidad asociada",
        concept_code: parameter.code,
        concept_name: parameter.name,
        ibc,
        employee_percent: parameter.payer === "employee" ? Number(parameter.value || 0) : 0,
        employer_percent: parameter.payer === "employer" ? Number(parameter.value || 0) : 0,
        employee_amount: employeeAmount,
        employer_amount: employerAmount,
        total_amount: amount,
        metadata: { missing_affiliation: !affiliation, source: docs.length ? "nomina" : "salario_empleado", arl_risk_class: arlRiskClass, novedades_pila: noveltySummary, ibc_base: baseIbc, ibc_delta: ibcDelta, exoneration: exonerationSummary }
      });
    }
    const pensionSolidarityPercent = pensionSolidarityRate(ibc, exonerationConfig.smmlv, pensionSolidarityParameter);
    if (pensionSolidarityPercent > 0) {
      const affiliation = affiliationForType(employeeAffiliations, "PENSION");
      const amount = money(ibc * (pensionSolidarityPercent / 100));
      employeeTotal += amount;
      lines.push({
        employee_id: employee.id,
        employee_name: employeeName,
        employee_code: employee.code,
        entity_type: "PENSION",
        entity_id: affiliation?.entity_id || null,
        entity_name: affiliation?.entity_legal_name || "Sin entidad asociada",
        concept_code: "DED_FONDO_SOLIDARIDAD_PENSIONAL",
        concept_name: pensionSolidarityParameter?.name || "Fondo de solidaridad pensional",
        ibc,
        employee_percent: pensionSolidarityPercent,
        employer_percent: 0,
        employee_amount: amount,
        employer_amount: 0,
        total_amount: amount,
        metadata: { missing_affiliation: !affiliation, source: docs.length ? "nomina" : "salario_empleado", novedades_pila: noveltySummary, ibc_base: baseIbc, ibc_delta: ibcDelta, smmlv: exonerationConfig.smmlv, salary_multiples: exonerationConfig.smmlv ? money(ibc / exonerationConfig.smmlv) : 0 }
      });
    }
    employeeRows.push({ employee_id: employee.id, employee_name: employeeName, employee_code: employee.code, ibc, employee_amount: money(employeeTotal), employer_amount: money(employerTotal), total_amount: money(employeeTotal + employerTotal), documents: docs.length, arl_risk_class: arlRiskClass, novedades_pila: noveltySummary, exoneration: exonerationSummary });
  }
  const totalIbc = money(employeeRows.reduce((sum, row) => sum + row.ibc, 0));
  const totalEmployee = money(lines.reduce((sum, row) => sum + row.employee_amount, 0));
  const totalEmployer = money(lines.reduce((sum, row) => sum + row.employer_amount, 0));
  return {
    period_key: periodKey,
    period_type: periodType,
    date_start: start,
    date_end: end,
    total_ibc: totalIbc,
    total_employee: totalEmployee,
    total_employer: totalEmployer,
    total_payable: money(totalEmployee + totalEmployer),
    employees: employeeRows,
    lines,
    source_summary: { employees: employeeRows.length, lines: lines.length, missing_affiliations: lines.filter((line) => line.metadata.missing_affiliation).length, novedades_pila: employeeRows.reduce((sum, row) => sum + row.novedades_pila.length, 0), exoneration: exonerationConfig }
  };
}

async function previewSocialContributions(tenantId, input = {}) {
  return prisma.runWithTenant(tenantId, async () => ({ mode: "preview", document: await buildSocialContributionRows(tenantId, input) }));
}

// Los despliegues remotos hablan con la base por pooler (~30ms por query): un INSERT por
// linea dentro de la transaccion interactiva supera el timeout por defecto de Prisma y
// falla con P2028 "Transaction not found" (~190 lineas alcanzan los 5s). Se inserta por
// lotes multi-VALUES y se amplía el timeout de las transacciones de nomina.
const PAYROLL_BATCH_TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 30000 };
const PAYROLL_LINE_INSERT_CHUNK = 500; // 500 filas x 14 parametros = 7000 < 65535 (tope Postgres)

function socialContributionLineValues(tenantId, documentId, line) {
  return Prisma.sql`(${tenantId}, ${documentId}, ${line.employee_id}, ${line.entity_type}, ${line.entity_id}, ${line.concept_code}, ${line.concept_name}, ${line.ibc}, ${line.employee_percent}, ${line.employer_percent}, ${line.employee_amount}, ${line.employer_amount}, ${line.total_amount}, ${JSON.stringify(line.metadata)}::jsonb)`;
}

async function insertSocialContributionLines(tx, tenantId, documentId, lines = []) {
  for (let index = 0; index < lines.length; index += PAYROLL_LINE_INSERT_CHUNK) {
    const chunk = lines.slice(index, index + PAYROLL_LINE_INSERT_CHUNK);
    await tx.$executeRaw`
      INSERT INTO th_aportes_sociales_lineas (tenant_id, document_id, employee_id, entity_type, entity_id, concept_code, concept_name, ibc, employee_percent, employer_percent, employee_amount, employer_amount, total_amount, metadata)
      VALUES ${Prisma.join(chunk.map((line) => socialContributionLineValues(tenantId, documentId, line)))}
    `;
  }
}

async function runSocialContributions(tenantId, input = {}, user = {}) {
  // buildSocialContributionRows consulta Employee sin filtro propio: debe correr dentro del
  // contexto de tenant (igual que preview) para no mezclar empleados de otros tenants.
  const document = await prisma.runWithTenant(tenantId, () => buildSocialContributionRows(tenantId, input));
  await assertPayrollPeriodOpen(tenantId, document.period_key);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    if (input.recalculate === true || input.recalculate === "true") await tx.$executeRaw`DELETE FROM th_aportes_sociales_documentos WHERE tenant_id = ${tenantId} AND period_key = ${document.period_key}`;
    const rows = await tx.$queryRaw`
      INSERT INTO th_aportes_sociales_documentos (tenant_id, period_key, period_type, date_start, date_end, status, total_ibc, total_employee, total_employer, total_payable, source_summary, created_by)
      VALUES (${tenantId}, ${document.period_key}, ${document.period_type}, ${document.date_start}::date, ${document.date_end}::date, 'draft', ${document.total_ibc}, ${document.total_employee}, ${document.total_employer}, ${document.total_payable}, ${JSON.stringify(document.source_summary)}::jsonb, ${user?.id || null})
      ON CONFLICT (tenant_id, period_key)
      DO UPDATE SET total_ibc = EXCLUDED.total_ibc, total_employee = EXCLUDED.total_employee, total_employer = EXCLUDED.total_employer, total_payable = EXCLUDED.total_payable, source_summary = EXCLUDED.source_summary, updated_at = now()
      RETURNING *
    `;
    const doc = rows[0];
    await tx.$executeRaw`DELETE FROM th_aportes_sociales_lineas WHERE tenant_id = ${tenantId} AND document_id = ${doc.id}`;
    await insertSocialContributionLines(tx, tenantId, doc.id, document.lines);
    return { ok: true, document: doc, lines: document.lines.length };
  }, PAYROLL_BATCH_TRANSACTION_OPTIONS));
}

async function listSocialContributionDocuments(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT *
    FROM th_aportes_sociales_documentos
    WHERE tenant_id = ${tenantId}
      AND (${!query.period_key} OR period_key = ${query.period_key || ""})
    ORDER BY created_at DESC
    LIMIT ${Math.min(Number(query.limit || 100), 300)}
  `);
}

async function listSocialContributionLines(tenantId, query = {}) {
  const documentId = numericId(query.document_id);
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT l.*, e.code AS employee_code, e.metadata->>'name' AS employee_name, le.legal_name AS entity_name, le.nit AS entity_nit
    FROM th_aportes_sociales_lineas l
    LEFT JOIN "Employee" e ON e.id = l.employee_id AND e.tenant_id = l.tenant_id
    LEFT JOIN th_entidades_laborales le ON le.id = l.entity_id AND le.tenant_id = l.tenant_id
    WHERE l.tenant_id = ${tenantId}
      AND (${!documentId} OR l.document_id = ${documentId || 0})
    ORDER BY l.entity_type ASC, entity_name ASC, employee_name ASC
    LIMIT ${Math.min(Number(query.limit || 1000), 2000)}
  `);
}

async function deleteSocialContributionDocument(tenantId, id) {
  const documentId = numericId(id);
  if (!documentId) throw validationError("Documento de aportes invalido.", 400, "DOCUMENTO_APORTES_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.$queryRaw`SELECT period_key FROM th_aportes_sociales_documentos WHERE tenant_id = ${tenantId} AND id = ${documentId} LIMIT 1`;
    if (!current[0]) throw validationError("Documento de aportes no encontrado.", 404, "DOCUMENTO_APORTES_NO_ENCONTRADO");
    await assertPayrollPeriodOpen(tenantId, current[0].period_key);
    const rows = await prisma.$queryRaw`DELETE FROM th_aportes_sociales_documentos WHERE tenant_id = ${tenantId} AND id = ${documentId} RETURNING *`;
    if (!rows[0]) throw validationError("Documento de aportes no encontrado.", 404, "DOCUMENTO_APORTES_NO_ENCONTRADO");
    return { ok: true, deleted: rows[0] };
  });
}

function provisionTotalFromPayrollDocuments(documents = []) {
  return money(documents.reduce((sum, doc) => sum + Number(doc.total_provisions || 0), 0));
}

function socialBenefitProvisionLinesFromPayrollDocument(document) {
  const summary = document.source_summary || {};
  const days = Number(summary.dias_prestaciones_sociales || summary.days_worked || document.days_worked || 0);
  const vacationDays = Number(summary.days_worked || document.days_worked || days || 0);
  const socialBenefitsBase = Number(summary.base_prestaciones_sociales || 0);
  const vacationBase = Number(summary.base_vacaciones || socialBenefitsBase || 0);
  if (!days && !vacationDays) return [];
  const cesantias = money((socialBenefitsBase * days) / 360);
  const prima = money((socialBenefitsBase * days) / 360);
  const interesesCesantias = money((cesantias * days * 0.12) / 360);
  const vacaciones = money((vacationBase * vacationDays) / 720);
  return [
    { code: "PRIMA_SERVICIOS", name: "Provision prima de servicios", base: socialBenefitsBase, quantity: days, formula: "base * dias / 360", amount: prima },
    { code: "CESANTIAS", name: "Provision cesantias", base: socialBenefitsBase, quantity: days, formula: "base * dias / 360", amount: cesantias },
    { code: "INTERESES_CESANTIAS", name: "Provision intereses a las cesantias", base: cesantias, quantity: days, formula: "cesantias * dias * 12% / 360", amount: interesesCesantias },
    { code: "VACACIONES", name: "Provision vacaciones", base: vacationBase, quantity: vacationDays, formula: "base * dias / 720", amount: vacaciones }
  ].filter((line) => Number(line.amount || 0) > 0).map((line) => ({ ...line, employee_id: document.employee_id, employee_name: document.employee_name, payroll_document_id: document.id }));
}

async function previewSocialBenefitProvisions(tenantId, input = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || input.tipo_periodo || "mes";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  // Toma los documentos de nomina cuyo periodo se solapa con el rango (asi un mes captura sus
  // quincenas, sin depender de que exista un documento con el period_key exacto del mes).
  const fromKey = start.toISOString().slice(0, 10);
  const toKey = end.toISOString().slice(0, 10);
  const payrollDocuments = await listPayrollDocuments(tenantId, { date_from: fromKey, date_to: toKey, limit: 2000 });
  if (!payrollDocuments.length) throw validationError("No existen documentos de nomina para provisionar este periodo.", 409, "PROVISION_SIN_NOMINA");
  // Agrega por empleado+concepto para que, si el mes abarca varias quincenas, se sumen (y no se
  // sobrescriban al guardar el saldo, cuya clave unica incluye el period_key).
  const aggregated = new Map();
  for (const line of payrollDocuments.flatMap(socialBenefitProvisionLinesFromPayrollDocument)) {
    const key = `${line.employee_id}|${line.code}`;
    const existing = aggregated.get(key);
    if (!existing) {
      aggregated.set(key, { ...line });
    } else {
      existing.amount = money(Number(existing.amount || 0) + Number(line.amount || 0));
      existing.quantity = money(Number(existing.quantity || 0) + Number(line.quantity || 0));
      existing.base = money(Number(existing.base || 0) + Number(line.base || 0));
      existing.payroll_document_id = existing.payroll_document_id || line.payroll_document_id;
    }
  }
  // Los intereses a las cesantias no son lineales respecto a los dias (intereses = cesantias *
  // dias * 12% / 360, y la cesantia ya depende de los dias). Por eso se recalculan sobre el
  // acumulado del periodo y no como suma de los intereses de cada quincena.
  const employeeIdsForInterest = new Set(Array.from(aggregated.values()).map((line) => line.employee_id));
  for (const employeeId of employeeIdsForInterest) {
    const cesantias = aggregated.get(`${employeeId}|CESANTIAS`);
    const intereses = aggregated.get(`${employeeId}|INTERESES_CESANTIAS`);
    if (cesantias && intereses) {
      intereses.amount = money((Number(cesantias.amount || 0) * Number(cesantias.quantity || 0) * 0.12) / 360);
      intereses.quantity = cesantias.quantity;
      intereses.base = cesantias.amount;
    }
  }
  const lines = Array.from(aggregated.values());
  const total = money(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
  return {
    period_key: periodKey,
    period_type: periodType,
    date_start: start,
    date_end: end,
    payroll_documents: payrollDocuments.length,
    lines,
    total_provisions: total
  };
}

async function runSocialBenefitProvisions(tenantId, input = {}, user = {}) {
  const document = await previewSocialBenefitProvisions(tenantId, input);
  await assertPayrollPeriodOpen(tenantId, document.period_key);
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM th_prestaciones_saldos
      WHERE tenant_id = ${tenantId}
        AND period_key = ${document.period_key}
        AND source_document_type = 'provision'
    `;
    for (let index = 0; index < document.lines.length; index += PAYROLL_LINE_INSERT_CHUNK) {
      const chunk = document.lines.slice(index, index + PAYROLL_LINE_INSERT_CHUNK);
      await tx.$executeRaw`
        INSERT INTO th_prestaciones_saldos (
          tenant_id, employee_id, concept_code, period_key, date_start, date_end, accrued_amount, paid_amount, balance_amount, source_document_type, source_document_id, metadata
        )
        VALUES ${Prisma.join(chunk.map((line) => Prisma.sql`(
          ${tenantId}, ${line.employee_id}, ${line.code}, ${document.period_key}, ${document.date_start}::date, ${document.date_end}::date,
          ${Number(line.amount || 0)}, 0, ${Number(line.amount || 0)}, 'provision', ${line.payroll_document_id || null},
          ${JSON.stringify({ source: "provision_prestaciones_sociales", provisioned_by: user?.id || null, quantity: line.quantity, employee_name: line.employee_name })}::jsonb
        )`))}
        ON CONFLICT (tenant_id, employee_id, concept_code, period_key)
        DO UPDATE SET accrued_amount = EXCLUDED.accrued_amount, paid_amount = 0, balance_amount = EXCLUDED.balance_amount, source_document_type = 'provision', source_document_id = EXCLUDED.source_document_id, metadata = EXCLUDED.metadata, updated_at = now()
      `;
    }
    return { ok: true, ...document, provisioned_lines: document.lines.length };
  }, PAYROLL_BATCH_TRANSACTION_OPTIONS));
}

const SOCIAL_BENEFIT_PAYMENT_TYPES = {
  prima: ["PRIMA_SERVICIOS"],
  cesantias: ["CESANTIAS"],
  intereses_cesantias: ["INTERESES_CESANTIAS"],
  vacaciones: ["VACACIONES"]
};

function socialBenefitPaymentInput(input = {}) {
  const { start, end } = periodFromRange(input);
  const paymentType = String(input.payment_type || input.tipo || "").trim().toLowerCase();
  if (!SOCIAL_BENEFIT_PAYMENT_TYPES[paymentType]) {
    throw validationError("Tipo de pago de prestaciones invalido.", 400, "PAGO_PRESTACION_TIPO_INVALIDO");
  }
  const periodType = input.period_type || (paymentType === "prima" ? "semestre" : "anio");
  const periodKey = input.period_key || `pago_prestaciones:${paymentType}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
  return {
    paymentType,
    conceptCodes: SOCIAL_BENEFIT_PAYMENT_TYPES[paymentType],
    start,
    end,
    periodType,
    periodKey,
    paymentDate: dateOnly(input.payment_date || input.fecha_pago || end),
    employeeId: input.employee_id ? numericId(input.employee_id) : null
  };
}

async function previewSocialBenefitPayments(tenantId, input = {}) {
  const data = socialBenefitPaymentInput(input);
  const rows = await prisma.$queryRaw`
    SELECT b.id AS benefit_balance_id, b.employee_id, b.concept_code, b.period_key AS source_period_key,
           b.accrued_amount, b.paid_amount, b.balance_amount, b.metadata,
           e.code AS employee_code, e.metadata->>'document' AS employee_document, e.metadata->>'name' AS employee_name,
           ent.id AS entity_id, ent.nit AS entity_nit, ent.legal_name AS entity_name
    FROM th_prestaciones_saldos b
    LEFT JOIN "Employee" e ON e.id = b.employee_id AND e.tenant_id = b.tenant_id
    LEFT JOIN th_empleado_afiliaciones a ON a.employee_id = b.employee_id
      AND a.tenant_id = b.tenant_id
      AND a.entity_type = 'FONDO_CESANTIAS'
      AND a.status = 'activa'
      AND a.valid_from <= ${data.end}::date
      AND (a.valid_to IS NULL OR a.valid_to >= ${data.start}::date)
    LEFT JOIN th_entidades_laborales ent ON ent.id = a.entity_id AND ent.tenant_id = a.tenant_id
    WHERE b.tenant_id = ${tenantId}
      AND b.source_document_type = 'provision'
      AND b.concept_code IN (${Prisma.join(data.conceptCodes)})
      AND b.date_start >= ${data.start}::date
      AND b.date_end <= ${data.end}::date
      AND b.balance_amount > 0
      AND (${data.employeeId == null} OR b.employee_id = ${data.employeeId || 0})
    ORDER BY e.metadata->>'name' ASC, b.concept_code ASC, b.date_start ASC
  `;
  const lines = rows.map((row) => ({
    benefit_balance_id: row.benefit_balance_id,
    employee_id: row.employee_id,
    employee_document: row.employee_document || row.employee_code || "",
    employee_name: row.employee_name || row.employee_code || "",
    concept_code: row.concept_code,
    source_period_key: row.source_period_key,
    accrued_amount: money(row.accrued_amount || 0),
    paid_amount: money(row.paid_amount || 0),
    balance_amount: money(row.balance_amount || 0),
    amount: money(row.balance_amount || 0),
    entity_id: row.entity_id || null,
    entity_nit: row.entity_nit || "",
    entity_name: row.entity_name || "",
    missing_entity: data.paymentType === "cesantias" && !row.entity_id,
    payment_target: data.paymentType === "cesantias" ? "fondo_cesantias" : "trabajador"
  }));
  return {
    payment_type: data.paymentType,
    period_type: data.periodType,
    period_key: data.periodKey,
    date_start: data.start,
    date_end: data.end,
    payment_date: data.paymentDate,
    lines,
    total_amount: money(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0))
  };
}

async function runSocialBenefitPayments(tenantId, input = {}, user = {}) {
  const preview = await previewSocialBenefitPayments(tenantId, input);
  if (!preview.lines.length) throw validationError("No hay saldos de prestaciones para pagar en el periodo.", 409, "PAGO_PRESTACION_SIN_SALDOS");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    if (input.recalculate) {
      const previous = await tx.$queryRaw`
        SELECT id FROM th_prestaciones_pagos_documentos
        WHERE tenant_id = ${tenantId} AND payment_type = ${preview.payment_type} AND period_key = ${preview.period_key} AND status <> 'anulado'
      `;
      for (const row of previous) await reverseSocialBenefitPaymentDocument(tx, tenantId, row.id);
    }
    const existing = await tx.$queryRaw`
      SELECT id FROM th_prestaciones_pagos_documentos
      WHERE tenant_id = ${tenantId} AND payment_type = ${preview.payment_type} AND period_key = ${preview.period_key} AND status <> 'anulado'
      LIMIT 1
    `;
    if (existing[0]) throw validationError("Ya existe un documento de pago de prestaciones para ese tipo y periodo. Anulalo o marca recalcular.", 409, "PAGO_PRESTACION_DUPLICADO");
    const docs = await tx.$queryRaw`
      INSERT INTO th_prestaciones_pagos_documentos (tenant_id, payment_type, period_key, date_start, date_end, payment_date, status, total_amount, source_summary, created_by)
      VALUES (${tenantId}, ${preview.payment_type}, ${preview.period_key}, ${preview.date_start}::date, ${preview.date_end}::date, ${preview.payment_date}::date, 'draft', ${preview.total_amount}, ${JSON.stringify({ period_type: preview.period_type, line_count: preview.lines.length })}::jsonb, ${user?.id || null})
      RETURNING *
    `;
    const doc = docs[0];
    for (const line of preview.lines) {
      const locked = await tx.$queryRaw`SELECT balance_amount FROM th_prestaciones_saldos WHERE tenant_id = ${tenantId} AND id = ${line.benefit_balance_id} FOR UPDATE`;
      const amount = money(Math.min(Number(line.amount || 0), Number(locked[0]?.balance_amount || 0)));
      if (!amount) continue;
      await tx.$executeRaw`
        INSERT INTO th_prestaciones_pagos_lineas (tenant_id, document_id, employee_id, benefit_balance_id, concept_code, amount, entity_id, entity_nit, entity_name, metadata)
        VALUES (${tenantId}, ${doc.id}, ${line.employee_id}, ${line.benefit_balance_id}, ${line.concept_code}, ${amount}, ${line.entity_id}, ${line.entity_nit}, ${line.entity_name}, ${JSON.stringify({ employee_name: line.employee_name, employee_document: line.employee_document, source_period_key: line.source_period_key, payment_target: line.payment_target })}::jsonb)
      `;
      await tx.$executeRaw`
        UPDATE th_prestaciones_saldos
        SET paid_amount = COALESCE(paid_amount, 0) + ${amount},
            balance_amount = GREATEST(COALESCE(balance_amount, 0) - ${amount}, 0),
            updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${line.benefit_balance_id}
      `;
    }
    return { ok: true, ...preview, document_id: doc.id };
  }, PAYROLL_BATCH_TRANSACTION_OPTIONS));
}

async function reverseSocialBenefitPaymentDocument(tx, tenantId, documentId) {
  const lines = await tx.$queryRaw`
    SELECT * FROM th_prestaciones_pagos_lineas
    WHERE tenant_id = ${tenantId} AND document_id = ${documentId}
  `;
  for (const line of lines) {
    await tx.$executeRaw`
      UPDATE th_prestaciones_saldos
      SET paid_amount = GREATEST(COALESCE(paid_amount, 0) - ${Number(line.amount || 0)}, 0),
          balance_amount = COALESCE(balance_amount, 0) + ${Number(line.amount || 0)},
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${line.benefit_balance_id}
    `;
  }
  await tx.$executeRaw`
    UPDATE th_prestaciones_pagos_documentos
    SET status = 'anulado', updated_at = now()
    WHERE tenant_id = ${tenantId} AND id = ${documentId}
  `;
}

async function deleteSocialBenefitPaymentDocument(tenantId, id) {
  const documentId = numericId(id);
  if (!documentId) throw validationError("Documento de pago de prestaciones invalido.", 400, "PAGO_PRESTACION_INVALIDO");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const doc = await tx.$queryRaw`SELECT * FROM th_prestaciones_pagos_documentos WHERE tenant_id = ${tenantId} AND id = ${documentId} LIMIT 1`;
    if (!doc[0]) throw validationError("Documento de pago de prestaciones no encontrado.", 404, "PAGO_PRESTACION_NO_ENCONTRADO");
    if (doc[0].status === "anulado") return { ok: true, deleted: doc[0] };
    await reverseSocialBenefitPaymentDocument(tx, tenantId, documentId);
    return { ok: true, deleted: doc[0] };
  }));
}

async function listSocialBenefitPaymentDocuments(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT d.*, COUNT(l.id)::int AS lines_count
    FROM th_prestaciones_pagos_documentos d
    LEFT JOIN th_prestaciones_pagos_lineas l ON l.document_id = d.id AND l.tenant_id = d.tenant_id
    WHERE d.tenant_id = ${tenantId}
      AND (${!query.payment_type} OR d.payment_type = ${query.payment_type || ""})
      AND (${!query.status} OR d.status = ${query.status || ""})
    GROUP BY d.id
    ORDER BY d.payment_date DESC, d.created_at DESC
    LIMIT ${Math.min(Number(query.limit || 200), 500)}
  `.catch(() => []));
}

async function listPayrollPeriodClosures(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.$queryRaw`
    SELECT *
    FROM th_nomina_cierres_periodo
    WHERE tenant_id = ${tenantId}
      AND (${!query.period_key} OR period_key = ${query.period_key || ""})
    ORDER BY date_start DESC, created_at DESC
    LIMIT ${Math.min(Number(query.limit || 100), 300)}
  `.catch(() => []));
}

async function validatePayrollPeriodClosure(tenantId, input = {}) {
  const payrollValidation = await validatePayrollPeriod(tenantId, input);
  const socialPreview = await previewSocialContributions(tenantId, input);
  const issues = [...(payrollValidation.issues || [])];
  const missingAffiliations = Number(socialPreview.document?.source_summary?.missing_affiliations || 0);
  if (missingAffiliations) issues.push({ severity: "warning", code: "AFILIACIONES_APORTES_FALTANTES", message: `${missingAffiliations} linea(s) de aportes no tienen entidad afiliada activa.` });
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    period_key: payrollValidation.period_key || socialPreview.document?.period_key || null,
    issues,
    employees: payrollValidation.employees || socialPreview.document?.source_summary?.employees || 0,
    social_contributions: {
      total_ibc: socialPreview.document?.total_ibc || 0,
      total_employee: socialPreview.document?.total_employee || 0,
      total_employer: socialPreview.document?.total_employer || 0,
      total_payable: socialPreview.document?.total_payable || 0,
      missing_affiliations: missingAffiliations
    }
  };
}

async function closePayrollPeriod(tenantId, input = {}, user = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || input.tipo_periodo || "mes";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  if (input.recalculate === true || input.recalculate === "true") {
    await reopenPayrollPeriod(tenantId, { period_key: periodKey }, user);
  }
  await assertPayrollPeriodOpen(tenantId, periodKey);
  const validation = await validatePayrollPeriodClosure(tenantId, { ...input, period_key: periodKey, period_type: periodType });
  if (!validation.ok && input.force !== true) throw validationError("La validacion del cierre encontro errores bloqueantes.", 409, "CIERRE_PERIODO_INVALIDO", validation);
  const payrollResult = await runPayrollLiquidation(tenantId, { ...input, period_key: periodKey, period_type: periodType, recalculate: true }, user);
  const socialResult = await runSocialContributions(tenantId, { ...input, period_key: periodKey, period_type: periodType, recalculate: true }, user);
  const [payrollDocuments, socialDocuments] = await Promise.all([
    listPayrollDocuments(tenantId, { period_key: periodKey, limit: 1000 }),
    listSocialContributionDocuments(tenantId, { period_key: periodKey, limit: 1 })
  ]);
  const totalPayrollGross = money(payrollDocuments.reduce((sum, doc) => sum + Number(doc.gross || 0), 0));
  const totalPayrollNet = money(payrollDocuments.reduce((sum, doc) => sum + Number(doc.net || 0), 0));
  const totalProvisions = provisionTotalFromPayrollDocuments(payrollDocuments);
  const socialDocument = socialDocuments[0] || socialResult.document || null;
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      INSERT INTO th_nomina_cierres_periodo (
        tenant_id, period_key, period_type, date_start, date_end, status, payroll_documents, social_contribution_document_id,
        total_payroll_gross, total_payroll_net, total_social_contributions, total_provisions, validation_summary, source_summary, closed_by, closed_at
      )
      VALUES (
        ${tenantId}, ${periodKey}, ${periodType}, ${start}::date, ${end}::date, 'cerrado', ${payrollDocuments.length}, ${socialDocument?.id || null},
        ${totalPayrollGross}, ${totalPayrollNet}, ${Number(socialDocument?.total_payable || 0)}, ${totalProvisions}, ${JSON.stringify(validation)}::jsonb,
        ${JSON.stringify({ payroll: payrollResult, social_contributions: socialResult, steps: ["validacion", "nomina", "provisiones", "aportes_sociales", "cierre"] })}::jsonb,
        ${user?.id || null}, now()
      )
      ON CONFLICT (tenant_id, period_key)
      DO UPDATE SET status = 'cerrado', payroll_documents = EXCLUDED.payroll_documents, social_contribution_document_id = EXCLUDED.social_contribution_document_id,
        total_payroll_gross = EXCLUDED.total_payroll_gross, total_payroll_net = EXCLUDED.total_payroll_net, total_social_contributions = EXCLUDED.total_social_contributions,
        total_provisions = EXCLUDED.total_provisions, validation_summary = EXCLUDED.validation_summary, source_summary = EXCLUDED.source_summary,
        closed_by = EXCLUDED.closed_by, closed_at = now(), reopened_by = NULL, reopened_at = NULL, updated_at = now()
      RETURNING *
    `;
    return { ok: true, closure: rows[0], validation };
  });
}

async function reopenPayrollPeriod(tenantId, input = {}, user = {}) {
  const periodKey = String(input.period_key || "").trim();
  if (!periodKey) return { ok: true, reopened: false };
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      UPDATE th_nomina_cierres_periodo
      SET status = 'reabierto', reopened_by = ${user?.id || null}, reopened_at = now(), updated_at = now()
      WHERE tenant_id = ${tenantId} AND period_key = ${periodKey}
      RETURNING *
    `;
    return { ok: true, reopened: Boolean(rows[0]), closure: rows[0] || null };
  });
}

async function recalculatePayrollPeriodClosure(tenantId, input = {}, user = {}) {
  const { start, end } = periodFromRange(input);
  const periodType = input.period_type || input.tipo_periodo || "mes";
  const periodKey = input.period_key || periodKeyFromRange({ start, end, type: periodType });
  await reopenPayrollPeriod(tenantId, { period_key: periodKey }, user);
  await deletePayrollLiquidation(tenantId, { period_key: periodKey });
  const docs = await listSocialContributionDocuments(tenantId, { period_key: periodKey, limit: 20 });
  for (const doc of docs) await deleteSocialContributionDocument(tenantId, doc.id);
  return closePayrollPeriod(tenantId, { ...input, period_key: periodKey, period_type: periodType }, user);
}

async function listPayroll(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.payroll.findMany({
      where: query.period ? { period: query.period } : {},
      include: { employee: { include: { user: { select: safeUserSelect } } } },
      orderBy: { created_at: "desc" },
      take: Math.min(Number(query.limit || 100), 300)
    });
    return rows.map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      empleado: row.detail?.empleado || row.employee.metadata?.name || row.employee.user?.name || row.employee.code,
      period: row.period,
      dias_trabajados: row.days_worked,
      overtime_hrs: row.overtime_hrs,
      total_devengado: row.gross,
      deducciones: row.deductions,
      neto_pagar: row.net,
      status: row.status,
      detail: row.detail
    }));
  });
}

module.exports = {
  listSchedules,
  createSchedule,
  updateSchedule,
  getPayrollConfig,
  savePayrollConfig,
  listEmployees,
  listEmployeeOrganizationOptions,
  getCurrentEmployee,
  createEmployee,
  updateEmployee,
  listEmployeeSalaryHistory,
  createEmployeeSalaryHistory,
  listEmployeeContracts,
  createEmployeeContractAddendum,
  createEmployeeRehire,
  syncEmployeeFromContract,
  ensureEmployeeContractFoundation,
  listLaborEntities,
  listLaborEntityPartyCandidates,
  createLaborEntity,
  updateLaborEntity,
  linkLaborEntityAccountingParty,
  listEmployeeAffiliations,
  createEmployeeAffiliation,
  updateEmployeeAffiliation,
  listRoutes,
  listOwnRoutes,
  listRouteEventSummaries,
  createRoute,
  updateRoute,
  createRoutesBulk,
  prevalidateRoutes,
  routeDeletionImpact,
  deleteRoute,
  listDateAssignments,
  getPreoperationalTemplate,
  getActivePreoperationalChecklist,
  getOwnPreoperationalChecklist,
  submitPreoperationalChecklist,
  submitOwnPreoperationalChecklist,
  getPreoperationalMetrics,
  getRouteTracking,
  getOperationsMap,
  getMonitorEvidence,
  getMonitorEvidenceBatch,
  createPunch,
  createOwnPunch,
  createGpsPing,
  createOwnGpsPing,
  listActivityTypes,
  createActivityType,
  updateActivityType,
  getCurrentWorkSession,
  getOwnWorkSession,
  listWorkActivities,
  createWorkActivity,
  createOwnWorkActivity,
  listActiveGps,
  listGpsHistory,
  listAttendance,
  listOwnAttendance,
  processDay,
  listWorkdays,
  listNoveltyTypes,
  listWorkdayNovelties,
  getLaborConfiguration,
  createLaborParameter,
  updateLaborParameter,
  createLaborDeduction,
  updateLaborDeduction,
  createSurchargeConcept,
  updateSurchargeConcept,
  createPayrollConcept,
  updatePayrollConcept,
  createCalendarDay,
  updateCalendarDay,
  validatePayrollPeriod,
  previewPayrollLiquidation,
  runPayrollLiquidation,
  deletePayrollLiquidation,
  payrollConceptReport,
  benefitBalanceReport,
  payrollAuxiliaryReport,
  listPayrollDocuments,
  createPayrollAdjustment,
  importExternalWorkdays,
  deleteExternalWorkdays,
  listPayrollAdjustments,
  deletePayrollAdjustment,
  listLibranzaConcepts,
  createLibranzaConcept,
  updateLibranzaConcept,
  deleteLibranzaConcept,
  listEmployeeLibranzas,
  createEmployeeLibranza,
  updateEmployeeLibranza,
  getPayrollDocumentPdf,
  previewEmployeeTerminationLiquidation,
  runEmployeeTerminationLiquidation,
  listEmployeeTerminationLiquidations,
  listEmployeeBenefitBalances,
  deleteEmployeeTerminationLiquidation,
  getEmployeeTerminationLiquidationPdf,
  previewSocialContributions,
  runSocialContributions,
  previewSocialBenefitProvisions,
  runSocialBenefitProvisions,
  previewSocialBenefitPayments,
  runSocialBenefitPayments,
  listSocialBenefitPaymentDocuments,
  deleteSocialBenefitPaymentDocument,
  listSocialContributionDocuments,
  listSocialContributionLines,
  deleteSocialContributionDocument,
  listPayrollPeriodClosures,
  validatePayrollPeriodClosure,
  closePayrollPeriod,
  reopenPayrollPeriod,
  recalculatePayrollPeriodClosure,
  processPayrollRange,
  listPayroll
};
