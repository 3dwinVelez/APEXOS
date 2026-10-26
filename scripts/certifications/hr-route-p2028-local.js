// Certificacion extremo a extremo (LOCAL) del fix P2028 en escrituras de mallas horarias.
//
// Defecto certificado (produccion 2026-10-26, adminsjc@apexos.local, tenant SJ C):
// POST /api/v1/hr/routes devolvia 500 (ERROR_INTERNO) con P2028 "Transaction not found".
// La transaccion interactiva de createRoute/updateRoute/createRoutesBulk corria con el
// timeout por defecto de Prisma (5s) mientras esperaba el advisory lock de asignacion;
// al expirar, Prisma abortaba la transaccion y el timeRoute.create() siguiente moria.
// El horario intentado nunca se guardaba y el banner del frontend decia "Backend no
// disponible", sugiriendo una caida que no existia.
//
// Correccion certificada:
//  1. { maxWait: 5s, timeout: 30s } en las tres transacciones de mallas.
//  2. pg_advisory_xact_lock (bloqueante e indefinido) -> pg_try_advisory_xact_lock con
//     reintento acotado (25s, 200ms) y fallo controlado 503 ROUTE_ASSIGNMENT_BUSY.
//  3. server.js mapea ROUTE_ASSIGNMENT_BUSY a 503 (antes caeria al generic 500).
//
// Este script NO escribe en QA ni en produccion: levanta la API Fastify contra la base
// local y ejercita el flujo real por HTTP, sosteniendo el advisory lock desde una
// conexion PostgreSQL independiente (la misma primitiva que provoco el incidente).
//
// Chequeos:
//  A. nivel de codigo: opciones de transaccion, try-lock acotado, rama 503 en server.
//  B. contencion REAL 7s (derriba del viejo limite de 5s): el POST sobrevive y guarda.
//  C. contencion REAL 26s (sobre la ventana de 25s): 503 ROUTE_ASSIGNMENT_BUSY, sin 500.
//  D. control positivo: horario valido creado, visible en GET /hr/routes y en BD.
//  E. regresion de serializacion: dos POST concurrentes al mismo scope -> 201 + 409
//     MALLA_SOLAPADA (el reintento no duplica mallas).
//  F. bulk con contencion REAL 7s: POST /hr/routes/bulk (2 dias) crea 2 rutas.
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

const PORT = Number(args.port || 3211);
const API_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-route-p2028-20261026/local-certification.json"));
const FIXTURE_OUTPUT = path.resolve(String(args["fixture-output"] || "docs/qa/evidence/hr-route-p2028-20261026/local-fixture.json"));

// Salvaguarda: solo localhost, nunca QA ni produccion.
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(API_URL)) {
  throw new Error("La certificacion solo permite localhost/127.0.0.1.");
}
const DATABASE_URL = String(process.env.DATABASE_URL || "");
if (/supabase\.com|railway\.app/.test(DATABASE_URL)) {
  throw new Error("DATABASE_URL apunta a una base remota; la certificacion exige la base local.");
}

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-P28-${crypto.randomBytes(6).toString("hex")}#26`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const SCJ_TENANT_ID = "001346eb-ba7f-4103-b032-73a219f1333e";

const SURVIVE_PERSON = `qa.p28.survive.${RUN_ID}@scj.test`;
const BUSY_PERSON = `qa.p28.busy.${RUN_ID}@scj.test`;
const CONTROL_PERSON = `qa.p28.control.${RUN_ID}@scj.test`;
const SERIAL_PERSON = `qa.p28.serial.${RUN_ID}@scj.test`;
const BULK_PERSON = `qa.p28.bulk.${RUN_ID}@scj.test`;

const LOCK_WAIT_MS = 25_000; // ventana de reintento del servicio (constante del fix)

