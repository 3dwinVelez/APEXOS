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
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const prisma = require("../../apps/api/src/core/prisma");
const admin = require("../../apps/api/src/modules/admin/service");
const hr = require("../../apps/api/src/modules/hr/service");

const API_URL = String(args["api-url"] || "http://127.0.0.1:3100").replace(/\/$/, "");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-monitor-ui-modernization-20260918/certification.json"));
const FIXTURE_OUTPUT = args["fixture-output"] ? path.resolve(String(args["fixture-output"])) : "";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Monitor-${crypto.randomBytes(6).toString("hex")}#26`;
const MARKING_EMAIL = `qa.monitor.marks.${RUN_ID}@scj.test`;
const SILENT_EMAIL = `qa.monitor.silent.${RUN_ID}@scj.test`;
const ADMIN_EMAIL = `qa.monitor.admin.${RUN_ID}@scj.test`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n8sAAAAASUVORK5CYII=";
const PUNCH_ISO = (bogotaHourMinute) => new Date(`${TODAY}T${bogotaHourMinute}:00.000Z`).toISOString();
const ROUTE_START = "06:00";
const ROUTE_END = "18:00";
const TOLERANCE = 15;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function check(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

async function request(pathname, { token = "", method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expected) {
    const error = new Error(`${method} ${pathname}: esperado ${expected}, obtenido ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function scjTenant() {
  const localId = "001346eb-ba7f-4103-b032-73a219f1333e";
  const qaId = "cbbf3627-4336-4f23-95c6-1077414bcd17";
  const expected = args.environment === "qa" ? qaId : localId;
  const tenant = await prisma.tenant.findFirst({ where: { id: expected } });
  if (tenant) return tenant;
  const fallback = await prisma.tenant.findFirst({ where: { name: { contains: "SCJ", mode: "insensitive" } } });
  if (!fallback) throw new Error(`No existe el tenant SCJ para el ambiente ${ENVIRONMENT}.`);
  return fallback;
}

const ENVIRONMENT = String(args.environment || (["qa"].includes(normalize(process.env.APP_ENV)) || ["qa"].includes(normalize(process.env.TARGET_ENV)) ? "qa" : "local")).toLowerCase();

async function main() {
  if (!["local", "qa"].includes(ENVIRONMENT)) {
    throw new Error("La certificacion solo puede ejecutarse en ambiente local o QA.");
  }
  const health = await request("/health");
  const tenant = await scjTenant();
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const adminRole = roles.find((item) => normalize(item.name) === "apex_admin") || roles.find((item) => normalize(item.name).includes("admin")) || roles[0];
  const markingRole = roles.find((item) => normalize(item.name).includes("marcacion")) || roles.find((item) => normalize(item.name).includes("empleado")) || null;
  if (!adminRole || !markingRole) throw new Error("No existen roles aptos para certificar el monitor de mallas en SCJ.");

  const result = {
    change_id: "hr-monitor-ui-modernization-20260918",
    environment: ENVIRONMENT.toUpperCase(),
    company: "SCJ",
    generated_at: new Date().toISOString(),
    api_commit: health.commit || "unknown",
    checks: [],
    fixture: {},
    observations: {},
    status: "running"
  };
  let markingUser;
  let silentUser;
  let adminUser;
  let route;

  try {
    const directLogin = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email: "scj@apexos.qa", password: "ApexOS-QA-SCJ-2026!" }
    }).catch(() => null);
    let adminToken = directLogin?.token || "";

    markingUser = await admin.createUser(tenant.id, {
      name: `Operario marcaciones ${RUN_ID}`, first_names: "Operario marcaciones", last_names: RUN_ID,
      email: MARKING_EMAIL, password: PASSWORD, role_id: markingRole.id, company: "SCJ",
      document: `QAMM${RUN_ID}`, code: `QA-MM-${RUN_ID}`, department: "QA", position: "Operario de pruebas",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    silentUser = await admin.createUser(tenant.id, {
      name: `Operario sin marcar ${RUN_ID}`, first_names: "Operario sin marcar", last_names: RUN_ID,
      email: SILENT_EMAIL, password: PASSWORD, role_id: markingRole.id, company: "SCJ",
      document: `QAMS${RUN_ID}`, code: `QA-MS-${RUN_ID}`, department: "QA", position: "Operario de pruebas",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    if (!adminToken) {
      adminUser = await admin.createUser(tenant.id, {
        name: `Administrador monitor ${RUN_ID}`, first_names: "Administrador monitor", last_names: RUN_ID,
        email: ADMIN_EMAIL, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
        document: `QAMA${RUN_ID}`, code: `QA-MA-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
        operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
      });
      adminToken = (await request("/api/v1/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: PASSWORD } })).token;
    }

    route = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id, date: new Date(`${TODAY}T05:00:00.000Z`), vehicle_plate: "",
        employees: [MARKING_EMAIL, SILENT_EMAIL], start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE,
        notes: `Certificacion monitor mallas modernizado ${RUN_ID}`, status: "active"
      }
    }));
    result.fixture = { tenant_id: tenant.id, route_id: route.id, marking_user_id: markingUser.id, silent_user_id: silentUser.id, admin_user_id: adminUser?.id || null };

    const markingLogin = await request("/api/v1/auth/login", { method: "POST", body: { email: MARKING_EMAIL, password: PASSWORD } });
    const markingToken = markingLogin.token;

    const entrada = await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "entrada", route_id: route.id, punched_at: PUNCH_ISO("11:10"), latitude: 4.711, longitude: -74.0721, accuracy_meters: 8, extra_evidence: { base64: PHOTO, name: `entrada-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });
    await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "inicio_almuerzo", route_id: route.id, punched_at: PUNCH_ISO("17:02"), latitude: 4.712, longitude: -74.0732, accuracy_meters: 10 }
    });
    await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "fin_almuerzo", route_id: route.id, punched_at: PUNCH_ISO("17:59"), latitude: 4.712, longitude: -74.0732, accuracy_meters: 10 }
    });
    const types = await request("/api/v1/hr/self/activity-types", { token: markingToken });
    const activity = await request("/api/v1/hr/self/work-activities", {
      token: markingToken, method: "POST",
      body: { activity_type_id: types[0].id, employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, route_id: route.id, occurred_at: PUNCH_ISO("19:30"), latitude: 4.714, longitude: -74.075, accuracy_meters: 12, observation: "Actividad certificada monitor mallas modernizado", gps_required: true, gps_skipped: false, photo: { base64: PHOTO, name: `activity-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });
    const salida = await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "salida", route_id: route.id, punched_at: PUNCH_ISO("21:05"), latitude: 4.713, longitude: -74.074, accuracy_meters: 6, extra_reason: "certificacion_qa", extra_detail: "Prueba controlada de evidencia de salida", extra_evidence: { base64: PHOTO, name: `salida-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });

    await request("/api/v1/hr/self/gps/ping", {
      token: markingToken, method: "POST",
      body: { user_name: MARKING_EMAIL, route_id: route.id, latitude: 4.7115, longitude: -74.0728, accuracy_meters: 8, captured_at: new Date().toISOString() }
    });

    const operations = await request(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=30`, { token: adminToken });
    const monitoredRoute = (operations.routes || []).find((item) => Number(item.id) === Number(route.id));
    const markingPerson = (operations.people || []).find((person) => Number(person.employee_id) === Number(markingUser.employee_id));
    const silentPerson = (operations.people || []).find((person) => Number(person.employee_id) === Number(silentUser.employee_id));
    const markingAliases = new Set([normalize(markingPerson?.user_name), normalize(markingPerson?.name)].filter(Boolean));
    const marksEntry = (monitoredRoute?.marks_by_user || []).find((item) => markingAliases.has(normalize(item.user_name)));
    const entradaPoint = monitoredRoute?.punch_points?.find((item) => Number(item.id) === Number(entrada.punch?.id));
    const salidaPoint = monitoredRoute?.punch_points?.find((item) => Number(item.id) === Number(salida.punch?.id));
    const activityPoint = monitoredRoute?.activity_points?.find((item) => Number(item.id) === Number(activity.id));

    check(result, "operations_map_route_present", Boolean(monitoredRoute), { route_id: route.id });
    check(result, "operations_map_marks_by_user_complete", marksEntry && marksEntry.marks.length === 4, { marks: marksEntry?.marks || [] });
    check(result, "operations_map_punch_points_complete", (monitoredRoute?.punch_points || []).length >= 4, { count: monitoredRoute?.punch_points?.length || 0 });
    check(result, "operations_map_activity_points_present", (monitoredRoute?.activity_points || []).length >= 1, { count: monitoredRoute?.activity_points?.length || 0 });
    check(result, "operations_map_people_include_both_operators", Boolean(markingPerson && silentPerson), {
      marking: markingPerson ? { online: markingPerson.online, last_punch_type: markingPerson.last_punch_type, has_gps: markingPerson.latitude != null } : null,
      silent: silentPerson ? { online: silentPerson.online, last_punch_type: silentPerson.last_punch_type, has_gps: silentPerson.latitude != null } : null
    });
    check(result, "operations_map_person_without_marks", silentPerson && silentPerson.last_punch_type === "sin_marcar", { last_punch_type: silentPerson?.last_punch_type || null });
    check(result, "operations_map_evidence_summaries", Boolean(entradaPoint?.extra_evidence?.available && salidaPoint?.extra_evidence?.available && activityPoint?.evidence?.[0]?.available), {
      entrada: entradaPoint?.extra_evidence || null,
      salida: salidaPoint?.extra_evidence || null,
      activity: activityPoint?.evidence?.[0] || null
    });

    const batch = await request(`/api/v1/hr/monitor-evidence/route/${route.id}`, { token: adminToken });
    const punchPayloads = Object.values(batch.punch_evidence || {});
    const activityPayloads = Object.values(batch.activity_evidence || {}).flat();
    check(result, "batch_counts_consistent", batch.counts && batch.counts.punches >= 4 && batch.counts.punch_evidence >= 2 && batch.counts.activities >= 1 && batch.counts.activity_evidence >= 1, batch.counts || {});
    check(result, "batch_punch_evidence_renders", punchPayloads.filter((item) => item.base64_data === PHOTO).length >= 2, { with_base64: punchPayloads.filter((item) => item.base64_data === PHOTO).length, total: punchPayloads.length });
    check(result, "batch_activity_evidence_renders", activityPayloads.some((item) => item.base64_data === PHOTO), { with_base64: activityPayloads.filter((item) => item.base64_data === PHOTO).length, total: activityPayloads.length });

    const denied = await request(`/api/v1/hr/monitor-evidence/route/${route.id}`, { token: markingToken, expected: 403 });
    check(result, "marking_only_role_denied_batch", denied.code === "PERMISO_DENEGADO", { code: denied.code });
    const invalid = await request("/api/v1/hr/monitor-evidence/route/abc", { token: adminToken, expected: 400 });
    check(result, "invalid_route_id_controlled", invalid.code === "EVIDENCIA_MONITOR_RUTA_INVALIDA", { code: invalid.code });

    const summaries = await request("/api/v1/hr/routes/event-summaries", { token: adminToken });
    const summaryRow = (summaries.routes || []).find((row) => Number(row.route_id) === Number(route.id));
    check(result, "route_summary_counts_all_evidence", summaryRow && summaryRow.evidence_count >= 3, { route_id: route.id, evidence_count: summaryRow?.evidence_count ?? null });

    const otherTenant = await prisma.tenant.findFirst({ where: { id: { not: tenant.id } } });
    if (otherTenant) {
      const isolated = await hr.getMonitorEvidenceBatch(otherTenant.id, route.id);
      const empty = Object.keys(isolated.punch_evidence || {}).length === 0 && Object.keys(isolated.activity_evidence || {}).length === 0;
      check(result, "cross_tenant_batch_isolated", empty, {
        other_tenant_id: otherTenant.id,
        punch_evidence: Object.keys(isolated.punch_evidence || {}).length,
        activity_evidence: Object.keys(isolated.activity_evidence || {}).length
      });
    }

    result.observations = {
      date: TODAY,
      route: { id: route.id, start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE, employees: [MARKING_EMAIL, SILENT_EMAIL] },
      totals: operations.totals || null,
      marks_by_user: marksEntry?.marks || [],
      exclusions: "Ruta sin placa: el flujo de kilometraje de salida (th_jornada_kilometrajes) se excluye por hallazgo preexistente 42P10 en el ON CONFLICT de createPunch, fuera del alcance de este cambio."
    };
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    throw error;
  } finally {
    if (FIXTURE_OUTPUT && result.status === "passed") {
      fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
      fs.writeFileSync(FIXTURE_OUTPUT, `${JSON.stringify({
        environment: ENVIRONMENT.toUpperCase(),
        api_url: API_URL,
        admin_email: adminUser ? ADMIN_EMAIL : "scj@apexos.qa",
        admin_password: adminUser ? PASSWORD : "ApexOS-QA-SCJ-2026!",
        tenant_id: tenant.id,
        route_id: route.id,
        marking_email: MARKING_EMAIL,
        silent_email: SILENT_EMAIL,
        password: PASSWORD,
        date: TODAY,
        generated_at: new Date().toISOString()
      }, null, 2)}\n`);
    } else {
      if (markingUser?.id) await admin.setUserActive(tenant.id, markingUser.id, false).catch(() => undefined);
      if (silentUser?.id) await admin.setUserActive(tenant.id, silentUser.id, false).catch(() => undefined);
      if (adminUser?.id) await admin.setUserActive(tenant.id, adminUser.id, false).catch(() => undefined);
      if (route?.id) await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: route.id }, data: { status: "inactive" } })).catch(() => undefined);
    }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`CERTIFICACION HR MONITOR MALLAS MODERNIZADO APROBADA: ${result.checks.length} controles`);
}

main().catch((error) => {
  console.error(`CERTIFICACION HR MONITOR MALLAS MODERNIZADO FALLIDA: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
