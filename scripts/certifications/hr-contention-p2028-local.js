// Certificacion extremo a extremo (LOCAL) de la contencion REAL en las tres escrituras
// concurrentes de Talento Humano que quedaron con el mismo riesgo del incidente P2028:
// marcacion, kilometraje de jornada y ajuste de nomina (novedades IBC).
//
// Defecto que se cierra (heredado de POST /hr/routes, produccion 2026-10-26):
// esas escrituras esperaban su advisory lock con pg_advisory_xact_lock (bloqueante, sin
// aviso) dentro de transacciones cuyo presupuesto no lo soportaba. Al expirar, Prisma
// abortaba la transaccion y el operario recibia 500 ERROR_INTERNO con P2028
// "Transaction not found": la plataforma "se bloqueaba" sin decirle a nadie que solo
// habia que esperar unos segundos. En el ajuste de nomina la transaccion ni siquiera
// declaraba presupuesto (5s por defecto de Prisma).
//
// Correccion certificada:
//  1. acquireBoundedScopeLocks: pg_try_advisory_xact_lock con deadline compartido (15s)
//     y reintento de 200ms; al agotarse rinde un 503 con codigo propio, nunca un 500.
//  2. createPunch (marcacion y kilometraje) pasa ese deadline y conserva su presupuesto
//     { maxWait: 10s, timeout: 20s }.
//  3. createPayrollAdjustment declara PAYROLL_ADJUSTMENT_TRANSACTION_OPTIONS
//     { maxWait: 5s, timeout: 30s } y su propio deadline.
//  4. server.js mapea TODO 503 con codigo a un fallo controlado (no solo los conocidos),
//     asi un codigo nuevo no degrada a 500 generico.
//
// Este script NO escribe en QA ni en produccion: levanta la API Fastify contra la base
// local y ejercita los flujos reales por HTTP, sosteniendo el advisory lock desde una
// conexion PostgreSQL independiente (la misma primitiva que provoco el incidente).
//
// Chequeos:
//  A. nivel de codigo: helper try-lock, presupuestos declarados, regla 503 general.
//  B. marcacion bajo contencion REAL 18s: 503 MARCACION_CONCURRENCIA_TEMPORAL, cero
//     marcaciones escritas, con request_id y mensaje accionable.
//  C. marcacion con el lock liberado a los 7s (derriba del viejo limite de 5s del
//     operario, por encima del default de Prisma): 200 y la marcacion queda persistida.
//  D. kilometraje de ruta vehicular bajo contencion REAL: 503 con codigo y la salida NO
//     persiste (la transaccion se revuelve integra: ni marcacion ni renglon de kilometraje).
//  E. control positivo del kilometraje: liberado el lock, la salida guarda y el renglon
//     activo de th_jornada_kilometrajes queda con el valor reportado.
//  F. ajuste de nomina bajo contencion REAL: 503 AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL y
//     cero renglones en th_nomina_ajustes.
//  G. control positivo del ajuste: liberado el lock, el ajuste se guarda y es visible.
//  H. la serializacion no se rompio: dos marcaciones concurrentes al mismo empleado/dia
//     producen 200 + 409 MARCACION_FUERA_DE_SECUENCIA con UNA sola marcacion (el
//     reintento con try-lock no duplica registros).
//  I. Ningun 500, ningun P2028 y ninguna caida de backend durante todo el flujo.
//  J. Suites unitarios versionados de API y Web en verde.
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || ".env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const WEB = path.join(ROOT, "apps/web");

const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

const HR_SERVICE = path.join(API, "src/modules/hr/service.js");
const SERVER = path.join(API, "server.js");
const WEB_API = path.join(WEB, "lib/api.ts");

const PORT = Number(args.port || 3212);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 60000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-contention-p2028-20261026/local-certification.json"));
const FIXTURE_OUTPUT = path.resolve(String(args["fixture-output"] || "docs/qa/evidence/hr-contention-p2028-20261026/local-fixture.json"));

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Cnt-${crypto.randomBytes(6).toString("hex")}#26`;
const CERT_ID = "hr-contention-p2028-20261026";
const CODE_PREFIX = "QA-CNT-";
const EMAIL_PREFIX = "qa.cnt28.";

// Constantes del fix (apps/api/src/modules/hr/service.js)
const CONTENTION_DEADLINE_MS = 15_000; // contentionLockWaitMs
const HOLD_OVER_DEADLINE_MS = 18_000; // sostiene el lock mas alla del deadline -> 503
const HOLD_BUDGETED_MS = 7_000; // por encima del viejo default de 5s, dentro del deadline
const LEADER_DELAY_MS = 400; // margen para que el titular tome el lock antes del POST

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PERIOD_KEY = `mensual:${TODAY.slice(0, 8)}01:${TODAY.slice(0, 8)}31`;
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];