const result = {
  change_id: "hr-route-p2028-20261026",
  certification: "hr-route-p2028-local",
  environment: "LOCAL",
  company: "SCJ",
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_date: TODAY,
  scope: {
    defect: "POST /api/v1/hr/routes con 500 P2028: la transaccion de mallas expiraba (5s por defecto) esperando el advisory lock; el horario no se guardaba y el banner decia 'Backend no disponible'.",
    product_decision: "No se cambio ninguna regla de negocio (MALLA_SOLAPADA, descanso, medianoche). Solo se amplió el presupuesto de la transaccion y el lock paso a try-lock acotado con 503 controlado.",
    proven_by_live_execution: [
      "contencion real de 7s sobre pg_try_advisory_xact_lock: el POST sobrevive y persiste la malla (antes: 500 P2028)",
      "contencion real de 26s: 503 ROUTE_ASSIGNMENT_BUSY con mensaje accionable, nunca 500",
      "horario valido creado por la API, devuelto por GET /api/v1/hr/routes y persistido en TimeRoute",
      "dos POST concurrentes al mismo scope: 201 + 409 MALLA_SOLAPADA, una sola malla persistida",
      "POST /hr/routes/bulk bajo contencion real de 7s crea las 2 rutas del rango"
    ],
    proven_by_code_level_assertion: [
      "ROUTE_ASSIGNMENT_TRANSACTION_OPTIONS { maxWait: 5000, timeout: 30000 } se pasa a las 3 transacciones de mallas",
      "lockRouteAssignmentScopes usa pg_try_advisory_xact_lock con deadline y ya no pg_advisory_xact_lock bloqueante",
      "server.js mapea ROUTE_ASSIGNMENT_BUSY a 503 junto a MARCACION_CONCURRENCIA_TEMPORAL"
    ]
  },
  checks: [],
  fixture: {},
  observations: {},
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail)}`);
}

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

function routeBody(person, overrides = {}) {
  return {
    date: TODAY,
    employees: [person],
    start_time: "08:00",
    end_time: "17:00",
    tolerance_minutes: 15,
    notes: `qa p2028 ${RUN_ID}`,
    ...overrides
  };
}

// Mismo scope que calcula lockRouteAssignmentScopes: startOfDay("YYYY-MM-DD") en
// America/Bogota es medianoche local = 05:00Z.
function assignmentScope(tenantId, person, date) {
  return `${tenantId}:asignacion:${String(person).trim().toLowerCase()}:${date}T05:00:00.000Z`;
}

// Sostiene el advisory lock desde una conexion independiente durante holdMs.
// $transaction interactiva = una sola conexion para BEGIN + lock + pg_sleep.
async function holdAssignmentLock(scope, holdMs) {
  const holder = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
    await tx.$executeRaw`SELECT pg_sleep(${holdMs / 1000}::double precision)`;
    return true;
  }, { maxWait: 5_000, timeout: holdMs + 30_000 });
  return holder;
}

async function countRoutesForPerson(tenantId, person, date) {
  const day = new Date(`${date}T00:00:00.000-05:00`);
  const next = new Date(day.getTime() + 86400000);
  const rows = await prisma.runWithTenant(tenantId, () => prisma.timeRoute.findMany({
    where: { tenant_id: tenantId, date: { gte: day, lt: next } },
    select: { employees: true }
  }));
  return rows.filter((row) => Array.isArray(row.employees) && row.employees.some((value) => String(value) === person)).length;
}

async function main() {
  let app = null;
  const createdRouteIds = [];

  try {
    // ---- Arranque del ambiente local ----
    const build = require(path.join(ROOT, "apps/api/server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });

    const health = await capture("/health", { actor: "cert", step: "health" });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    // ---- A. Nivel de codigo del fix ----
    const serviceSource = fs.readFileSync(path.join(ROOT, "apps/api/src/modules/hr/service.js"), "utf8");
    const serverSource = fs.readFileSync(path.join(ROOT, "apps/api/server.js"), "utf8");
    const optionsCount = (serviceSource.match(/, ROUTE_ASSIGNMENT_TRANSACTION_OPTIONS\)/g) || []).length;
    // Solo el lock de asignacion de mallas pasa a try-lock; marcaciones y kilometraje
    // conservan su lock bloqueante porque sus transacciones ya declaran presupuesto propio.
    const lockFnStart = serviceSource.indexOf("async function lockRouteAssignmentScopes");
    const lockFnEnd = serviceSource.indexOf("async function findRouteAssignmentConflicts", lockFnStart);
    const lockFnBody = serviceSource.slice(lockFnStart, lockFnEnd > lockFnStart ? lockFnEnd : -1);
    check("transaction_options_declared", /const ROUTE_ASSIGNMENT_TRANSACTION_OPTIONS = \{ maxWait: 5_000, timeout: 30_000 \}/.test(serviceSource));
    check("transaction_options_applied_to_all_three_writes", optionsCount === 3, { optionsCount });
    check("try_lock_replaces_blocking_lock", lockFnBody.includes("pg_try_advisory_xact_lock") && !lockFnBody.includes("pg_advisory_xact_lock("), {
      has_try_lock: lockFnBody.includes("pg_try_advisory_xact_lock"),
      still_blocking: lockFnBody.includes("SELECT pg_advisory_xact_lock")
    });
    check("busy_deadline_declared", lockFnBody.includes("deadline") && lockFnBody.includes("routeLockWaitMs"));
    check("busy_error_declared", serviceSource.includes('503, "ROUTE_ASSIGNMENT_BUSY"'));
    check("server_maps_busy_to_503", serverSource.includes('error.code === "ROUTE_ASSIGNMENT_BUSY"'));

    // ---- Fixtures: tenant SCJ + admin con bypass hr:write ----
    const tenant = await prisma.tenant.findFirst({ where: { id: SCJ_TENANT_ID } });
    if (!tenant) throw new Error("No existe el tenant SCJ en la base local.");
    const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const adminRole = roles.find((item) => normalize(item.name) === "apex_admin") || roles.find((item) => normalize(item.name).includes("admin"));
    if (!adminRole) throw new Error("No existe rol administrativo en SCJ.");

    const adminUser = await admin.createUser(tenant.id, {
      name: `Admin P2028 ${RUN_ID}`, first_names: "Admin", last_names: `P2028 ${RUN_ID}`,
      email: `qa.p28.admin.${RUN_ID}@scj.test`, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
      document: `QAP28${RUN_ID}`.slice(0, 20), code: `QA-P28-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
      operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    const login = await capture("/api/v1/auth/login", { method: "POST", body: { email: `qa.p28.admin.${RUN_ID}@scj.test`, password: PASSWORD }, actor: "admin", step: "login" });
    if (login.status !== 200 || !login.payload?.token) throw new Error(`login admin fallo: ${login.status} (${login.code || login.error})`);
    const adminToken = login.payload.token;
    result.fixture = {
      tenant_id: tenant.id,
      admin_user_id: adminUser.id,
      admin_email: `qa.p28.admin.${RUN_ID}@scj.test`,
      admin_role: adminRole.name,
      operating_date: TODAY,
      persons: { survive: SURVIVE_PERSON, busy: BUSY_PERSON, control: CONTROL_PERSON, serial: SERIAL_PERSON, bulk: BULK_PERSON },
      lock_wait_ms: LOCK_WAIT_MS
    };

    // ---- B. Contencion real 7s: el POST sobrevive mas alla del viejo limite de 5s ----
    {
      const scope = assignmentScope(tenant.id, SURVIVE_PERSON, TODAY);
      const holdPromise = holdAssignmentLock(scope, 7_000);
      await new Promise((resolve) => setTimeout(resolve, 400)); // que el titular tome el lock primero
      const started = Date.now();
      const created = await capture("/api/v1/hr/routes", { token: adminToken, method: "POST", body: routeBody(SURVIVE_PERSON), actor: "admin", step: "contencion_7s" });
      const waitObserved = Date.now() - started;
      await holdPromise;
      if (created.payload?.id) createdRouteIds.push(created.payload.id);
      result.observations.contencion_7s = { status: created.status, code: created.code, latency_ms: created.latency_ms, wait_observed_ms: waitObserved };
      check("contention_7s_post_succeeds", created.status === 200 || created.status === 201, { status: created.status, code: created.code, error: created.error });
      check("contention_7s_waited_beyond_old_default", waitObserved > 5_000, { wait_observed_ms: waitObserved, note: "con el default de 5s esto era 500 P2028" });
      check("contention_7s_route_persisted", (await countRoutesForPerson(tenant.id, SURVIVE_PERSON, TODAY)) === 1);
    }

    // ---- C. Contencion real 26s: 503 controlado, nunca 500 ----
    {
      const scope = assignmentScope(tenant.id, BUSY_PERSON, TODAY);
      const holdPromise = holdAssignmentLock(scope, LOCK_WAIT_MS + 1_000);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const created = await capture("/api/v1/hr/routes", { token: adminToken, method: "POST", body: routeBody(BUSY_PERSON), actor: "admin", step: "contencion_26s" });
      await holdPromise;
      result.observations.contencion_26s = { status: created.status, code: created.code, latency_ms: created.latency_ms };
      check("contention_26s_returns_503", created.status === 503, { status: created.status, code: created.code });
      check("contention_26s_busy_code", created.code === "ROUTE_ASSIGNMENT_BUSY", { code: created.code });
      check("contention_26s_never_500", created.status !== 500 && created.code !== "ERROR_INTERNO");
      check("contention_26s_nothing_persisted", (await countRoutesForPerson(tenant.id, BUSY_PERSON, TODAY)) === 0);
    }

    // ---- D. Control positivo: flujo normal del cliente, visible para el monitor ----
    {
      const created = await capture("/api/v1/hr/routes", { token: adminToken, method: "POST", body: routeBody(CONTROL_PERSON), actor: "admin", step: "control" });
      if (created.payload?.id) createdRouteIds.push(created.payload.id);
      check("control_post_succeeds", created.status === 200 || created.status === 201, { status: created.status, code: created.code });
      check("control_latency_under_contention_budget", created.latency_ms < 5_000, { latency_ms: created.latency_ms });
      const listed = await capture("/api/v1/hr/routes?limit=500", { token: adminToken, step: "control_get" });
      const visible = Array.isArray(listed.payload) && listed.payload.some((row) => Number(row.id) === Number(created.payload?.id));
      check("control_visible_in_monitor_get", visible === true, { total: Array.isArray(listed.payload) ? listed.payload.length : null });
      check("control_persisted", (await countRoutesForPerson(tenant.id, CONTROL_PERSON, TODAY)) === 1);
    }

    // ---- E. Regresion de serializacion: reintento no duplica mallas ----
    {
      const [first, second] = await Promise.all([
        capture("/api/v1/hr/routes", { token: adminToken, method: "POST", body: routeBody(SERIAL_PERSON), actor: "admin", step: "serial_1" }),
        capture("/api/v1/hr/routes", { token: adminToken, method: "POST", body: routeBody(SERIAL_PERSON), actor: "admin", step: "serial_2" })
      ]);
      const statuses = [first.status, second.status].sort();
      const codes = [first.code, second.code];
      if (first.payload?.id) createdRouteIds.push(first.payload.id);
      if (second.payload?.id) createdRouteIds.push(second.payload.id);
      result.observations.serializacion = { statuses, codes };
      check("serialization_one_wins_one_conflicts", statuses.join(",") === "201,409" || statuses.join(",") === "200,409", { statuses });
      check("serialization_conflict_is_malla_solapada", codes.includes("MALLA_SOLAPADA"), { codes });
      check("serialization_no_duplicates", (await countRoutesForPerson(tenant.id, SERIAL_PERSON, TODAY)) === 1);
    }

    // ---- F. Bulk bajo contencion real 7s ----
    {
      const tomorrow = new Date(new Date(`${TODAY}T00:00:00.000-05:00`).getTime() + 86400000).toLocaleDateString("en-CA", { timeZone: "UTC" });
      const scopeDay1 = assignmentScope(tenant.id, BULK_PERSON, TODAY);
      const scopeDay2 = assignmentScope(tenant.id, BULK_PERSON, tomorrow);
      const holdPromises = [holdAssignmentLock(scopeDay1, 7_000), holdAssignmentLock(scopeDay2, 7_000)];
      await new Promise((resolve) => setTimeout(resolve, 400));
      const bulk = await capture("/api/v1/hr/routes/bulk", {
        token: adminToken, method: "POST",
        body: { start_date: TODAY, end_date: tomorrow, weekdays: [0, 1, 2, 3, 4, 5, 6], employees: [BULK_PERSON], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, notes: `qa p28 bulk ${RUN_ID}` },
        actor: "admin", step: "bulk_contencion_7s"
      });
      await Promise.all(holdPromises);
      for (const route of bulk.payload?.routes || []) createdRouteIds.push(route.id);
      result.observations.bulk = { status: bulk.status, created: bulk.payload?.created ?? null, latency_ms: bulk.latency_ms };
      check("bulk_under_contention_succeeds", (bulk.status === 200 || bulk.status === 201) && bulk.payload?.created === 2, { status: bulk.status, created: bulk.payload?.created, error: bulk.error });
    }

    result.status = "passed";
    result.summary = {
      checks_total: result.checks.length,
      checks_passed: result.checks.filter((item) => item.ok).length,
      requests: requestLog.length
    };
  } catch (error) {
    result.status = "failed";
    result.failure = error.message;
    result.summary = {
      checks_total: result.checks.length,
      checks_passed: result.checks.filter((item) => item.ok).length,
      requests: requestLog.length
    };
  } finally {
    // Limpieza: borra solo las mallas de esta corrida (tenant + ids propios + marca de notas).
    // El servicio antepone la linea de tracking a las notas, por eso el patron es contenedor.
    const ids = [...new Set(createdRouteIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length) {
      try {
        const placeholders = ids.map((_, index) => `$${index + 2}`).join(",");
        await prisma.$executeRawUnsafe(
          `DELETE FROM "TimeRoute" WHERE tenant_id = $1 AND id IN (${placeholders}) AND notes LIKE $${ids.length + 2}`,
          SCJ_TENANT_ID, ...ids, `%qa p2028 ${RUN_ID}%`
        );
        result.cleanup = { deleted_candidates: ids.length };
      } catch (cleanupError) {
        result.cleanup_error = cleanupError.message;
      }
    }
    result.request_log = requestLog;
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(FIXTURE_OUTPUT, `${JSON.stringify({ ...result.fixture, run_id: RUN_ID }, null, 2)}\n`);
    console.log(`[cert] ${result.status} · ${result.summary?.checks_passed ?? 0}/${result.summary?.checks_total ?? 0} checks · evidencia: ${path.relative(ROOT, OUTPUT)}`);
    if (app) await app.close();
    await prisma.$disconnect();
  }

  process.exitCode = result.status === "passed" ? 0 : 1;
}

main();
