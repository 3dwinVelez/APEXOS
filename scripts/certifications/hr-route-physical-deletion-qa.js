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
//                (QA_LOGIN_EMAIL/QA_LOGIN_PASSWORD) y lectura de endpoints clave. No crea
//                ni borra fixtures.
//   (sin flags)  Certificacion completa: fixtures NYVORA + borrado fisico real de una malla
//                de prueba + aislamiento multi-tenant + auditoria + limpieza selectiva.
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
const ROUTE_DATE = new Date(`${TODAY}T00:00:00.000Z`);
const OUTPUT = path.resolve(String(args.output || `docs/qa/evidence/${CERT_ID}/qa-certification.json`));
const REASON = `Certificacion QA ${RUN_ID}: malla de prueba eliminada de forma controlada y trazable`;
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];
const PHYSICAL_DELETE_ACTION = "delete_physical_records";
const ROUTE_NOTE_PREFIX = "QA certification ";
const STALE_CODE_PREFIX = "QA-DEL-";
const STALE_EMAIL_PREFIX = "qa.delroute.";
const STALE_ROLE_PREFIXES = ["QA Borrado Malla", "QA Operador Malla", "QA Sin Modulo"];
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
    const login = await capture("/api/v1/auth/login", { method: "POST", body: { email, password } });
    const token = login.payload?.token || login.payload?.access_token || "";
    check("qa_admin_login_ok", login.status === 200 && Boolean(token), { status: login.status, code: login.payload?.code ?? null });
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
    const listed = (listRoutes.payload?.routes || listRoutes.payload?.data || []).find((item) => Number(item.id) === Number(routeA.routeId));
    check("qa_monitor_listroutes_includes_route", listRoutes.status === 200 && Boolean(listed), {
      status: listRoutes.status, employee_count: listed?.employee_count ?? listed?.employees?.length ?? null
    });
    const summaries = await capture("/api/v1/hr/routes/event-summaries", { token: tokenG });
    const summary = (summaries.payload?.routes || []).find((row) => Number(row.route_id) === Number(routeA.routeId));
    check("qa_monitor_event_summaries_report_events", summaries.status === 200 && Number(summary?.event_count || 0) >= 4, {
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

async function seedRoute(prisma, tenantId, label, { withOpenChecklist = false, withTrace = false } = {}) {
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
