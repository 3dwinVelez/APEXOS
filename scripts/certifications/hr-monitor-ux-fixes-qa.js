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
const WEB_URL = args["web-url"] ? String(args["web-url"]).replace(/\/$/, "") : "";
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-monitor-ux-fixes-20260919/certification.json"));
const FIXTURE_OUTPUT = args["fixture-output"] ? path.resolve(String(args["fixture-output"])) : "";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Ux-${crypto.randomBytes(6).toString("hex")}#26`;
const MARKING_EMAIL = `qa.ux.marks.${RUN_ID}@scj.test`;
const SILENT_EMAIL = `qa.ux.silent.${RUN_ID}@scj.test`;
const ADMIN_EMAIL = `qa.ux.admin.${RUN_ID}@scj.test`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const OLD_DAY = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n8sAAAAASUVORK5CYII=";
const PHOTO_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
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

// Coordenadas distintas por marcacion para verificar la linea del recorrido.
const STOPS = [
  { type: "entrada", hour: "11:10", latitude: 4.711, longitude: -74.0721 },
  { type: "inicio_almuerzo", hour: "17:02", latitude: 4.7148, longitude: -74.0691 },
  { type: "fin_almuerzo", hour: "17:59", latitude: 4.7152, longitude: -74.0688 },
  { type: "salida", hour: "21:05", latitude: 4.7189, longitude: -74.0655 }
];

function punchCoordinateCount(marks) {
  const seen = new Set();
  for (const mark of marks || []) {
    const latitude = Number(mark.latitude);
    const longitude = Number(mark.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) seen.add(`${latitude},${longitude}`);
  }
  return seen.size;
}

function isAscending(marks) {
  const times = (marks || []).map((mark) => new Date(mark.punched_at || 0).getTime());
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1]) return false;
  }
  return true;
}

