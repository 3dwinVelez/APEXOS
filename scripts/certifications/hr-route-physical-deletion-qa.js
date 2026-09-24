// Certificacion QA (extremo a extremo) del borrado fisico controlado de mallas/horarios
// (TimeRoute) bajo el permiso especial delete_physical_records, junto con el monitor de
// horarios en ventana emergente con validacion por usuario y el buscador Ctrl+K global.
//
// Diferencias con la certificacion local:
//   - Ejercita la API DESPLEGADA en QA por HTTP (QA_API_URL) y exige que el commit
//     desplegado coincida con QA_EXPECTED_COMMIT (/health -> commit).
//   - Crea fixtures controlados en la base de QA con datos de la empresa modelo NYVORA,
//     un rol autorizado, un rol SIN el permiso especial y un usuario de otro tenant.
//   - Aborta si DATABASE_URL no corresponde al proyecto QA de Supabase; nunca escribe
//     en produccion ni en una base local.
//
// Modos:
//   --preflight  Verifica solo ambiente: /health, commit desplegado, login administrativo
//                (QA_LOGIN_EMAIL/QA_LOGIN_PASSWORD) vía grant de contraseña de Supabase
//                Auth (la cuenta admin de QA vive en auth.users; /api/v1/auth/login solo
//                cubre usuarios Prisma) y lectura de endpoints clave. No crea ni borra
//                fixtures.
//   (sin flags)  Certificacion completa: fixtures NYVORA + borrado fisico real de una malla
//                de prueba + aislamiento multi-tenant + auditoria + captura de errores
//                operativos en marcaciones + limpieza selectiva.
//
// Uso:
//   QA_API_URL=https://apexos-api-qa-production.up.railway.app \
//   QA_EXPECTED_COMMIT=<sha-desplegado> DATABASE_URL=<qa-supabase> \
//   node scripts/certifications/hr-route-physical-deletion-qa.js
//
// Sale con codigo distinto de cero ante cualquier control fallido. La evidencia JSON no
// contiene contrasenas, tokens ni secretos.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

const QA_API_HOST = "apexos-api-qa-production.up.railway.app";
const PRODUCTION_MARKERS = ["apexos-api-prod", "jzbwzmkidfthknsohhnr"];
const QA_SUPABASE_PROJECT_REF = "jbirkghkekuifgfsgquq";
const CERT_ID = "hr-route-physical-deletion-20260923";
const PREFLIGHT = args.preflight === true;
const API_URL = String(args["api-url"] || process.env.QA_API_URL || `https://${QA_API_HOST}`).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 30000);
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
// La malla debe caer dentro del dia operativo de Bogota: el monitor filtra con
// startOfDay(-05:00), asi que una medianoche UTC quedaria 5 horas fuera del rango.
const ROUTE_DATE = new Date(`${TODAY}T00:00:00-05:00`);
const OUTPUT = path.resolve(String(args.output || `docs/qa/evidence/${CERT_ID}/qa-certification.json`));
const REASON = `Certificacion QA ${RUN_ID}: malla de prueba eliminada de forma controlada y trazable`;
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];
const PHYSICAL_DELETE_ACTION = "delete_physical_records";
const ROUTE_NOTE_PREFIX = "QA certification ";
const STALE_CODE_PREFIX = "QA-DEL-";
const STALE_EMAIL_PREFIX = "qa.delroute.";
const STALE_ROLE_PREFIXES = ["QA Borrado Malla", "QA Operador Malla", "QA Sin Modulo", "QA Marcador Malla", "QA Conductor Malla"];
const PASSWORD = `Qa-DelR-${crypto.randomBytes(6).toString("hex")}#26`;

function fail(message) {
  console.error(`BLOQUEADO: ${message}`);
  process.exit(1);
}

if (PREFLIGHT && /apexos-web/i.test(API_URL)) fail("QA_API_URL debe apuntar a la API, no al frontend.");
if (!API_URL.includes(QA_API_HOST)) fail(`QA_API_URL debe apuntar al API de QA (${QA_API_HOST}). Recibido: ${API_URL}`);
if (PRODUCTION_MARKERS.some((marker) => API_URL.includes(marker))) fail("QA_API_URL apunta a produccion. Prohibido certificar produccion desde este script.");
const EXPECTED_COMMIT = String(args["expected-commit"] || process.env.QA_EXPECTED_COMMIT || "").trim();
if (!EXPECTED_COMMIT) fail("QA_EXPECTED_COMMIT es obligatorio (sha del commit desplegado en QA).");

const result = {
  change_id: CERT_ID,
  certification: PREFLIGHT ? "hr-route-physical-deletion-qa-preflight" : "hr-route-physical-deletion-qa",
  environment: "QA",
  company: "NYVORA",
  mode: PREFLIGHT ? "preflight" : "full",
  generated_at: new Date().toISOString(),
  api_url: API_URL,
  expected_commit: EXPECTED_COMMIT,
  deployed_commit: "unknown",
  operating_date: TODAY,
  checks: [],
  observations: {},
  coverage_notes: [],
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

async function supabasePasswordGrant(supabaseUrl, anonKey, email, password) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  return { status, payload, transportError, access_token: payload?.access_token || "", latency_ms: Date.now() - started };
}

function writeEvidence() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
}

function modulesOf(tenant) {
  return Array.isArray(tenant.active_modules) ? tenant.active_modules.map((code) => String(code || "").trim().toLowerCase()) : [];
}
function tenantHasHrModule(tenant) {
  return modulesOf(tenant).some((code) => HR_CODES.includes(code));
}

