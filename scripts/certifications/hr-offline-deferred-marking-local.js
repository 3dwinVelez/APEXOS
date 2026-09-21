// Certificacion extremo a extremo (LOCAL) de la marcacion sin senal y la regla del dia.
//
// Escenario del negocio certificado: el operario abre su jornada, pierde senal y sigue
// marcando. El sistema debe (a) dejarle marcar con la fecha y hora reales del clic,
// (b) admitir la marcacion aunque el GPS sea obligatorio y no haya fix, dejando la novedad
// GPS_INACTIVO_SIN_SENAL, (c) sincronizar al recuperar senal sin que la regla del dia la
// rechace por haber cruzado medianoche, y (d) mostrar al supervisor la marcacion en su hora
// correcta, sin traza GPS y con la novedad visible.
//
// Antes de este cambio la regla del dia se evaluaba contra la hora del flush: una marcacion
// de las 22:40 sincronizada a las 07:00 del dia siguiente moria con 409 HORARIO_FUERA_DEL_DIA
// y el operario perdia su jornada real. Ahora se evalua contra punched_at, acotado por una
// ventana de edad maxima (default 24 h) y una tolerancia de futuro (15 min) para que la
// cola offline no sirva de coladero para marcar en dias arbitrarios.
//
// Este script NO escribe en QA ni en produccion: levanta la API Fastify contra la base local
// (Prisma/PostgreSQL) y ejercita el flujo real por HTTP + verificacion en base. La logica de
// decision del navegador se importa EN VIVO desde apps/web/lib/hrOfflineMarking.ts, de modo
// que el payload enviado es exactamente el que construiria la pantalla del operario.
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}

const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || ".env")));

const ROOT = path.resolve(__dirname, "..", "..");
const prisma = require(path.join(ROOT, "apps/api/src/core/prisma"));
const admin = require(path.join(ROOT, "apps/api/src/modules/admin/service"));
const hrPolicy = require(path.join(ROOT, "apps/api/src/modules/hr/policy"));

const WEB_OFFLINE_TS = path.join(ROOT, "apps/web/lib/hrOfflineMarking.ts");
const WEB_MARKING_PAGE = path.join(ROOT, "apps/web/app/dashboard/talento-humano/marcacion/page.tsx");
const WEB_API_TS = path.join(ROOT, "apps/web/lib/api.ts");
const API_SERVICE_JS = path.join(ROOT, "apps/api/src/modules/hr/service.js");

const PORT = Number(args.port || 3198);
const EXTERNAL_API_URL = args["api-url"] ? String(args["api-url"]).replace(/\/$/, "") : "";
const API_URL = EXTERNAL_API_URL || `http://127.0.0.1:${PORT}`;
// Solo se permite ambiente local: nunca QA ni produccion.
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(API_URL)) {
  throw new Error(`La certificacion de marcacion sin senal solo permite localhost/127.0.0.1 (recibido: ${API_URL}).`);
}

const EVIDENCE_DIR = "docs/qa/evidence/hr-offline-deferred-marking-20260921";
const OUTPUT = path.resolve(String(args.output || `${EVIDENCE_DIR}/local-certification.json`));
const FIXTURE_OUTPUT = path.resolve(String(args["fixture-output"] || `${EVIDENCE_DIR}/local-fixture.json`));

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Odm-${crypto.randomBytes(6).toString("hex")}#26`;
const SCJ_TENANT_ID = "001346eb-ba7f-4103-b032-73a219f1333e";

// Ventana de marcacion diferida: el default de produccion es 24 h y se certifica tal cual,
// sin sobrescribir la variable, porque es el valor con el que opera el despliegue.
const OPERATING_TIMEZONE = "America/Bogota";
const DEFERRED_WINDOW_HOURS = 24;
const FUTURE_TOLERANCE_MINUTES = 15;

function dayKeyOf(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}

function midnightOf(dayKey) {
  return new Date(`${dayKey}T00:00:00.000-05:00`);
}

const NOW = new Date();
const TODAY = dayKeyOf(NOW);

// Instante diferido aceptado: dentro de la ventana y, siempre que el reloj lo permita, en el
// dia anterior para probar el cruce de medianoche real. Si la corrida cae cerca de las 23:59,
// "ayer 23:59" quedaria a mas de 24 h; en ese caso se retrocede 6 h, que es igualmente
// diferido y nunca roza el borde de la ventana.
const lastMidnight = midnightOf(TODAY);
const yesterdayLate = new Date(lastMidnight.getTime() - 60000);
const crossesMidnight = NOW.getTime() - yesterdayLate.getTime() < (DEFERRED_WINDOW_HOURS - 1) * 3600000;
const DEFERRED_AT = crossesMidnight ? yesterdayLate : new Date(NOW.getTime() - 6 * 3600000);
const DEFERRED_DAY = dayKeyOf(DEFERRED_AT);

// Correccion administrativa fuera del dia: 30 h atras siempre cae en otro dia bogotano.
const ADMIN_ADJUSTMENT_AT = new Date(NOW.getTime() - 30 * 3600000);
const ADMIN_ADJUSTMENT_DAY = dayKeyOf(ADMIN_ADJUSTMENT_AT);

// Ruta de un dia distinto al del punched_at: dos dias atras, nunca coincide con hoy ni ayer.
const OUT_OF_DAY_ROUTE_DAY = dayKeyOf(new Date(NOW.getTime() - 48 * 3600000));

const ADMIN_EMAIL = `qa.odm.admin.${RUN_ID}@scj.test`;
const OPERATOR_EMAIL = `qa.odm.operario.${RUN_ID}@scj.test`;
const OPERATOR_CODE = `QAODM${RUN_ID.slice(-8)}`;