async function fetchWebCss(webUrl) {
  const login = await fetch(`${webUrl}/login`).catch(() => null);
  if (!login || !login.ok) return "";
  const html = await login.text();
  const hrefs = Array.from(html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)).map((match) => match[1]);
  let combined = "";
  for (const href of hrefs) {
    const css = await fetch(`${webUrl}${href}`).catch(() => null);
    if (css && css.ok) combined += await css.text();
  }
  return combined;
}

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
    change_id: "hr-monitor-ux-fixes-20260919",
    environment: ENVIRONMENT.toUpperCase(),
    company: "SCJ",
    generated_at: new Date().toISOString(),
    api_commit: health.commit || "unknown",
    api_url: API_URL,
    web_url: WEB_URL || null,
    checks: [],
    fixture: {},
    observations: {},
    status: "running"
  };
  let markingUser;
  let silentUser;
  let adminUser;
  let route;
  let oldRoute;

  try {
    const directLogin = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email: "scj@apexos.qa", password: "ApexOS-QA-SCJ-2026!" }
    }).catch(() => null);
    let adminToken = directLogin?.token || "";

    markingUser = await admin.createUser(tenant.id, {
      name: `Operario UX ${RUN_ID}`, first_names: "Operario UX", last_names: RUN_ID,
      email: MARKING_EMAIL, password: PASSWORD, role_id: markingRole.id, company: "SCJ",
      document: `QAUX${RUN_ID}`, code: `QA-UX-${RUN_ID}`, department: "QA", position: "Operario de pruebas",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    silentUser = await admin.createUser(tenant.id, {
      name: `Operario sin marcar UX ${RUN_ID}`, first_names: "Operario sin marcar UX", last_names: RUN_ID,
      email: SILENT_EMAIL, password: PASSWORD, role_id: markingRole.id, company: "SCJ",
      document: `QAUS${RUN_ID}`, code: `QA-US-${RUN_ID}`, department: "QA", position: "Operario de pruebas",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    if (!adminToken) {
      adminUser = await admin.createUser(tenant.id, {
        name: `Administrador UX ${RUN_ID}`, first_names: "Administrador UX", last_names: RUN_ID,
        email: ADMIN_EMAIL, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
        document: `QAUA${RUN_ID}`, code: `QA-UA-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
        operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
      });
      adminToken = (await request("/api/v1/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: PASSWORD } })).token;
    }

    route = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id, date: new Date(`${TODAY}T05:00:00.000Z`), vehicle_plate: "",
        employees: [MARKING_EMAIL, SILENT_EMAIL], start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE,
        notes: `Certificacion UX monitor mallas ${RUN_ID}`, status: "active"
      }
    }));
    // Ruta antigua (TODAY-3) para certificar el monitor de horarios pasados.
    oldRoute = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id, date: new Date(`${OLD_DAY}T05:00:00.000Z`), vehicle_plate: "",
        employees: [MARKING_EMAIL], start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE,
        notes: `Certificacion UX monitor historico ${RUN_ID}`, status: "active"
      }
    }));
    result.fixture = { tenant_id: tenant.id, route_id: route.id, old_route_id: oldRoute.id, marking_user_id: markingUser.id, silent_user_id: silentUser.id, admin_user_id: adminUser?.id || null };

    const markingLogin = await request("/api/v1/auth/login", { method: "POST", body: { email: MARKING_EMAIL, password: PASSWORD } });
    const markingToken = markingLogin.token;
    const PUNCH_ISO = (hourMinute) => new Date(`${TODAY}T${hourMinute}:00.000Z`).toISOString();

    // Marcaciones con evidencia en entrada y salida (distintas) para certificar el lightbox multi-imagen.
    const entrada = await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "entrada", route_id: route.id, punched_at: PUNCH_ISO(STOPS[0].hour), latitude: STOPS[0].latitude, longitude: STOPS[0].longitude, accuracy_meters: 8, extra_evidence: { base64: PHOTO, name: `entrada-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });
    await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "inicio_almuerzo", route_id: route.id, punched_at: PUNCH_ISO(STOPS[1].hour), latitude: STOPS[1].latitude, longitude: STOPS[1].longitude, accuracy_meters: 10 }
    });
    await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "fin_almuerzo", route_id: route.id, punched_at: PUNCH_ISO(STOPS[2].hour), latitude: STOPS[2].latitude, longitude: STOPS[2].longitude, accuracy_meters: 10 }
    });
    const types = await request("/api/v1/hr/self/activity-types", { token: markingToken });
    const activity = await request("/api/v1/hr/self/work-activities", {
      token: markingToken, method: "POST",
      body: { activity_type_id: types[0].id, employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, route_id: route.id, occurred_at: PUNCH_ISO("19:30"), latitude: 4.7161, longitude: -74.0672, accuracy_meters: 12, observation: "Actividad certificada UX monitor mallas", gps_required: true, gps_skipped: false, photo: { base64: PHOTO, name: `activity-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });
    const salida = await request("/api/v1/hr/self/time-punches", {
      token: markingToken, method: "POST",
      body: { employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "salida", route_id: route.id, punched_at: PUNCH_ISO(STOPS[3].hour), latitude: STOPS[3].latitude, longitude: STOPS[3].longitude, accuracy_meters: 6, extra_reason: "certificacion_qa", extra_detail: "Evidencia de salida UX", extra_evidence: { base64: PHOTO_2, name: `salida-${RUN_ID}.png`, type: "image/png", size: 68 } }
    });

    // Marcaciones historicas: el flujo self solo permite el dia actual
    // (HORARIO_FUERA_DEL_DIA), por eso la ruta antigua se siembra directo en Prisma.
    const OLD_PUNCH_ISO = (hourMinute) => new Date(`${OLD_DAY}T${hourMinute}:00.000Z`).toISOString();
    const oldDayDate = new Date(`${OLD_DAY}T05:00:00.000Z`);
    await prisma.runWithTenant(tenant.id, () => prisma.timePunch.createMany({
      data: [
        { tenant_id: tenant.id, employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "entrada", punched_at: OLD_PUNCH_ISO("11:05"), date: oldDayDate, time: "11:05", latitude: 4.7001, longitude: -74.0801, accuracy_meters: 9, route_id: oldRoute.id },
        { tenant_id: tenant.id, employee_id: markingUser.employee_id, user_name: MARKING_EMAIL, type: "salida", punched_at: OLD_PUNCH_ISO("17:30"), date: oldDayDate, time: "17:30", latitude: 4.7088, longitude: -74.0712, accuracy_meters: 7, route_id: oldRoute.id }
      ]
    }));

    const operations = await request(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=30`, { token: adminToken });
    const monitoredRoute = (operations.routes || []).find((item) => Number(item.id) === Number(route.id));
    const markingPerson = (operations.people || []).find((person) => Number(person.employee_id) === Number(markingUser.employee_id));
    const silentPerson = (operations.people || []).find((person) => Number(person.employee_id) === Number(silentUser.employee_id));
    const markingAliases = new Set([normalize(markingPerson?.user_name), normalize(markingPerson?.name), normalize(MARKING_EMAIL)].filter(Boolean));
    const marksEntry = (monitoredRoute?.marks_by_user || []).find((item) => markingAliases.has(normalize(item.user_name)));
    const marks = marksEntry?.marks || [];
    const entradaPoint = monitoredRoute?.punch_points?.find((item) => Number(item.id) === Number(entrada.punch?.id));
    const salidaPoint = monitoredRoute?.punch_points?.find((item) => Number(item.id) === Number(salida.punch?.id));
    const activityPoint = monitoredRoute?.activity_points?.find((item) => Number(item.id) === Number(activity.id));

    check(result, "operations_map_route_present", Boolean(monitoredRoute), { route_id: route.id });

    // Defecto 4: la linea del recorrido requiere marcas localizables, ordenadas y con coordenadas distintas.
    check(result, "trail_marks_located", marks.length === 4, { marks: marks.length, user_names: (monitoredRoute?.marks_by_user || []).map((item) => item.user_name) });
    check(result, "trail_marks_chronological", isAscending(marks), { punched_at: marks.map((mark) => mark.punched_at) });
    check(result, "trail_marks_distinct_coordinates", punchCoordinateCount(marks) >= 2, {
      distinct: punchCoordinateCount(marks),
      coordinates: marks.map((mark) => [Number(mark.latitude), Number(mark.longitude)])
    });
    check(result, "trail_punch_points_have_coordinates", (monitoredRoute?.punch_points || []).filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))).length >= 4, {
      count: (monitoredRoute?.punch_points || []).filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))).length
    });

    // Defecto 2: monitor de horarios antiguos devuelve la ruta con sus marcaciones.
    const oldOperations = await request(`/api/v1/hr/operations-map?date=${OLD_DAY}&minutes=30&footprint_days=30`, { token: adminToken });
    const oldMonitored = (oldOperations.routes || []).find((item) => Number(item.id) === Number(oldRoute.id));
    const oldMarks = (oldMonitored?.marks_by_user || []).flatMap((item) => item.marks || []);
    check(result, "old_date_route_present_with_marks", Boolean(oldMonitored) && oldMarks.length === 2, {
      route_id: oldRoute.id, marks: oldMarks.length, date: OLD_DAY
    });

    // Defecto 1: el lightbox ampliado requiere multiples evidencias base64 renderizables.
    const batch = await request(`/api/v1/hr/monitor-evidence/route/${route.id}`, { token: adminToken });
    const punchPayloads = Object.values(batch.punch_evidence || {});
    const activityPayloads = Object.values(batch.activity_evidence || {}).flat();
    const photos = punchPayloads.filter((item) => [PHOTO, PHOTO_2].includes(item.base64_data));
    check(result, "lightbox_multiple_evidence_renders", photos.length >= 2, { with_base64: photos.length, total: punchPayloads.length });
    check(result, "lightbox_activity_evidence_renders", activityPayloads.some((item) => item.base64_data === PHOTO), { with_base64: activityPayloads.filter((item) => item.base64_data === PHOTO).length, total: activityPayloads.length });
    check(result, "evidence_summaries_available", Boolean(entradaPoint?.extra_evidence?.available && salidaPoint?.extra_evidence?.available && activityPoint?.evidence?.[0]?.available), {
      entrada: entradaPoint?.extra_evidence || null,
      salida: salidaPoint?.extra_evidence || null,
      activity: activityPoint?.evidence?.[0] || null
    });

    // Defecto 3: distribucion del monitor — personas marcando y sin marcar presentes.
    check(result, "monitor_people_include_both_operators", Boolean(markingPerson && silentPerson), {
      marking: markingPerson ? { online: markingPerson.online, last_punch_type: markingPerson.last_punch_type, has_gps: markingPerson.latitude != null } : null,
      silent: silentPerson ? { online: silentPerson.online, last_punch_type: silentPerson.last_punch_type } : null
    });
    check(result, "monitor_person_without_marks", silentPerson && silentPerson.last_punch_type === "sin_marcar", { last_punch_type: silentPerson?.last_punch_type || null });

    // Regresion de autorizacion: solo roles administrativos consultan el lote de evidencia.
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

    // Correccion raiz de los defectos 1-3: el keyframe debe terminar en transform:none
    // para no dejar un containing block residual que rompa position:fixed descendientes.
    if (WEB_URL) {
      const css = await fetchWebCss(WEB_URL);
      check(result, "web_css_page_enter_transform_none", /@keyframes\s+apexPageEnter\{[^@]*?transform:\s*none/.test(css), { web_url: WEB_URL, css_bytes: css.length });
    }

    result.observations = {
      date: TODAY,
      old_date: OLD_DAY,
      route: { id: route.id, start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE, employees: [MARKING_EMAIL, SILENT_EMAIL] },
      old_route: { id: oldRoute.id, date: OLD_DAY },
      trail: { marks: marks.length, distinct_coordinates: punchCoordinateCount(marks), chronological: isAscending(marks) },
      totals: operations.totals || null,
      exclusions: "Rutas sin placa: el flujo de kilometraje de salida (th_jornada_kilometrajes) se excluye por hallazgo preexistente 42P10 en el ON CONFLICT de createPunch, fuera del alcance de este cambio."
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
        web_url: WEB_URL || null,
        admin_email: adminUser ? ADMIN_EMAIL : "scj@apexos.qa",
        admin_password: adminUser ? PASSWORD : "ApexOS-QA-SCJ-2026!",
        tenant_id: tenant.id,
        route_id: route.id,
        old_route_id: oldRoute?.id || null,
        marking_email: MARKING_EMAIL,
        silent_email: SILENT_EMAIL,
        password: PASSWORD,
        date: TODAY,
        old_date: OLD_DAY,
        generated_at: new Date().toISOString()
      }, null, 2)}\n`);
    } else {
      if (markingUser?.id) await admin.setUserActive(tenant.id, markingUser.id, false).catch(() => undefined);
      if (silentUser?.id) await admin.setUserActive(tenant.id, silentUser.id, false).catch(() => undefined);
      if (adminUser?.id) await admin.setUserActive(tenant.id, adminUser.id, false).catch(() => undefined);
      if (route?.id) await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: route.id }, data: { status: "inactive" } })).catch(() => undefined);
      if (oldRoute?.id) await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: oldRoute.id }, data: { status: "inactive" } })).catch(() => undefined);
    }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`CERTIFICACION HR MONITOR UX FIXES APROBADA: ${result.checks.length} controles`);
}

main().catch((error) => {
  console.error(`CERTIFICACION HR MONITOR UX FIXES FALLIDA: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
