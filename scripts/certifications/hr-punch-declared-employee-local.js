// Certificacion LOCAL (en vivo) del destino de las marcaciones operativas con empleado
// declarado y de la matriz de errores que deben capturarse al marcar.
//
// Contexto del cambio certificado:
//   La ruta administrativa POST /api/v1/hr/time-punches permite declarar el empleado
//   destino (employee_id). Antes de la correccion, un employee_id inexistente en el
//   tenant del solicitante se redirigia EN SILENCIO a la propia ficha del admin: la
//   marcacion y la novedad AJUSTE_MANUAL_MARCACION quedaban sobre la persona equivocada
//   sin ningun error visible. La queja operativa recurrente es que "al marcar se generan
//   muchos errores", por lo que esta certificacion ejercita en vivo todos los caminos de
//   error de la marcacion operativa, no solo el camino feliz.
//
// Alcance certificado (en vivo, contra la base LOCAL):
//   - La marcacion administrativa con employee_id valido cae en el empleado declarado
//     (marcacion y novedad de ajuste manual incluidas).
//   - employee_id inexistente en el tenant responde 404 EMPLEADO_NO_ENCONTRADO sin
//     escribir nada: la ficha propia del admin no recibe la marcacion (regresion del
//     redireccion silencioso).
//   - employee_id malformado (no numerico) responde 422 EMPLEADO_NO_ENCONTRADO.
//   - Sin employee_id se conserva el comportamiento historico (fallback a la ficha
//     propia del admin autenticado).
//   - El ambito self-service (/hr/self/time-punches) queda anclado al usuario
//     autenticado aunque el payload declare otro employee_id.
//   - Un empleado de otra empresa (cross-tenant) no es resoluble: 404 y cero escrituras.
//   - Matriz de errores operativos: MARCACION_FUERA_DE_SECUENCIA (409), JORNADA_COMPLETA
//     (409), replay idempotente + IDEMPOTENCY_KEY_CONFLICT (409), PERMISO_DENEGADO (403,
//     rol sin hr:write) y MODULO_NO_HABILITADO (403, empresa sin Talento Humano).
//   - Aserciones de codigo sobre el servicio, las rutas y el esquema, mas el suite
//     unitario versionado apps/api/test/hr-marking-declared-employee.test.js.
//
// Este script arranca la API Fastify contra la base LOCAL (Prisma/PostgreSQL), crea
// fixtures temporales en tenants existentes y ejercita los endpoints reales por HTTP.
// NO escribe en QA ni en produccion: aborta si DATABASE_URL no apunta a
// localhost/127.0.0.1. Sale con codigo distinto de cero ante cualquier fallo.

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
require("../load-env")(path.resolve(String(args["env-file"] || "apps/api/.env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");

const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

const HR_ROUTES = path.join(API, "src/modules/hr/routes.js");
const HR_SERVICE = path.join(API, "src/modules/hr/service.js");
const HR_SCHEMA = path.join(API, "src/modules/hr/schema.js");

const PORT = Number(args.port || 3198);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 20000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-punch-declared-employee-20260924/local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-PunchDecl-${crypto.randomBytes(6).toString("hex")}#26`;
// America/Bogota es UTC-5 fijo (sin horario de verano): mediodia local = 17:00 UTC y el
// arranque de dia local = 05:00 UTC, asi que los limites de jornada son deterministicos.
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const TODAY_NOON = new Date(`${TODAY}T17:00:00.000Z`);
const YESTERDAY_NOON = new Date(TODAY_NOON.getTime() - 86400000);
const YESTERDAY = YESTERDAY_NOON.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const YESTERDAY_LUNCH = new Date(YESTERDAY_NOON.getTime() + 15 * 60000);
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];
const MANUAL_ADJUSTMENT_NOVELTY_CODE = "AJUSTE_MANUAL_MARCACION";
const UNKNOWN_EMPLOYEE_ID = 999999999;
const MALFORMED_EMPLOYEE_ID = "b0e6c3f2-9d1a-4c8e-8f2a-3c4d5e6f7081";
const DECLARED_USER_NAME = "qa-punchdecl-declarado";
const CERT_ID = "hr-punch-declared-employee-20260924";
const STALE_CODE_PREFIX = "QA-PCH-";
const STALE_EMAIL_PREFIX = "qa.punchdecl.";
const STALE_ROLE_PREFIXES = ["QA Marcacion Admin", "QA Marcacion Operario", "QA Marcacion Sin Modulo"];

const result = {
  change_id: CERT_ID,
  certification: "hr-punch-declared-employee-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_date: TODAY,
  previous_operating_date: YESTERDAY,
  scope: {
    capability:
      "Destino correcto de la marcacion administrativa con empleado declarado (POST /hr/time-punches), ambito self-service anclado al usuario autenticado y captura explicita de la matriz de errores operativos de marcacion: empleado inexistente (404), identificador malformado (422), secuencia (409), jornada completa (409), idempotencia (409), permisos (403) y modulo no habilitado (403).",
    proven_by_live_execution: [
      "POST /api/v1/hr/time-punches con employee_id existente marca al empleado declarado y registra la novedad AJUSTE_MANUAL_MARCACION sobre ese empleado, no sobre la ficha del admin",
      "POST /api/v1/hr/time-punches con employee_id inexistente responde 404 EMPLEADO_NO_ENCONTRADO y la ficha del admin queda intacta (regresion del redireccion silencioso)",
      "POST /api/v1/hr/time-punches con employee_id no numerico responde 422 EMPLEADO_NO_ENCONTRADO sin escrituras",
      "POST /api/v1/hr/time-punches sin employee_id conserva el fallback historico a la ficha propia del admin autenticado",
      "POST /api/v1/hr/self/time-punches ignora el employee_id del payload y ancla la marcacion al usuario autenticado",
      "Un employee_id de otra empresa no es resoluble: 404 y cero marcaciones en el tenant ajeno",
      "La secuencia entrada/inicio_almuerzo/fin_almuerzo/salida se exige: repeticion 409 MARCACION_FUERA_DE_SECUENCIA y jornada cerrada 409 JORNADA_COMPLETA",
      "La clave de idempotencia responde igual (replayed) para el mismo empleado y 409 IDEMPOTENCY_KEY_CONFLICT para otro",
      "Rol sin hr:write recibe 403 PERMISO_DENEGADO y empresa sin Talento Humano recibe 403 MODULO_NO_HABILITADO",
      "Ningun request del flujo certificado responde 5xx"
    ],
    proven_by_code_level_assertion: [
      "hr/service.js resuelve el empleado declarado dentro del tenant y rechaza con EMPLEADO_NO_ENCONTRADO lo no numerico (422) o no encontrado (404) antes de escribir",
      "hr/routes.js separa la ruta administrativa (requirePermission hr:write) de la self-service (ownWrite) con el mismo esquema punchSchema",
      "hr/schema.js acepta employee_id numerico o texto para poder capturar el error 422 en el servicio y no en el esquema"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/hr-marking-declared-employee.test.js (6 controles)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

const requestLog = [];
async function capture(pathname, { token = "", method = "GET", body } = {}) {
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
  requestLog.push({ method, path: pathname, status, transport_error: transportError, latency_ms: Date.now() - started });
  return { status, payload, transportError, latency_ms: Date.now() - started };
}

function readSource(file) {
  return fs.readFileSync(file, "utf8");
}

function modulesOf(tenant) {
  return Array.isArray(tenant.active_modules) ? tenant.active_modules.map((code) => String(code || "").trim().toLowerCase()) : [];
}
function tenantHasHrModule(tenant) {
  return modulesOf(tenant).some((code) => HR_CODES.includes(code));
}
function tenantHrDisabled(tenant) {
  const modules = modulesOf(tenant);
  return modules.length > 0 && !tenantHasHrModule(tenant);
}

async function login(email) {
  const response = await capture("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  if (response.status !== 200 || !response.payload?.token) throw new Error(`Login fallo para ${email}: ${response.status} ${response.payload?.code || ""}`);
  return response.payload.token;
}

async function countPunchesOnDay(tenantId, employeeId, dayStr) {
  const from = new Date(`${dayStr}T05:00:00.000Z`);
  const to = new Date(from.getTime() + 86400000);
  return prisma.runWithTenant(tenantId, () => prisma.timePunch.count({
    where: { tenant_id: tenantId, employee_id: employeeId, date: { gte: from, lt: to } }
  }));
}

async function countNoveltiesOnDay(tenantId, employeeId, typeCode, dayStr) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`SELECT COUNT(*)::int AS total FROM th_novedades_jornada WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND type_code = ${typeCode} AND date = ${dayStr}::date`;
    return Number(rows?.[0]?.total || 0);
  });
}

// Borra todo el arbol operativo de los empleados de certificacion antes de eliminar la
// ficha: sesiones (que referencian marcaciones por entry_punch_id), marcaciones, jornales
// procesados y novedades (tabla raw fuera del esquema Prisma).
async function purgeEmployeeFixture(tenantId, employeeIds) {
  const summary = { activities: 0, sessions: 0, punches: 0, workdays: 0, novelties: 0, employees: 0, errors: [] };
  if (!tenantId || !employeeIds.length) return summary;
  await prisma.runWithTenant(tenantId, async () => {
    const sessions = await prisma.workSession.findMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } }, select: { id: true } });
    const sessionIds = sessions.map((item) => item.id);
    if (sessionIds.length) {
      summary.activities = await prisma.workActivity.deleteMany({ where: { tenant_id: tenantId, session_id: { in: sessionIds } } }).then((r) => r.count).catch(() => 0);
    }
    summary.sessions = await prisma.workSession.deleteMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } } }).then((r) => r.count).catch(() => 0);
    summary.punches = await prisma.timePunch.deleteMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } } }).then((r) => r.count).catch(() => 0);
    summary.workdays = await prisma.processedWorkday.deleteMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } } }).then((r) => r.count).catch(() => 0);
    for (const id of employeeIds) {
      try {
        await prisma.$executeRaw`DELETE FROM th_novedades_jornada WHERE tenant_id = ${tenantId} AND employee_id = ${id}`;
        summary.novelties += 1;
      } catch (error) { summary.errors.push(`novelties ${id}: ${error.message}`); }
    }
    for (const id of employeeIds) {
      try { await prisma.employee.delete({ where: { id } }); summary.employees += 1; } catch (error) { summary.errors.push(`employee ${id}: ${error.message}`); }
    }
  });
  return summary;
}

