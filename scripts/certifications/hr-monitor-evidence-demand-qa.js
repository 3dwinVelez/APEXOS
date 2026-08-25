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
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-monitor-evidence-demand-20260824/certification.json"));
const FIXTURE_OUTPUT = args["fixture-output"] ? path.resolve(String(args["fixture-output"])) : "";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Monitor-${crypto.randomBytes(6).toString("hex")}#26`;
const MARKING_EMAIL = `qa.monitor.employee.${RUN_ID}@nyvora.test`;
const ADMIN_EMAIL = `qa.monitor.admin.${RUN_ID}@nyvora.test`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n8sAAAAASUVORK5CYII=";

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

async function nyvoraTenant() {
  const direct = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } } });
  if (direct) return direct;
  const companies = await prisma.$queryRawUnsafe("select id,name,legal_name from public.companies order by name").catch(() => []);
  const company = companies.find((item) => normalize(item.name).includes("nyvora") || normalize(item.legal_name).includes("nyvora"));
  if (!company) throw new Error("No existe la empresa modelo Nyvora en QA.");
  const tenant = await prisma.tenant.findFirst({ where: { config: { path: ["company_id"], equals: String(company.id) } } });
  if (!tenant) throw new Error("No existe tenant operativo Nyvora en QA.");
  return tenant;
}

