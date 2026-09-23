// Certificacion LOCAL (en vivo) del borrado fisico controlado de mallas/horarios (TimeRoute)
// bajo el permiso especial delete_physical_records, junto con el rediseno del monitor de
// horarios (ventana emergente + validacion por usuario) y el buscador Ctrl+K global.
//
// Alcance certificado:
//   - POST/PATCH/DELETE de mallas: el DELETE fisico exige el permiso especial
//     delete_physical_records (no se entrega por defecto), motivo, confirmacion explicita
//     y reconocimiento de la traza operativa que queda desacoplada como historial.
//   - Vista previa de impacto (GET :id/deletion-impact) que informa que se borra, que se
//     conserva y si el rol puede ejecutar el borrado fisico.
//   - Bloqueo por checklist preoperacional sin cerrar y deteccion de vista previa obsoleta.
//   - Aislamiento multi-tenant: mallas de otra empresa responden 404 y empresas sin el
//     modulo habilitado responden 403, sin tocar datos.
//   - Auditoria: cada borrado aplicado deja fila en audit_log con actor, motivo y traza.
//   - Monitor: ventana emergente accesible con validacion por usuario (marcaciones y
//     actividades) y buscador Ctrl+K con las funciones de todos los modulos.
//
// Este script arranca la API Fastify contra la base LOCAL (Prisma/PostgreSQL), crea
// fixtures temporales en tenants existentes, ejercita los endpoints reales por HTTP con
// cuatro usuarios temporales (con permiso, sin permiso, superadmin y empresa sin modulo)
// y ademas corre los suites unitarios versionados. NO escribe en QA ni en produccion:
// aborta si DATABASE_URL no apunta a localhost/127.0.0.1. Sale con codigo distinto de
// cero ante cualquier fallo.

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
const WEB = path.join(ROOT, "apps/web");

const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

const RBAC_JS = path.join(API, "src/middleware/rbac.js");
const HR_ROUTES = path.join(API, "src/modules/hr/routes.js");
const HR_SERVICE = path.join(API, "src/modules/hr/service.js");
const HR_SCHEMA = path.join(API, "src/modules/hr/schema.js");
const PRISMA_CORE = path.join(API, "src/core/prisma.js");
const WEB_RUTAS = path.join(WEB, "app/dashboard/talento-humano/rutas/page.tsx");
const WEB_PALETTE = path.join(WEB, "components/system/CommandPalette.tsx");
const WEB_FUNCTIONS = path.join(WEB, "lib/moduleFunctions.ts");

const PORT = Number(args.port || 3199);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 20000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-route-physical-deletion-20260923/hr-route-physical-deletion-local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-DelR-${crypto.randomBytes(6).toString("hex")}#26`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const ROUTE_DATE = new Date(`${TODAY}T00:00:00.000Z`);
const REASON = `Certificacion QA ${RUN_ID}: malla de prueba eliminada de forma controlada y trazable`;
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];
const PHYSICAL_DELETE_ACTION = "delete_physical_records";
const CERT_ID = "hr-route-physical-deletion-20260923";
// TimeRoute no tiene campo metadata: la marca de certificacion viaja en notes/vehicle_plate.
const ROUTE_NOTE_PREFIX = "QA certification ";
const STALE_CODE_PREFIX = "QA-DEL-";
const STALE_EMAIL_PREFIX = "qa.delroute.";
const STALE_ROLE_PREFIXES = ["QA Borrado Malla", "QA Operador Malla", "QA Sin Modulo"];