async function main() {
  const health = await capture("/health");
  result.deployed_commit = health.payload?.commit || "unknown";
  check("qa_health_ok", health.status === 200 && health.payload?.status === "OK" && !health.transportError, {
    status: health.status, commit: result.deployed_commit, transport_error: health.transportError, latency_ms: health.latency_ms
  });
  check("qa_runs_expected_commit", String(result.deployed_commit).startsWith(EXPECTED_COMMIT.slice(0, 12)), {
    deployed: result.deployed_commit, expected: EXPECTED_COMMIT.slice(0, 12)
  });

  if (PREFLIGHT) {
    const email = String(args["login-email"] || process.env.QA_LOGIN_EMAIL || "").trim();
    const password = String(args["login-password"] || process.env.QA_LOGIN_PASSWORD || "");
    check("qa_login_credentials_present", Boolean(email && password), { email_provided: Boolean(email), password_provided: Boolean(password) });
    // La cuenta administrativa de QA vive en Supabase Auth; /api/v1/auth/login solo
    // autentica por bcrypt contra usuarios Prisma, asi que el token se obtiene con el
    // mismo grant de contrasena que usa la app web QA contra Supabase.
    const supabaseUrl = String(args["supabase-url"] || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
    const supabaseAnonKey = String(args["supabase-anon-key"] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    check("qa_supabase_config_present", Boolean(supabaseUrl && supabaseAnonKey) && supabaseUrl.includes(QA_SUPABASE_PROJECT_REF), {
      url_provided: Boolean(supabaseUrl), url_is_qa_project: supabaseUrl.includes(QA_SUPABASE_PROJECT_REF),
      anon_key_provided: Boolean(supabaseAnonKey)
    });
    const grant = await supabasePasswordGrant(supabaseUrl, supabaseAnonKey, email, password);
    check("qa_admin_login_ok", grant.status === 200 && Boolean(grant.access_token), {
      status: grant.status, has_access_token: Boolean(grant.access_token),
      transport_error: grant.transportError, latency_ms: grant.latency_ms
    });
    const token = grant.access_token;
    const me = await capture("/api/v1/auth/me", { token });
    check("qa_session_ok", me.status === 200, { status: me.status, transport_error: me.transportError });
    const routes = await capture("/api/v1/hr/routes?limit=5", { token });
    const summaries = await capture("/api/v1/hr/routes/event-summaries", { token });
    check("qa_monitor_endpoints_ok", routes.status === 200 && summaries.status === 200, {
      list_routes: routes.status, event_summaries: summaries.status
    });
    const unauthorized = await capture("/api/v1/hr/routes?limit=1");
    check("qa_unauthorized_blocked", unauthorized.status === 401, { status: unauthorized.status });
    result.status = "passed";
    return;
  }

  const databaseUrl = String(process.env.DATABASE_URL || "");
  if (!databaseUrl) fail("DATABASE_URL de QA es obligatorio para la certificacion completa (fixtures NYVORA).");
  if (PRODUCTION_MARKERS.some((marker) => databaseUrl.includes(marker))) fail("DATABASE_URL apunta a produccion. Prohibido continuar.");
  if (!databaseUrl.includes(QA_SUPABASE_PROJECT_REF)) fail(`DATABASE_URL no corresponde al proyecto QA de Supabase (${QA_SUPABASE_PROJECT_REF}).`);
  result.database_project = QA_SUPABASE_PROJECT_REF;

  const prisma = require(path.join(__dirname, "..", "..", "apps/api/src/core/prisma"));
  const admin = require(path.join(__dirname, "..", "..", "apps/api/src/modules/admin/service"));

  const cleanup = { users: [], roles: [], routes: [], employees: [], errors: [] };
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, active: true, active_modules: true } });
    const activeTenants = tenants.filter((tenant) => tenant.active !== false);
    const nyvora = activeTenants.find((tenant) => /^nyvora$/i.test(String(tenant.name || "").trim()));
    check("qa_model_company_present", Boolean(nyvora && tenantHasHrModule(nyvora)), {
      tenant: nyvora ? { id: nyvora.id, name: nyvora.name, modules: modulesOf(nyvora) } : null
    });
    const otherTenant = activeTenants
      .filter((tenant) => tenant.id !== nyvora.id && tenantHasHrModule(tenant))
      .sort((a, b) => (/nyvora/i.test(a.name) ? -1 : 0) - (/nyvora/i.test(b.name) ? -1 : 0))
      .find((tenant) => true);
    check("qa_other_tenant_present", Boolean(otherTenant), { tenant: otherTenant ? { id: otherTenant.id, name: otherTenant.name } : null });

    result.company = nyvora.name;
    result.observations.tenants = {
      model_company: { id: nyvora.id, name: nyvora.name },
      other_tenant: { id: otherTenant.id, name: otherTenant.name }
    };

    // Corridas anteriores interrumpidas pueden dejar fixtures vivos: se limpian antes de sembrar.
    result.stale_leftovers_purged = await purgeStale(prisma, admin, [nyvora, otherTenant]);

    const grantRole = await admin.createRole(nyvora.id, {
      name: `QA Borrado Malla ${RUN_ID}`,
      description: "Rol temporal de certificacion con permiso especial de borrado fisico (se desactiva al final).",
      permissions: { talento_humano: { view: true, [PHYSICAL_DELETE_ACTION]: true } }
    });
    cleanup.roles.push({ tenantId: nyvora.id, id: grantRole.id });
    const plainRole = await admin.createRole(nyvora.id, {
      name: `QA Operador Malla ${RUN_ID}`,
      description: "Rol temporal de certificacion con lectura/edicion de Talento Humano pero sin borrado fisico (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true } }
    });
    cleanup.roles.push({ tenantId: nyvora.id, id: plainRole.id });
    const otherRoles = await admin.listRoles(otherTenant.id, {}, "APEX_ADMIN");
    const otherAdminRole = otherRoles.find((role) => String(role.name || "").trim().toUpperCase() === "APEX_ADMIN");
    check("qa_other_tenant_superadmin_role_present", Boolean(otherAdminRole), {
      tenant: otherTenant.name, roles: otherRoles.length
    });
    check("qa_roles_created", Boolean(grantRole.id && plainRole.id), {
      con_permiso_especial: grantRole.name, sin_permiso_especial: plainRole.name
    });

    const userShape = (label, roleId, slug) => ({
      name: `QA ${label} ${RUN_ID}`,
      first_names: "QA",
      last_names: `${label} ${RUN_ID}`,
      email: `${STALE_EMAIL_PREFIX}${slug}.${RUN_ID}@apex.test`,
      password: PASSWORD,
      role_id: roleId,
      company: "QA",
      document: `QAD${RUN_ID}`.slice(0, 20),
      code: `${STALE_CODE_PREFIX}${slug}-${RUN_ID.slice(-10)}`.slice(0, 24),
      department: "QA",
      position: "Usuario de certificacion",
      operational_classification: "administrativo",
      can_punch_time: false,
      can_be_assigned_routes: false,
      require_password_change: false
    });
    const userG = await admin.createUser(nyvora.id, userShape("ConPermiso", grantRole.id, "g"));
    cleanup.users.push({ tenantId: nyvora.id, id: userG.id });
    const userB = await admin.createUser(nyvora.id, userShape("SinPermiso", plainRole.id, "b"));
    cleanup.users.push({ tenantId: nyvora.id, id: userB.id });
    const userX = await admin.createUser(otherTenant.id, userShape("OtroTenant", otherAdminRole.id, "x"));
    cleanup.users.push({ tenantId: otherTenant.id, id: userX.id });
    for (const [tenantId, user] of [[nyvora.id, userG], [nyvora.id, userB], [otherTenant.id, userX]]) {
      if (user.employee_id) cleanup.employees.push({ tenantId, id: user.employee_id });
    }

    const loginAs = async (user, slug) => {
      const email = user.metadata?.access?.email || `${STALE_EMAIL_PREFIX}${slug}.${RUN_ID}@apex.test`;
      const response = await capture("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
      if (response.status !== 200 || !response.payload?.token) {
        throw new Error(`Login QA fallo para ${slug}: ${response.status} ${response.payload?.code || response.transportError || ""}`);
      }
      return response.payload.token;
    };
    const tokenG = await loginAs(userG, "g");
    const tokenB = await loginAs(userB, "b");
    const tokenX = await loginAs(userX, "x");
    check("qa_fixture_users_can_login", Boolean(tokenG && tokenB && tokenX), { logins: 3 });

    result.fixture = {
      model_company: {
        tenant_id: nyvora.id,
        role_with_special_permission: grantRole.name,
        role_without_special_permission: plainRole.name,
        user_with_permission_id: userG.id,
        user_without_permission_id: userB.id
      },
      other_tenant: { tenant_id: otherTenant.id, role: otherAdminRole.name, user_id: userX.id },
      operating_date: TODAY,
      credentials: "redacted"
    };

    // ---- Mallas de prueba ----
    const routeA = await seedRoute(prisma, nyvora.id, "A", { withOpenChecklist: true, withTrace: true });
    const routeB = await seedRoute(prisma, nyvora.id, "B", {});
    const routeC = await seedRoute(prisma, otherTenant.id, "C", {});
    cleanup.routes.push({ tenantId: nyvora.id, id: routeA.routeId }, { tenantId: nyvora.id, id: routeB.routeId }, { tenantId: otherTenant.id, id: routeC.routeId });
    cleanup.employees.push(...routeA.employeeIds.map((id) => ({ tenantId: nyvora.id, id })));
    result.fixture.routes = {
      a_completa: { route_id: routeA.routeId, checklist_con_hijos: 6, traza_operativa: 6 },
      b_minima: { route_id: routeB.routeId },
      c_otro_tenant: { tenant: otherTenant.name, route_id: routeC.routeId }
    };
    check("qa_fixture_routes_seeded", [routeA.routeId, routeB.routeId, routeC.routeId].every((id) => Number.isInteger(id) && id > 0), {
      route_a: routeA.routeId, route_b: routeB.routeId, route_c: routeC.routeId
    });

    // ---- Monitor: la malla de prueba aparece con sus eventos atribuidos por usuario ----
    const listRoutes = await capture(`/api/v1/hr/routes?date=${TODAY}`, { token: tokenG });
    // /hr/routes devuelve un array puro (sin envoltorio {routes|data}).
    const listedRoutes = Array.isArray(listRoutes.payload) ? listRoutes.payload : (listRoutes.payload?.routes || listRoutes.payload?.data || []);
    const listed = listedRoutes.find((item) => Number(item.id) === Number(routeA.routeId));
    check("qa_monitor_listroutes_includes_route", listRoutes.status === 200 && Boolean(listed), {
      status: listRoutes.status, employee_count: listed?.employee_count ?? listed?.employees?.length ?? null
    });
    const summaries = await capture("/api/v1/hr/routes/event-summaries", { token: tokenG });
    const summary = (summaries.payload?.routes || []).find((row) => Number(row.route_id) === Number(routeA.routeId));
    // event_count solo agrega marcaciones + actividades: el fixture A trae 2 punches
    // y 1 actividad (pings y sesiones no cuentan como eventos del resumen).
    check("qa_monitor_event_summaries_report_events", summaries.status === 200 && Number(summary?.event_count || 0) >= 3, {
      status: summaries.status, event_count: summary?.event_count ?? null, evidence_count: summary?.evidence_count ?? null
    });
    const operations = await capture(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=30`, { token: tokenG });
    const monitoredRoute = (operations.payload?.routes || []).find((item) => Number(item.id) === Number(routeA.routeId));
    const marksByUser = monitoredRoute?.marks_by_user || [];
    check("qa_monitor_attributes_marks_per_user", operations.status === 200 && Boolean(monitoredRoute)
      && marksByUser.length === 2 && marksByUser.every((entry) => Array.isArray(entry.marks) && entry.marks.length >= 1), {
      status: operations.status,
      marks_by_user: marksByUser.map((entry) => ({ user_name: entry.user_name, marks: entry.marks?.length ?? 0 })),
      punch_points: monitoredRoute?.punch_points?.length ?? null
    });
    result.observations.monitor = {
      listroutes_route_found: Boolean(listed),
      event_count: summary?.event_count ?? null,
      marks_by_user: marksByUser.map((entry) => ({ user_name: entry.user_name, marks: entry.marks?.length ?? 0 })),
      punch_points: monitoredRoute?.punch_points?.length ?? null
    };

    // ---- Captura de errores operativos en marcaciones ----
    // Queja prioritaria de usuarios: al marcar salen muchos errores. Esta seccion ejercita
    // CADA camino de error documentado de createPunch por HTTP contra la API de QA con
    // marcadores reales (ficha propia + endpoint /hr/self/time-punches) y verifica que
    // todo negativo devuelva codigo estructurado (nada de 5xx ni 200 mudos).
    const markerRole = await admin.createRole(nyvora.id, {
      name: `QA Marcador Malla ${RUN_ID}`,
      description: "Rol temporal de marcacion operativa (se desactiva al final).",
      permissions: { marcaciones: { view: true, edit: true } }
    });
    cleanup.roles.push({ tenantId: nyvora.id, id: markerRole.id });
    const conductorRole = await admin.createRole(nyvora.id, {
      name: `QA Conductor Malla ${RUN_ID}`,
      description: "Rol temporal de conductor con marcacion operativa (se desactiva al final).",
      permissions: { marcaciones: { view: true, edit: true } }
    });
    cleanup.roles.push({ tenantId: nyvora.id, id: conductorRole.id });
    // "marcaciones" equivale a time_tracking read+write en el catalogo de permisos:
    // alcanza para el endpoint propio de marcacion pero NO para el administrativo de hr.
    const markerShape = (label, roleId, slug) => ({
      name: `QA Marcador ${label} ${RUN_ID}`,
      first_names: "QA",
      last_names: `Marcador ${label} ${RUN_ID}`,
      email: `${STALE_EMAIL_PREFIX}${slug}.${RUN_ID}@apex.test`,
      password: PASSWORD,
      role_id: roleId,
      company: "QA",
      document: `QAM${label}${RUN_ID}`.slice(0, 20),
      code: `${STALE_CODE_PREFIX}${slug}-${RUN_ID.slice(-10)}`.slice(0, 24),
      department: "QA",
      position: "Marcador de certificacion",
      operational_classification: "operativo",
      can_punch_time: true,
      can_be_assigned_routes: true,
      require_password_change: false
    });
    const markerA = await admin.createUser(nyvora.id, markerShape("MA", markerRole.id, "ma"));
    const markerB = await admin.createUser(nyvora.id, markerShape("MB", markerRole.id, "mb"));
    const markerC = await admin.createUser(nyvora.id, markerShape("MC", markerRole.id, "mc"));
    const markerD = await admin.createUser(nyvora.id, markerShape("MD", conductorRole.id, "md"));
    cleanup.users.push(...[markerA, markerB, markerC, markerD].map((user) => ({ tenantId: nyvora.id, id: user.id })));
    const markerFicha = (user) => prisma.runWithTenant(nyvora.id, () => prisma.employee.findFirst({ where: { user_id: user.id, tenant_id: nyvora.id }, select: { id: true, code: true } }));
    const fichaA = await markerFicha(markerA);
    const fichaB = await markerFicha(markerB);
    const fichaC = await markerFicha(markerC);
    const fichaD = await markerFicha(markerD);
    check("qa_marker_fichas_present", [fichaA, fichaB, fichaC, fichaD].every((ficha) => ficha && Number.isInteger(ficha.id)), {
      fichas: { a: fichaA?.id ?? null, b: fichaB?.id ?? null, c: fichaC?.id ?? null, d: fichaD?.id ?? null }
    });
    // createUser deja la ficha como "empleado": el marcador D necesita tipo conductor
    // para que la compuerta preoperacional de entrada aplique sobre su malla.
    await prisma.runWithTenant(nyvora.id, () => prisma.employee.update({
      where: { id: fichaD.id },
      data: { user_type: "conductor", position: "Conductor de certificacion" }
    }));
    const tokenMA = await loginAs(markerA, "ma");
    const tokenMB = await loginAs(markerB, "mb");
    const tokenMC = await loginAs(markerC, "mc");
    const tokenMD = await loginAs(markerD, "md");
    check("qa_marker_users_can_login", Boolean(tokenMA && tokenMB && tokenMC && tokenMD), { logins: 4 });

    const markerEmail = (slug) => `${STALE_EMAIL_PREFIX}${slug}.${RUN_ID}@apex.test`;
    const routeD = await seedRoute(prisma, nyvora.id, "D", {}, {
      vehicle_plate: "",
      employees: [markerEmail("ma"), markerEmail("mb"), markerEmail("mc")],
      end_time: "00:00",
      tolerance_minutes: 0
    });
    // E se siembra DESPUES de D: con dos mallas activas el mismo dia, la malla vigente del
    // marcador A es la de id mayor (E), lo que permite certificar HORARIO_NO_ACTIVO contra D.
    const routeE = await seedRoute(prisma, nyvora.id, "E", {}, { employees: [markerEmail("ma")] });
    // Malla con placa para el conductor D: dispara la compuerta preoperacional de entrada.
    const routeF = await seedRoute(prisma, nyvora.id, "F", {}, { employees: [markerEmail("md")] });
    cleanup.routes.push({ tenantId: nyvora.id, id: routeD.routeId }, { tenantId: nyvora.id, id: routeE.routeId }, { tenantId: nyvora.id, id: routeF.routeId });

    const YESTERDAY = new Date(new Date(`${TODAY}T12:00:00-05:00`).getTime() - 86400000)
      .toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const bogotaParts = (moment) => Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }).formatToParts(moment).map((part) => [part.type, part.value])
    );
    const isoBogota = (moment) => {
      const parts = bogotaParts(moment);
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-05:00`;
    };
    const bogotaMinutesOf = (moment) => {
      const parts = bogotaParts(moment);
      return Number(parts.hour) * 60 + Number(parts.minute);
    };
    const bogotaDayOf = (moment) => {
      const parts = bogotaParts(moment);
      return `${parts.year}-${parts.month}-${parts.day}`;
    };
    const selfPunch = (token, body) => capture("/api/v1/hr/self/time-punches", { token, method: "POST", body });
    const overtimeEvidenceBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z";
    const overtimeEvidence = {
      base64: overtimeEvidenceBase64,
      name: "qa-hora-extra.jpg",
      type: "image/jpeg",
      size: Buffer.from(overtimeEvidenceBase64, "base64").length
    };
    const negativeResponses = [];
    const t0 = new Date();
    // Nota de borde: si la corrida inicia a menos de ~2 min de la medianoche de Bogota,
    // t0+120s cruza de dia y los controles de secuencia/hora extra fallan por fecha. Riesgo
    // aceptado y documentado; fuera de esa ventana todos los momentos son deterministas.
    const at = (offsetMs) => new Date(t0.getTime() + offsetMs);
    const cSalidaMoment = at(120000);
    const expectedExtra = bogotaMinutesOf(cSalidaMoment);
    const aBody = (extra = {}) => ({ user_name: markerEmail("ma"), type: "entrada", punched_at: isoBogota(new Date()), ...extra });
    const bBody = (type, moment, extra = {}) => ({ user_name: markerEmail("mb"), type, punched_at: isoBogota(moment), route_id: routeD.routeId, ...extra });
    const cBody = (type, moment, extra = {}) => ({ user_name: markerEmail("mc"), type, punched_at: isoBogota(moment), route_id: routeD.routeId, ...extra });

    // Autenticacion y esquema: sin token -> 401; cuerpo invalido -> 400 (esquema antes de RBAC).
    const unauthorized = await capture("/api/v1/hr/self/time-punches", { method: "POST", body: { user_name: "qa", type: "entrada" } });
    check("qa_punch_unauthorized_401", unauthorized.status === 401, { status: unauthorized.status });
    const schemaEmpty = await selfPunch(tokenMC, {});
    negativeResponses.push(schemaEmpty);
    check("qa_punch_schema_validation_400", schemaEmpty.status === 400, { status: schemaEmpty.status, code: schemaEmpty.payload?.code ?? null });
    const adminEndpointAsMarker = await capture("/api/v1/hr/time-punches", { token: tokenMC, method: "POST", body: { user_name: "qa", type: "entrada" } });
    negativeResponses.push(adminEndpointAsMarker);
    check("qa_punch_rbac_blocks_hr_admin_endpoint", adminEndpointAsMarker.status === 403 && adminEndpointAsMarker.payload?.code === "PERMISO_DENEGADO", {
      status: adminEndpointAsMarker.status, code: adminEndpointAsMarker.payload?.code ?? null
    });

    // Marcador A: malla ajena, malla no vigente, futuro, diferida expirada y fuera del dia.
    const foreignRoute = await selfPunch(tokenMA, aBody({ route_id: routeB.routeId }));
    negativeResponses.push(foreignRoute);
    check("qa_punch_foreign_route_denied_403", foreignRoute.status === 403 && foreignRoute.payload?.code === "HORARIO_AJENO_DENEGADO", {
      status: foreignRoute.status, code: foreignRoute.payload?.code ?? null
    });
    const inactiveRoute = await selfPunch(tokenMA, aBody({ route_id: routeD.routeId, punched_at: isoBogota(t0) }));
    negativeResponses.push(inactiveRoute);
    check("qa_punch_inactive_route_rejected_409", inactiveRoute.status === 409 && inactiveRoute.payload?.code === "HORARIO_NO_ACTIVO", {
      status: inactiveRoute.status, code: inactiveRoute.payload?.code ?? null
    });
    // +60 min y no +20: la tolerancia futura del servidor es fija (15 min) y el reloj local
    // puede venir atrasado frente al servidor de QA; 60 min cubre hasta 45 min de desfase.
    const futurePunch = await selfPunch(tokenMA, aBody({ route_id: routeE.routeId, punched_at: isoBogota(new Date(Date.now() + 60 * 60000)) }));
    negativeResponses.push(futurePunch);
    check("qa_punch_future_timestamp_rejected_409", futurePunch.status === 409 && futurePunch.payload?.code === "MARCACION_EN_EL_FUTURO", {
      status: futurePunch.status, code: futurePunch.payload?.code ?? null
    });
    const expiredDeferred = await selfPunch(tokenMA, aBody({ route_id: routeE.routeId, punched_at: isoBogota(new Date(Date.now() - 73 * 3600000)) }));
    negativeResponses.push(expiredDeferred);
    check("qa_punch_expired_deferred_rejected_409", expiredDeferred.status === 409 && expiredDeferred.payload?.code === "MARCACION_DIFERIDA_EXPIRADA", {
      status: expiredDeferred.status, code: expiredDeferred.payload?.code ?? null
    });
    // Momento de otro dia dentro de la ventana diferida (max 24 h): si aun no pasan 30 min
    // del dia, now-30min cae en ayer; el resto del dia se usa ayer 23:59:59.999, que
    // siempre queda a menos de 24 h del momento actual.
    const nowMinus30 = new Date(Date.now() - 30 * 60000);
    const offdayMoment = bogotaDayOf(nowMinus30) !== TODAY ? nowMinus30 : new Date(new Date(`${TODAY}T00:00:00-05:00`).getTime() - 1);
    const offdayPunch = await selfPunch(tokenMA, aBody({ route_id: routeE.routeId, punched_at: isoBogota(offdayMoment) }));
    negativeResponses.push(offdayPunch);
    check("qa_punch_offday_rejected_409", offdayPunch.status === 409 && offdayPunch.payload?.code === "HORARIO_FUERA_DEL_DIA", {
      status: offdayPunch.status, code: offdayPunch.payload?.code ?? null
    });

    // Conductor D: la compuerta preoperacional bloquea la entrada sin checklist aprobado.
    // Respuesta estructurada 200 con ok=false (no es un error de negocio: es una compuerta).
    const mdEntrada = await selfPunch(tokenMD, { user_name: markerEmail("md"), type: "entrada", punched_at: isoBogota(t0), route_id: routeF.routeId });
    check("qa_punch_driver_preop_gate_blocks_entry", mdEntrada.status === 200 && mdEntrada.payload?.ok === false
      && mdEntrada.payload?.preoperational_required === true && mdEntrada.payload?.route_authorized === false, {
      status: mdEntrada.status, ok: mdEntrada.payload?.ok ?? null,
      preoperational_required: mdEntrada.payload?.preoperational_required ?? null,
      route_authorized: mdEntrada.payload?.route_authorized ?? null
    });

    // Marcador C: secuencia completa del dia con hora extra justificada al final.
    const cSalidaFirst = await selfPunch(tokenMC, cBody("salida", cSalidaMoment));
    negativeResponses.push(cSalidaFirst);
    check("qa_punch_out_of_sequence_409", cSalidaFirst.status === 409 && cSalidaFirst.payload?.code === "MARCACION_FUERA_DE_SECUENCIA", {
      status: cSalidaFirst.status, code: cSalidaFirst.payload?.code ?? null
    });
    const cEntrada = await selfPunch(tokenMC, cBody("entrada", t0, { metadata: { gps_unavailable: true } }));
    check("qa_punch_entrada_ok_after_gps_unavailable", cEntrada.status === 200 && cEntrada.payload?.ok === true, {
      status: cEntrada.status, code: cEntrada.payload?.code ?? null
    });
    const cInicio = await selfPunch(tokenMC, cBody("inicio_almuerzo", at(40000)));
    const cFin = await selfPunch(tokenMC, cBody("fin_almuerzo", at(80000)));
    check("qa_punch_almuerzo_sequence_ok", cInicio.status === 200 && cFin.status === 200, {
      inicio: cInicio.status, fin: cFin.status
    });
    // La malla D termina 00:00 sin tolerancia: la salida siempre genera hora extra y los
    // minutos esperados son exactamente los minutos del dia de Bogota de la marcacion.
    const cSalidaNoReason = await selfPunch(tokenMC, cBody("salida", cSalidaMoment));
    negativeResponses.push(cSalidaNoReason);
    check("qa_punch_overtime_requires_justification_422", cSalidaNoReason.status === 422 && cSalidaNoReason.payload?.code === "JUSTIFICACION_HORA_EXTRA_REQUERIDA"
      && Number(cSalidaNoReason.payload?.details?.extra_minutes) === expectedExtra, {
      status: cSalidaNoReason.status, code: cSalidaNoReason.payload?.code ?? null,
      extra_minutes: cSalidaNoReason.payload?.details?.extra_minutes ?? null, expected_extra_minutes: expectedExtra
    });
    const cSalidaNoEvidence = await selfPunch(tokenMC, cBody("salida", cSalidaMoment, {
      extra_reason: "Cierre de ruta extendida por novedad operativa", extra_detail: "Cliente solicito entrega fuera de horario"
    }));
    negativeResponses.push(cSalidaNoEvidence);
    check("qa_punch_overtime_requires_evidence_422", cSalidaNoEvidence.status === 422 && cSalidaNoEvidence.payload?.code === "EVIDENCIA_HORA_EXTRA_REQUERIDA", {
      status: cSalidaNoEvidence.status, code: cSalidaNoEvidence.payload?.code ?? null
    });
    const cSalidaOk = await selfPunch(tokenMC, cBody("salida", cSalidaMoment, {
      extra_reason: "Cierre de ruta extendida por novedad operativa",
      extra_detail: "Cliente solicito entrega fuera de horario",
      extra_evidence: overtimeEvidence
    }));
    check("qa_punch_overtime_success_reports_minutes", cSalidaOk.status === 200 && cSalidaOk.payload?.ok === true
      && Number(cSalidaOk.payload?.minutos_extra) === expectedExtra && cSalidaOk.payload?.es_extra === true, {
      status: cSalidaOk.status, minutos_extra: cSalidaOk.payload?.minutos_extra ?? null,
      es_extra: cSalidaOk.payload?.es_extra ?? null, expected_extra_minutes: expectedExtra
    });
    const cJornadaCompleta = await selfPunch(tokenMC, cBody("entrada", at(150000)));
    negativeResponses.push(cJornadaCompleta);
    check("qa_punch_completed_day_409", cJornadaCompleta.status === 409 && cJornadaCompleta.payload?.code === "JORNADA_COMPLETA", {
      status: cJornadaCompleta.status, code: cJornadaCompleta.payload?.code ?? null
    });

    // Marcador B: idempotencia (primer intento, replay y conflicto) y kilometrajes.
    const idemKeyB = `qa-punch-${RUN_ID}-b-entrada`;
    const bEntrada = await selfPunch(tokenMB, bBody("entrada", t0, { idempotency_key: idemKeyB }));
    check("qa_punch_idempotent_first_attempt_ok", bEntrada.status === 200 && bEntrada.payload?.ok === true, {
      status: bEntrada.status, code: bEntrada.payload?.code ?? null
    });
    const bReplay = await selfPunch(tokenMB, bBody("entrada", t0, { idempotency_key: idemKeyB }));
    check("qa_punch_idempotent_replay_returns_same_punch", bReplay.status === 200 && bReplay.payload?.replayed === true
      && bReplay.payload?.punch?.id === bEntrada.payload?.punch?.id, {
      status: bReplay.status, replayed: bReplay.payload?.replayed ?? null,
      first_punch_id: bEntrada.payload?.punch?.id ?? null, replay_punch_id: bReplay.payload?.punch?.id ?? null
    });
    const bInicio = await selfPunch(tokenMB, bBody("inicio_almuerzo", at(40000)));
    const bFin = await selfPunch(tokenMB, bBody("fin_almuerzo", at(80000)));
    check("qa_punch_almuerzo_b_ok", bInicio.status === 200 && bFin.status === 200, { inicio: bInicio.status, fin: bFin.status });
    // La malla D no tiene placa: el kilometraje solo se valida cuando la marcacion
    // declara placa (QAB999), lo que aisla el error de kilometraje del resto de compuertas.
    const bSalidaNoKm = await selfPunch(tokenMB, bBody("salida", cSalidaMoment, {
      vehicle_plate: "QAB999", kilometraje_dia: "",
      extra_reason: "Cierre de ruta extendida por novedad operativa",
      extra_detail: "Cliente solicito entrega fuera de horario",
      extra_evidence: overtimeEvidence
    }));
    negativeResponses.push(bSalidaNoKm);
    check("qa_punch_mileage_required_400", bSalidaNoKm.status === 400 && bSalidaNoKm.payload?.code === "KILOMETRAJE_REQUERIDO", {
      status: bSalidaNoKm.status, code: bSalidaNoKm.payload?.code ?? null
    });
    const bSalidaBadKm = await selfPunch(tokenMB, bBody("salida", cSalidaMoment, {
      vehicle_plate: "QAB999", kilometraje_dia: "abc",
      extra_reason: "Cierre de ruta extendida por novedad operativa",
      extra_detail: "Cliente solicito entrega fuera de horario",
      extra_evidence: overtimeEvidence
    }));
    negativeResponses.push(bSalidaBadKm);
    check("qa_punch_mileage_invalid_400", bSalidaBadKm.status === 400 && bSalidaBadKm.payload?.code === "KILOMETRAJE_INVALIDO", {
      status: bSalidaBadKm.status, code: bSalidaBadKm.payload?.code ?? null
    });
    const bSalidaUnusual = await selfPunch(tokenMB, bBody("salida", cSalidaMoment, {
      vehicle_plate: "QAB999", kilometraje_dia: 480,
      extra_reason: "Cierre de ruta extendida por novedad operativa",
      extra_detail: "Cliente solicito entrega fuera de horario",
      extra_evidence: overtimeEvidence
    }));
    check("qa_punch_unusual_mileage_accepted_with_novelty", bSalidaUnusual.status === 200 && bSalidaUnusual.payload?.ok === true, {
      status: bSalidaUnusual.status, code: bSalidaUnusual.payload?.code ?? null, kilometraje_dia: 480
    });
    const aIdemConflict = await selfPunch(tokenMA, aBody({ route_id: routeE.routeId, punched_at: isoBogota(t0), idempotency_key: idemKeyB }));
    negativeResponses.push(aIdemConflict);
    check("qa_punch_idempotency_conflict_409", aIdemConflict.status === 409 && aIdemConflict.payload?.code === "IDEMPOTENCY_KEY_CONFLICT", {
      status: aIdemConflict.status, code: aIdemConflict.payload?.code ?? null
    });

    // Ajuste administrativo en fecha pasada. La cuenta administrativa de QA vive en
    // Supabase Auth (mismo grant de la app web) pero su usuario local pertenece a otro
    // tenant, asi que el camino feliz lo emite un operador del tenant NYVORA con permiso
    // de edicion de Talento Humano (tokenB). El admin de QA participa solo del camino de
    // error: declarar una ficha de otro tenant debe fallar con EMPLEADO_NO_ENCONTRADO —
    // antes el servicio redirigia en silencio la correccion a la propia ficha del admin y
    // la novedad AJUSTE_MANUAL_MARCACION quedaba sobre la persona equivocada sin error
    // visible. Ese fallo silencioso es exactamente la clase de error que los operadores
    // reportan al marcar, y esta certificacion debe capturarlo.
    const adminGrant = await supabasePasswordGrant(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim(),
      String(process.env.QA_LOGIN_EMAIL || ""),
      String(process.env.QA_LOGIN_PASSWORD || "")
    );
    const tokenAdmin = adminGrant.access_token;
    check("qa_punch_admin_token_available", adminGrant.status === 200 && Boolean(tokenAdmin), {
      status: adminGrant.status, transport_error: adminGrant.transportError
    });
    const ajusteCode = `qa-punch-${RUN_ID}-ajuste`;
    // tenant_id explicito: el PrismaPromise es lazy y al devolverlo desde un callback
    // sincrono la consulta se ejecuta fuera del contexto ALS de runWithTenant.
    const ajusteEmployee = await prisma.runWithTenant(nyvora.id, () => prisma.employee.create({
      data: { tenant_id: nyvora.id, code: ajusteCode, position: "Operario QA", department: "QA", salary_base: 1000000, hire_date: ROUTE_DATE }
    }));
    const ajustePunch = await capture("/api/v1/hr/time-punches", {
      token: tokenB, method: "POST",
      body: { employee_id: ajusteEmployee.id, user_name: ajusteCode, type: "entrada", punched_at: `${YESTERDAY}T07:00:00-05:00`, route_id: routeD.routeId }
    });
    check("qa_punch_past_date_records_manual_adjustment", ajustePunch.status === 200 && ajustePunch.payload?.ok === true, {
      status: ajustePunch.status, code: ajustePunch.payload?.code ?? null, employee_id: ajusteEmployee.id
    });
    const foreignEmployeePunch = await capture("/api/v1/hr/time-punches", {
      token: tokenAdmin, method: "POST",
      body: { employee_id: ajusteEmployee.id, user_name: ajusteCode, type: "entrada", punched_at: `${YESTERDAY}T07:30:00-05:00`, route_id: routeD.routeId }
    });
    negativeResponses.push(foreignEmployeePunch);
    check("qa_punch_foreign_employee_rejected", foreignEmployeePunch.status === 404 && foreignEmployeePunch.payload?.code === "EMPLEADO_NO_ENCONTRADO", {
      status: foreignEmployeePunch.status, code: foreignEmployeePunch.payload?.code ?? null,
      admin_tenant_isolation: "el admin de QA pertenece a otro tenant y no puede declarar fichas de NYVORA"
    });
    const garbageEmployeePunch = await capture("/api/v1/hr/time-punches", {
      token: tokenAdmin, method: "POST",
      body: { employee_id: "3f2b8c1e-9d4a-4c1b-8f2e-6a1b2c3d4e5f", user_name: ajusteCode, type: "entrada", punched_at: `${YESTERDAY}T07:45:00-05:00`, route_id: routeD.routeId }
    });
    negativeResponses.push(garbageEmployeePunch);
    check("qa_punch_garbage_employee_id_rejected", garbageEmployeePunch.status === 422 && garbageEmployeePunch.payload?.code === "EMPLEADO_NO_ENCONTRADO", {
      status: garbageEmployeePunch.status, code: garbageEmployeePunch.payload?.code ?? null
    });

    // Novedades registradas por los caminos de error (se leen por codigo y empleado).
    const noveltiesOf = async (type, from, to, employeeCode) => {
      const response = await capture(`/api/v1/hr/novelties?type=${encodeURIComponent(type)}&from=${from}&to=${to}`, { token: tokenG });
      const rows = Array.isArray(response.payload) ? response.payload : (response.payload?.novelties || response.payload?.rows || []);
      return { status: response.status, rows, mine: rows.filter((row) => String(row.employee_code || "") === employeeCode) };
    };
    const gpsNovelty = await noveltiesOf("GPS_INACTIVO_SIN_SENAL", TODAY, TODAY, fichaC?.code || "");
    check("qa_novelty_gps_unavailable_recorded", gpsNovelty.status === 200 && gpsNovelty.mine.length >= 1, {
      status: gpsNovelty.status, found: gpsNovelty.mine.length, employee_code: fichaC?.code ?? null
    });
    const unusualNovelty = await noveltiesOf("KILOMETRAJE_INCONSISTENTE", TODAY, TODAY, fichaB?.code || "");
    check("qa_novelty_unusual_mileage_recorded", unusualNovelty.status === 200 && unusualNovelty.mine.length >= 1, {
      status: unusualNovelty.status, found: unusualNovelty.mine.length, employee_code: fichaB?.code ?? null
    });
    const manualNovelty = await noveltiesOf("AJUSTE_MANUAL_MARCACION", YESTERDAY, TODAY, ajusteCode);
    check("qa_novelty_manual_adjustment_recorded", manualNovelty.status === 200 && manualNovelty.mine.length >= 1, {
      status: manualNovelty.status, found: manualNovelty.mine.length, employee_code: ajusteCode
    });

    // Sin fallas silenciosas: solo las marcaciones validas existen (C: 4, B: 4 hoy; ajuste: 1
    // ayer; el replay no crea fila, los rechazos y la compuerta preoperacional dejan la malla
    // sin filas nuevas) y todo negativo devolvio codigo estructurado (ningun 5xx ni 200 mudo).
    const trackingToday = await capture(`/api/v1/hr/routes/${routeD.routeId}/tracking?date=${TODAY}`, { token: tokenG });
    const trackingYesterday = await capture(`/api/v1/hr/routes/${routeD.routeId}/tracking?date=${YESTERDAY}`, { token: tokenG });
    const todayCount = Array.isArray(trackingToday.payload?.punches) ? trackingToday.payload.punches.length : -1;
    const yesterdayCount = Array.isArray(trackingYesterday.payload?.punches) ? trackingYesterday.payload.punches.length : -1;
    check("qa_punch_no_silent_failures_row_count", trackingToday.status === 200 && trackingYesterday.status === 200
      && todayCount === 8 && yesterdayCount === 1, {
      today_status: trackingToday.status, today_punches: todayCount,
      yesterday_status: trackingYesterday.status, yesterday_punches: yesterdayCount
    });
    check("qa_punch_negatives_carry_structured_codes", negativeResponses.every((response) => response.status >= 400 && response.status < 500
      && (Boolean(response.payload?.code) || Boolean(response.payload?.message))), {
      codes: negativeResponses.map((response) => ({ status: response.status, code: response.payload?.code ?? null }))
    });
    result.observations.punch_errors = {
      marker_users: [markerA.id, markerB.id, markerC.id, markerD.id],
      negative_codes: negativeResponses.map((response) => ({ status: response.status, code: response.payload?.code ?? null })),
      preop_gate: { status: mdEntrada.status, preoperational_required: mdEntrada.payload?.preoperational_required ?? null },
      today_punches: todayCount, yesterday_punches: yesterdayCount,
      overtime_minutes: Number(cSalidaOk.payload?.minutos_extra) || null,
      novelty_rows: {
        gps_inactivo_sin_senal: gpsNovelty.mine.length,
        kilometraje_inconsistente: unusualNovelty.mine.length,
        ajuste_manual_marcacion: manualNovelty.mine.length
      }
    };

    // Limpieza selectiva de esta seccion: primero las mallas (sus FK cubren punches,
    // sesiones, actividades y el checklist en borrador de la compuerta preoperacional) y
    // luego las fichas por id, con SQL explicito para novedades y kilometrajes que no
    // tienen FK hacia Employee.
    for (const route of [routeD, routeE, routeF]) {
      await purgeRouteFixture(prisma, nyvora.id, route.routeId);
    }
    for (const ficha of [fichaA, fichaB, fichaC, fichaD, ajusteEmployee]) {
      if (ficha) await purgePunchEmployeeById(prisma, nyvora.id, ficha.id);
    }
    cleanup.routes = cleanup.routes.filter((route) => ![routeD.routeId, routeE.routeId, routeF.routeId].includes(route.id));

    // ---- Vista previa de impacto ----
    const previewBlocked = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenG });
    const blockedBody = previewBlocked.payload || {};
    check("qa_preview_reports_special_grant", previewBlocked.status === 200 && blockedBody.permissions?.can_physical_delete === true, {
      status: previewBlocked.status, permissions: blockedBody.permissions ?? null
    });
    check("qa_preview_blocks_open_checklist", blockedBody.can_delete === false && blockedBody.blockers?.[0]?.code === "ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST", {
      can_delete: blockedBody.can_delete, blocker: blockedBody.blockers?.[0]?.code ?? null
    });
    check("qa_preview_quantifies_deletion", blockedBody.will_delete?.total === 6 && blockedBody.will_delete?.checklists === 1
      && blockedBody.will_delete?.checklist_answers === 1 && blockedBody.will_delete?.checklist_evidence === 1
      && blockedBody.will_delete?.checklist_findings === 1 && blockedBody.will_delete?.start_authorizations === 1
      && blockedBody.will_delete?.block_events === 1, { will_delete: blockedBody.will_delete ?? null });
    check("qa_preview_preserves_operational_trace", blockedBody.preserved_trace?.total === 6 && blockedBody.preserved_trace?.time_punches === 2
      && blockedBody.preserved_trace?.gps_pings === 1 && blockedBody.preserved_trace?.work_sessions === 1
      && blockedBody.preserved_trace?.work_activities === 1 && blockedBody.preserved_trace?.processed_workdays === 1
      && blockedBody.requires_trace_acknowledgement === true, { preserved_trace: blockedBody.preserved_trace ?? null });
    check("qa_preview_returns_route_snapshot", blockedBody.route?.employee_count === 2 && blockedBody.route?.date === TODAY
      && blockedBody.route_id === routeA.routeId, { route: blockedBody.route ?? null, route_id: blockedBody.route_id });

    const previewWithoutGrant = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenB });
    check("qa_preview_hides_grant_without_permission", previewWithoutGrant.status === 200 && previewWithoutGrant.payload?.permissions?.can_physical_delete === false, {
      status: previewWithoutGrant.status, permissions: previewWithoutGrant.payload?.permissions ?? null
    });

    await prisma.runWithTenant(nyvora.id, async () => {
      await prisma.routePreoperationalChecklist.update({ where: { id: routeA.checklistId }, data: { checklist_status: "aprobado", completed_at: new Date() } });
    });
    const previewReady = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenG });
    check("qa_preview_unblocks_after_checklist_closed", previewReady.status === 200 && previewReady.payload?.can_delete === true
      && Array.isArray(previewReady.payload?.blockers) && previewReady.payload.blockers.length === 0, {
      status: previewReady.status, can_delete: previewReady.payload?.can_delete, blockers: previewReady.payload?.blockers?.length ?? null
    });

    // ---- Denegaciones visibles ----
    const deleteAsPlain = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenB, method: "DELETE", body: { reason: REASON, confirmed: true } });
    check("qa_delete_requires_special_permission", deleteAsPlain.status === 403 && deleteAsPlain.payload?.code === "PERMISO_BORRADO_FISICO_DENEGADO", {
      status: deleteAsPlain.status, code: deleteAsPlain.payload?.code ?? null
    });
    const schemaMissingReason = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenG, method: "DELETE", body: { confirmed: true } });
    const schemaShortReason = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenG, method: "DELETE", body: { reason: "corto", confirmed: true } });
    const schemaUnconfirmed = await capture(`/api/v1/hr/routes/${routeA.routeId}`, { token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: false } });
    check("qa_delete_requires_reason_and_confirmation", [schemaMissingReason, schemaShortReason, schemaUnconfirmed].every((response) => response.status === 400), {
      sin_motivo: schemaMissingReason.status, motivo_corto: schemaShortReason.status, sin_confirmacion: schemaUnconfirmed.status
    });
    const stalePreview = await capture(`/api/v1/hr/routes/${routeA.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 99, expected_date: TODAY, acknowledge_trace: true }
    });
    check("qa_delete_detects_stale_preview", stalePreview.status === 409 && stalePreview.payload?.code === "ROUTE_DELETE_STALE_PREVIEW"
      && stalePreview.payload?.details?.current_employees === 2, { status: stalePreview.status, code: stalePreview.payload?.code ?? null });
    const missingAck = await capture(`/api/v1/hr/routes/${routeA.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY }
    });
    check("qa_delete_requires_trace_acknowledgement", missingAck.status === 409 && missingAck.payload?.code === "ROUTE_DELETE_TRACE_NOT_ACKNOWLEDGED"
      && missingAck.payload?.details?.preserved_trace?.total === 6, { status: missingAck.status, code: missingAck.payload?.code ?? null });

    // ---- Aislamiento multi-tenant entre la empresa modelo y el otro tenant ----
    const crossTenantPreview = await capture(`/api/v1/hr/routes/${routeB.routeId}/deletion-impact`, { token: tokenX });
    const crossTenantDelete = await capture(`/api/v1/hr/routes/${routeB.routeId}`, { token: tokenX, method: "DELETE", body: { reason: REASON, confirmed: true, acknowledge_trace: true } });
    const crossTenantDeleteReverse = await capture(`/api/v1/hr/routes/${routeC.routeId}`, { token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, acknowledge_trace: true } });
    check("qa_cross_tenant_hidden_as_not_found", crossTenantPreview.status === 404 && crossTenantPreview.payload?.code === "ROUTE_NOT_FOUND"
      && crossTenantDelete.status === 404 && crossTenantDelete.payload?.code === "ROUTE_NOT_FOUND"
      && crossTenantDeleteReverse.status === 404 && crossTenantDeleteReverse.payload?.code === "ROUTE_NOT_FOUND", {
      preview_ajena: crossTenantPreview.status, delete_ajena: crossTenantDelete.status, delete_inversa: crossTenantDeleteReverse.status
    });
    const aliveAfterCrossTenant = await countRows(prisma, nyvora.id, routeB.routeId);
    const aliveForeign = await countRows(prisma, otherTenant.id, routeC.routeId);
    check("qa_cross_tenant_targets_stay_alive", aliveAfterCrossTenant.route === 1 && aliveForeign.route === 1, {
      route_b_model_company: aliveAfterCrossTenant.route, route_c_other_tenant: aliveForeign.route
    });

    // ---- Borrado fisico aplicado con el permiso especial (empresa modelo NYVORA) ----
    const applied = await capture(`/api/v1/hr/routes/${routeA.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY, acknowledge_trace: true }
    });
    check("qa_delete_applies_with_special_permission", applied.status === 200 && applied.payload?.ok === true
      && applied.payload?.deleted?.total === 6 && applied.payload?.preserved_trace?.total === 6
      && applied.payload?.reason === REASON && applied.payload?.approved_by?.role === grantRole.name, {
      status: applied.status, deleted: applied.payload?.deleted ?? null, preserved_trace: applied.payload?.preserved_trace ?? null,
      approved_by: applied.payload?.approved_by ?? null
    });
    const afterDelete = await countRows(prisma, nyvora.id, routeA.routeId);
    check("qa_deleted_rows_are_gone_and_trace_survives", afterDelete.route === 0 && afterDelete.checklists === 0
      && afterDelete.start_authorizations === 0 && afterDelete.block_events === 0 && afterDelete.findings === 0
      && afterDelete.time_punches === 2 && afterDelete.gps_pings === 1 && afterDelete.work_sessions === 1
      && afterDelete.work_activities === 1 && afterDelete.processed_workdays === 1, afterDelete);
    const previewGone = await capture(`/api/v1/hr/routes/${routeA.routeId}/deletion-impact`, { token: tokenG });
    check("qa_deleted_route_preview_is_404", previewGone.status === 404 && previewGone.payload?.code === "ROUTE_NOT_FOUND", { status: previewGone.status });
    const auditRow = await prisma.runWithTenant(nyvora.id, () => prisma.auditLog.findFirst({
      where: { tenant_id: nyvora.id, action: "route.physical_deletion.applied", entity: "TimeRoute", entity_id: String(routeA.routeId) },
      orderBy: { id: "desc" }
    }));
    check("qa_deletion_is_audited_with_actor_and_reason", Boolean(auditRow) && auditRow.user_id === userG.id
      && auditRow.module === "hr" && auditRow.old_value?.reason === REASON
      && auditRow.old_value?.deleted?.total === 6 && auditRow.old_value?.preserved_trace?.total === 6, {
      audit_id: auditRow?.id != null ? String(auditRow.id) : null, user_id: auditRow?.user_id ?? null, module: auditRow?.module ?? null
    });
    result.observations.deletion = {
      route_id: routeA.routeId,
      deleted: applied.payload?.deleted ?? null,
      preserved_trace: applied.payload?.preserved_trace ?? null,
      approved_by: applied.payload?.approved_by ?? null,
      audit_id: auditRow?.id != null ? String(auditRow.id) : null
    };

    // ---- Malla sin checklist ni traza: se elimina sin exigir reconocimiento ----
    const minimalDelete = await capture(`/api/v1/hr/routes/${routeB.routeId}`, {
      token: tokenG, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY }
    });
    check("qa_delete_minimal_route_without_acknowledgement", minimalDelete.status === 200 && minimalDelete.payload?.ok === true
      && minimalDelete.payload?.deleted?.total === 0 && minimalDelete.payload?.preserved_trace?.total === 0, {
      status: minimalDelete.status, deleted: minimalDelete.payload?.deleted ?? null
    });

    // ---- Ruta alternativa /talento-humano/mallas con rol superadministrador del otro tenant ----
    const aliasPreview = await capture(`/api/v1/talento-humano/mallas/${routeC.routeId}/deletion-impact`, { token: tokenX });
    check("qa_alias_route_serves_impact_preview", aliasPreview.status === 200 && aliasPreview.payload?.permissions?.can_physical_delete === true
      && aliasPreview.payload?.can_delete === true, { status: aliasPreview.status, permissions: aliasPreview.payload?.permissions ?? null });
    const aliasDelete = await capture(`/api/v1/talento-humano/mallas/${routeC.routeId}`, {
      token: tokenX, method: "DELETE", body: { reason: REASON, confirmed: true, expected_employees: 2, expected_date: TODAY }
    });
    check("qa_superadmin_wildcard_grant_applies", aliasDelete.status === 200 && aliasDelete.payload?.ok === true
      && aliasDelete.payload?.deleted?.total === 0 && aliasDelete.payload?.approved_by?.role === otherAdminRole.name, {
      status: aliasDelete.status, approved_by: aliasDelete.payload?.approved_by ?? null
    });

    result.coverage_notes = [
      "La compuerta MODULO_NO_HABILITADO y las aserciones de codigo se certifican en la certificacion local sobre este mismo commit (hr-route-physical-deletion-local.js).",
      "El buscador Ctrl+K y la ventana emergente del monitor se validan en la sesion de navegador QA registrada en browser-qa-evidence.md."
    ];
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message };
    throw error;
  } finally {
    await cleanupFixtures(prisma, admin, cleanup);
    result.cleanup = {
      routes_purged: cleanup.routes.length,
      employees_deactivated: cleanup.employees.length,
      users_deactivated: cleanup.users.length,
      roles_deactivated: cleanup.roles.length,
      errors: cleanup.errors
    };
    result.finished_at = new Date().toISOString();
    writeEvidence();
  }
}

async function seedRoute(prisma, tenantId, label, { withOpenChecklist = false, withTrace = false } = {}, overrides = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const suffix = `${RUN_ID.slice(-6)}-${label}`;
    const route = await prisma.timeRoute.create({
      data: {
        date: ROUTE_DATE,
        vehicle_plate: `QA${label}${RUN_ID.slice(-4)}`,
        employees: [`qa-${suffix}-titular@apex.test`, `qa-${suffix}-acompanante@apex.test`],
        start_time: "06:00",
        end_time: "16:00",
        tolerance_minutes: 15,
        status: "active",
        notes: `${ROUTE_NOTE_PREFIX}${CERT_ID} run ${RUN_ID} ${label}`,
        ...overrides
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
      // Dos usuarios distintos sobre la misma malla: permite certificar la atribucion por usuario del monitor.
      for (const [index, who] of [`qa-${suffix}-titular@apex.test`, `qa-${suffix}-acompanante@apex.test`].entries()) {
        await prisma.timePunch.create({
          data: { user_name: who, type: index === 0 ? "entrada" : "salida", date: ROUTE_DATE, time: index === 0 ? "06:02" : "15:58", route_id: route.id }
        });
      }
      await prisma.gpsPing.create({
        data: { user_name: `qa-${suffix}-titular@apex.test`, latitude: 4.6533, longitude: -74.0836, route_id: route.id }
      });
      const session = await prisma.workSession.create({
        data: { user_name: `qa-${suffix}-titular@apex.test`, date: ROUTE_DATE, status: "activa", route_id: route.id }
      });
      await prisma.workActivity.create({
        data: { session_id: session.id, activity_type_name: "Cargue", user_name: `qa-${suffix}-titular@apex.test`, latitude: 4.6533, longitude: -74.0836, observation: `Certificacion ${suffix}`, route_id: route.id }
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

async function countRows(prisma, tenantId, routeId) {
  return prisma.runWithTenant(tenantId, async () => ({
    route: await prisma.timeRoute.count({ where: { id: routeId } }),
    checklists: await prisma.routePreoperationalChecklist.count({ where: { route_id: routeId } }),
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

async function purgeRouteFixture(prisma, tenantId, routeId) {
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

async function purgePunchEmployeeById(prisma, tenantId, employeeId) {
  if (!tenantId || !employeeId) return;
  await prisma.runWithTenant(tenantId, async () => {
    // th_novedades_jornada y th_jornada_kilometrajes no tienen FK hacia Employee:
    // sin este borrado explicito las filas del fixture quedarian huerfanas.
    await prisma.$executeRaw`DELETE FROM th_novedades_jornada WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId}`;
    await prisma.$executeRaw`DELETE FROM th_jornada_kilometrajes WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId}`;
    await prisma.employee.deleteMany({ where: { id: employeeId, tenant_id: tenantId } });
  });
}

async function purgeStale(prisma, admin, tenants) {
  const purged = { routes: 0, users: 0, employees: 0, roles: 0, errors: [] };
  for (const tenant of tenants) {
    if (!tenant) continue;
    await prisma.runWithTenant(tenant.id, async () => {
      const staleRoutes = await prisma.timeRoute.findMany({
        where: { notes: { startsWith: `${ROUTE_NOTE_PREFIX}${CERT_ID}` } },
        select: { id: true }
      });
      for (const route of staleRoutes) {
        try { await purgeRouteFixture(prisma, tenant.id, route.id); purged.routes += 1; } catch (error) { purged.errors.push(`route ${route.id}: ${error.message}`); }
      }
      const staleEmployees = await prisma.employee.findMany({ where: { code: { startsWith: STALE_CODE_PREFIX } }, select: { id: true } });
      for (const employee of staleEmployees) {
        try { await purgePunchEmployeeById(prisma, tenant.id, employee.id); purged.employees += 1; } catch (error) { purged.errors.push(`employee ${employee.id}: ${error.message}`); }
      }
      // Empleados auto-creados por secciones de marcaciones de corridas interrumpidas.
      const stalePunchEmployees = await prisma.employee.findMany({
        where: { code: { startsWith: "qa-punch-" }, NOT: { code: { contains: RUN_ID } } },
        select: { id: true }
      });
      for (const employee of stalePunchEmployees) {
        try { await purgePunchEmployeeById(prisma, tenant.id, employee.id); purged.employees += 1; } catch (error) { purged.errors.push(`punch employee ${employee.id}: ${error.message}`); }
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

async function cleanupFixtures(prisma, admin, cleanup) {
  for (const route of cleanup.routes) {
    try {
      const existing = await prisma.runWithTenant(route.tenantId, () => prisma.timeRoute.count({ where: { id: route.id } }));
      if (existing > 0) await purgeRouteFixture(prisma, route.tenantId, route.id);
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
}

main()
  .then(() => {
    writeEvidence();
    console.log(`CERTIFICACION QA BORRADO FISICO DE MALLAS ${result.status === "passed" ? "APROBADA" : "INCOMPLETA"}: ${result.checks.length} controles, commit=${result.deployed_commit}, evidencia=${OUTPUT}`);
  })
  .catch((error) => {
    console.error(`CERTIFICACION QA BORRADO FISICO DE MALLAS BLOQUEADA: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!PREFLIGHT) {
      try { await require(path.join(__dirname, "..", "..", "apps/api/src/core/prisma")).$disconnect(); } catch { /* el pool se cierra al salir */ }
    }
  });