async function purgeStaleCertificationLeftovers(tenants) {
  const purged = { employees: 0, users: 0, roles: 0, errors: [] };
  for (const tenant of tenants) {
    if (!tenant) continue;
    const staleEmployees = await prisma.runWithTenant(tenant.id, () => prisma.employee.findMany({ where: { code: { startsWith: STALE_CODE_PREFIX } }, select: { id: true } }));
    if (staleEmployees.length) {
      try {
        const summary = await purgeEmployeeFixture(tenant.id, staleEmployees.map((item) => item.id));
        purged.employees += summary.employees;
        purged.errors.push(...summary.errors);
      } catch (error) { purged.errors.push(`purge ${tenant.id}: ${error.message}`); }
    }
    await prisma.runWithTenant(tenant.id, async () => {
      const staleUsers = await prisma.user.findMany({ where: { email: { startsWith: STALE_EMAIL_PREFIX } }, select: { id: true } });
      for (const user of staleUsers) {
        try { await admin.setUserActive(tenant.id, user.id, false); purged.users += 1; } catch (error) { purged.errors.push(`user ${user.id}: ${error.message}`); }
      }
      const staleRoles = await prisma.role.findMany({ where: { name: { startsWith: "QA " } }, select: { id: true, name: true, metadata: true } });
      for (const role of staleRoles.filter((item) => STALE_ROLE_PREFIXES.some((prefix) => String(item.name || "").startsWith(prefix)))) {
        if (role.metadata?.active === false) continue;
        try { await admin.setRoleActive(tenant.id, role.id, false); purged.roles += 1; } catch (error) { purged.errors.push(`role ${role.id}: ${error.message}`); }
      }
    });
  }
  return purged;
}