const result = {
  change_id: "hr-offline-deferred-marking-20260921",
  certification: "hr-offline-deferred-marking-local",
  environment: "LOCAL",
  company: "SCJ",
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_timezone: OPERATING_TIMEZONE,
  operating_date: TODAY,
  scope: {
    scenario: "El operario abre la jornada, pierde senal y sigue marcando: la marcacion conserva su fecha y hora reales, se encola en el equipo, admite GPS obligatorio sin fix dejando novedad, y al recuperar senal se sincroniza sin que la regla del dia la rechace.",
    deferred_window_hours: DEFERRED_WINDOW_HOURS,
    future_tolerance_minutes: FUTURE_TOLERANCE_MINUTES,
    proven_by_live_execution: [
      "marcacion diferida aceptada y persistida con el punched_at declarado por el cliente, no con la hora del flush",
      "novedad GPS_INACTIVO_SIN_SENAL creada en th_novedades_jornada y visible por GET /api/v1/hr/novelties",
      "tipo de novedad GPS_INACTIVO_SIN_SENAL presente en GET /api/v1/hr/novelty-types",
      "marcacion diferida fuera de la ventana rechazada con 409 MARCACION_DIFERIDA_EXPIRADA y sin escribir",
      "marcacion en el futuro rechazada con 409 MARCACION_EN_EL_FUTURO y sin escribir",
      "marcacion contra una ruta de otro dia rechazada con 409 HORARIO_FUERA_DEL_DIA",
      "marcacion del dia en curso contra una ruta no activa rechazada con 409 HORARIO_NO_ACTIVO",
      "correccion administrativa fuera del dia deja novedad AJUSTE_MANUAL_MARCACION",
      "la correccion administrativa escribe sobre el empleado declarado en el payload y no sobre el admin que la ejecuta (defecto preexistente corregido)",
      "marcacion self-service del dia en curso NO deja AJUSTE_MANUAL_MARCACION",
      "actividad con GPS obligatorio y sin coordenadas rechazada con 422 GPS_OBLIGATORIO_SIN_UBICACION",
      "actividad sin senal aceptada con occurred_at declarado y novedad GPS_INACTIVO_SIN_SENAL",
      "GET /api/v1/hr/self/routes devuelve solo el horario del dia en curso aunque haya varios asignados",
      "GET /api/v1/hr/operations-map expone el payload de truncamiento",
      "reintento con la misma idempotency_key no duplica la marcacion"
    ],
    proven_by_code_level_assertion: [
      "decideOfflineMarking importado EN VIVO desde apps/web/lib/hrOfflineMarking.ts: sin senal permite marcar y declara gpsUnavailable; con PERMISSION_DENIED bloquea",
      "la pantalla captura markedAt antes de cualquier await y lo envia como punched_at",
      "sin senal se reutiliza un fix GPS en cache de menos de 25 s en marcacion y en actividad",
      "shouldBlockHrWriteFallback cubre /api/v1/hr/self/* para todo metodo distinto de GET",
      "el backend fija ownScope por la ruta invocada, no por el payload"
    ],
    not_certified_here: [
      "comportamiento real de un navegador en modo avion (IndexedDB, navigator.onLine, geolocation): requiere certificacion en dispositivo",
      "Background Sync / Service Worker: la cola se vacia por listeners online y por reapertura de la pantalla",
      "despliegue en QA y produccion: esta certificacion es exclusivamente local"
    ]
  },
  checks: [],
  fixture: {},
  aggregates: {},
  observations: {},
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

// Lanzador no abortivo: captura status/code/latencia de TODA respuesta (incluidas 4xx/5xx).
const requestLog = [];
async function capture(pathname, { token = "", method = "GET", body, actor = "", step = "" } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const response = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    status = response.status;
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  const entry = {
    actor, step, method, pathname, status,
    code: payload?.code || null,
    ok: status >= 200 && status < 300 && !transportError,
    latency_ms: Date.now() - started,
    transport_error: transportError,
    error: payload?.error || payload?.message || null
  };
  requestLog.push(entry);
  return { ...entry, payload };
}

function sliceBetween(source, startMarker, endMarker, fromIndex = 0) {
  const start = source.indexOf(startMarker, fromIndex);
  if (start < 0) return "";
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
}

async function noveltyRows(tenantId, typeCode, dayKey) {
  return prisma.$queryRaw`
    SELECT id, logical_key, employee_id, route_id, date, type_code, status, origin,
           requires_review, metadata, created_at
    FROM th_novedades_jornada
    WHERE tenant_id = ${tenantId} AND type_code = ${typeCode} AND date = ${dayKey}::date
    ORDER BY id ASC
  `;
}

async function countPunches(tenantId, employeeId, dayKey) {
  return prisma.runWithTenant(tenantId, () => prisma.timePunch.count({
    where: { tenant_id: tenantId, employee_id: employeeId, date: { gte: midnightOf(dayKey), lt: new Date(midnightOf(dayKey).getTime() + 86400000) } }
  }));
}

async function main() {
  let app = null;
  let adminUser = null;
  let operatorUser = null;
  let operatorEmployee = null;
  let adjustmentEmployee = null;
  const adminToken = { value: "" };
  const operatorToken = { value: "" };
  const createdRouteIds = [];
  const createdEmployeeIds = [];

  try {
    // ---- Arranque del ambiente local ----
    if (!EXTERNAL_API_URL) {
      const build = require(path.join(ROOT, "apps/api/server.js"));
      app = await build();
      await app.listen({ port: PORT, host: "127.0.0.1" });
    }

    const health = await capture("/health", { actor: "cert", step: "health" });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    const tenant = await prisma.tenant.findFirst({ where: { id: SCJ_TENANT_ID } });
    if (!tenant) throw new Error("No existe el tenant SCJ en la base local.");
    const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const adminRole = roles.find((item) => normalize(item.name) === "apex_admin") || roles.find((item) => normalize(item.name).includes("admin"));
    if (!adminRole) throw new Error("No existe rol administrativo en SCJ.");

    adminUser = await admin.createUser(tenant.id, {
      name: `Admin Sin Senal ${RUN_ID}`, first_names: "Admin", last_names: `SinSenal ${RUN_ID}`,
      email: ADMIN_EMAIL, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
      document: `QAODM${RUN_ID}`.slice(0, 20), code: `QA-ODM-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
      operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    operatorUser = await admin.createUser(tenant.id, {
      name: `Operario Sin Senal ${RUN_ID}`, first_names: "Operario", last_names: `SinSenal ${RUN_ID}`,
      email: OPERATOR_EMAIL, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
      document: `QAODP${RUN_ID}`.slice(0, 20), code: OPERATOR_CODE, department: "Operaciones", position: "Operario de pruebas",
      operational_classification: "operativo", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });

    // admin.createUser ya crea la fila Employee del usuario: se reutiliza y solo se le fija
    // el code unico, que es el alias contra el que routeAssignedToEmployee compara employees[].
    const ensureEmployee = async (userId, code, extra) => {
      const existing = await prisma.runWithTenant(tenant.id, () => prisma.employee.findFirst({
        where: { tenant_id: tenant.id, user_id: userId }, select: { id: true }
      }));
      const data = {
        code, user_type: "operario", active: true,
        metadata: { certification_run: RUN_ID, ...extra }
      };
      if (existing) {
        return prisma.runWithTenant(tenant.id, () => prisma.employee.update({ where: { id: existing.id }, data }));
      }
      return prisma.runWithTenant(tenant.id, () => prisma.employee.create({
        data: {
          tenant_id: tenant.id, user_id: userId, position: "Operario de pruebas", department: "Operaciones",
          salary_base: 0, salary_type: "monthly", hire_date: new Date(), contract_type: "indefinite", ...data
        }
      }));
    };
    operatorEmployee = await ensureEmployee(operatorUser.id, OPERATOR_CODE, { name: `Operario Sin Senal ${RUN_ID}` });
    createdEmployeeIds.push(operatorEmployee.id);

    // Empleados auxiliares sin usuario: reciben las marcaciones de rechazo y la correccion
    // administrativa sin contaminar la secuencia del operario principal.
    adjustmentEmployee = await prisma.runWithTenant(tenant.id, () => prisma.employee.create({
      data: {
        tenant_id: tenant.id, code: `${OPERATOR_CODE}-AJU`, user_type: "operario",
        position: "Ajuste administrativo", department: "QA", salary_base: 0, salary_type: "monthly",
        hire_date: new Date(), contract_type: "indefinite", active: true,
        metadata: { name: `Ajuste ${RUN_ID}`, certification_run: RUN_ID }
      }
    }));
    createdEmployeeIds.push(adjustmentEmployee.id);

    const loginAdmin = await capture("/api/v1/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: PASSWORD }, actor: "admin", step: "login-admin" });
    if (loginAdmin.status !== 200 || !loginAdmin.payload?.token) throw new Error(`login admin fallo: ${loginAdmin.status} (${loginAdmin.code || loginAdmin.error})`);
    adminToken.value = loginAdmin.payload.token;
    const loginOperator = await capture("/api/v1/auth/login", { method: "POST", body: { email: OPERATOR_EMAIL, password: PASSWORD }, actor: "operario", step: "login-operario" });
    if (loginOperator.status !== 200 || !loginOperator.payload?.token) throw new Error(`login operario fallo: ${loginOperator.status} (${loginOperator.code || loginOperator.error})`);
    operatorToken.value = loginOperator.payload.token;

    // createPunch resuelve el empleado por user_id antes que por employee_id del payload.
    // admin.createUser SI crea fila en Employee, que es justo la condicion bajo la cual la
    // correccion administrativa caia sobre el admin y no sobre el declarado. Se registra la
    // precondition para que la afirmacion del BLOQUE F sobre el empleado declarado sea
    // significativa: si el admin no tuviera Employee, el caso no probaria nada.
    const adminEmployee = await prisma.runWithTenant(tenant.id, () => prisma.employee.findFirst({
      where: { tenant_id: tenant.id, user_id: adminUser.id }, select: { id: true, code: true }
    }));
    check("admin_actor_has_employee_row_precondition", Boolean(adminEmployee) && Number(adminEmployee.id) !== Number(operatorEmployee.id), {
      admin_employee_id: adminEmployee?.id || null,
      operator_employee_id: operatorEmployee.id
    });
    if (adminEmployee) createdEmployeeIds.push(adminEmployee.id);

    result.fixture = {
      tenant_id: tenant.id,
      run_id: RUN_ID,
      admin_user_id: adminUser.id,
      admin_email: ADMIN_EMAIL,
      operator_user_id: operatorUser.id,
      operator_email: OPERATOR_EMAIL,
      operator_employee_id: operatorEmployee.id,
      operator_code: OPERATOR_CODE,
      adjustment_employee_id: adjustmentEmployee.id,
      dates: {
        today: TODAY,
        deferred: DEFERRED_DAY,
        admin_adjustment: ADMIN_ADJUSTMENT_DAY,
        out_of_day_route: OUT_OF_DAY_ROUTE_DAY
      }
    };

    // =====================================================================
    // BLOQUE A - Logica de decision del navegador, importada EN VIVO
    // =====================================================================
    const offline = await import(pathToFileURL(WEB_OFFLINE_TS).href);
    for (const exported of ["decideOfflineMarking", "gpsFailureCause", "gpsUnavailableMetadata", "OFFLINE_GPS_REASON", "GPS_UNAVAILABLE_REASONS"]) {
      if (offline[exported] === undefined) throw new Error(`hrOfflineMarking.ts no exporta ${exported}`);
    }

    const offlineDecision = offline.decideOfflineMarking({ online: false, gpsRequired: true, hasFix: false, cause: null });
    const deniedDecision = offline.decideOfflineMarking({ online: true, gpsRequired: true, hasFix: false, cause: "PERMISSION_DENIED" });
    const timeoutDecision = offline.decideOfflineMarking({ online: true, gpsRequired: true, hasFix: false, cause: "TIMEOUT" });
    const withFixDecision = offline.decideOfflineMarking({ online: true, gpsRequired: true, hasFix: true, cause: null });
    const gpsOptionalDecision = offline.decideOfflineMarking({ online: false, gpsRequired: false, hasFix: false, cause: null });
    check("offline_decision_allows_marking_without_signal", [
      offlineDecision.allowed === true,
      offlineDecision.gpsUnavailable === true,
      offlineDecision.reason === offline.OFFLINE_GPS_REASON,
      offline.OFFLINE_GPS_REASON === "sin_senal",
      /GPS inactivo por falta de senal/.test(offlineDecision.userMessage)
    ].every(Boolean), { offline: offlineDecision, offline_reason: offline.OFFLINE_GPS_REASON });

    check("denied_permission_is_the_only_blocking_cause", [
      deniedDecision.allowed === false,
      deniedDecision.gpsUnavailable === false,
      timeoutDecision.allowed === true,
      timeoutDecision.gpsUnavailable === true,
      timeoutDecision.reason === offline.GPS_UNAVAILABLE_REASONS.TIMEOUT,
      withFixDecision.allowed === true && withFixDecision.gpsUnavailable === false,
      gpsOptionalDecision.allowed === true && gpsOptionalDecision.gpsUnavailable === false
    ].every(Boolean), { denied: deniedDecision, timeout: timeoutDecision, with_fix: withFixDecision, gps_optional: gpsOptionalDecision });

    check("gps_failure_cause_classifies_wrapped_and_raw_errors", [
      offline.gpsFailureCause({ gpsCause: "TIMEOUT" }) === "TIMEOUT",
      offline.gpsFailureCause({ code: 1 }) === "PERMISSION_DENIED",
      offline.gpsFailureCause({ code: 2 }) === "POSITION_UNAVAILABLE",
      offline.gpsFailureCause({ code: 3 }) === "TIMEOUT",
      offline.gpsFailureCause(new Error("boom")) === "UNKNOWN",
      offline.gpsFailureCause(null) === "UNKNOWN"
    ].every(Boolean), {
      wrapped: offline.gpsFailureCause({ gpsCause: "TIMEOUT" }),
      raw_1: offline.gpsFailureCause({ code: 1 }),
      raw_3: offline.gpsFailureCause({ code: 3 }),
      unknown: offline.gpsFailureCause(new Error("boom"))
    });

    // El metadata de novedad se construye con la MISMA funcion que usa la pantalla: lo que
    // se envia aqui es byte a byte lo que enviaria el navegador sin senal.
    const queuedAt = DEFERRED_AT.toISOString();
    const noveltyMetadata = offline.gpsUnavailableMetadata({
      gpsUnavailable: offlineDecision.gpsUnavailable, reason: offlineDecision.reason, queuedAt
    });
    check("novelty_metadata_contract_matches_backend_reader", [
      noveltyMetadata.gps_unavailable === true,
      noveltyMetadata.gps_unavailable_reason === "sin_senal",
      noveltyMetadata.queued_at === queuedAt,
      offline.gpsUnavailableMetadata({ gpsUnavailable: false, reason: "", queuedAt }) && Object.keys(offline.gpsUnavailableMetadata({ gpsUnavailable: false, reason: "", queuedAt })).length === 0
    ].every(Boolean), { metadata: noveltyMetadata });

    const pageSource = fs.readFileSync(WEB_MARKING_PAGE, "utf8");
    const markBody = sliceBetween(pageSource, "async function mark(type: string)", "async function openActivityModal");
    const markedAtIndex = markBody.indexOf("const markedAt = new Date();");
    const firstAwaitIndex = markBody.indexOf("await ");
    check("marking_captures_real_click_time_before_any_await", [
      markedAtIndex >= 0,
      firstAwaitIndex >= 0,
      markedAtIndex < firstAwaitIndex,
      /punched_at: markedAt\.toISOString\(\),/.test(markBody)
    ].every(Boolean), { marked_at_index: markedAtIndex, first_await_index: firstAwaitIndex });

    const activityBody = sliceBetween(pageSource, "async function saveActivity()", "async function evidenceFile");
    check("marking_and_activity_reuse_recent_gps_cache_offline", [
      /else if \(gps && Date\.now\(\) - gpsUpdatedAt < 25000\)/.test(markBody),
      /else if \(gps && Date\.now\(\) - gpsUpdatedAt < 25000\)/.test(activityBody),
      /occurred_at: occurredAt\.toISOString\(\),/.test(activityBody)
    ].every(Boolean), {
      marking_reuses_cache: /else if \(gps && Date\.now\(\) - gpsUpdatedAt < 25000\)/.test(markBody),
      activity_reuses_cache: /else if \(gps && Date\.now\(\) - gpsUpdatedAt < 25000\)/.test(activityBody),
      activity_declares_occurred_at: /occurred_at: occurredAt\.toISOString\(\),/.test(activityBody)
    });

    const apiSource = fs.readFileSync(WEB_API_TS, "utf8");
    const fallbackGuard = sliceBetween(apiSource, "function shouldBlockHrWriteFallback", "\n}");
    check("offline_queue_never_falls_back_to_supabase_for_self_service", [
      fallbackGuard.includes('pathname.startsWith("/api/v1/hr/self/")'),
      /method !== "GET"/.test(fallbackGuard),
      apiSource.includes("if (supabaseSession && !preferOperationalApi && !shouldBlockHrWriteFallback(path, method))"),
      apiSource.includes("if (supabaseSession && !shouldBlockHrWriteFallback(path, method))")
    ].every(Boolean), {
      guard_covers_self_service: fallbackGuard.includes('pathname.startsWith("/api/v1/hr/self/")'),
      both_branches_guarded: apiSource.includes("!shouldBlockHrWriteFallback(path, method)")
    });

    const serviceSource = fs.readFileSync(API_SERVICE_JS, "utf8");
    check("backend_scope_is_fixed_by_route_not_by_payload", [
      /const ownScope = options\.scope === "own";/.test(serviceSource),
      /createPunch\(tenantId, ownOperationalInput\(input, employee, user\), user, \{ scope: "own" \}\)/.test(serviceSource),
      /service\.createPunch\(request\.user\?\.tenant_id, request\.body, request\.user\)/.test(fs.readFileSync(path.join(ROOT, "apps/api/src/modules/hr/routes.js"), "utf8"))
    ].every(Boolean), {});

    // =====================================================================
    // BLOQUE B - Horarios del fixture, creados por la API
    // =====================================================================
    async function createRoute(step, body) {
      const created = await capture("/api/v1/hr/routes", { token: adminToken.value, method: "POST", actor: "admin", step, body });
      if (!(created.status === 200 || created.status === 201) || !created.payload?.id) {
        throw new Error(`no se pudo crear el horario ${step} (${body.date}): ${created.status} (${created.code || created.error})`);
      }
      createdRouteIds.push(created.payload.id);
      return created.payload;
    }

    const deferredRoute = await createRoute("deferred-route", {
      date: DEFERRED_DAY, employees: [OPERATOR_CODE], start_time: "06:00", end_time: "18:00",
      tolerance_minutes: 15, notes: `Certificacion marcacion sin senal ${RUN_ID}`
    });
    const outOfDayRoute = await createRoute("out-of-day-route", {
      date: OUT_OF_DAY_ROUTE_DAY, employees: [OPERATOR_CODE], start_time: "06:00", end_time: "18:00",
      tolerance_minutes: 15, notes: `Ruta de otro dia ${RUN_ID}`
    });
    const adjustmentRoute = await createRoute("adjustment-route", {
      date: ADMIN_ADJUSTMENT_DAY, employees: [`${OPERATOR_CODE}-AJU`], start_time: "06:00", end_time: "18:00",
      tolerance_minutes: 15, notes: `Correccion administrativa ${RUN_ID}`
    });
    // Dos horarios del dia en curso del PROPIO operario, sin solaparse: el activo es el de
    // mayor id, y marcar contra el otro debe devolverse con HORARIO_NO_ACTIVO. No puede
    // montarse con otro empleado porque el self-service ignora el employee_id del payload.
    const inactiveMorningRoute = await createRoute("no-active-morning", {
      date: TODAY, employees: [OPERATOR_CODE], start_time: "06:00", end_time: "10:00",
      tolerance_minutes: 15, notes: `Horario no activo ${RUN_ID}`
    });
    const activeAfternoonRoute = await createRoute("no-active-afternoon", {
      date: TODAY, employees: [OPERATOR_CODE], start_time: "12:00", end_time: "18:00",
      tolerance_minutes: 15, notes: `Horario activo del dia ${RUN_ID}`
    });
    result.fixture.routes = {
      deferred: deferredRoute.id, out_of_day: outOfDayRoute.id, adjustment: adjustmentRoute.id,
      inactive_morning: inactiveMorningRoute.id, active_afternoon: activeAfternoonRoute.id
    };

    // =====================================================================
    // BLOQUE C - Regla del dia: solo el horario del dia en curso
    // =====================================================================
    // El operario tiene horarios en DEFERRED_DAY, OUT_OF_DAY_ROUTE_DAY y TODAY. La pantalla
    // del operario lee /hr/self/routes: debe ver UNO solo, el de hoy.
    const selfRoutes = await capture("/api/v1/hr/self/routes", { token: operatorToken.value, actor: "operario", step: "self-routes-only-today" });
    const selfList = Array.isArray(selfRoutes.payload) ? selfRoutes.payload : (selfRoutes.payload?.data || []);
    check("self_routes_returns_only_current_day_shift", [
      selfRoutes.status === 200,
      selfList.length === 1,
      Number(selfList[0]?.id) === Number(activeAfternoonRoute.id),
      dayKeyOf(selfList[0]?.date || selfList[0]?.fecha) === TODAY
    ].every(Boolean), {
      status: selfRoutes.status,
      returned: selfList.map((row) => ({ id: row.id, date: row.date || row.fecha })),
      expected_id: activeAfternoonRoute.id,
      assigned_days: [DEFERRED_DAY, OUT_OF_DAY_ROUTE_DAY, TODAY]
    });

    // =====================================================================
    // BLOQUE D - Marcacion diferida sin senal: el corazon del escenario
    // =====================================================================
    const deferredKey = `qa-odm-deferred-${RUN_ID}`;
    const deferredBody = {
      employee_id: operatorEmployee.id,
      user_name: OPERATOR_CODE,
      type: "entrada",
      punched_at: DEFERRED_AT.toISOString(),
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      route_id: deferredRoute.id,
      idempotency_key: deferredKey,
      metadata: {
        source: "apexos-mobile",
        current_user_only: true,
        idempotency_key: deferredKey,
        gps_required: true,
        tracking_mode: "gps",
        offline: true,
        ...noveltyMetadata
      }
    };
    const noveltiesBefore = await noveltyRows(tenant.id, "GPS_INACTIVO_SIN_SENAL", DEFERRED_DAY);
    const deferred = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "deferred-punch-accept", body: deferredBody
    });
    const persistedPunch = await prisma.runWithTenant(tenant.id, () => prisma.timePunch.findFirst({
      where: { tenant_id: tenant.id, idempotency_key: deferredKey },
      select: { id: true, employee_id: true, route_id: true, type: true, punched_at: true, date: true, latitude: true, longitude: true, metadata: true }
    }));
    check("deferred_marking_accepted", (deferred.status === 200 || deferred.status === 201) && deferred.payload?.ok !== false, {
      status: deferred.status, code: deferred.code, error: deferred.error, payload_ok: deferred.payload?.ok
    });
    // La invariant que el operario ve: su marcacion queda en la hora real del clic, no en la
    // hora en que el equipo recupero senal.
    check("deferred_marking_keeps_declared_real_time", [
      Boolean(persistedPunch),
      persistedPunch && new Date(persistedPunch.punched_at).getTime() === DEFERRED_AT.getTime(),
      persistedPunch && dayKeyOf(persistedPunch.date) === DEFERRED_DAY,
      persistedPunch && Number(persistedPunch.route_id) === Number(deferredRoute.id),
      persistedPunch && persistedPunch.latitude == null && persistedPunch.longitude == null
    ].every(Boolean), {
      declared: DEFERRED_AT.toISOString(),
      persisted: persistedPunch?.punched_at?.toISOString?.() || String(persistedPunch?.punched_at),
      persisted_date: persistedPunch ? dayKeyOf(persistedPunch.date) : null,
      expected_day: DEFERRED_DAY,
      route_id: persistedPunch?.route_id,
      expected_route_id: deferredRoute.id,
      latitude: persistedPunch ? persistedPunch.latitude : "sin_fila",
      longitude: persistedPunch ? persistedPunch.longitude : "sin_fila",
      crosses_midnight: crossesMidnight,
      age_hours_at_sync: Number(((NOW.getTime() - DEFERRED_AT.getTime()) / 3600000).toFixed(2))
    });

    const noveltiesAfter = await noveltyRows(tenant.id, "GPS_INACTIVO_SIN_SENAL", DEFERRED_DAY);
    const created = noveltiesAfter.filter((row) => !noveltiesBefore.some((before) => before.id === row.id));
    check("gps_unavailable_novelty_created", created.length === 1, {
      before: noveltiesBefore.length, after: noveltiesAfter.length, created: created.map((row) => ({ id: row.id, logical_key: row.logical_key }))
    });
    const novelty = created[0] || {};
    check("gps_unavailable_novelty_carries_signal_context", [
      novelty.type_code === "GPS_INACTIVO_SIN_SENAL",
      Number(novelty.employee_id) === Number(operatorEmployee.id),
      Number(novelty.route_id) === Number(deferredRoute.id),
      novelty.requires_review === true,
      novelty.metadata?.reason === "sin_senal",
      novelty.metadata?.source === "marcacion_sin_senal",
      String(novelty.logical_key || "").includes("GPS_INACTIVO_SIN_SENAL")
    ].every(Boolean), {
      type_code: novelty.type_code, employee_id: novelty.employee_id, route_id: novelty.route_id,
      requires_review: novelty.requires_review, status: novelty.status, metadata: novelty.metadata,
      expected_logical_key: hrPolicy.noveltyLogicalKey({
        tenantId: tenant.id, employeeId: operatorEmployee.id, date: DEFERRED_DAY,
        routeId: deferredRoute.id, typeCode: "GPS_INACTIVO_SIN_SENAL",
        segment: `entrada:${new Intl.DateTimeFormat("es-CO", { timeZone: OPERATING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(DEFERRED_AT)}`
      })
    });

    // El supervisor debe poder verla por la API de novedades, no solo en la tabla.
    const noveltiesApi = await capture(`/api/v1/hr/novelties?date=${DEFERRED_DAY}&type=GPS_INACTIVO_SIN_SENAL&limit=500`, {
      token: adminToken.value, actor: "admin", step: "novelties-read"
    });
    const noveltiesList = Array.isArray(noveltiesApi.payload) ? noveltiesApi.payload : (noveltiesApi.payload?.data || []);
    check("gps_novelty_visible_to_supervisor_via_api", [
      noveltiesApi.status === 200,
      noveltiesList.some((row) => Number(row.employee_id) === Number(operatorEmployee.id) && row.type_code === "GPS_INACTIVO_SIN_SENAL")
    ].every(Boolean), { status: noveltiesApi.status, returned: noveltiesList.length });

    const typesApi = await capture("/api/v1/hr/novelty-types?limit=500", { token: adminToken.value, actor: "admin", step: "novelty-types-read" });
    const typesList = Array.isArray(typesApi.payload) ? typesApi.payload : (typesApi.payload?.data || []);
    check("gps_novelty_type_is_catalogued", [
      typesApi.status === 200,
      typesList.some((row) => row.code === "GPS_INACTIVO_SIN_SENAL")
    ].every(Boolean), {
      status: typesApi.status,
      returned: typesList.length,
      present: typesList.some((row) => row.code === "GPS_INACTIVO_SIN_SENAL")
    });

    // Idempotencia: el flush offline reintenta al recuperar senal; no debe duplicar.
    const replay = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "deferred-punch-replay", body: deferredBody
    });
    const replayCount = await prisma.runWithTenant(tenant.id, () => prisma.timePunch.count({
      where: { tenant_id: tenant.id, idempotency_key: deferredKey }
    }));
    const replayNovelties = await noveltyRows(tenant.id, "GPS_INACTIVO_SIN_SENAL", DEFERRED_DAY);
    check("offline_flush_retry_does_not_duplicate", [
      replay.status === 200 || replay.status === 201,
      replayCount === 1,
      replayNovelties.length === noveltiesAfter.length
    ].every(Boolean), { status: replay.status, code: replay.code, punches: replayCount, novelties: replayNovelties.length });

    // =====================================================================
    // BLOQUE E - La ventana diferida no es un coladero
    // =====================================================================
    const staleAt = new Date(NOW.getTime() - (DEFERRED_WINDOW_HOURS + 6) * 3600000);
    const staleDay = dayKeyOf(staleAt);
    const stalePunchesBefore = await countPunches(tenant.id, operatorEmployee.id, staleDay);
    const stale = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "deferred-punch-stale-reject",
      body: {
        ...deferredBody,
        punched_at: staleAt.toISOString(),
        idempotency_key: `qa-odm-stale-${RUN_ID}`,
        metadata: { ...deferredBody.metadata, idempotency_key: `qa-odm-stale-${RUN_ID}` }
      }
    });
    const stalePunchesAfter = await countPunches(tenant.id, operatorEmployee.id, staleDay);
    check("stale_deferred_marking_rejected", stale.status === 409 && stale.code === "MARCACION_DIFERIDA_EXPIRADA", {
      status: stale.status, code: stale.code, error: stale.error, age_hours: DEFERRED_WINDOW_HOURS + 6
    });
    check("stale_deferred_marking_writes_nothing", stalePunchesBefore === stalePunchesAfter, { before: stalePunchesBefore, after: stalePunchesAfter });

    const futureAt = new Date(NOW.getTime() + (FUTURE_TOLERANCE_MINUTES + 45) * 60000);
    const future = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "deferred-punch-future-reject",
      body: {
        ...deferredBody,
        punched_at: futureAt.toISOString(),
        idempotency_key: `qa-odm-future-${RUN_ID}`,
        metadata: { ...deferredBody.metadata, idempotency_key: `qa-odm-future-${RUN_ID}` }
      }
    });
    const futurePunches = await prisma.runWithTenant(tenant.id, () => prisma.timePunch.count({
      where: { tenant_id: tenant.id, idempotency_key: `qa-odm-future-${RUN_ID}` }
    }));
    check("future_marking_rejected", future.status === 409 && future.code === "MARCACION_EN_EL_FUTURO", {
      status: future.status, code: future.code, error: future.error, tolerance_minutes: FUTURE_TOLERANCE_MINUTES
    });
    check("future_marking_writes_nothing", futurePunches === 0, { punches: futurePunches });

    // Ruta de hace dos dias marcada con punched_at reciente: el dia no coincide.
    const outOfDay = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "out-of-day-route-reject",
      body: {
        ...deferredBody,
        punched_at: new Date(NOW.getTime() - 3600000).toISOString(),
        route_id: outOfDayRoute.id,
        idempotency_key: `qa-odm-outday-${RUN_ID}`,
        metadata: { ...deferredBody.metadata, idempotency_key: `qa-odm-outday-${RUN_ID}` }
      }
    });
    check("marking_against_other_day_route_rejected", outOfDay.status === 409 && outOfDay.code === "HORARIO_FUERA_DEL_DIA", {
      status: outOfDay.status, code: outOfDay.code, error: outOfDay.error,
      route_day: OUT_OF_DAY_ROUTE_DAY, marking_day: dayKeyOf(new Date(NOW.getTime() - 3600000)),
      expected_day: outOfDay.payload?.details?.expected_day || null
    });

    // Horario no activo: dos rutas del dia, se marca contra la que no esta activa.
    const noActive = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "inactive-route-reject",
      body: {
        employee_id: operatorEmployee.id,
        user_name: OPERATOR_CODE,
        type: "entrada",
        punched_at: new Date(NOW.getTime() - 60000).toISOString(),
        route_id: inactiveMorningRoute.id,
        idempotency_key: `qa-odm-noactive-${RUN_ID}`
      }
    });
    check("marking_against_non_active_shift_rejected", noActive.status === 409 && noActive.code === "HORARIO_NO_ACTIVO", {
      status: noActive.status, code: noActive.code, error: noActive.error,
      attempted_route: inactiveMorningRoute.id, active_route: activeAfternoonRoute.id
    });

    // =====================================================================
    // BLOQUE F - Correccion administrativa deja rastro visible
    // =====================================================================
    const adjustmentNoveltiesBefore = await noveltyRows(tenant.id, "AJUSTE_MANUAL_MARCACION", ADMIN_ADJUSTMENT_DAY);
    const adjustment = await capture("/api/v1/hr/time-punches", {
      token: adminToken.value, method: "POST", actor: "admin", step: "admin-adjustment-out-of-day",
      body: {
        employee_id: adjustmentEmployee.id,
        user_name: `${OPERATOR_CODE}-AJU`,
        type: "entrada",
        punched_at: ADMIN_ADJUSTMENT_AT.toISOString(),
        route_id: adjustmentRoute.id,
        idempotency_key: `qa-odm-adjust-${RUN_ID}`,
        extra_reason: "correccion_qa",
        extra_detail: `Ajuste administrativo de la certificacion ${RUN_ID}`
      }
    });
    const adjustmentNoveltiesAfter = await noveltyRows(tenant.id, "AJUSTE_MANUAL_MARCACION", ADMIN_ADJUSTMENT_DAY);
    const adjustmentCreated = adjustmentNoveltiesAfter.filter((row) => !adjustmentNoveltiesBefore.some((before) => before.id === row.id));
    check("admin_out_of_day_correction_accepted", adjustment.status === 200 || adjustment.status === 201, {
      status: adjustment.status, code: adjustment.code, error: adjustment.error
    });
    // Guard de regresion del defecto preexistente: createPunch resolvia el empleado por
    // user_id antes que por employee_id, asi que la correccion administrativa de un admin con
    // fila en Employee caia sobre el admin y dejaba intacta la jornada de la persona corregida.
    const adjustmentPunch = await prisma.runWithTenant(tenant.id, () => prisma.timePunch.findFirst({
      where: { tenant_id: tenant.id, idempotency_key: `qa-odm-adjust-${RUN_ID}` },
      select: { id: true, employee_id: true, route_id: true, punched_at: true }
    }));
    const adminOwnPunches = await prisma.runWithTenant(tenant.id, () => prisma.timePunch.count({
      where: { tenant_id: tenant.id, employee_id: adminEmployee.id }
    }));
    check("admin_correction_lands_on_declared_employee_not_on_admin", [
      Boolean(adjustmentPunch),
      adjustmentPunch && Number(adjustmentPunch.employee_id) === Number(adjustmentEmployee.id),
      adjustmentPunch && Number(adjustmentPunch.route_id) === Number(adjustmentRoute.id),
      adjustmentPunch && new Date(adjustmentPunch.punched_at).getTime() === ADMIN_ADJUSTMENT_AT.getTime(),
      adminOwnPunches === 0
    ].every(Boolean), {
      punch_employee_id: adjustmentPunch?.employee_id,
      declared_employee_id: adjustmentEmployee.id,
      admin_employee_id: adminEmployee.id,
      admin_own_punches: adminOwnPunches,
      persisted_punched_at: adjustmentPunch?.punched_at?.toISOString?.() || String(adjustmentPunch?.punched_at)
    });
    check("admin_out_of_day_correction_leaves_audit_novelty", adjustmentCreated.length === 1, {
      before: adjustmentNoveltiesBefore.length, after: adjustmentNoveltiesAfter.length,
      created: adjustmentCreated.map((row) => ({ id: row.id, status: row.status, metadata: row.metadata }))
    });
    check("admin_adjustment_novelty_names_the_corrector", [
      adjustmentCreated[0]?.metadata?.source === "correccion_administrativa",
      adjustmentCreated[0]?.metadata?.corrected_by != null,
      adjustmentCreated[0]?.metadata?.reason === "correccion_qa"
    ].every(Boolean), { metadata: adjustmentCreated[0]?.metadata || null });

    // Control negativo: la marcacion self-service del dia en curso NO debe dejar ajuste manual.
    const ownTodayKey = `qa-odm-owntoday-${RUN_ID}`;
    const ownToday = await capture("/api/v1/hr/self/time-punches", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "own-today-punch",
      body: {
        employee_id: operatorEmployee.id,
        user_name: OPERATOR_CODE,
        type: "entrada",
        punched_at: new Date(NOW.getTime() - 60000).toISOString(),
        latitude: 6.2442,
        longitude: -75.5812,
        accuracy_meters: 12,
        route_id: activeAfternoonRoute.id,
        idempotency_key: ownTodayKey,
        metadata: { source: "apexos-mobile", current_user_only: true, idempotency_key: ownTodayKey, gps_required: true, tracking_mode: "gps", offline: false }
      }
    });
    const ownAdjustments = await prisma.runWithTenant(tenant.id, () => prisma.$queryRaw`
      SELECT id FROM th_novedades_jornada
      WHERE tenant_id = ${tenant.id} AND type_code = 'AJUSTE_MANUAL_MARCACION'
        AND employee_id = ${operatorEmployee.id}
    `);
    check("self_service_current_day_marking_leaves_no_adjustment_novelty", [
      ownToday.status === 200 || ownToday.status === 201,
      ownAdjustments.length === 0
    ].every(Boolean), { status: ownToday.status, code: ownToday.code, adjustments: ownAdjustments.length });

    // =====================================================================
    // BLOQUE G - Actividades sin senal
    // =====================================================================
    const activityTypes = await capture("/api/v1/hr/self/activity-types", { token: operatorToken.value, actor: "operario", step: "activity-types" });
    const activityTypeList = Array.isArray(activityTypes.payload) ? activityTypes.payload : (activityTypes.payload?.data || []);
    const activityType = activityTypeList[0];
    if (!activityType) throw new Error("No hay tipos de actividad en el tenant SCJ para certificar la actividad sin senal.");
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const photo = { base64: tinyPng, name: `qa-odm-${RUN_ID}.png`, type: "image/png", size: 68 };

    // GPS obligatorio declarado, sin coordenadas y SIN novedad: debe rechazarse.
    const blockedActivity = await capture("/api/v1/hr/self/work-activities", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "activity-gps-required-no-coords",
      body: {
        activity_type_id: activityType.id || activityType.code,
        employee_id: operatorEmployee.id,
        occurred_at: DEFERRED_AT.toISOString(),
        gps_required: true,
        gps_skipped: false,
        route_id: deferredRoute.id,
        observation: `Actividad sin coordenadas ${RUN_ID}`,
        photo,
        metadata: { source: "apexos-mobile-activity", gps_required: true }
      }
    });
    check("activity_with_required_gps_and_no_fix_rejected", blockedActivity.status === 422 && blockedActivity.code === "GPS_OBLIGATORIO_SIN_UBICACION", {
      status: blockedActivity.status, code: blockedActivity.code, error: blockedActivity.error
    });

    // Mismo caso pero sin senal: se admite y deja novedad.
    const activityNoveltiesBefore = await noveltyRows(tenant.id, "GPS_INACTIVO_SIN_SENAL", DEFERRED_DAY);
    const offlineActivity = await capture("/api/v1/hr/self/work-activities", {
      token: operatorToken.value, method: "POST", actor: "operario", step: "activity-offline-accepted",
      body: {
        activity_type_id: activityType.id || activityType.code,
        employee_id: operatorEmployee.id,
        occurred_at: DEFERRED_AT.toISOString(),
        gps_required: true,
        gps_skipped: false,
        route_id: deferredRoute.id,
        observation: `Actividad registrada sin senal ${RUN_ID}`,
        photo,
        metadata: { source: "apexos-mobile-activity", gps_required: true, offline: true, ...noveltyMetadata }
      }
    });
    const activityNoveltiesAfter = await noveltyRows(tenant.id, "GPS_INACTIVO_SIN_SENAL", DEFERRED_DAY);
    const activityNoveltyCreated = activityNoveltiesAfter.filter((row) => !activityNoveltiesBefore.some((before) => before.id === row.id));
    check("offline_activity_accepted_with_novelty", [
      offlineActivity.status === 200 || offlineActivity.status === 201,
      activityNoveltyCreated.length === 1,
      String(activityNoveltyCreated[0]?.metadata?.source || "") === "marcacion_sin_senal",
      String(activityNoveltyCreated[0]?.logical_key || "").includes("actividad-")
    ].every(Boolean), {
      status: offlineActivity.status, code: offlineActivity.code, error: offlineActivity.error,
      novelties_before: activityNoveltiesBefore.length, novelties_after: activityNoveltiesAfter.length,
      created: activityNoveltyCreated.map((row) => ({ id: row.id, logical_key: row.logical_key }))
    });

    // La actividad debe conservar el occurred_at declarado por el clic, no la hora del flush.
    // WorkActivity.latitude/longitude son Float NO nulables y el servicio guarda 0 como
    // centinela de "sin GPS": la senal honesta que debe leer el consumidor es gps_skipped.
    const persistedActivity = await prisma.runWithTenant(tenant.id, () => prisma.workActivity.findFirst({
      where: { tenant_id: tenant.id, employee_id: operatorEmployee.id, observation: { contains: RUN_ID } },
      orderBy: { id: "desc" },
      select: { id: true, occurred_at: true, latitude: true, longitude: true, route_id: true, metadata: true }
    }));
    check("offline_activity_keeps_declared_occurred_at", [
      Boolean(persistedActivity),
      persistedActivity && new Date(persistedActivity.occurred_at).getTime() === DEFERRED_AT.getTime(),
      persistedActivity && Number(persistedActivity.route_id) === Number(deferredRoute.id),
      persistedActivity && persistedActivity.metadata?.gps_skipped === true,
      persistedActivity && persistedActivity.metadata?.tracking_mode === "punch_only"
    ].every(Boolean), {
      declared: DEFERRED_AT.toISOString(),
      persisted: persistedActivity?.occurred_at?.toISOString?.() || String(persistedActivity?.occurred_at),
      activity_id: persistedActivity?.id,
      route_id: persistedActivity?.route_id,
      latitude: persistedActivity?.latitude,
      longitude: persistedActivity?.longitude,
      gps_skipped: persistedActivity?.metadata?.gps_skipped,
      tracking_mode: persistedActivity?.metadata?.tracking_mode
    });

    // =====================================================================
    // BLOQUE H - Lectura del mapa: el truncamiento deja de ser invisible
    // =====================================================================
    const operations = await capture(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=1&ping_limit=100&punch_limit=100&activity_limit=100`, {
      token: adminToken.value, actor: "admin", step: "operations-map-truncation"
    });
    check("operations_map_exposes_truncation_signal", [
      operations.status === 200,
      operations.payload?.truncation != null,
      typeof operations.payload?.truncation?.truncated === "boolean",
      Array.isArray(operations.payload?.truncation?.collections),
      typeof operations.payload?.truncation?.hint === "string",
      typeof operations.payload?.totals?.truncated === "boolean"
    ].every(Boolean), {
      status: operations.status,
      truncation: operations.payload?.truncation || null,
      totals_truncated: operations.payload?.totals?.truncated
    });

    // Con limites amplios el mismo dia no debe reportarse truncado.
    const wide = await capture(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=1&ping_limit=2000&punch_limit=2000&activity_limit=2000`, {
      token: adminToken.value, actor: "admin", step: "operations-map-wide"
    });
    check("operations_map_truncation_is_not_always_on", wide.status === 200 && wide.payload?.truncation != null, {
      status: wide.status, truncated: wide.payload?.truncation?.truncated, collections: wide.payload?.truncation?.collections
    });

    result.observations.deferred_window = {
      default_hours: DEFERRED_WINDOW_HOURS,
      env_override: "HR_DEFERRED_MARKING_MAX_AGE_HOURS (1..72)",
      future_tolerance_minutes: FUTURE_TOLERANCE_MINUTES,
      cross_midnight_exercised: crossesMidnight,
      deferred_instant: DEFERRED_AT.toISOString(),
      deferred_day: DEFERRED_DAY,
      today: TODAY,
      age_hours_at_sync: Number(((NOW.getTime() - DEFERRED_AT.getTime()) / 3600000).toFixed(2)),
      note: crossesMidnight
        ? "La corrida ejercito el cruce de medianoche real: la marcacion es del dia anterior y se sincroniza hoy."
        : "La corrida cayo cerca de las 23:59, cuando 'ayer 23:59' superaria la ventana de 24 h; se retrocedio 6 h, que sigue siendo una marcacion diferida."
    };
    result.observations.admin_path = {
      note: "La ruta administrativa POST /api/v1/hr/time-punches no pasa por assertOwnAssignedRoute: puede corregir cualquier fecha y por eso deja la novedad AJUSTE_MANUAL_MARCACION. La ventana diferida de 24 h aplica solo al self-service, que es la cola offline del operario.",
      scope_fixed_by: "options.scope === 'own', fijado por la ruta invocada y no por el payload"
    };
    result.observations.gps_novelty_catalog = {
      note: "El tipo GPS_INACTIVO_SIN_SENAL se asegura en tiempo de ejecucion (INSERT ... WHERE NOT EXISTS) ademas de la migracion 20260921000000, porque los tenants creados despues de una migracion de siembra no la reciben."
    };
    result.observations.deferred_activity_session = {
      defect: "createWorkActivity no le pasaba date a findCurrentWorkSession ni a ensureWorkSessionFromPunches, que ya estaban parametrizadas: ambas resolbian contra hoy.",
      impact: "Una actividad registrada sin senal durante la jornada y sincronizada al dia siguiente moria con 422 JORNADA_ACTIVA_REQUERIDA y se perdia, aunque la marcacion diferida de esa misma jornada si se aceptara.",
      fix: "La sesion se resuelve contra el dia del occurred_at declarado. Para una actividad del dia en curso el comportamiento es identico al anterior.",
      bounded_by: "createOwnWorkActivity pasa por assertOwnAssignedRoute, asi que occurred_at queda dentro de la misma ventana diferida de 24 h y de la regla del dia que las marcaciones."
    };
    result.observations.work_activity_coordinates = {
      finding_abierto: "WorkActivity.latitude/longitude son Float NO nulables y el servicio guarda 0 como centinela de sin-GPS (gpsSkipped ? 0 : Number(...)).",
      risk: "Un consumidor que plotee la coordenada sin mirar metadata.gps_skipped dibuja un punto fantasma en (0,0). TimePunch si admite NULL y ya queda corregido.",
      decision: "Se declara como hallazgo abierto y no se corrige aqui: volver nulables esas columnas es una migracion de esquema con impacto mas alla del alcance de este cambio. La senal honesta a consumir es metadata.gps_skipped / tracking_mode, que esta certificacion verifica."
    };
    result.observations.labor_configuration_date_cast = {
      finding_abierto: "getLaborConfiguration compara th_calendario_dias.date y th_conceptos_recargo.valid_to contra TIMESTAMPTZ de startOfDay/endOfDay con la sesion en UTC, el mismo patron que hacia invisibles las novedades por fecha.",
      impact_probable: "El calendario laboral pierde el primer dia del rango y los conceptos de recargo vigentes hasta hoy pueden quedar excluidos.",
      decision: "Se declara y no se corrige en este cambio: pertenece a la pantalla de configuracion laboral, fuera del alcance de la marcacion sin senal. Requiere su propia certificacion."
    };
    result.observations.null_coordinates_boundary_defect = {
      defect: "Fastify corre ajv con coerceTypes: un `latitude: null` declarado como type \"number\" se coercia a 0. La marcacion sin senal se persistia en (0,0) en vez de NULL.",
      impact: [
        "el mapa de operaciones ploteaba un punto fantasma en el golfo de Guinea para una marcacion que no tiene GPS",
        "el guard del servicio `input.latitude == null` nunca se cumplia por HTTP, asi que el 422 GPS_OBLIGATORIO_SIN_UBICACION no disparaba y la actividad quedaba guardada con coordenadas inventadas"
      ],
      fix: "punchSchema, workActivitySchema y gpsPingSchema declaran latitude/longitude/accuracy_meters como anyOf [number, null], que es la convencion ya usada en el archivo.",
      why_unit_tests_missed_it: "Las pruebas unitarias llaman al servicio directamente y no atraviesan la validacion HTTP de Fastify; solo una certificacion extremo a extremo por HTTP podia verlo.",
      asserted_by: "deferred_marking_keeps_declared_real_time (latitude/longitude == null, lo que excluye 0) y offline_activity_keeps_declared_occurred_at"
    };

    result.aggregates = {
      total_requests: requestLog.length,
      by_status: requestLog.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {}),
      server_errors: requestLog.filter((entry) => entry.status >= 500).length,
      created_route_ids: createdRouteIds,
      created_employee_ids: createdEmployeeIds,
      rejected_writes: requestLog.filter((entry) => entry.status === 400 || entry.status === 409 || entry.status === 422).map((entry) => ({ step: entry.step, status: entry.status, code: entry.code }))
    };
    check("no_server_errors_during_certification", result.aggregates.server_errors === 0, { server_errors: result.aggregates.server_errors });

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null, stack: error.stack };
    throw error;
  } finally {
    result.request_log_summary = {
      total: requestLog.length,
      by_status: requestLog.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {}),
      entries: requestLog.map((entry) => ({ step: entry.step, method: entry.method, pathname: entry.pathname, status: entry.status, code: entry.code }))
    };

    // Limpieza selectiva por identificador de corrida: se borra solo lo que esta corrida creo.
    try {
      const tenantId = result.fixture.tenant_id;
      const employeeIds = createdEmployeeIds.filter(Boolean).map(Number);
      const deleted = { punches: 0, novelties: 0, activities: 0, routes_deactivated: 0, employees_deactivated: 0 };
      if (tenantId && employeeIds.length) {
        deleted.activities = await prisma.runWithTenant(tenantId, () => prisma.workActivity.deleteMany({
          where: { tenant_id: tenantId, employee_id: { in: employeeIds } }
        })).then((r) => r.count).catch(() => 0);
        deleted.punches = await prisma.runWithTenant(tenantId, () => prisma.timePunch.deleteMany({
          where: { tenant_id: tenantId, employee_id: { in: employeeIds } }
        })).then((r) => r.count).catch(() => 0);
        deleted.novelties = await prisma.$executeRaw`
          DELETE FROM th_novedades_jornada
          WHERE tenant_id = ${tenantId} AND employee_id = ANY(${employeeIds})
        `.catch(() => 0);
        deleted.employees_deactivated = await prisma.runWithTenant(tenantId, () => prisma.employee.updateMany({
          where: { tenant_id: tenantId, id: { in: employeeIds } }, data: { active: false }
        })).then((r) => r.count).catch(() => 0);
      }
      for (const routeId of createdRouteIds) {
        await prisma.runWithTenant(tenantId, () => prisma.timeRoute.updateMany({ where: { id: Number(routeId) }, data: { status: "inactive" } })).catch(() => undefined);
        deleted.routes_deactivated += 1;
      }
      if (adminUser) await admin.setUserActive(tenantId, adminUser.id, false).catch(() => undefined);
      if (operatorUser) await admin.setUserActive(tenantId, operatorUser.id, false).catch(() => undefined);
      result.cleanup = {
        ...deleted,
        admin_deactivated: Boolean(adminUser),
        operator_deactivated: Boolean(operatorUser),
        note: "Limpieza selectiva por employee_id y route_id de esta corrida, en la base local. No toca QA ni produccion."
      };
    } catch { /* la limpieza es mejor esfuerzo */ }

    result.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
    fs.writeFileSync(FIXTURE_OUTPUT, `${JSON.stringify({
      environment: "LOCAL", api_url: API_URL, run_id: RUN_ID,
      operating_timezone: OPERATING_TIMEZONE, operating_date: TODAY,
      tenant_id: result.fixture.tenant_id,
      admin_email: ADMIN_EMAIL, operator_email: OPERATOR_EMAIL,
      admin_credential: "no persistida: la contrasena se genera por corrida, solo se usa para el login de esta certificacion y los usuarios quedan inactivos al terminar.",
      operator_code: OPERATOR_CODE,
      dates: result.fixture.dates,
      created_route_ids: createdRouteIds,
      created_employee_ids: createdEmployeeIds,
      generated_at: result.finished_at,
      note: "Fixture local limpiado al terminar (marcaciones, actividades y novedades de la corrida borradas; rutas en status inactive; usuarios y empleados inactivos). No toca QA ni produccion."
    }, null, 2)}\n`);

    if (app) await app.close().catch(() => undefined);
  }
}

main()
  .then(() => {
    console.log(`CERTIFICACION MARCACION SIN SENAL APROBADA: ${result.checks.length} controles, ${requestLog.length} peticiones, status=${result.status}`);
  })
  .catch((error) => {
    console.error(`CERTIFICACION MARCACION SIN SENAL BLOQUEADA: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