const result = {
  change_id: CERT_ID,
  certification: "hr-contention-p2028-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_date: TODAY,
  payroll_period_key: PERIOD_KEY,
  scope: {
    defect:
      "Marcacion, kilometraje de jornada y ajuste de nomina esperaban su advisory lock con pg_advisory_xact_lock bloqueante: al agotarse el presupuesto de la transaccion, Prisma abortaba y el operario veia 500 ERROR_INTERNO con P2028 ('Backend no disponible') sin que se le dijera que solo debia esperar unos segundos.",
    product_decision:
      "No se cambio ninguna regla de negocio ni el alcance del lock: la serializacion por empleado/dia, por ruta/kilometraje y por empleado/IBC sigue siendo la misma. Solo se sustituyo el lock bloqueante por un try-lock con deadline compartido que rinde un 503 con codigo reintentable, y se declaro presupuesto explicito en el ajuste de nomina.",
    proven_by_live_execution: [
      "contencion real de 18s sobre el scope de marcacion: 503 MARCACION_CONCURRENCIA_TEMPORAL con request_id, cero marcaciones escritas",
      "lock de marcacion liberado a los 7s (el viejo default de 5s de Prisma): 200 y la marcacion queda persistida",
      "contencion real sobre el scope de kilometraje de ruta vehicular: 503 con codigo y la salida no persiste ni marcacion ni renglon de kilometraje",
      "kilometraje liberado: la salida guarda y el renglon activo de th_jornada_kilometrajes queda con el valor reportado",
      "contencion real sobre el scope hr-ibc-adjustment: 503 AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL y cero renglones en th_nomina_ajustes",
      "ajuste de nomina sin contencion: se guarda y es devuelto por GET /talento-humano/nomina/ajustes (la ruta que usa la pantalla de nomina)",
      "dos marcaciones concurrentes del mismo empleado/dia: 200 + 409 MARCACION_FUERA_DE_SECUENCIA con una sola marcacion persistida",
      "ningun request del flujo certificado responde 500 ni P2028"
    ],
    proven_by_code_level_assertion: [
      "acquireBoundedScopeLocks usa pg_try_advisory_xact_lock con deadline y reintento acotado; ya no queda pg_advisory_xact_lock bloqueante en el servicio",
      "createPunch pasa punchLockDeadlineAt al scope de marcacion y al de kilometraje, ambos con codigo MARCACION_CONCURRENCIA_TEMPORAL",
      "createPayrollAdjustment cierra con PAYROLL_ADJUSTMENT_TRANSACTION_OPTIONS y su propio deadline AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL",
      "server.js mapea todo 503 con codigo a fallo controlado (un codigo nuevo no cae al 500 generico)",
      "apps/web/lib/api.ts lista los tres codigos como reintentables para el mensaje amable del operario"
    ],
    proven_by_versioned_unit_suites: [
      "apps/api/test/hr-marking-concurrency.test.js",
      "apps/api/test/hr-marking-kilometraje-conflict.test.js",
      "apps/api/test/hr-payroll-adjustment-lock.test.js",
      "apps/api/test/hr-deferred-marking-offline.test.js",
      "apps/api/test/hr-marking-declared-employee.test.js",
      "apps/web/test/hr-route-write-feedback.test.mjs",
      "apps/web/test/hr-contention-write-feedback.test.mjs"
    ]
  },
  checks: [],
  fixture: {},
  observations: {},
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail)}`);
}

const requestLog = [];
async function capture(pathname, { token = "", method = "GET", body, step = "" } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  const entry = {
    step, method, pathname, status,
    code: payload?.code || null,
    request_id: payload?.request_id || null,
    latency_ms: Date.now() - started,
    transport_error: transportError,
    error: payload?.error || payload?.message || null
  };
  requestLog.push(entry);
  return { ...entry, payload };
}

function currentCommit() {
  try {
    return { commit: require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: ROOT }).trim() };
  } catch (error) {
    return { commit: "unknown", error: error.message };
  }
}

// Mismo ambito que calcula el servicio (startOfDay America/Bogota = 05:00Z).
function punchScope(tenantId, employeeId, routeId, dayISO = TODAY) {
  return `${tenantId}:${employeeId}:${routeId || "sin-horario"}:${dayISO}T05:00:00.000Z`;
}
function mileageScope(tenantId, routeId, employeeId) {
  return `${tenantId}:kilometraje:${routeId}:${employeeId}`;
}
function payrollScope(tenantId, employeeId) {
  return `hr-ibc-adjustment:${tenantId}:${employeeId}`;
}

// Sostiene el advisory lock desde una conexion independiente durante holdMs: la misma
// primitiva que provoco el incidente, pero del lado del otro escritor.
async function holdScope(scope, holdMs) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
    await tx.$executeRaw`SELECT pg_sleep(${holdMs / 1000}::double precision)`;
    return true;
  }, { maxWait: 5_000, timeout: holdMs + 30_000 });
}

async function countPunches(tenantId, employeeId) {
  return prisma.runWithTenant(tenantId, () => prisma.timePunch.count({ where: { tenant_id: tenantId, employee_id: employeeId } }));
}
async function activeMileageRow(tenantId, employeeId) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      SELECT id, value, unit, route_id FROM th_jornada_kilometrajes
      WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND active = true
      ORDER BY id DESC LIMIT 1
    `;
    return rows?.[0] || null;
  });
}
async function countAdjustments(tenantId, employeeId) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS total FROM th_nomina_ajustes
      WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND status = 'activo'
    `;
    return Number(rows?.[0]?.total || 0);
  });
}

// Desarma el arbol operativo del empleado de certificacion (sesiones -> actividades ->
// marcaciones -> jornales -> novedades -> kilometraje -> ajustes -> ficha).
async function purgeCertificationEmployee(tenantId, employeeId) {
  const summary = { errors: [] };
  await prisma.runWithTenant(tenantId, async () => {
    const sessions = await prisma.workSession.findMany({ where: { tenant_id: tenantId, employee_id: employeeId }, select: { id: true } });
    const sessionIds = sessions.map((item) => item.id);
    if (sessionIds.length) {
      await prisma.workActivity.deleteMany({ where: { tenant_id: tenantId, session_id: { in: sessionIds } } }).catch((e) => summary.errors.push(`activities: ${e.message}`));
    }
    await prisma.workSession.deleteMany({ where: { tenant_id: tenantId, employee_id: employeeId } }).catch((e) => summary.errors.push(`sessions: ${e.message}`));
    await prisma.timePunch.deleteMany({ where: { tenant_id: tenantId, employee_id: employeeId } }).catch((e) => summary.errors.push(`punches: ${e.message}`));
    await prisma.processedWorkday.deleteMany({ where: { tenant_id: tenantId, employee_id: employeeId } }).catch((e) => summary.errors.push(`workdays: ${e.message}`));
    for (const sql of [
      `DELETE FROM th_novedades_jornada WHERE tenant_id = $1 AND employee_id = $2`,
      `DELETE FROM th_jornada_kilometrajes WHERE tenant_id = $1 AND employee_id = $2`,
      `DELETE FROM th_nomina_ajustes WHERE tenant_id = $1 AND employee_id = $2`
    ]) {
      await prisma.$executeRawUnsafe(sql, tenantId, employeeId).catch((e) => summary.errors.push(`${sql.split(" ")[2]}: ${e.message}`));
    }
    await prisma.employee.delete({ where: { id: employeeId } }).catch((e) => summary.errors.push(`employee: ${e.message}`));
  });
  return summary;
}

function modulesOf(tenant) {
  return Array.isArray(tenant.active_modules) ? tenant.active_modules.map((code) => String(code || "").trim().toLowerCase()) : [];
}

async function main() {
  let app = null;
  const cleanup = { tenantId: null, userId: null, roleId: null, employeeIds: [], routeIds: [] };
  try {
    // ---- A. Arranque + nivel de codigo ----
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });
    result.api_commit = currentCommit().commit;

    const health = await capture("/health", { step: "health" });
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit, health_commit: health.payload?.commit || null });

    const serviceSrc = fs.readFileSync(HR_SERVICE, "utf8");
    const serverSrc = fs.readFileSync(SERVER, "utf8");
    const webApiSrc = fs.readFileSync(WEB_API, "utf8");
    const helperStart = serviceSrc.indexOf("async function acquireBoundedScopeLocks");
    const helperEnd = serviceSrc.indexOf("async function lockRouteAssignmentScopes", helperStart);
    const helper = helperStart >= 0 && helperEnd > helperStart ? serviceSrc.slice(helperStart, helperEnd) : "";
    check("bounded_try_lock_helper_exists", helper.includes("pg_try_advisory_xact_lock")
      && helper.includes("deadlineAt") && helper.includes("ROUTE_LOCK_RETRY_MS"), { helper_found: helperStart >= 0 });
    check("no_blocking_advisory_lock_left", !/SELECT pg_advisory_xact_lock\(/.test(serviceSrc), {
      blocking_occurrences: (serviceSrc.match(/SELECT pg_advisory_xact_lock\(/g) || []).length
    });
    check("helper_used_by_four_writes", (serviceSrc.match(/await acquireBoundedScopeLocks\(/g) || []).length === 4, {
      occurrences: (serviceSrc.match(/await acquireBoundedScopeLocks\(/g) || []).length
    });
    check("contention_budget_declared", /let contentionLockWaitMs = 15_000/.test(serviceSrc));
    check("punch_scopes_share_deadline", serviceSrc.includes("const punchLockDeadlineAt = Date.now() + contentionLockWaitMs;")
      && (serviceSrc.match(/deadlineAt: punchLockDeadlineAt/g) || []).length === 2);
    check("payroll_transaction_budget_declared", /const PAYROLL_ADJUSTMENT_TRANSACTION_OPTIONS = \{ maxWait: 5_000, timeout: 30_000 \}/.test(serviceSrc)
      && serviceSrc.includes("}, PAYROLL_ADJUSTMENT_TRANSACTION_OPTIONS));"));
    check("three_busy_codes_declared", ["ROUTE_ASSIGNMENT_BUSY", "MARCACION_CONCURRENCIA_TEMPORAL", "AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL"]
      .every((code) => serviceSrc.includes(`"${code}"`)));
    check("server_maps_any_coded_503", /error\.statusCode === 503 && error\.code/.test(serverSrc)
      && !/error\.code === "ROUTE_ASSIGNMENT_BUSY" \|\| error\.code === "MARCACION_CONCURRENCIA_TEMPORAL"/.test(serverSrc), {
      generic_rule: /statusCode === 503 && error\.code/.test(serverSrc)
    });
    const busyCodesLine = (webApiSrc.match(/const RETRYABLE_BUSY_CODES = \[[^\]]*\]/) || [""])[0];
    check("web_lists_the_three_busy_codes", ["ROUTE_ASSIGNMENT_BUSY", "MARCACION_CONCURRENCIA_TEMPORAL", "AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL"]
      .every((code) => busyCodesLine.includes(`"${code}"`)), { linea: busyCodesLine });

    // ---- Fixtures: tenant con Talento Humano, admin con hr:write, empleados y ruta vehicular ----
    const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true, name: true, active_modules: true } });
    const withHr = tenants.filter((tenant) => modulesOf(tenant).some((code) => HR_CODES.includes(code)));
    const tenant = withHr.find((item) => /puebla|operaciones/i.test(String(item.name || ""))) || withHr[0];
    if (!tenant) throw new Error("No hay tenant con modulo Talento Humano en la base local.");
    cleanup.tenantId = tenant.id;

    const role = await admin.createRole(tenant.id, {
      name: `QA Concurrencia Admin ${RUN_ID}`,
      description: "Rol temporal de certificacion con hr:write y nomina para marcar, ajustar nomina y sostener concurrencia (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true }, nomina: { view: true, edit: true } }
    });
    cleanup.roleId = role.id;
    const user = await admin.createUser(tenant.id, {
      name: `Admin Concurrencia ${RUN_ID}`, first_names: "Admin", last_names: `Concurrencia ${RUN_ID}`,
      email: `${EMAIL_PREFIX}admin.${RUN_ID}@apex.test`, password: PASSWORD, role_id: role.id, company: "QA",
      document: `QACNT${RUN_ID}`.slice(0, 20), code: `${CODE_PREFIX}U${RUN_ID}`.slice(0, 24),
      department: "QA", position: "Administrador de pruebas", operational_classification: "administrativo",
      can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    cleanup.userId = user.id;
    const login = await capture("/api/v1/auth/login", { method: "POST", body: { email: `${EMAIL_PREFIX}admin.${RUN_ID}@apex.test`, password: PASSWORD }, step: "login" });
    if (login.status !== 200 || !login.payload?.token) throw new Error(`login admin fallo: ${login.status} (${login.code || login.error})`);
    const token = login.payload.token;

    const newEmployee = async (label) => {
      const code = `${CODE_PREFIX}${label}${RUN_ID.slice(-8)}`.slice(0, 24);
      const employee = await prisma.runWithTenant(tenant.id, () => prisma.employee.create({
        data: { code, position: "Operario QA", department: "QA", salary_base: 1_300_000, hire_date: new Date(`${TODAY}T05:00:00.000Z`) }
      }));
      cleanup.employeeIds.push(employee.id);
      return employee;
    };
    const punchEmployee = await newEmployee("PCH");
    const kmEmployee = await newEmployee("KM");
    const payrollEmployee = await newEmployee("NOM");
    const raceEmployee = await newEmployee("RAR");
    check("fixture_employees_seeded", [punchEmployee, kmEmployee, payrollEmployee, raceEmployee].every((item) => Number.isInteger(item.id) && item.id > 0), {
      ids: [punchEmployee.id, kmEmployee.id, payrollEmployee.id, raceEmployee.id]
    });

    const kmRoute = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id,
        date: new Date(`${TODAY}T05:00:00.000Z`),
        employees: [kmEmployee.code],
        start_time: "08:00",
        end_time: "23:59",
        tolerance_minutes: 15,
        vehicle_plate: "QACNT28",
        per_diem: 0,
        notes: `qa contencion p2028 ${RUN_ID}`,
        status: "active"
      }
    }));
    cleanup.routeIds.push(kmRoute.id);
    check("fixture_vehicle_route_seeded", Number.isInteger(kmRoute.id) && kmRoute.id > 0, { route_id: kmRoute.id, plate: kmRoute.vehicle_plate });

    result.fixture = {
      tenant: { id: tenant.id, name: tenant.name, modules: modulesOf(tenant) },
      role: { id: role.id, name: role.name },
      admin_user: { id: user.id, email: `${EMAIL_PREFIX}admin.${RUN_ID}@apex.test` },
      employees: { punch: punchEmployee.id, kilometraje: kmEmployee.id, nomina: payrollEmployee.id, carrera: raceEmployee.id },
      route: { id: kmRoute.id, vehicle_plate: kmRoute.vehicle_plate },
      payroll_period_key: PERIOD_KEY,
      contention_deadline_ms: CONTENTION_DEADLINE_MS,
      hold_over_deadline_ms: HOLD_OVER_DEADLINE_MS,
      hold_budgeted_ms: HOLD_BUDGETED_MS
    };

    const punch = (body, step) => capture("/api/v1/hr/time-punches", { token, method: "POST", body: { user_name: "qa-cnt28", ...body }, step });

    // ---- B. Marcacion bajo contencion real mas alla del deadline: 503 con codigo ----
    {
      const scope = punchScope(tenant.id, punchEmployee.id, null);
      const holder = holdScope(scope, HOLD_OVER_DEADLINE_MS);
      await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
      const busy = await punch({ employee_id: punchEmployee.id, type: "entrada" }, "marcacion_contencion_18s");
      result.observations.marcacion_contencion = { status: busy.status, code: busy.code, latency_ms: busy.latency_ms };
      check("punch_contention_returns_503", busy.status === 503, { status: busy.status, code: busy.code, error: busy.error });
      check("punch_contention_busy_code", busy.code === "MARCACION_CONCURRENCIA_TEMPORAL", { code: busy.code });
      check("punch_contention_never_500", busy.status !== 500 && busy.code !== "ERROR_INTERNO" && !/P2028/i.test(String(busy.error || "")));
      check("punch_contention_exposes_request_id", Boolean(busy.request_id), { request_id: busy.request_id });
      check("punch_contention_message_is_actionable", /Intente de nuevo/i.test(String(busy.error || "")), { message: busy.error });
      check("punch_contention_gives_up_within_budget", busy.latency_ms >= CONTENTION_DEADLINE_MS - 1_000 && busy.latency_ms < CONTENTION_DEADLINE_MS + 6_000, {
        latency_ms: busy.latency_ms, deadline_ms: CONTENTION_DEADLINE_MS
      });
      await holder;
      check("punch_contention_nothing_persisted", (await countPunches(tenant.id, punchEmployee.id)) === 0);
    }

    // ---- C. Marcacion con el lock liberado a los 7s: sobrevive y persiste ----
    {
      const scope = punchScope(tenant.id, punchEmployee.id, null);
      const holder = holdScope(scope, HOLD_BUDGETED_MS);
      await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
      const started = Date.now();
      const okPunch = await punch({ employee_id: punchEmployee.id, type: "entrada" }, "marcacion_espera_7s");
      const waited = Date.now() - started;
      await holder;
      result.observations.marcacion_espera = { status: okPunch.status, latency_ms: okPunch.latency_ms, wait_observed_ms: waited };
      check("punch_after_short_contention_succeeds", okPunch.status === 200 && okPunch.payload?.ok === true, { status: okPunch.status, code: okPunch.code, error: okPunch.error });
      check("punch_waited_beyond_old_default", waited > 5_000, { wait_observed_ms: waited, note: "con el default de 5s de Prisma esto era 500 P2028" });
      check("punch_persisted", (await countPunches(tenant.id, punchEmployee.id)) === 1);
    }

    // ---- D. Kilometraje de ruta vehicular bajo contencion real: 503 y transaccion integra ----
    {
      const warmup = ["entrada", "inicio_almuerzo", "fin_almuerzo"];
      const warmups = [];
      for (const type of warmup) {
        warmups.push(await punch({ employee_id: kmEmployee.id, user_name: kmEmployee.code, type, route_id: kmRoute.id }, `km_previa_${type}`));
      }
      check("punch_route_warmup_ok", warmups.every((item) => item.status === 200 && item.payload?.ok === true), {
        estados: warmups.map((item) => ({ status: item.status, code: item.code, error: item.error }))
      });

      const scope = mileageScope(tenant.id, kmRoute.id, kmEmployee.id);
      const holder = holdScope(scope, HOLD_OVER_DEADLINE_MS);
      await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
      const busy = await punch({
        employee_id: kmEmployee.id, user_name: kmEmployee.code, type: "salida", route_id: kmRoute.id, kilometraje_dia: "42.5"
      }, "kilometraje_contencion_18s");
      await holder;
      result.observations.kilometraje_contencion = { status: busy.status, code: busy.code, latency_ms: busy.latency_ms };
      check("mileage_contention_returns_503", busy.status === 503, { status: busy.status, code: busy.code, error: busy.error });
      check("mileage_contention_busy_code", busy.code === "MARCACION_CONCURRENCIA_TEMPORAL", { code: busy.code });
      check("mileage_contention_never_500", busy.status !== 500 && busy.code !== "ERROR_INTERNO" && !/P2028/i.test(String(busy.error || "")));
      check("mileage_contention_rolls_back_whole_transaction", (await countPunches(tenant.id, kmEmployee.id)) === 3 && (await activeMileageRow(tenant.id, kmEmployee.id)) === null, {
        marcaciones: await countPunches(tenant.id, kmEmployee.id), kilometraje_activo: await activeMileageRow(tenant.id, kmEmployee.id)
      });
    }

    // ---- E. Kilometraje liberado: la salida guarda el renglon activo ----
    {
      const scope = mileageScope(tenant.id, kmRoute.id, kmEmployee.id);
      const holder = holdScope(scope, HOLD_BUDGETED_MS);
      await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
      const okExit = await punch({
        employee_id: kmEmployee.id, user_name: kmEmployee.code, type: "salida", route_id: kmRoute.id, kilometraje_dia: "42.5"
      }, "kilometraje_espera_7s");
      await holder;
      const mileage = await activeMileageRow(tenant.id, kmEmployee.id);
      result.observations.kilometraje_recuperado = { status: okExit.status, latency_ms: okExit.latency_ms, mileage: mileage && { id: Number(mileage.id), value: Number(mileage.value) } };
      check("mileage_after_short_contention_succeeds", okExit.status === 200 && okExit.payload?.ok === true, { status: okExit.status, code: okExit.code, error: okExit.error });
      check("mileage_row_persisted", Boolean(mileage) && Number(mileage.value) === 42.5 && Number(mileage.route_id) === kmRoute.id, { mileage });
      check("mileage_no_duplicate_active_rows", (await prisma.runWithTenant(tenant.id, async () => prisma.$queryRaw`
        SELECT COUNT(*)::int AS total FROM th_jornada_kilometrajes
        WHERE tenant_id = ${tenant.id} AND employee_id = ${kmEmployee.id} AND active = true
      `))?.[0]?.total === 1);
    }

    // ---- F. Ajuste de nomina bajo contencion real: 503 con codigo propio ----
    {
      const scope = payrollScope(tenant.id, payrollEmployee.id);
      const holder = holdScope(scope, HOLD_OVER_DEADLINE_MS);
      await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
      const busy = await capture("/api/v1/talento-humano/nomina/ajustes", {
        token, method: "POST", step: "nomina_contencion_18s",
        body: { employee_id: payrollEmployee.id, period_key: PERIOD_KEY, adjustment_type: "manual", concept_code: "AJUSTE_MANUAL", description: `qa contencion ${RUN_ID}`, amount: 50000, minutes: 480 }
      });
      await holder;
      result.observations.nomina_contencion = { status: busy.status, code: busy.code, latency_ms: busy.latency_ms };
      check("payroll_contention_returns_503", busy.status === 503, { status: busy.status, code: busy.code, error: busy.error });
      check("payroll_contention_busy_code", busy.code === "AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL", { code: busy.code });
      check("payroll_contention_never_500", busy.status !== 500 && busy.code !== "ERROR_INTERNO" && !/P2028/i.test(String(busy.error || "")));
      check("payroll_contention_exposes_request_id", Boolean(busy.request_id), { request_id: busy.request_id });
      check("payroll_contention_message_is_actionable", /Intente de nuevo/i.test(String(busy.error || "")), { message: busy.error });
      check("payroll_contention_nothing_persisted", (await countAdjustments(tenant.id, payrollEmployee.id)) === 0);
    }

    // ---- G. Ajuste de nomina liberado: se guarda y es visible para el listado ----
    {
      const scope = payrollScope(tenant.id, payrollEmployee.id);
      const holder = holdScope(scope, HOLD_BUDGETED_MS);
      await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
      const created = await capture("/api/v1/talento-humano/nomina/ajustes", {
        token, method: "POST", step: "nomina_espera_7s",
        body: { employee_id: payrollEmployee.id, period_key: PERIOD_KEY, adjustment_type: "manual", concept_code: "AJUSTE_MANUAL", description: `qa contencion ok ${RUN_ID}`, amount: 50000, minutes: 480 }
      });
      await holder;
      result.observations.nomina_recuperada = { status: created.status, latency_ms: created.latency_ms, id: created.payload?.id ?? null };
      check("payroll_after_short_contention_succeeds", created.status === 200 || created.status === 201, { status: created.status, code: created.code, error: created.error });
      check("payroll_adjustment_persisted", (await countAdjustments(tenant.id, payrollEmployee.id)) === 1);
      const listed = await capture(`/api/v1/talento-humano/nomina/ajustes?period_key=${encodeURIComponent(PERIOD_KEY)}`, { token, step: "nomina_listado" });
      const visible = Array.isArray(listed.payload) && listed.payload.some((row) => Number(row.employee_id) === payrollEmployee.id);
      check("payroll_adjustment_visible_in_list", visible === true, { status: listed.status, total: Array.isArray(listed.payload) ? listed.payload.length : null });
    }

    // ---- H. La serializacion sigue intacta: concurrencia real no duplica marcaciones ----
    {
      const [first, second] = await Promise.all([
        punch({ employee_id: raceEmployee.id, user_name: raceEmployee.code, type: "entrada" }, "carrera_1"),
        punch({ employee_id: raceEmployee.id, user_name: raceEmployee.code, type: "entrada" }, "carrera_2")
      ]);
      result.observations.serializacion = {
        estados: [first.status, second.status], codigos: [first.code, second.code]
      };
      const statuses = [first.status, second.status].sort();
      check("concurrent_punch_one_wins_one_conflicts", statuses.join(",") === "200,409", { statuses });
      check("concurrent_punch_conflict_is_secuencia", [first.code, second.code].includes("MARCACION_FUERA_DE_SECUENCIA"), { codes: [first.code, second.code] });
      check("concurrent_punch_no_duplicate_rows", (await countPunches(tenant.id, raceEmployee.id)) === 1, {
        marcaciones: await countPunches(tenant.id, raceEmployee.id)
      });
    }

    // ---- I. Ninguna caida de backend durante el flujo certificado ----
    const fiveHundreds = requestLog.filter((item) => item.status >= 500 && item.status !== 503);
    const crashes = requestLog.filter((item) => item.transport_error || /P2028|Transaction not found/i.test(String(item.error || "")));
    check("no_500_during_certification", fiveHundreds.length === 0, { errores: fiveHundreds });
    check("no_p2028_or_transport_failure", crashes.length === 0, { errores: crashes });
    check("all_contention_failures_are_controlled_503", requestLog.filter((item) => item.status === 503).every((item) => Boolean(item.code)), {
      cincocientos_tres: requestLog.filter((item) => item.status === 503).map((item) => ({ step: item.step, code: item.code }))
    });
    result.http_log = requestLog;

    // ---- J. Suites unitarios versionados ----
    const unitSuites = [
      { cwd: API, file: "test/hr-marking-concurrency.test.js" },
      { cwd: API, file: "test/hr-marking-kilometraje-conflict.test.js" },
      { cwd: API, file: "test/hr-payroll-adjustment-lock.test.js" },
      { cwd: API, file: "test/hr-deferred-marking-offline.test.js" },
      { cwd: API, file: "test/hr-marking-declared-employee.test.js" },
      { cwd: WEB, file: "test/hr-route-write-feedback.test.mjs" },
      { cwd: WEB, file: "test/hr-contention-write-feedback.test.mjs" }
    ];
    const unitOut = {};
    for (const suite of unitSuites) {
      const run = spawnSync(process.execPath, ["--test", suite.file], {
        cwd: suite.cwd, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" }
      });
      const output = `${run.stdout || ""}${run.stderr || ""}`;
      const pass = Number((output.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1] || 0);
      const fail = Number((output.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1] || 0);
      unitOut[`${path.basename(suite.cwd)}/${suite.file}`] = { pass, fail, exit: run.status };
      check(`unit_suite_green:${path.basename(suite.cwd)}/${path.basename(suite.file)}`, run.status === 0 && fail === 0 && pass > 0, { pass, fail, exit: run.status });
    }
    result.versioned_suites = unitOut;

    result.status = "passed";
    result.summary = {
      checks_total: result.checks.length,
      checks_passed: result.checks.filter((item) => item.ok).length,
      requests: requestLog.length,
      contention_deadline_ms: CONTENTION_DEADLINE_MS
    };
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack };
    result.summary = {
      checks_total: result.checks.length,
      checks_passed: result.checks.filter((item) => item.ok).length,
      requests: requestLog.length
    };
  } finally {
    const cleanupErrors = [];
    // Orden: primero lo que referencia a la ruta (checklists, marcaciones) y despues la ruta.
    const purged = [];
    for (const employeeId of cleanup.employeeIds) {
      const summary = await purgeCertificationEmployee(cleanup.tenantId, employeeId).catch((e) => ({ errors: [`empleado ${employeeId}: ${e.message}`] }));
      purged.push({ employee_id: employeeId, errors: summary.errors });
      cleanupErrors.push(...summary.errors);
    }
    for (const routeId of cleanup.routeIds) {
      await prisma.runWithTenant(cleanup.tenantId, () => prisma.routePreoperationalChecklist.deleteMany({ where: { tenant_id: cleanup.tenantId, route_id: routeId } }))
        .catch((e) => cleanupErrors.push(`checklist ${routeId}: ${e.message}`));
      await prisma.runWithTenant(cleanup.tenantId, () => prisma.timeRoute.delete({ where: { id: routeId } })).catch((e) => cleanupErrors.push(`route ${routeId}: ${e.message}`));
    }
    // El alta del usuario administrador crea un empleado espejo (Employee.user_id). Se localiza
    // ANTES de desactivar al usuario porque el cliente con ambito de tenant solo ve activos, y se
    // purga DESPUES porque updateUser vuelve a crearlo si ya no existe al desactivar.
    const mirrorId = cleanup.userId ? await prisma.runWithTenant(cleanup.tenantId, () => prisma.employee.findFirst({
      where: { tenant_id: cleanup.tenantId, user_id: cleanup.userId }, select: { id: true }
    })).then((row) => (row ? row.id : null)).catch((e) => { cleanupErrors.push(`busqueda empleado espejo: ${e.message}`); return null; }) : null;
    if (cleanup.userId) await admin.setUserActive(cleanup.tenantId, cleanup.userId, false).catch((e) => cleanupErrors.push(`user: ${e.message}`));
    if (cleanup.roleId) await admin.setRoleActive(cleanup.tenantId, cleanup.roleId, false).catch((e) => cleanupErrors.push(`role: ${e.message}`));
    if (mirrorId) {
      const summary = await purgeCertificationEmployee(cleanup.tenantId, mirrorId).catch((e) => ({ errors: [`empleado espejo ${mirrorId}: ${e.message}`] }));
      purged.push({ employee_id: mirrorId, espejo_del_usuario: true, errors: summary.errors });
      cleanupErrors.push(...summary.errors);
    }
    result.mirror_employee_removed = Boolean(mirrorId);
    result.cleanup = { routes_deleted: cleanup.routeIds.length, employees_purged: purged, user_deactivated: Boolean(cleanup.userId), role_deactivated: Boolean(cleanup.roleId), errors: cleanupErrors };
    result.finished_at = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, `${JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
      fs.writeFileSync(FIXTURE_OUTPUT, `${JSON.stringify({ ...result.fixture, run_id: RUN_ID }, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
    } finally {
      if (app) await app.close().catch(() => undefined);
    }
  }

  process.exitCode = result.status === "passed" ? 0 : 1;
}

main()
  .then(() => console.log(`CERTIFICACION CONCURRENCIA TALENTO HUMANO ${result.status === "passed" ? "APROBADA" : "BLOQUEADA"}: ${result.summary?.checks_passed ?? 0}/${result.summary?.checks_total ?? 0} controles`))
  .catch((error) => { console.error(`CERTIFICACION CONCURRENCIA TALENTO HUMANO BLOQUEADA: ${error.message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
