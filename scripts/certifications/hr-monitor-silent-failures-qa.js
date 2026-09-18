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

const API_URL = String(args["api-url"] || "http://127.0.0.1:3100").replace(/\/$/, "");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-monitor-silent-failures-20260918/qa-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Silent-${crypto.randomBytes(6).toString("hex")}#26`;
const OPERATOR_EMAIL = `qa.silent.operator.${RUN_ID}@scj.test`;
const ADMIN_EMAIL = `qa.silent.admin.${RUN_ID}@scj.test`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const SCJ_TENANT_ID = "cbbf3627-4336-4f23-95c6-1077414bcd17";
const REQUEST_ID = `hr-silent-qa-${RUN_ID}`;

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
  const tenant = await prisma.tenant.findFirst({ where: { id: SCJ_TENANT_ID } });
  if (tenant) return tenant;
  const fallback = await prisma.tenant.findFirst({ where: { name: { contains: "SCJ", mode: "insensitive" } } });
  if (!fallback) throw new Error("No existe el tenant SCJ en QA.");
  return fallback;
}

async function main() {
  if (![process.env.APP_ENV, process.env.TARGET_ENV].some((value) => normalize(value) === "qa")) {
    throw new Error("La certificacion solo puede ejecutarse con configuracion QA.");
  }
  const health = await request("/health");
  const tenant = await scjTenant();
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const adminRole = roles.find((item) => normalize(item.name).includes("administrador")) || roles.find((item) => normalize(item.name).includes("admin")) || roles[0];
  const operatorRole = roles.find((item) => ["marcacion", "operario", "tecnico", "empleado"].some((key) => normalize(item.name).includes(key)))
    || roles.find((item) => !normalize(item.name).includes("admin")) || null;
  if (!adminRole || !operatorRole) throw new Error("No existen roles aptos para certificar telemetria de cliente en SCJ.");

  const result = {
    change_id: "hr-monitor-silent-failures-20260918",
    environment: "QA",
    company: "SCJ",
    generated_at: new Date().toISOString(),
    api_commit: health.commit || "unknown",
    checks: [],
    observations: {},
    status: "running"
  };
  let operatorUser;
  let adminUser;
  let adminToken = "";

  try {
    const directLogin = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email: "scj@apexos.qa", password: "ApexOS-QA-SCJ-2026!" }
    }).catch(() => null);
    adminToken = directLogin?.token || "";

    operatorUser = await admin.createUser(tenant.id, {
      name: `Operario telemetria ${RUN_ID}`, first_names: "Operario telemetria", last_names: RUN_ID,
      email: OPERATOR_EMAIL, password: PASSWORD, role_id: operatorRole.id, company: "SCJ",
      document: `QASO${RUN_ID}`, code: `QA-SO-${RUN_ID}`, department: "QA", position: "Operario de pruebas",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    if (!adminToken) {
      adminUser = await admin.createUser(tenant.id, {
        name: `Administrador telemetria ${RUN_ID}`, first_names: "Administrador telemetria", last_names: RUN_ID,
        email: ADMIN_EMAIL, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
        document: `QASA${RUN_ID}`, code: `QA-SA-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
        operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
      });
      adminToken = (await request("/api/v1/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: PASSWORD } })).token;
    }
    const operatorToken = (await request("/api/v1/auth/login", { method: "POST", body: { email: OPERATOR_EMAIL, password: PASSWORD } })).token;

    const routes = await request("/api/v1/hr/routes", { token: adminToken });
    const route72 = (routes || []).find((route) => Number(route.id) === 72);
    const route90 = (routes || []).find((route) => Number(route.id) === 90);
    check(result, "route_72_tracking_mode_punch_only", route72 && route72.tracking_mode === "punch_only" && route72.gps_required === false, {
      tracking_mode: route72?.tracking_mode || null,
      gps_required: route72?.gps_required ?? null,
      notes: route72?.notes || ""
    });
    check(result, "route_90_present", Boolean(route90), { id: route90?.id || null, tracking_mode: route90?.tracking_mode || null });

    const clientLog = await request("/admin/platform-logs/client", {
      token: operatorToken,
      method: "POST",
      body: {
        message: `Certificacion telemetria de cliente ${RUN_ID}`,
        module: "qa-certification",
        route: "/dashboard/talento-humano/mapa",
        method: "GET",
        status_code: 500,
        code: "QA_SILENT_FAILURES_CERT",
        detail: "Registro de prueba para validar que operarios pueden reportar errores silenciosos.",
        request_id: REQUEST_ID
      }
    });
    check(result, "client_log_accepted_for_non_admin", clientLog?.ok === true, clientLog);

    const logs = await request("/admin/platform-logs?limit=10", { token: adminToken });
    const recorded = (Array.isArray(logs) ? logs : []).find((log) => log.request_id === REQUEST_ID);
    check(result, "client_log_readable_by_admin", Boolean(recorded && recorded.source === "frontend" && recorded.module === "qa-certification"), {
      source: recorded?.source || null,
      module: recorded?.module || null,
      level: recorded?.level || null,
      status_code: recorded?.status_code ?? null
    });

    const operations = await request(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=30`, { token: adminToken });
    const locatedPeople = (operations.people || []).filter((person) => person.latitude != null && person.longitude != null);
    const mapRoute72 = (operations.routes || []).find((route) => Number(route.id) === 72);
    const mapRoute90 = (operations.routes || []).find((route) => Number(route.id) === 90);
    result.observations = {
      date: TODAY,
      totals: operations.totals || null,
      located_people: locatedPeople.length,
      route_72: { present: Boolean(mapRoute72), pings: mapRoute72?.pings?.length || 0, punch_points: mapRoute72?.punch_points?.length || 0, activity_points: mapRoute72?.activity_points?.length || 0 },
      route_90: { present: Boolean(mapRoute90), pings: mapRoute90?.pings?.length || 0, punch_points: mapRoute90?.punch_points?.length || 0, activity_points: mapRoute90?.activity_points?.length || 0 }
    };
    check(result, "operations_map_payload_complete", Boolean(operations.totals && operations.routes && operations.people), result.observations);

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    throw error;
  } finally {
    if (operatorUser?.id) await admin.setUserActive(tenant.id, operatorUser.id, false).catch(() => undefined);
    if (adminUser?.id) await admin.setUserActive(tenant.id, adminUser.id, false).catch(() => undefined);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`CERTIFICACION HR SILENT FAILURES APROBADA: ${result.checks.length} controles`);
}

main().catch((error) => {
  console.error(`CERTIFICACION HR SILENT FAILURES FALLIDA: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