async function main() {
  let app = null;
  const cleanup = { users: [], roles: [], employees: [] };
  try {
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });
    // Si un paso se cuelga, el watchdog deja rastro del ultimo control completado.
    const watchdog = setInterval(() => {
      const last = result.checks[result.checks.length - 1];
      console.error(`[cert] watchdog ${result.checks.length} controles; ultimo=${last ? last.name : "ninguno"}`);
    }, Number(args["watchdog-ms"] || 30000));
    watchdog.unref();

    const health = await capture("/health");
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    // ---- Fixtures: empresa con hr, empresa ajena (cross-tenant) y empresa sin hr ----
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, active: true, active_modules: true } });
    const activeTenants = tenants.filter((tenant) => tenant.active !== false);
    const withHr = activeTenants.filter(tenantHasHrModule);
    const withoutHr = activeTenants.filter(tenantHrDisabled);
    const byName = (list, re) => list.find((tenant) => re.test(String(tenant.name || ""))) || list[0];
    const tenantP = byName(withHr, /puebla|operaciones/i);
    const tenantX = byName(withoutHr, /prueba/i);
    const tenantQ = byName(activeTenants.filter((tenant) => tenant.id !== tenantP?.id && tenant.id !== tenantX?.id), /scj/i);
    check("fixture_tenants_resolved", Boolean(tenantP && tenantQ && tenantX && new Set([tenantP.id, tenantQ.id, tenantX.id]).size === 3), {
      con_hr: tenantP ? { id: tenantP.id, name: tenantP.name, modules: modulesOf(tenantP) } : null,
      cross_tenant: tenantQ ? { id: tenantQ.id, name: tenantQ.name, modules: modulesOf(tenantQ) } : null,
      sin_modulo_hr: tenantX ? { id: tenantX.id, name: tenantX.name, modules: modulesOf(tenantX) } : null
    });

    // Una corrida anterior interrumpida puede dejar fixtures vivos: se limpian antes de sembrar.
    result.stale_leftovers_purged = await purgeStaleCertificationLeftovers([tenantP, tenantQ, tenantX]);

    const adminRole = await admin.createRole(tenantP.id, {
      name: `QA Marcacion Admin ${RUN_ID}`,
      description: "Rol temporal de certificacion con hr:write para la ruta administrativa de marcaciones (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true } }
    });
    cleanup.roles.push({ tenantId: tenantP.id, id: adminRole.id });
    const operarioRole = await admin.createRole(tenantP.id, {
      name: `QA Marcacion Operario ${RUN_ID}`,
      description: "Rol temporal de certificacion con time_tracking read/write para la ruta self-service de marcaciones (se desactiva al final).",
      permissions: { marcaciones: { view: true, create: true } }
    });
    cleanup.roles.push({ tenantId: tenantP.id, id: operarioRole.id });
    const noModuleRole = await admin.createRole(tenantX.id, {
      name: `QA Marcacion Sin Modulo ${RUN_ID}`,
      description: "Rol temporal de certificacion en empresa sin el modulo de Talento Humano (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true } }
    });
    cleanup.roles.push({ tenantId: tenantX.id, id: noModuleRole.id });
    check("fixture_roles_created", Boolean(adminRole.id && operarioRole.id && noModuleRole.id), {
      admin: adminRole.name, operario: operarioRole.name, empresa_sin_modulo: noModuleRole.name
    });

    const userShape = (label, roleId, slug, { canPunch = false } = {}) => ({
      name: `QA PunchDecl ${label} ${RUN_ID}`,
      first_names: "QA",
      last_names: `${label} ${RUN_ID}`,
      email: `qa.punchdecl.${slug}.${RUN_ID}@apex.test`,
      password: PASSWORD,
      role_id: roleId,
      company: "QA",
      document: `QAPD${RUN_ID}`.slice(0, 20),
      // createUser crea un Employee anidado con este code y Employee tiene @@unique([tenant_id, code]):
      // el code debe ser unico por corrida para que la certificacion sea repetible.
      code: `${STALE_CODE_PREFIX}${slug}-${RUN_ID.slice(-10)}`.slice(0, 24),
      department: "QA",
      position: "Usuario de certificacion",
      operational_classification: "administrativo",
      can_punch_time: canPunch,
      can_be_assigned_routes: false,
      require_password_change: false
    });
    const userAdmin = await admin.createUser(tenantP.id, userShape("Admin", adminRole.id, "admin"));
    cleanup.users.push({ tenantId: tenantP.id, id: userAdmin.id });
    const userOperario = await admin.createUser(tenantP.id, userShape("Operario", operarioRole.id, "oper", { canPunch: true }));
    cleanup.users.push({ tenantId: tenantP.id, id: userOperario.id });
    const userX = await admin.createUser(tenantX.id, userShape("SinModulo", noModuleRole.id, "nox"));
    cleanup.users.push({ tenantId: tenantX.id, id: userX.id });
    for (const [tenantId, user] of [[tenantP.id, userAdmin], [tenantP.id, userOperario], [tenantX.id, userX]]) {
      if (user.employee_id) cleanup.employees.push({ tenantId, id: user.employee_id });
    }

    const tokenAdmin = await login(userAdmin.metadata?.access?.email || `qa.punchdecl.admin.${RUN_ID}@apex.test`);
    const tokenOperario = await login(userOperario.metadata?.access?.email || `qa.punchdecl.oper.${RUN_ID}@apex.test`);
    const tokenX = await login(userX.metadata?.access?.email || `qa.punchdecl.nox.${RUN_ID}@apex.test`);
    check("fixture_users_can_login", Boolean(tokenAdmin && tokenOperario && tokenX), { logins: 3 });

    // Empleado declarado (sin usuario) en la empresa principal y empleado ajeno en otra empresa.
    const declaradoEmployee = await prisma.runWithTenant(tenantP.id, async () => prisma.employee.create({
      data: {
        code: `${STALE_CODE_PREFIX}decl-${RUN_ID.slice(-10)}`.slice(0, 24),
        position: "Operario declarado QA",
        department: "QA",
        salary_base: 1000000,
        hire_date: new Date(`${TODAY}T05:00:00.000Z`)
      }
    }));
    cleanup.employees.push({ tenantId: tenantP.id, id: declaradoEmployee.id });
    const crossEmployee = await prisma.runWithTenant(tenantQ.id, async () => prisma.employee.create({
      data: {
        code: `${STALE_CODE_PREFIX}cross-${RUN_ID.slice(-10)}`.slice(0, 24),
        position: "Operario ajeno QA",
        department: "QA",
        salary_base: 1000000,
        hire_date: new Date(`${TODAY}T05:00:00.000Z`)
      }
    }));
    cleanup.employees.push({ tenantId: tenantQ.id, id: crossEmployee.id });
    check("fixture_employees_seeded", Number.isInteger(declaradoEmployee.id) && declaradoEmployee.id > 0
      && Number.isInteger(crossEmployee.id) && crossEmployee.id > 0, {
      declarado: { tenant: tenantP.name, id: declaradoEmployee.id },
      cross_tenant: { tenant: tenantQ.name, id: crossEmployee.id }
    });

    result.fixture = {
      tenants: {
        principal: { id: tenantP.id, name: tenantP.name, modules: modulesOf(tenantP) },
        cross: { id: tenantQ.id, name: tenantQ.name },
        sin_modulo: { id: tenantX.id, name: tenantX.name, modules: modulesOf(tenantX) }
      },
      roles: { admin: adminRole.name, operario: operarioRole.name, sin_modulo: noModuleRole.name },
      users: { admin: userAdmin.id, operario: userOperario.id, sin_modulo: userX.id },
      empleados: { declarado: declaradoEmployee.id, cross_tenant: crossEmployee.id },
      fichas: { admin: userAdmin.employee_id ?? null, operario: userOperario.employee_id ?? null }
    };

    const adminPunch = (body) => capture("/api/v1/hr/time-punches", { token: tokenAdmin, method: "POST", body });
    const selfPunch = (body) => capture("/api/v1/hr/self/time-punches", { token: tokenOperario, method: "POST", body });

    // ---- Marcacion administrativa de ayer: novedad de ajuste sobre el declarado ----
    const noveltyPunch = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "entrada", punched_at: YESTERDAY_NOON.toISOString() });
    const noveltyOnDeclared = await countNoveltiesOnDay(tenantP.id, declaradoEmployee.id, MANUAL_ADJUSTMENT_NOVELTY_CODE, YESTERDAY);
    const noveltyOnAdmin = userAdmin.employee_id
      ? await countNoveltiesOnDay(tenantP.id, userAdmin.employee_id, MANUAL_ADJUSTMENT_NOVELTY_CODE, YESTERDAY)
      : -1;
    check("punch_novelty_lands_on_declared_employee", noveltyPunch.status === 200 && noveltyPunch.payload?.ok === true
      && noveltyPunch.payload?.punch?.employee_id === declaradoEmployee.id
      && noveltyOnDeclared >= 1 && noveltyOnAdmin === 0, {
      status: noveltyPunch.status, punch_employee_id: noveltyPunch.payload?.punch?.employee_id ?? null,
      novedad_declarado: noveltyOnDeclared, novedad_ficha_admin: noveltyOnAdmin
    });

    // ---- Camino feliz de hoy: la marca cae en el empleado declarado ----
    const declaredPunch = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "entrada" });
    check("punch_lands_on_declared_employee", declaredPunch.status === 200 && declaredPunch.payload?.ok === true
      && declaredPunch.payload?.punch?.employee_id === declaradoEmployee.id
      && declaredPunch.payload?.punch?.type === "entrada"
      && typeof declaredPunch.payload?.hora === "string", {
      status: declaredPunch.status, punch_employee_id: declaredPunch.payload?.punch?.employee_id ?? null,
      hora: declaredPunch.payload?.hora ?? null, next: declaredPunch.payload?.next ?? null
    });

    // ---- Rechazos: inexistente (404) y malformado (422) sin tocar la ficha del admin ----
    const adminFichaBefore = userAdmin.employee_id ? await countPunchesOnDay(tenantP.id, userAdmin.employee_id, TODAY) : 0;
    const unknownPunch = await adminPunch({ employee_id: UNKNOWN_EMPLOYEE_ID, user_name: "qa-punchdecl-inexistente", type: "entrada" });
    const adminFichaAfterUnknown = userAdmin.employee_id ? await countPunchesOnDay(tenantP.id, userAdmin.employee_id, TODAY) : adminFichaBefore;
    check("punch_rejects_unknown_employee", unknownPunch.status === 404 && unknownPunch.payload?.code === "EMPLEADO_NO_ENCONTRADO"
      && adminFichaAfterUnknown === adminFichaBefore, {
      status: unknownPunch.status, code: unknownPunch.payload?.code ?? null, error: unknownPunch.payload?.error ?? null,
      marcaciones_ficha_admin_antes: adminFichaBefore, marcaciones_ficha_admin_despues: adminFichaAfterUnknown
    });

    const malformedPunch = await adminPunch({ employee_id: MALFORMED_EMPLOYEE_ID, user_name: "qa-punchdecl-malformado", type: "entrada" });
    const adminFichaAfterMalformed = userAdmin.employee_id ? await countPunchesOnDay(tenantP.id, userAdmin.employee_id, TODAY) : adminFichaBefore;
    check("punch_rejects_malformed_employee_id", malformedPunch.status === 422 && malformedPunch.payload?.code === "EMPLEADO_NO_ENCONTRADO"
      && adminFichaAfterMalformed === adminFichaBefore, {
      status: malformedPunch.status, code: malformedPunch.payload?.code ?? null, employee_id_enviado: MALFORMED_EMPLOYEE_ID,
      marcaciones_ficha_admin: adminFichaAfterMalformed
    });

    // ---- Sin employee_id: fallback historico a la ficha propia del admin ----
    const fallbackPunch = await adminPunch({ user_name: "qa-punchdecl-fallback", type: "entrada" });
    check("punch_fallback_without_employee_id", fallbackPunch.status === 200 && fallbackPunch.payload?.ok === true
      && Number.isInteger(userAdmin.employee_id) && fallbackPunch.payload?.punch?.employee_id === userAdmin.employee_id, {
      status: fallbackPunch.status, punch_employee_id: fallbackPunch.payload?.punch?.employee_id ?? null,
      ficha_admin: userAdmin.employee_id ?? null
    });

    // ---- Ambito self-service: el employee_id del payload se ignora ----
    const selfPunchResponse = await selfPunch({ employee_id: declaradoEmployee.id, user_name: "qa-punchdecl-operario", type: "entrada" });
    check("self_punch_ignores_foreign_employee_id", selfPunchResponse.status === 200 && selfPunchResponse.payload?.ok === true
      && Number.isInteger(userOperario.employee_id)
      && selfPunchResponse.payload?.punch?.employee_id === userOperario.employee_id
      && selfPunchResponse.payload?.punch?.employee_id !== declaradoEmployee.id, {
      status: selfPunchResponse.status, employee_id_enviado: declaradoEmployee.id,
      punch_employee_id: selfPunchResponse.payload?.punch?.employee_id ?? null,
      ficha_operario: userOperario.employee_id ?? null
    });

    // ---- Empleado de otra empresa: 404 y cero escrituras en el tenant ajeno ----
    const crossPunch = await adminPunch({ employee_id: crossEmployee.id, user_name: "qa-punchdecl-ajeno", type: "entrada" });
    const crossPunchCount = await countPunchesOnDay(tenantQ.id, crossEmployee.id, TODAY);
    check("cross_tenant_declared_employee_hidden", crossPunch.status === 404 && crossPunch.payload?.code === "EMPLEADO_NO_ENCONTRADO"
      && crossPunchCount === 0, {
      status: crossPunch.status, code: crossPunch.payload?.code ?? null,
      marcaciones_empleado_ajeno: crossPunchCount
    });

    // ---- Matriz de errores operativos: secuencia, jornada completa, idempotencia ----
    const secondEntry = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "entrada" });
    check("punch_sequence_error_captured", secondEntry.status === 409 && secondEntry.payload?.code === "MARCACION_FUERA_DE_SECUENCIA"
      && /inicio_almuerzo/.test(String(secondEntry.payload?.error || "")), {
      status: secondEntry.status, code: secondEntry.payload?.code ?? null, error: secondEntry.payload?.error ?? null
    });

    const lunchStart = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "inicio_almuerzo" });
    const lunchEnd = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "fin_almuerzo" });
    const exitPunch = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "salida" });
    const afterComplete = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "entrada" });
    check("jornada_completa_error_captured", [lunchStart, lunchEnd, exitPunch].every((response) => response.status === 200 && response.payload?.ok === true)
      && afterComplete.status === 409 && afterComplete.payload?.code === "JORNADA_COMPLETA", {
      inicio_almuerzo: lunchStart.status, fin_almuerzo: lunchEnd.status, salida: exitPunch.status,
      siguiente_marcacion: { status: afterComplete.status, code: afterComplete.payload?.code ?? null }
    });

    const idempotencyKey = `qa-pch-${RUN_ID}-idem`;
    const idemFirst = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "inicio_almuerzo", punched_at: YESTERDAY_LUNCH.toISOString(), idempotency_key: idempotencyKey });
    const idemReplay = await adminPunch({ employee_id: declaradoEmployee.id, user_name: DECLARED_USER_NAME, type: "inicio_almuerzo", punched_at: YESTERDAY_LUNCH.toISOString(), idempotency_key: idempotencyKey });
    const idemConflict = await adminPunch({ user_name: "qa-punchdecl-conflicto", type: "entrada", punched_at: YESTERDAY_NOON.toISOString(), idempotency_key: idempotencyKey });
    check("idempotency_replay_and_conflict", idemFirst.status === 200 && idemFirst.payload?.ok === true
      && idemReplay.status === 200 && idemReplay.payload?.replayed === true
      && idemConflict.status === 409 && idemConflict.payload?.code === "IDEMPOTENCY_KEY_CONFLICT", {
      primera: idemFirst.status, replay: { status: idemReplay.status, replayed: idemReplay.payload?.replayed ?? null },
      conflicto: { status: idemConflict.status, code: idemConflict.payload?.code ?? null }
    });

    // ---- Puertas RBAC: permiso del rol y modulo habilitado del tenant ----
    const operarioOnAdminRoute = await capture("/api/v1/hr/time-punches", { token: tokenOperario, method: "POST", body: { user_name: "qa-punchdecl-operario", type: "entrada" } });
    const noModuleOnAdminRoute = await capture("/api/v1/hr/time-punches", { token: tokenX, method: "POST", body: { user_name: "qa-punchdecl-sin-modulo", type: "entrada" } });
    check("rbac_gates_on_punch_routes", operarioOnAdminRoute.status === 403 && operarioOnAdminRoute.payload?.code === "PERMISO_DENEGADO"
      && noModuleOnAdminRoute.status === 403 && noModuleOnAdminRoute.payload?.code === "MODULO_NO_HABILITADO", {
      rol_sin_hr_write: { status: operarioOnAdminRoute.status, code: operarioOnAdminRoute.payload?.code ?? null },
      empresa_sin_modulo: { status: noModuleOnAdminRoute.status, code: noModuleOnAdminRoute.payload?.code ?? null }
    });

    // ---- Aserciones de codigo ----
    const serviceSrc = readSource(HR_SERVICE);
    check("code_service_rejects_unresolved_declared_employee", [
      /const declaredEmployeeId = !ownScope && input\.employee_id != null/.test(serviceSrc),
      /Number\.isInteger\(declaredEmployeeId\)/.test(serviceSrc),
      /EMPLEADO_NO_ENCONTRADO/.test(serviceSrc),
      /const employee = declaredEmployee \|\| currentEmployee \|\| await resolveEmployeeForPunch\(tenantId, input\)/.test(serviceSrc)
    ].every(Boolean), {
      resolucion_declarado: /declaredEmployeeId/.test(serviceSrc),
      rechazo_numerico: /Number\.isInteger\(declaredEmployeeId\)/.test(serviceSrc),
      fallback_conservado: /declaredEmployee \|\| currentEmployee/.test(serviceSrc)
    });

    const routesSrc = readSource(HR_ROUTES);
    check("code_routes_split_admin_and_self_punch", [
      /post\("\/hr\/time-punches", \{ schema: schemas\.punchSchema, preHandler: requirePermission\("hr", "write"\) \}/.test(routesSrc),
      /post\("\/hr\/self\/time-punches", \{ schema: schemas\.punchSchema, preHandler: ownWrite/.test(routesSrc)
    ].every(Boolean), {
      ruta_administrativa: /post\("\/hr\/time-punches"/.test(routesSrc),
      ruta_self_service: /post\("\/hr\/self\/time-punches"/.test(routesSrc)
    });

    const schemaSrc = readSource(HR_SCHEMA);
    check("code_schema_allows_numeric_and_string_employee_id", /employee_id: \{ anyOf: \[\{ type: "integer" \}, \{ type: "string" \}\] \}/.test(schemaSrc), {
      punchSchema_employee_id_flexible: /employee_id: \{ anyOf:/.test(schemaSrc)
    });

    // ---- Suite unitario versionado ----
    const apiUnit = spawnSync(process.execPath, ["--test", "test/hr-marking-declared-employee.test.js"], { cwd: API, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" } });
    const apiUnitOut = `${apiUnit.stdout || ""}${apiUnit.stderr || ""}`;
    check("api_unit_suite_passes", apiUnit.status === 0 && /(?:#|ℹ)\s+fail\s+0/.test(apiUnitOut) && /(?:#|ℹ)\s+pass\s+6/.test(apiUnitOut), {
      exit: apiUnit.status, pass: (apiUnitOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1], fail: (apiUnitOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1]
    });
    result.versioned_suites = {
      "apps/api/test/hr-marking-declared-employee.test.js": { pass: 6, fail: 0 }
    };

    // ---- Ningun error interno durante todo el flujo certificado ----
    const serverErrors = requestLog.filter((item) => !item.status || item.status >= 500 || item.transport_error);
    check("no_5xx_during_certification", serverErrors.length === 0, {
      requests: requestLog.length,
      errores_servidor: serverErrors.slice(0, 10)
    });
    result.http_log = requestLog;

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack };
    result.http_log = requestLog;
    throw error;
  } finally {
    const employeesByTenant = new Map();
    for (const employee of cleanup.employees) {
      if (!employeesByTenant.has(employee.tenantId)) employeesByTenant.set(employee.tenantId, []);
      employeesByTenant.get(employee.tenantId).push(employee.id);
    }
    const purgeSummary = { employees: 0, punches: 0, sessions: 0, activities: 0, workdays: 0, novelties: 0, errors: [] };
    for (const [tenantId, employeeIds] of employeesByTenant) {
      try {
        const summary = await purgeEmployeeFixture(tenantId, employeeIds);
        purgeSummary.employees += summary.employees;
        purgeSummary.punches += summary.punches;
        purgeSummary.sessions += summary.sessions;
        purgeSummary.activities += summary.activities;
        purgeSummary.workdays += summary.workdays;
        purgeSummary.novelties += summary.novelties;
        purgeSummary.errors.push(...summary.errors);
      } catch (error) { purgeSummary.errors.push(`purge ${tenantId}: ${error.message}`); }
    }
    const cleanupErrors = [...purgeSummary.errors];
    for (const user of cleanup.users) {
      try { await admin.setUserActive(user.tenantId, user.id, false); } catch (error) { cleanupErrors.push(`user ${user.id}: ${error.message}`); }
    }
    for (const role of cleanup.roles) {
      try { await admin.setRoleActive(role.tenantId, role.id, false); } catch (error) { cleanupErrors.push(`role ${role.id}: ${error.message}`); }
    }
    result.cleanup = {
      employees_deleted: purgeSummary.employees,
      punches_deleted: purgeSummary.punches,
      sessions_deleted: purgeSummary.sessions,
      activities_deleted: purgeSummary.activities,
      workdays_deleted: purgeSummary.workdays,
      novelties_deleted: purgeSummary.novelties,
      users_deactivated: cleanup.users.length,
      roles_deactivated: cleanup.roles.length,
      errors: cleanupErrors
    };
    result.finished_at = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, `${JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
    } finally {
      // La API embebida debe soltar el puerto aunque la escritura de evidencia falle.
      if (app) await app.close().catch(() => undefined);
    }
  }
}

main()
  .then(() => console.log(`CERTIFICACION MARCACION CON EMPLEADO DECLARADO APROBADA: ${result.checks.length} controles, status=${result.status}`))
  .catch((error) => { console.error(`CERTIFICACION MARCACION CON EMPLEADO DECLARADO BLOQUEADA: ${error.message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