async function main() {
  if (![process.env.APP_ENV, process.env.TARGET_ENV].some((value) => normalize(value) === "qa")) {
    throw new Error("La certificacion solo puede ejecutarse con configuracion QA.");
  }
  const health = await request("/health");
  const tenant = await nyvoraTenant();
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const markingRole = roles.find((item) => item.name === "Empleado marcaciones");
  const monitorRole = roles.find((item) => item.name === "Administrador de empresa") || roles.find((item) => item.name === "APEX_ADMIN");
  if (!markingRole || !monitorRole) throw new Error("No existen los roles requeridos para certificar el monitor.");

  const result = {
    change_id: "hr-monitor-evidence-demand-20260824",
    environment: "QA",
    company: "NYVORA",
    generated_at: new Date().toISOString(),
    api_commit: health.commit || "unknown",
    checks: [],
    fixture: {},
    status: "running"
  };
  let employeeUser;
  let monitorUser;
  let route;

  try {
    employeeUser = await admin.createUser(tenant.id, {
      name: `Empleado evidencia ${RUN_ID}`, first_names: "Empleado evidencia", last_names: RUN_ID,
      email: MARKING_EMAIL, password: PASSWORD, role_id: markingRole.id, company: "Nyvora",
      document: `QAME${RUN_ID}`, code: `QA-ME-${RUN_ID}`, department: "QA", position: "Empleado de pruebas",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    monitorUser = await admin.createUser(tenant.id, {
      name: `Administrador monitor ${RUN_ID}`, first_names: "Administrador monitor", last_names: RUN_ID,
      email: ADMIN_EMAIL, password: PASSWORD, role_id: monitorRole.id, company: "Nyvora",
      document: `QAMA${RUN_ID}`, code: `QA-MA-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
      operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    route = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id, date: new Date(`${TODAY}T05:00:00.000Z`), vehicle_plate: "", employees: [MARKING_EMAIL],
        start_time: "00:01", end_time: "00:02", tolerance_minutes: 0, per_diem: 0,
        notes: "Control de marcacion: punch_only\nCertificacion carga de evidencia bajo demanda", status: "active"
      }
    }));
    result.fixture = { employee_user_id: employeeUser.id, monitor_user_id: monitorUser.id, route_id: route.id };

    const employeeLogin = await request("/api/v1/auth/login", { method: "POST", body: { email: MARKING_EMAIL, password: PASSWORD } });
    const employeeToken = employeeLogin.token;
    await request("/api/v1/hr/self/time-punches", { token: employeeToken, method: "POST", body: { employee_id: employeeUser.employee_id, user_name: MARKING_EMAIL, type: "entrada", route_id: route.id, punched_at: new Date().toISOString() } });
    const types = await request("/api/v1/hr/self/activity-types", { token: employeeToken });
    const activity = await request("/api/v1/hr/self/work-activities", {
      token: employeeToken,
      method: "POST",
      body: { activity_type_id: types[0].id, employee_id: employeeUser.employee_id, user_name: MARKING_EMAIL, route_id: route.id, gps_required: false, gps_skipped: true, observation: "Actividad con evidencia bajo demanda", photo: { base64: PHOTO, name: `activity-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });
    for (const type of ["inicio_almuerzo", "fin_almuerzo"]) {
      await request("/api/v1/hr/self/time-punches", { token: employeeToken, method: "POST", body: { employee_id: employeeUser.employee_id, user_name: MARKING_EMAIL, type, route_id: route.id, punched_at: new Date().toISOString() } });
    }
    const exit = await request("/api/v1/hr/self/time-punches", {
      token: employeeToken,
      method: "POST",
      body: { employee_id: employeeUser.employee_id, user_name: MARKING_EMAIL, type: "salida", route_id: route.id, punched_at: new Date().toISOString(), extra_reason: "certificacion_qa", extra_detail: "Prueba controlada de evidencia de salida", extra_evidence: { base64: PHOTO, name: `punch-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });

    const monitorLogin = await request("/api/v1/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: PASSWORD } });
    const monitorToken = monitorLogin.token;
    const operations = await request(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=30`, { token: monitorToken });
    const monitoredRoute = (operations.routes || []).find((item) => Number(item.id) === Number(route.id));
    const activityPoint = monitoredRoute?.activity_points?.find((item) => Number(item.id) === Number(activity.id));
    const punchPoint = monitoredRoute?.punch_points?.find((item) => Number(item.id) === Number(exit.punch?.id));
    const activitySummary = activityPoint?.evidence?.[0];
    const punchSummary = punchPoint?.extra_evidence;
    check(result, "activity_summary_available", Boolean(activitySummary?.available && activitySummary?.id), activitySummary || {});
    check(result, "activity_summary_excludes_payload", !activitySummary?.base64_data, { has_base64_data: activitySummary?.has_base64_data });
    check(result, "punch_summary_available", Boolean(punchSummary?.available && punchSummary?.id), punchSummary || {});
    check(result, "punch_summary_excludes_payload", !punchSummary?.base64_data, { has_base64_data: punchSummary?.has_base64_data });

    const activityEvidence = await request(`/api/v1/hr/monitor-evidence/activity/${activitySummary.id}`, { token: monitorToken });
    const punchEvidence = await request(`/api/v1/hr/monitor-evidence/punch/${punchSummary.id}`, { token: monitorToken });
    check(result, "activity_loaded_on_demand", activityEvidence.base64_data === PHOTO, { id: activityEvidence.id, source: activityEvidence.source });
    check(result, "punch_loaded_on_demand", punchEvidence.base64_data === PHOTO, { id: punchEvidence.id, source: punchEvidence.source });

    const denied = await request(`/api/v1/hr/monitor-evidence/activity/${activitySummary.id}`, { token: employeeToken, expected: 403 });
    check(result, "marking_only_role_denied", denied.code === "PERMISO_DENEGADO", { code: denied.code });
    const missing = await request("/api/v1/hr/monitor-evidence/activity/2147483647", { token: monitorToken, expected: 404 });
    check(result, "missing_evidence_controlled", missing.code === "EVIDENCIA_MONITOR_NO_ENCONTRADA", { code: missing.code });

    const otherTenant = await prisma.tenant.findFirst({ where: { id: { not: tenant.id } } });
    if (otherTenant) {
      let isolated = false;
      try {
        await hr.getMonitorEvidence(otherTenant.id, "activity", activitySummary.id);
      } catch (error) {
        isolated = error.statusCode === 404 && error.code === "EVIDENCIA_MONITOR_NO_ENCONTRADA";
      }
      check(result, "cross_tenant_evidence_denied", isolated, { other_tenant_id: otherTenant.id });
    }
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    throw error;
  } finally {
    if (FIXTURE_OUTPUT && result.status === "passed") {
      fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
      fs.writeFileSync(FIXTURE_OUTPUT, JSON.stringify({ admin_email: ADMIN_EMAIL, password: PASSWORD, tenant_id: tenant.id, employee_user_id: employeeUser.id, monitor_user_id: monitorUser.id, route_id: route.id, date: TODAY }));
    } else {
      if (employeeUser?.id) await admin.setUserActive(tenant.id, employeeUser.id, false).catch(() => undefined);
      if (monitorUser?.id) await admin.setUserActive(tenant.id, monitorUser.id, false).catch(() => undefined);
      if (route?.id) await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: route.id }, data: { status: "inactive" } })).catch(() => undefined);
    }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`CERTIFICACION HR EVIDENCIA BAJO DEMANDA APROBADA: ${result.checks.length} controles`);
}

main().catch((error) => {
  console.error(`CERTIFICACION HR EVIDENCIA BAJO DEMANDA FALLIDA: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