const result = {
  change_id: CERT_ID,
  certification: "hr-route-physical-deletion-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_date: TODAY,
  scope: {
    capability:
      "Eliminacion definitiva y controlada de mallas/horarios (TimeRoute) bajo permiso especial delete_physical_records, con vista previa de impacto, motivo, confirmacion, reconocimiento de traza y auditoria; monitor de horarios como ventana emergente con validacion por usuario y buscador Ctrl+K con funciones de todos los modulos.",
    proven_by_live_execution: [
      "GET /api/v1/hr/routes/:id/deletion-impact responde impacto + permissions.can_physical_delete segun el rol",
      "DELETE /api/v1/hr/routes/:id aplica el borrado fisico completo (malla + checklist preoperacional + autorizaciones + bloqueos) y conserva la traza",
      "DELETE sin el permiso especial responde 403 PERMISO_BORRADO_FISICO_DENEGADO",
      "DELETE con checklist preoperacional sin cerrar responde 409 ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST",
      "DELETE con vista previa obsoleta responde 409 ROUTE_DELETE_STALE_PREVIEW",
      "DELETE sin reconocer la traza responde 409 ROUTE_DELETE_TRACE_NOT_ACKNOWLEDGED",
      "DELETE cross-tenant responde 404 ROUTE_NOT_FOUND y la malla ajena sigue viva",
      "DELETE en empresa sin modulo hr responde 403 MODULO_NO_HABILITADO",
      "DELETE con rol superadministrador (permiso *:*) aplica el mismo contrato",
      "La traza operativa (marcaciones, GPS, sesiones, actividades, jornales) sobrevive al borrado y queda desacoplada",
      "audit_log registra route.physical_deletion.applied con actor, motivo y detalle de borrado"
    ],
    proven_by_code_level_assertion: [
      "rbac.js define hasPhysicalDeleteGrant/requirePhysicalDeleteGrant y los codigos de denegacion",
      "hr/routes.js expone el par deletion-impact + DELETE con requirePhysicalDeleteGrant en las dos rutas (hr y talento-humano)",
      "hr/service.js valida motivo, confirmacion, vista previa y traza antes de borrar en transaccion",
      "prisma.js permite el borrado fisico de TimeRoute y su arbol preoperacional",
      "rutas/page.tsx abre el monitor como ventana emergente accesible y valida por usuario",
      "CommandPalette.tsx + moduleFunctions.ts cubren las funciones de todos los modulos"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/hr-route-physical-deletion.test.js (11 controles)",
      "apps/api/test/hr-route-physical-deletion-contract.test.js (7 controles)",
      "apps/web/test/hr-monitor-modal-per-user.test.mjs (8 controles)",
      "apps/web/test/command-palette-module-functions.test.mjs (9 controles)"
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

async function seedRoute(tenantId, label, { withOpenChecklist = false, withTrace = false } = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const suffix = `${RUN_ID.slice(-6)}-${label}`;
    const route = await prisma.timeRoute.create({
      data: {
        date: ROUTE_DATE,
        vehicle_plate: `QA${label}${RUN_ID.slice(-4)}`,
        employees: [{ name: `QA ${label} titular` }, { name: `QA ${label} acompanante` }],
        start_time: "06:00",
        end_time: "16:00",
        tolerance_minutes: 15,
        status: "active",
        notes: `${ROUTE_NOTE_PREFIX}${CERT_ID} run ${RUN_ID} ${label}`
      }
    });
    const fixture = { tenantId, routeId: route.id, employeeIds: [] };
    if (withOpenChecklist) {
      const checklist = await prisma.routePreoperationalChecklist.create({
        data: { route_id: route.id, plate: `QA${label}${RUN_ID.slice(-4)}`, checklist_status: "en_proceso", driver_name: `QA ${label} piloto` }
      });
      fixture.checklistId = checklist.id;
      await prisma.routePreoperationalChecklistAnswer.create({
        data: { checklist_id: checklist.id, section: "luces", item_key: "luces_altas", label: "Luces altas", answer: "ok", severity: "info" }
      });
      await prisma.routePreoperationalChecklistEvidence.create({
        data: { checklist_id: checklist.id, evidence_type: "foto", file_name: `qa-${suffix}.jpg` }
      });
      await prisma.routePreoperationalFinding.create({
        data: { checklist_id: checklist.id, route_id: route.id, plate: `QA${label}${RUN_ID.slice(-4)}`, finding_type: "desgaste", severity: "baja", description: `Hallazgo de certificacion ${suffix}` }
      });
      await prisma.routeStartAuthorization.create({
        data: { route_id: route.id, plate: `QA${label}${RUN_ID.slice(-4)}`, status: "bloqueada", reason: `Certificacion ${suffix}` }
      });
      await prisma.routeBlockEvent.create({
        data: { route_id: route.id, plate: `QA${label}${RUN_ID.slice(-4)}`, reason: `Certificacion ${suffix}`, severity: "baja" }
      });
    }
    if (withTrace) {
      await prisma.timePunch.create({
        data: { user_name: `qa-${suffix}`, type: "entrada", date: ROUTE_DATE, time: "06:02", route_id: route.id }
      });
      await prisma.gpsPing.create({
        data: { user_name: `qa-${suffix}`, latitude: 4.6533, longitude: -74.0836, route_id: route.id }
      });
      const session = await prisma.workSession.create({
        data: { user_name: `qa-${suffix}`, date: ROUTE_DATE, status: "activa", route_id: route.id }
      });
      await prisma.workActivity.create({
        data: { session_id: session.id, activity_type_name: "Cargue", user_name: `qa-${suffix}`, latitude: 4.6533, longitude: -74.0836, observation: `Certificacion ${suffix}`, route_id: route.id }
      });
      const employee = await prisma.employee.create({
        data: { code: `QA-${suffix}`.slice(0, 20), position: "Operario QA", department: "QA", salary_base: 1000000, hire_date: ROUTE_DATE }
      });
      fixture.employeeIds.push(employee.id);
      await prisma.processedWorkday.create({
        data: { employee_id: employee.id, date: ROUTE_DATE, route_id: route.id }
      });
    }
    return fixture;
  });
}

async function purgeRouteFixture(tenantId, routeId) {
  if (!tenantId || !routeId) return;
  await prisma.runWithTenant(tenantId, async () => {
    const checklists = await prisma.routePreoperationalChecklist.findMany({ where: { route_id: routeId, tenant_id: tenantId }, select: { id: true } });
    const checklistIds = checklists.map((item) => item.id);
    if (checklistIds.length) {
      const scope = { checklist_id: { in: checklistIds }, tenant_id: tenantId };
      await prisma.routePreoperationalChecklistAnswer.deleteMany({ where: scope });
      await prisma.routePreoperationalChecklistEvidence.deleteMany({ where: scope });
      await prisma.routePreoperationalFinding.deleteMany({ where: { tenant_id: tenantId, OR: [scope, { route_id: routeId }] } });
    }
    await prisma.routePreoperationalChecklist.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.routeStartAuthorization.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.routeBlockEvent.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.workActivity.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.workSession.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.timePunch.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.gpsPing.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.processedWorkday.deleteMany({ where: { route_id: routeId, tenant_id: tenantId } });
    await prisma.timeRoute.deleteMany({ where: { id: routeId, tenant_id: tenantId } });
  });
}

async function purgeStaleCertificationLeftovers(tenants) {
  const purged = { routes: 0, users: 0, employees: 0, roles: 0, errors: [] };
  for (const tenant of tenants) {
    if (!tenant) continue;
    await prisma.runWithTenant(tenant.id, async () => {
      const staleRoutes = await prisma.timeRoute.findMany({
        where: { notes: { startsWith: `${ROUTE_NOTE_PREFIX}${CERT_ID}` } },
        select: { id: true }
      });
      for (const route of staleRoutes) {
        try { await purgeRouteFixture(tenant.id, route.id); purged.routes += 1; } catch (error) { purged.errors.push(`route ${route.id}: ${error.message}`); }
      }
      const staleEmployees = await prisma.employee.findMany({ where: { code: { startsWith: STALE_CODE_PREFIX } }, select: { id: true } });
      for (const employee of staleEmployees) {
        try { await prisma.employee.delete({ where: { id: employee.id } }); purged.employees += 1; } catch (error) { purged.errors.push(`employee ${employee.id}: ${error.message}`); }
      }
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

async function countRows(tenantId, routeId) {
  return prisma.runWithTenant(tenantId, async () => ({
    route: await prisma.timeRoute.count({ where: { id: routeId } }),
    checklists: await prisma.routePreoperationalChecklist.count({ where: { route_id: routeId } }),
    answers: await prisma.routePreoperationalChecklistAnswer.count({ where: { checklist: { route_id: routeId } } }).catch(() => null),
    start_authorizations: await prisma.routeStartAuthorization.count({ where: { route_id: routeId } }),
    block_events: await prisma.routeBlockEvent.count({ where: { route_id: routeId } }),
    time_punches: await prisma.timePunch.count({ where: { route_id: routeId } }),
    gps_pings: await prisma.gpsPing.count({ where: { route_id: routeId } }),
    work_sessions: await prisma.workSession.count({ where: { route_id: routeId } }),
    work_activities: await prisma.workActivity.count({ where: { route_id: routeId } }),
    processed_workdays: await prisma.processedWorkday.count({ where: { route_id: routeId } }),
    findings: await prisma.routePreoperationalFinding.count({ where: { route_id: routeId } })
  }));
}

async function main() {
  let app = null;
  const cleanup = { users: [], roles: [], routes: [], employees: [], errors: [] };
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

    // ---- Fixtures: tres empresas locales (con modulo hr, superadmin, sin modulo hr) ----
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, active: true, active_modules: true } });
    const activeTenants = tenants.filter((tenant) => tenant.active !== false);
    const withHr = activeTenants.filter(tenantHasHrModule);
    const withoutHr = activeTenants.filter(tenantHrDisabled);
    const byName = (list, re) => list.find((tenant) => re.test(String(tenant.name || ""))) || list[0];
    const tenantP = byName(withHr, /puebla|operaciones/i);
    const tenantD = byName(withHr.filter((tenant) => tenant.id !== tenantP?.id), /demo|apex/i);
    const tenantX = byName(withoutHr, /prueba/i);
    check("fixture_tenants_resolved", Boolean(tenantP && tenantD && tenantX && tenantP.id !== tenantD.id && tenantX.id !== tenantP.id && tenantX.id !== tenantD.id), {
      con_permiso_y_sin_permiso: tenantP ? { id: tenantP.id, name: tenantP.name } : null,
      superadmin: tenantD ? { id: tenantD.id, name: tenantD.name } : null,
      sin_modulo_hr: tenantX ? { id: tenantX.id, name: tenantX.name, modules: modulesOf(tenantX) } : null
    });

    const dRoles = await admin.listRoles(tenantD.id, {}, "APEX_ADMIN");
    const apexAdminRole = dRoles.find((role) => String(role.name || "").trim().toUpperCase() === "APEX_ADMIN");
    check("fixture_superadmin_role_present", Boolean(apexAdminRole), { tenant: tenantD.name, roles: dRoles.length });

    // Una corrida anterior interrumpida puede dejar fixtures vivos: se limpian antes de sembrar.
    result.stale_leftovers_purged = await purgeStaleCertificationLeftovers([tenantP, tenantD, tenantX]);

    const grantRole = await admin.createRole(tenantP.id, {
      name: `QA Borrado Malla ${RUN_ID}`,
      description: "Rol temporal de certificacion con permiso especial de borrado fisico (se desactiva al final).",
      permissions: { talento_humano: { view: true, [PHYSICAL_DELETE_ACTION]: true } }
    });
    cleanup.roles.push({ tenantId: tenantP.id, id: grantRole.id });
    const plainRole = await admin.createRole(tenantP.id, {
      name: `QA Operador Malla ${RUN_ID}`,
      description: "Rol temporal de certificacion con lectura/edicion de Talento Humano pero sin borrado fisico (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true } }
    });
    cleanup.roles.push({ tenantId: tenantP.id, id: plainRole.id });
    const noModuleRole = await admin.createRole(tenantX.id, {
      name: `QA Sin Modulo ${RUN_ID}`,
      description: "Rol temporal de certificacion en empresa sin el modulo de Talento Humano (se desactiva al final).",
      permissions: { talento_humano: { view: true, [PHYSICAL_DELETE_ACTION]: true } }
    });
    cleanup.roles.push({ tenantId: tenantX.id, id: noModuleRole.id });
    check("fixture_roles_created", Boolean(grantRole.id && plainRole.id && noModuleRole.id), {
      con_permiso_especial: grantRole.name,
      sin_permiso_especial: plainRole.name,
      empresa_sin_modulo: noModuleRole.name
    });

    const userShape = (label, roleId, slug) => ({
      name: `QA ${label} ${RUN_ID}`,
      first_names: "QA",
      last_names: `${label} ${RUN_ID}`,
      email: `qa.delroute.${slug}.${RUN_ID}@apex.test`,
      password: PASSWORD,
      role_id: roleId,
      company: "QA",
      document: `QAD${RUN_ID}`.slice(0, 20),
      // createUser crea un Employee anidado con este code y Employee tiene @@unique([tenant_id, code]):
      // el code debe ser unico por corrida para que la certificacion sea repetible.
      code: `${STALE_CODE_PREFIX}${slug}-${RUN_ID.slice(-10)}`.slice(0, 24),
      department: "QA",
      position: "Usuario de certificacion",
      operational_classification: "administrativo",
      can_punch_time: false,
      can_be_assigned_routes: false,
      require_password_change: false
    });
    const userG = await admin.createUser(tenantP.id, userShape("ConPermiso", grantRole.id, "g"));
    cleanup.users.push({ tenantId: tenantP.id, id: userG.id });
    const userB = await admin.createUser(tenantP.id, userShape("SinPermiso", plainRole.id, "b"));
    cleanup.users.push({ tenantId: tenantP.id, id: userB.id });
    const userD = await admin.createUser(tenantD.id, userShape("Super", apexAdminRole.id, "d"));
    cleanup.users.push({ tenantId: tenantD.id, id: userD.id });
    const userX = await admin.createUser(tenantX.id, userShape("SinModulo", noModuleRole.id, "x"));
    cleanup.users.push({ tenantId: tenantX.id, id: userX.id });
    // createUser siempre crea un Employee anidado; se registra para desactivarlo en la limpieza.
    for (const [tenantId, user] of [[tenantP.id, userG], [tenantP.id, userB], [tenantD.id, userD], [tenantX.id, userX]]) {
      if (user.employee_id) cleanup.employees.push({ tenantId, id: user.employee_id });
    }

    const tokenG = await login(userG.metadata?.access?.email || `qa.delroute.g.${RUN_ID}@apex.test`);
    const tokenB = await login(userB.metadata?.access?.email || `qa.delroute.b.${RUN_ID}@apex.test`);
    const tokenD = await login(userD.metadata?.access?.email || `qa.delroute.d.${RUN_ID}@apex.test`);
    const tokenX = await login(userX.metadata?.access?.email || `qa.delroute.x.${RUN_ID}@apex.test`);
    result.fixture = {
      tenants: {
        con_permiso: { id: tenantP.id, name: tenantP.name, role: grantRole.name, user_id: userG.id },
        superadmin: { id: tenantD.id, name: tenantD.name, role: apexAdminRole.name, user_id: userD.id },
        sin_modulo: { id: tenantX.id, name: tenantX.name, role: noModuleRole.name, user_id: userX.id }
      },
      operating_date: TODAY
    };
    check("fixture_users_can_login", Boolean(tokenG && tokenB && tokenD && tokenX), { logins: 4 });

    // ---- Mallas de prueba ----
    const routeA = await seedRoute(tenantP.id, "A", { withOpenChecklist: true, withTrace: true });
    const routeB = await seedRoute(tenantP.id, "B", {});
    const routeC = await seedRoute(tenantD.id, "C", {});
    cleanup.routes.push({ tenantId: tenantP.id, id: routeA.routeId }, { tenantId: tenantP.id, id: routeB.routeId }, { tenantId: tenantD.id, id: routeC.routeId });
    cleanup.employees.push(...routeA.employeeIds.map((id) => ({ tenantId: tenantP.id, id })));
    result.fixture.routes = {
      a_completa: { tenant: tenantP.name, route_id: routeA.routeId, checklist_con_hijos: 6, traza_operativa: 5 },
      b_minima: { tenant: tenantP.name, route_id: routeB.routeId },
      c_superadmin: { tenant: tenantD.name, route_id: routeC.routeId }
    };
    check("fixture_routes_seeded", [routeA.routeId, routeB.routeId, routeC.routeId].every((id) => Number.isInteger(id) && id > 0), {
      route_a: routeA.routeId, route_b: routeB.routeId, route_c: routeC.routeId
    });

    // ---- Vista previa de impacto ----
    const previewBlocked = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenG });
    const blockedBody = previewBlocked.payload || {};
    check("preview_reports_special_grant", previewBlocked.status === 200 && blockedBody.permissions?.can_physical_delete === true, {
      status: previewBlocked.status, permissions: blockedBody.permissions ?? null
    });
    check("preview_blocks_open_checklist", blockedBody.can_delete === false && blockedBody.blockers?.[0]?.code === "ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST", {
      can_delete: blockedBody.can_delete, blocker: blockedBody.blockers?.[0]?.code ?? null, checklist_ids: blockedBody.blockers?.[0]?.detail?.checklist_ids ?? null
    });
    check("preview_quantifies_deletion", blockedBody.will_delete?.total === 6 && blockedBody.will_delete?.checklists === 1
      && blockedBody.will_delete?.checklist_answers === 1 && blockedBody.will_delete?.checklist_evidence === 1
      && blockedBody.will_delete?.checklist_findings === 1 && blockedBody.will_delete?.start_authorizations === 1
      && blockedBody.will_delete?.block_events === 1, { will_delete: blockedBody.will_delete ?? null });
    check("preview_preserves_operational_trace", blockedBody.preserved_trace?.total === 5 && blockedBody.preserved_trace?.time_punches === 1
      && blockedBody.preserved_trace?.gps_pings === 1 && blockedBody.preserved_trace?.work_sessions === 1
      && blockedBody.preserved_trace?.work_activities === 1 && blockedBody.preserved_trace?.processed_workdays === 1
      && blockedBody.requires_trace_acknowledgement === true, { preserved_trace: blockedBody.preserved_trace ?? null });
    check("preview_returns_route_snapshot", blockedBody.route?.employee_count === 2 && blockedBody.route?.date === TODAY && blockedBody.route?.route_id === undefined
      && blockedBody.route_id === routeA.routeId, { route: blockedBody.route ?? null, route_id: blockedBody.route_id });

    const previewWithoutGrant = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenB });
    check("preview_hides_grant_without_permission", previewWithoutGrant.status === 200 && previewWithoutGrant.payload?.permissions?.can_physical_delete === false, {
      status: previewWithoutGrant.status, permissions: previewWithoutGrant.payload?.permissions ?? null
    });

    // ----- Cierre del checklist preoperacional: la malla pasa a ser eliminable -----
    await prisma.runWithTenant(tenantP.id, async () => {
      await prisma.routePreoperationalChecklist.update({ where: { id: routeA.checklistId }, data: { checklist_status: "aprobado", completed_at: new Date() } });
    });
    const previewReady = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenG });
    check("preview_unblocks_after_checklist_closed", previewReady.status === 200 && previewReady.payload?.can_delete === true
      && Array.isArray(previewReady.payload?.blockers) && previewReady.payload.blockers.length === 0
      && previewReady.payload?.permissions?.can_physical_delete === true, {
      status: previewReady.status, can_delete: previewReady.payload?.can_delete, blockers: previewReady.payload?.blockers?.length ?? null
    });

    // ---- Denegaciones ----
    const deleteAsPlain = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenB, method: "DELETE", body: { reason: REASON, confirmed: true } });
    check("delete_requires_special_permission", deleteAsPlain.status === 403 && deleteAsPlain.payload?.code === "PERMISO_BORRADO_FISICO_DENEGADO", {
      status: deleteAsPlain.status, code: deleteAsPlain.payload?.code ?? null
    });

    const schemaMissingReason = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenG, method: "DELETE", body: { confirmed: true } });
    const schemaShortReason = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenG, method: "DELETE", body: { reason: "corto", confirmed: true } });
    const schemaUnconfirmed = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: false } });
    check("delete_requires_reason_and_confirmation", [schemaMissingReason, schemaShortReason, schemaUnconfirmed].every((response) => response.status === 400), {
      sin_motivo: schemaMissingReason.status, motivo_corto: schemaShortReason.status, sin_confirmacion: schemaUnconfirmed.status
    });

    const stalePreview = await capture(`/api/v1/hr/routes/${routeA.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 99, expected_date: TODAY, acknowledge_trace: true }
    });
    check("delete_detects_stale_preview", stalePreview.status === 409 && stalePreview.payload?.code === "ROUTE_DELETE_STALE_PREVIEW"
      && stalePreview.payload?.details?.expected_employees === 99 && stalePreview.payload?.details?.current_employees === 2, {
      status: stalePreview.status, code: stalePreview.payload?.code ?? null, details: stalePreview.payload?.details ?? null
    });

    const missingAck = await capture(`/api/v1/hr/routes/${routeA.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY }
    });
    check("delete_requires_trace_acknowledgement", missingAck.status === 409 && missingAck.payload?.code === "ROUTE_DELETE_TRACE_NOT_ACKNOWLEDGED"
      && missingAck.payload?.details?.preserved_trace?.total === 5, {
      status: missingAck.status, code: missingAck.payload?.code ?? null, preserved_trace: missingAck.payload?.details?.preserved_trace ?? null
    });

    // ---- Aislamiento multi-tenant y modulo habilitado ----
    const crossTenantPreview = await capture(`/api/v1/hr/routes/${routeB.routeId}/deletion-impact`, { token: tokenD });
    const crossTenantDelete = await capture(`/api/v1/hr/routes/${routeB.routeId}`, { token: tokenD, method: "DELETE", body: { reason: REASON, confirmed: true, acknowledge_trace: true } });
    const crossTenantDeleteReverse = await capture(`/api/v1/hr/routes/${routeC.routeId}`, { token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, acknowledge_trace: true } });
    check("cross_tenant_hidden_as_not_found", crossTenantPreview.status === 404 && crossTenantPreview.payload?.code === "ROUTE_NOT_FOUND"
      && crossTenantDelete.status === 404 && crossTenantDelete.payload?.code === "ROUTE_NOT_FOUND"
      && crossTenantDeleteReverse.status === 404 && crossTenantDeleteReverse.payload?.code === "ROUTE_NOT_FOUND", {
      preview_ajena: crossTenantPreview.status, delete_ajena: crossTenantDelete.status, delete_inversa: crossTenantDeleteReverse.status
    });
    const aliveAfterCrossTenant = await countRows(tenantP.id, routeB.routeId);
    const aliveForeign = await countRows(tenantD.id, routeC.routeId);
    check("cross_tenant_targets_stay_alive", aliveAfterCrossTenant.route === 1 && aliveForeign.route === 1, {
      route_b_p: aliveAfterCrossTenant.route, route_c_d: aliveForeign.route
    });

    const noModuleDelete = await capture(`/api/v1/hr/routes/${routeB.routeId}`, { token: tokenX, method: "DELETE", body: { reason: REASON, confirmed: true, acknowledge_trace: true } });
    const noModulePreview = await capture(`/api/v1/hr/routes/${routeB.routeId}/deletion-impact`, { token: tokenX });
    check("module_gate_blocks_without_hr_module", noModuleDelete.status === 403 && noModuleDelete.payload?.code === "MODULO_NO_HABILITADO"
      && noModulePreview.status === 403 && noModulePreview.payload?.code === "MODULO_NO_HABILITADO", {
      delete: { status: noModuleDelete.status, code: noModuleDelete.payload?.code ?? null },
      preview: { status: noModulePreview.status, code: noModulePreview.payload?.code ?? null },
      tenant_modules: modulesOf(tenantX)
    });

    // ---- Borrado fisico aplicado con el permiso especial ----
    const applied = await capture(`/api/v1/hr/routes/${routeA.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY, acknowledge_trace: true }
    });
    check("delete_applies_with_special_permission", applied.status === 200 && applied.payload?.ok === true
      && applied.payload?.deleted?.total === 6 && applied.payload?.preserved_trace?.total === 5
      && applied.payload?.reason === REASON && applied.payload?.approved_by?.role === grantRole.name
      && applied.payload?.route?.employee_count === 2, {
      status: applied.status, deleted: applied.payload?.deleted ?? null, preserved_trace: applied.payload?.preserved_trace ?? null,
      approved_by: applied.payload?.approved_by ?? null
    });

    const afterDelete = await countRows(tenantP.id, routeA.routeId);
    check("deleted_rows_are_gone_and_trace_survives", afterDelete.route === 0 && afterDelete.checklists === 0
      && afterDelete.start_authorizations === 0 && afterDelete.block_events === 0 && afterDelete.findings === 0
      && afterDelete.time_punches === 1 && afterDelete.gps_pings === 1 && afterDelete.work_sessions === 1
      && afterDelete.work_activities === 1 && afterDelete.processed_workdays === 1, afterDelete);

    const previewGone = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenG });
    check("deleted_route_preview_is_404", previewGone.status === 404 && previewGone.payload?.code === "ROUTE_NOT_FOUND", { status: previewGone.status, code: previewGone.payload?.code ?? null });

    const auditRow = await prisma.runWithTenant(tenantP.id, () => prisma.auditLog.findFirst({
      where: { tenant_id: tenantP.id, action: "route.physical_deletion.applied", entity: "TimeRoute", entity_id: String(routeA.routeId) },
      orderBy: { id: "desc" }
    }));
    check("deletion_is_audited_with_actor_and_reason", Boolean(auditRow)
      && auditRow.user_id === userG.id
      && Boolean(auditRow.session_id)
      && auditRow.module === "hr"
      && auditRow.old_value?.reason === REASON
      && auditRow.old_value?.deleted?.total === 6
      && auditRow.old_value?.preserved_trace?.total === 5
      && auditRow.new_value?.actor?.role === grantRole.name, {
      audit_id: auditRow?.id != null ? String(auditRow.id) : null, user_id: auditRow?.user_id ?? null, module: auditRow?.module ?? null,
      old_value: auditRow?.old_value ?? null, new_value: auditRow?.new_value ?? null
    });

    // ---- Malla sin checklist ni traza: se elimina sin exigir reconocimiento ----
    const minimalDelete = await capture(`/api/v1/hr/routes/${routeB.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY }
    });
    check("delete_minimal_route_without_acknowledgement", minimalDelete.status === 200 && minimalDelete.payload?.ok === true
      && minimalDelete.payload?.deleted?.total === 0 && minimalDelete.payload?.preserved_trace?.total === 0, {
      status: minimalDelete.status, deleted: minimalDelete.payload?.deleted ?? null, preserved_trace: minimalDelete.payload?.preserved_trace ?? null
    });

    // ---- Ruta alternativa /talento-humano/mallas + rol superadministrador (*:*) ----
    const aliasPreview = await capture(`/api/v1/talento-humano/mallas/${routeC.routeId}/deletion-impact`, { token: tokenD });
    check("alias_route_serves_impact_preview", aliasPreview.status === 200 && aliasPreview.payload?.permissions?.can_physical_delete === true
      && aliasPreview.payload?.can_delete === true, { status: aliasPreview.status, permissions: aliasPreview.payload?.permissions ?? null });

    const aliasDelete = await capture(`/api/v1/talento-humano/mallas/${routeC.routeId}`, {
      token: tokenD, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY }
    });
    check("superadmin_wildcard_grant_applies", aliasDelete.status === 200 && aliasDelete.payload?.ok === true
      && aliasDelete.payload?.deleted?.total === 0 && aliasDelete.payload?.approved_by?.role === apexAdminRole.name, {
      status: aliasDelete.status, approved_by: aliasDelete.payload?.approved_by ?? null
    });

    // ---- Aserciones de codigo ----
    const rbacSrc = readSource(RBAC_JS);
    check("rbac_defines_special_delete_gate", [
      /const PHYSICAL_DELETE_ACTION = "delete_physical_records";/.test(rbacSrc),
      /function hasPhysicalDeleteGrant\(role, resourceKey\)/.test(rbacSrc),
      /function requirePhysicalDeleteGrant\(resourceKey\)/.test(rbacSrc),
      /"PERMISO_BORRADO_FISICO_DENEGADO"/.test(rbacSrc),
      /"MODULO_NO_HABILITADO"/.test(rbacSrc),
      /"ALCANCE_ROL_DENEGADO"/.test(rbacSrc)
    ].every(Boolean), {
      action: /PHYSICAL_DELETE_ACTION = "delete_physical_records"/.test(rbacSrc),
      legacy_keys: /PHYSICAL_DELETE_LEGACY_KEYS/.test(rbacSrc)
    });

    const routesSrc = readSource(HR_ROUTES);
    check("hr_routes_gate_delete_with_special_permission", [
      /requirePhysicalDeleteGrant\("hr"\)/.test(routesSrc),
      /hasPhysicalDeleteGrant\(request\.user\?\.role, "hr"\)/.test(routesSrc),
      /deletion-impact/.test(routesSrc),
      /requestContext\(request\)/.test(routesSrc)
    ].every(Boolean), { grants: (routesSrc.match(/requirePhysicalDeleteGrant\("hr"\)/g) || []).length });

    const serviceSrc = readSource(HR_SERVICE);
    check("hr_service_validates_before_physical_delete", [
      /const ROUTE_DELETE_REASON_MIN = 12;/.test(serviceSrc),
      /"ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST"/.test(serviceSrc),
      /"ROUTE_DELETE_STALE_PREVIEW"/.test(serviceSrc),
      /"ROUTE_DELETE_TRACE_NOT_ACKNOWLEDGED"/.test(serviceSrc),
      /action: "route\.physical_deletion\.applied"/.test(serviceSrc),
      /input\.confirmed !== true/.test(serviceSrc),
      /\$transaction/.test(serviceSrc)
    ].every(Boolean), {
      blocked: /ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST/.test(serviceSrc),
      audited: /route\.physical_deletion\.applied/.test(serviceSrc)
    });

    const schemaSrc = readSource(HR_SCHEMA);
    check("route_delete_schema_demands_reason_and_confirmation", /routeDeleteSchema/.test(schemaSrc) && /minLength: 12/.test(schemaSrc) && /const: true/.test(schemaSrc), {
      schema: /routeDeleteSchema/.test(schemaSrc)
    });

    const prismaSrc = readSource(PRISMA_CORE);
    check("prisma_allows_physical_delete_of_route_tree", ["TimeRoute", "RoutePreoperationalChecklist", "RoutePreoperationalChecklistAnswer", "RoutePreoperationalChecklistEvidence", "RoutePreoperationalFinding", "RouteStartAuthorization", "RouteBlockEvent"].every((model) => prismaSrc.includes(`"${model}"`)), {
      allowed_set: /PHYSICAL_DELETE_ALLOWED/.test(prismaSrc)
    });

    const rutasSrc = readSource(WEB_RUTAS);
    check("monitor_is_accessible_modal_with_per_user_validation", [
      /createPortal/.test(rutasSrc),
      /aria-modal="true"/.test(rutasSrc),
      /aria-label="Monitor de horario"/.test(rutasSrc),
      /aria-pressed=\{active\}/.test(rutasSrc),
      /monitorPersonKey/.test(rutasSrc),
      /resetMonitorFilters/.test(rutasSrc)
    ].every(Boolean), { modal: /createPortal/.test(rutasSrc), per_user: /monitorPersonKey/.test(rutasSrc) });

    check("delete_ui_reviews_impact_and_confirms_trace", [
      /can_physical_delete/.test(rutasSrc),
      /deletion-impact/.test(rutasSrc),
      /expected_employees/.test(rutasSrc),
      /acknowledge_trace/.test(rutasSrc)
    ].every(Boolean), {
      grant_hint: /can_physical_delete/.test(rutasSrc),
      trace_ack: /acknowledge_trace/.test(rutasSrc)
    });

    const paletteSrc = readSource(WEB_PALETTE);
    const functionsSrc = readSource(WEB_FUNCTIONS);
    const functionEntries = functionsSrc.match(/id: "fn-/g) || [];
    check("palette_covers_functions_of_all_modules", /MODULE_FUNCTIONS/.test(paletteSrc) && /moduleHome/.test(paletteSrc)
      && functionEntries.length >= 60 && /fn-hr-rutas/.test(functionsSrc) && /Crear mallas/.test(functionsSrc)
      && /fn-hr-mapa/.test(functionsSrc) && /[Vv]er monitor/.test(functionsSrc), {
      function_entries: functionEntries.length,
      crear_mallas: /Crear mallas/.test(functionsSrc),
      ver_monitor: /[Vv]er monitor/.test(functionsSrc)
    });

    // ---- Suites unitarios versionados ----
    const apiUnit = spawnSync(process.execPath, ["--test", "test/hr-route-physical-deletion.test.js"], { cwd: API, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" } });
    const apiUnitOut = `${apiUnit.stdout || ""}${apiUnit.stderr || ""}`;
    check("api_unit_suite_passes", apiUnit.status === 0 && /(?:#|ℹ)\s+fail\s+0/.test(apiUnitOut) && /(?:#|ℹ)\s+pass\s+11/.test(apiUnitOut), {
      exit: apiUnit.status, pass: (apiUnitOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1], fail: (apiUnitOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1]
    });
    const apiContract = spawnSync(process.execPath, ["--test", "test/hr-route-physical-deletion-contract.test.js"], { cwd: API, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" } });
    const apiContractOut = `${apiContract.stdout || ""}${apiContract.stderr || ""}`;
    check("api_contract_suite_passes", apiContract.status === 0 && /(?:#|ℹ)\s+fail\s+0/.test(apiContractOut) && /(?:#|ℹ)\s+pass\s+7/.test(apiContractOut), {
      exit: apiContract.status, pass: (apiContractOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1], fail: (apiContractOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1]
    });
    const webSuite = spawnSync(process.execPath, ["--test", "test/hr-monitor-modal-per-user.test.mjs", "test/command-palette-module-functions.test.mjs"], { cwd: WEB, encoding: "utf8" });
    const webOut = `${webSuite.stdout || ""}${webSuite.stderr || ""}`;
    check("web_suites_pass", webSuite.status === 0 && /(?:#|ℹ)\s+fail\s+0/.test(webOut) && /(?:#|ℹ)\s+pass\s+17/.test(webOut), {
      exit: webSuite.status, pass: (webOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1], fail: (webOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1]
    });
    result.versioned_suites = {
      "apps/api/test/hr-route-physical-deletion.test.js": { pass: 11, fail: 0 },
      "apps/api/test/hr-route-physical-deletion-contract.test.js": { pass: 7, fail: 0 },
      "apps/web/test/hr-monitor-modal-per-user.test.mjs + command-palette-module-functions.test.mjs": { pass: 17, fail: 0 }
    };

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    for (const route of cleanup.routes) {
      try {
        const existing = await prisma.runWithTenant(route.tenantId, () => prisma.timeRoute.count({ where: { id: route.id } }));
        if (existing > 0) await purgeRouteFixture(route.tenantId, route.id);
      } catch (error) { cleanup.errors.push(`route ${route.id}: ${error.message}`); }
    }
    for (const employee of cleanup.employees) {
      try {
        await prisma.runWithTenant(employee.tenantId, () => prisma.employee.delete({ where: { id: employee.id } }));
      } catch (error) { cleanup.errors.push(`employee ${employee.id}: ${error.message}`); }
    }
    for (const user of cleanup.users) {
      try { await admin.setUserActive(user.tenantId, user.id, false); } catch (error) { cleanup.errors.push(`user ${user.id}: ${error.message}`); }
    }
    for (const role of cleanup.roles) {
      try { await admin.setRoleActive(role.tenantId, role.id, false); } catch (error) { cleanup.errors.push(`role ${role.id}: ${error.message}`); }
    }
    result.cleanup = {
      routes_purged: cleanup.routes.length,
      employees_deactivated: cleanup.employees.length,
      users_deactivated: cleanup.users.length,
      roles_deactivated: cleanup.roles.length,
      errors: cleanup.errors
    };
    result.finished_at = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      // AuditLog.id es BigInt: se serializa como string para que la evidencia sea JSON valido.
      fs.writeFileSync(OUTPUT, `${JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
    } finally {
      // La API embebida debe soltar el puerto aunque la escritura de evidencia falle.
      if (app) await app.close().catch(() => undefined);
    }
  }
}

main()
  .then(() => console.log(`CERTIFICACION BORRADO FISICO DE MALLAS APROBADA: ${result.checks.length} controles, status=${result.status}`))
  .catch((error) => { console.error(`CERTIFICACION BORRADO FISICO DE MALLAS BLOQUEADA: ${error.message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
