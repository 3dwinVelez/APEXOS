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

const prisma = require("../../apps/api/src/core/prisma");
const admin = require("../../apps/api/src/modules/admin/service");

const API_URL = String(args["api-url"] || "http://127.0.0.1:3000").replace(/\/$/, "");
const ENVIRONMENT = /railway\.app|supabase\./.test(API_URL) ? "QA" : "LOCAL";
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-markings-medellin-20260919/simulation-certification.json"));
const FIXTURE_OUTPUT = args["fixture-output"] ? path.resolve(String(args["fixture-output"])) : "";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Med-${crypto.randomBytes(6).toString("hex")}#26`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PHOTO_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const ROUTE_START = "06:00";
const ROUTE_END = "14:00";
const TOLERANCE = 15;
// Marcaciones en hora Bogota (-05:00). La salida a las 16:30 genera hora extra
// (16:30 - 14:00 - 15min tolerancia = 135 min) para ejercitar el flujo de justificacion.
const PUNCH_TIMES = { entrada: "06:05", inicio_almuerzo: "10:00", fin_almuerzo: "10:45", salida: "16:30" };
const ACTIVITY_TIME = "11:30";

function bogotaIso(hourMinute) {
  return new Date(`${TODAY}T${hourMinute}:00.000-05:00`).toISOString();
}

// 5 horarios en el area metropolitana de Medellin, cada uno en un municipio distinto,
// 2 personas por horario = 10 marcadores concurrentes. Cada persona tiene una ruta de
// 4 paradas con coordenadas distintas para que el mapa trace una linea real.
const SCHEDULES = [
  {
    municipality: "Medellin", routeType: "administrative", vehiclePlate: "",
    people: [
      { tag: "A", stops: [[6.24430, -75.57120], [6.24060, -75.57410], [6.24060, -75.57830], [6.24060, -75.59000]], activity: [6.24800, -75.57600] },
      { tag: "B", stops: [[6.26700, -75.56700], [6.25700, -75.57200], [6.24430, -75.57120], [6.23500, -75.57500]], activity: [6.25200, -75.56900] }
    ]
  },
  {
    municipality: "Bello", routeType: "vehicle", vehiclePlate: "SIMBLL01", kilometraje: "42.5",
    people: [
      { tag: "A", stops: [[6.33800, -75.55900], [6.34500, -75.55600], [6.33000, -75.55000], [6.35200, -75.54700]], activity: [6.34100, -75.55300] },
      { tag: "B", stops: [[6.36000, -75.55500], [6.34500, -75.55600], [6.33800, -75.55900], [6.33000, -75.55000]], activity: [6.35000, -75.55100] }
    ]
  },
  {
    municipality: "Itagui", routeType: "administrative", vehiclePlate: "",
    people: [
      { tag: "A", stops: [[6.18470, -75.59910], [6.17800, -75.60500], [6.17500, -75.59000], [6.16800, -75.60000]], activity: [6.18000, -75.60100] },
      { tag: "B", stops: [[6.19000, -75.60500], [6.18470, -75.59910], [6.17800, -75.60500], [6.17500, -75.59000]], activity: [6.18600, -75.60200] }
    ]
  },
  {
    municipality: "Envigado", routeType: "vehicle", vehiclePlate: "SIMENV01", kilometraje: "38.2",
    people: [
      { tag: "A", stops: [[6.17150, -75.59040], [6.16000, -75.58000], [6.16500, -75.58500], [6.15500, -75.57500]], activity: [6.16800, -75.58700] },
      { tag: "B", stops: [[6.18000, -75.59500], [6.17150, -75.59040], [6.16500, -75.58500], [6.16000, -75.58000]], activity: [6.17500, -75.59200] }
    ]
  },
  {
    municipality: "Sabaneta", routeType: "administrative", vehiclePlate: "",
    people: [
      { tag: "A", stops: [[6.15170, -75.61540], [6.15800, -75.61000], [6.14500, -75.62000], [6.14000, -75.61000]], activity: [6.15400, -75.61300] },
      { tag: "B", stops: [[6.15500, -75.62500], [6.15170, -75.61540], [6.15800, -75.61000], [6.14500, -75.62000]], activity: [6.15000, -75.61800] }
    ]
  }
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function check(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

// Registrono lanzador: captura status/code/latencia de TODA respuesta (incluidas 4xx/5xx)
// para detectar errores silenciosos sin abortar el simulacro.
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
    actor, step, municipality: actor.split("/")[1] || "", method, pathname,
    status, code: payload?.code || null, ok: status >= 200 && status < 300 && !transportError,
    latency_ms: Date.now() - started, transport_error: transportError,
    error: payload?.error || payload?.message || null
  };
  requestLog.push(entry);
  return { ...entry, payload };
}

async function expectStatus(pathname, opts, expected) {
  const res = await capture(pathname, opts);
  if (res.status !== expected) {
    const error = new Error(`${opts.method || "GET"} ${pathname}: esperado ${expected}, obtenido ${res.status} (${res.code || res.error || "sin codigo"})`);
    error.payload = res.payload;
    throw error;
  }
  return res;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// El login esta limitado a 10/minuto; el simulacro hace 12 logins. Se pacean con
// reintento honoring retry-after para no agotar la ventana antes de la fase concurrente.
async function loginWithRetry(email, password, actor) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await capture("/api/v1/auth/login", { method: "POST", body: { email, password }, actor, step: `login-intento-${attempt + 1}` });
    if (res.status === 200 && res.payload?.token) return res.payload.token;
    if (res.status === 429) {
      const retryAfter = Number(res.payload?.retry_after || res.payload?.retryAfter || 0) || 61;
      const waitMs = Math.min(Math.max(retryAfter, 1), 65) * 1000;
      process.stdout.write(`[login] 429 para ${actor}, esperando ${Math.round(waitMs / 1000)}s (intento ${attempt + 1}/4)\n`);
      await sleep(waitMs);
      continue;
    }
    const error = new Error(`login ${email}: status ${res.status} (${res.code || res.error || "sin codigo"})`);
    error.payload = res.payload;
    throw error;
  }
  throw new Error(`login ${email}: 429 persistente tras 4 intentos (rate limit 10/min)`);
}

function pgErrorCodes() {
  const codes = new Set();
  for (const entry of requestLog) {
    const blob = `${entry.code || ""} ${entry.error || ""}`;
    for (const code of ["42P10", "25P02", "40P01", "P2010", "P2024", "P2028", "P2034"]) {
      if (blob.includes(code)) codes.add(code);
    }
  }
  return Array.from(codes);
}

function distinctCoords(marks) {
  const seen = new Set();
  for (const mark of marks || []) {
    const lat = Number(mark.latitude);
    const lng = Number(mark.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) seen.add(`${lat.toFixed(5)},${lng.toFixed(5)}`);
  }
  return seen.size;
}

async function scjTenant() {
  const localId = "001346eb-ba7f-4103-b032-73a219f1333e";
  const tenant = await prisma.tenant.findFirst({ where: { id: localId } });
  if (tenant) return tenant;
  const fallback = await prisma.tenant.findFirst({ where: { name: { equals: "SCJ", mode: "insensitive" } } });
  if (!fallback) throw new Error("No existe el tenant SCJ en el ambiente local.");
  return fallback;
}

async function main() {
  const health = await expectStatus("/health", {}, 200);
  const tenant = await scjTenant();
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const adminRole = roles.find((item) => normalize(item.name) === "apex_admin") || roles.find((item) => normalize(item.name).includes("admin")) || roles[0];
  const markingRole = roles.find((item) => normalize(item.name).includes("marcacion")) || roles.find((item) => normalize(item.name).includes("empleado")) || null;
  if (!adminRole || !markingRole) throw new Error("No existen roles aptos (admin + marcacion) en SCJ.");

  const result = {
    change_id: "hr-markings-medellin-20260919",
    environment: ENVIRONMENT,
    company: "SCJ",
    generated_at: new Date().toISOString(),
    api_commit: health.payload.commit || "unknown",
    api_url: API_URL,
    simulation: { concurrent_markers: 10, schedules: SCHEDULES.length, metropolitan_area: "Valle de Aburra (Medellin)" },
    checks: [],
    fixture: {},
    aggregates: {},
    observations: {},
    status: "running"
  };

  const createdUsers = [];
  const createdRoutes = [];
  let adminUser;
  let adminToken;

  try {
    adminUser = await admin.createUser(tenant.id, {
      name: `Admin Simulacro ${RUN_ID}`, first_names: "Admin", last_names: `Simulacro ${RUN_ID}`,
      email: `qa.med.admin.${RUN_ID}@scj.test`, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
      document: `QMEDA${RUN_ID}`, code: `QA-MED-A-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
      operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    adminToken = await loginWithRetry(`qa.med.admin.${RUN_ID}@scj.test`, PASSWORD, "admin");

    // Construir los 10 marcadores (5 horarios x 2 personas) con sus rutas.
    const markers = [];
    for (let s = 0; s < SCHEDULES.length; s += 1) {
      const schedule = SCHEDULES[s];
      const emails = [];
      const people = [];
      for (const person of schedule.people) {
        const email = `qa.med.${normalize(schedule.municipality)}.${person.tag}.${RUN_ID}@scj.test`;
        emails.push(email);
        const user = await admin.createUser(tenant.id, {
          name: `Operario ${schedule.municipality} ${person.tag} ${RUN_ID}`, first_names: `Operario ${schedule.municipality}`, last_names: `${person.tag} ${RUN_ID}`,
          email, password: PASSWORD, role_id: markingRole.id, company: "SCJ",
          document: `QMED${s}${person.tag}${RUN_ID}`.slice(0, 20), code: `QA-MED-${s}${person.tag}-${RUN_ID}`, department: "Operaciones", position: "Operario de campo",
          operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
        });
        createdUsers.push(user);
        people.push({ ...person, email, user });
      }
      const route = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
        data: {
          tenant_id: tenant.id, date: new Date(`${TODAY}T05:00:00.000Z`), vehicle_plate: schedule.vehiclePlate,
          employees: emails, start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE,
          notes: `Simulacro marcaciones ${schedule.municipality} ${schedule.routeType} ${RUN_ID}`, status: "active"
        }
      }));
      createdRoutes.push(route);
      for (const person of people) {
        markers.push({ schedule, route, person, actor: `${person.email}/${schedule.municipality}` });
      }
    }
    result.fixture = {
      tenant_id: tenant.id, admin_user_id: adminUser.id,
      routes: createdRoutes.map((route) => ({ id: route.id, vehicle_plate: route.vehicle_plate, employees: route.employees })),
      markers: markers.map((marker) => ({ email: marker.person.email, municipality: marker.schedule.municipality, route_id: marker.route.id, route_type: marker.schedule.routeType }))
    };

    const activityTypes = await expectStatus("/api/v1/hr/self/activity-types", { token: adminToken }, 200);
    const activityTypeId = activityTypes.payload[0].id;

    // Secuencia completa de una persona: entrada -> inicio_almuerzo -> fin_almuerzo -> actividad -> salida.
    async function runMarkerSequence(marker) {
      const token = marker.token;
      const employeeId = marker.person.user.employee_id;
      const base = { employee_id: employeeId, user_name: marker.person.email, route_id: marker.route.id };
      const seq = [];
      const steps = [
        { type: "entrada", time: PUNCH_TIMES.entrada, coord: marker.person.stops[0], evidence: { base64: PHOTO, name: `entrada-${RUN_ID}.png`, type: "image/png", size: 68 } },
        { type: "inicio_almuerzo", time: PUNCH_TIMES.inicio_almuerzo, coord: marker.person.stops[1] },
        { type: "fin_almuerzo", time: PUNCH_TIMES.fin_almuerzo, coord: marker.person.stops[2] }
      ];
      for (const step of steps) {
        const body = { ...base, type: step.type, punched_at: bogotaIso(step.time), latitude: step.coord[0], longitude: step.coord[1], accuracy_meters: 8, idempotency_key: crypto.randomUUID(), ...(step.evidence ? { extra_evidence: step.evidence } : {}) };
        seq.push(await capture("/api/v1/hr/self/time-punches", { token, method: "POST", body, actor: marker.actor, step: step.type }));
      }
      // Evento diverso: actividad laboral con evidencia entre almuerzo y salida.
      seq.push(await capture("/api/v1/hr/self/work-activities", {
        token, method: "POST", actor: marker.actor, step: "actividad",
        body: { activity_type_id: activityTypeId, employee_id: employeeId, user_name: marker.person.email, route_id: marker.route.id, occurred_at: bogotaIso(ACTIVITY_TIME), latitude: marker.person.activity[0], longitude: marker.person.activity[1], accuracy_meters: 10, observation: `Evento operativo en ${marker.schedule.municipality}`, gps_required: true, gps_skipped: false, photo: { base64: PHOTO, name: `activity-${RUN_ID}.png`, type: "image/png", size: 68 } }
      }));
      // Salida con hora extra (16:30 > 14:00 + 15min) + justificacion + evidencia; en rutas vehiculares agrega kilometraje.
      const salidaBody = {
        ...base, type: "salida", punched_at: bogotaIso(PUNCH_TIMES.salida), latitude: marker.person.stops[3][0], longitude: marker.person.stops[3][1], accuracy_meters: 6, idempotency_key: crypto.randomUUID(),
        extra_reason: "operacion_extendida", extra_detail: `Cierre de jornada extendida en ${marker.schedule.municipality}`, extra_evidence: { base64: PHOTO_2, name: `salida-${RUN_ID}.png`, type: "image/png", size: 68 }
      };
      if (marker.schedule.routeType === "vehicle") salidaBody.kilometraje_dia = marker.schedule.kilometraje;
      seq.push(await capture("/api/v1/hr/self/time-punches", { token, method: "POST", body: salidaBody, actor: marker.actor, step: "salida" }));
      return { marker, token, seq };
    }

    // Fase de login paceada (10/min) ANTES de la fase concurrente de marcaciones.
    for (const marker of markers) {
      marker.token = await loginWithRetry(marker.person.email, PASSWORD, marker.actor);
    }

    // SIMULACRO DE CONCURRENCIA: los 10 marcadores ejecutan su jornada simultaneamente.
    const concurrencyStart = Date.now();
    const outcomes = await Promise.all(markers.map((marker) => runMarkerSequence(marker)));
    const concurrencyWallMs = Date.now() - concurrencyStart;

    const punchRequests = requestLog.filter((entry) => entry.pathname === "/api/v1/hr/self/time-punches");
    const serverErrors = requestLog.filter((entry) => entry.status >= 500);
    const salidaResults = outcomes.map((outcome) => outcome.seq.find((step) => step.step === "salida"));
    const vehicleSalidas = outcomes.filter((outcome) => outcome.marker.schedule.routeType === "vehicle").map((outcome) => outcome.seq.find((step) => step.step === "salida"));
    const latencies = punchRequests.map((entry) => entry.latency_ms).sort((a, b) => a - b);

    result.aggregates = {
      total_requests: requestLog.length,
      punch_requests: punchRequests.length,
      by_status: requestLog.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {}),
      server_errors: serverErrors.length,
      pg_error_codes: pgErrorCodes(),
      concurrency_wall_ms: concurrencyWallMs,
      punch_latency_ms: { min: latencies[0] ?? null, median: latencies[Math.floor(latencies.length / 2)] ?? null, max: latencies[latencies.length - 1] ?? null },
      vehicle_salida_statuses: vehicleSalidas.map((step) => ({ actor: step.actor, status: step.status, code: step.code }))
    };

    // ---- Controles de certificacion ----
    check(result, "health_ok", health.payload.status === "OK", { commit: health.payload.commit });
    check(result, "ten_concurrent_markers_executed", outcomes.length === 10, { markers: outcomes.length });
    check(result, "all_entries_accepted", outcomes.every((outcome) => outcome.seq[0].status === 200), { entrada_statuses: outcomes.map((outcome) => outcome.seq[0].status) });
    check(result, "all_lunch_breaks_accepted", outcomes.every((outcome) => outcome.seq[1].status === 200 && outcome.seq[2].status === 200), {});
    check(result, "all_activities_accepted", outcomes.every((outcome) => outcome.seq[3].status === 200 || outcome.seq[3].status === 201), { activity_statuses: outcomes.map((outcome) => outcome.seq[3].status) });
    // Nucleo del bug FM-01: las salidas (incluidas las vehiculares con kilometraje) deben cerrar en 200/201.
    check(result, "all_exits_accepted", salidaResults.every((step) => step.status === 200 || step.status === 201), { salida_statuses: salidaResults.map((step) => ({ actor: step.actor, status: step.status, code: step.code })) });
    check(result, "no_server_errors", serverErrors.length === 0, { server_errors: serverErrors.map((entry) => ({ actor: entry.actor, step: entry.step, status: entry.status, code: entry.code, error: entry.error })) });
    check(result, "no_postgres_silent_errors", pgErrorCodes().length === 0, { codes: pgErrorCodes() });
    check(result, "no_concurrency_throttling", !requestLog.some((entry) => (entry.status === 503 || entry.status === 429) && !String(entry.step).startsWith("login")), { throttled: requestLog.filter((entry) => (entry.status === 503 || entry.status === 429) && !String(entry.step).startsWith("login")).map((entry) => ({ actor: entry.actor, step: entry.step, status: entry.status, code: entry.code })) });
    check(result, "vehicle_exits_record_mileage", vehicleSalidas.every((step) => step.status === 200 || step.status === 201), { vehicle_salidas: vehicleSalidas.map((step) => ({ actor: step.actor, status: step.status, code: step.code, error: step.error })) });

    // Verificacion del mapa: cada ruta (2 personas) debe trazar, por persona, 4 marcaciones
    // con coordenadas distintas (no un solo punto). marks_by_user se indexa por nombre visible.
    const operations = await expectStatus(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=1`, { token: adminToken, actor: "admin", step: "operations-map" }, 200);
    const mapTraces = [];
    for (const schedule of SCHEDULES) {
      const route = createdRoutes.find((item) => item.vehicle_plate === schedule.vehiclePlate && (item.notes || "").includes(schedule.municipality));
      const monitored = (operations.payload.routes || []).find((item) => Number(item.id) === Number(route.id));
      const byUser = (monitored?.marks_by_user || []).map((entry) => ({ user_name: entry.user_name, marks: (entry.marks || []).length, distinct_coords: distinctCoords(entry.marks) }));
      const locatedPunchPoints = (monitored?.punch_points || []).filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))).length;
      mapTraces.push({
        municipality: schedule.municipality, route_id: route.id, present: Boolean(monitored),
        users: byUser.length, by_user: byUser, located_punch_points: locatedPunchPoints,
        marks_by_user_keys: (monitored?.marks_by_user || []).map((entry) => entry.user_name)
      });
    }
    result.observations.map_traces = mapTraces;
    check(result, "every_route_present_in_operations_map", mapTraces.every((trace) => trace.present), { missing: mapTraces.filter((trace) => !trace.present).map((trace) => trace.municipality) });
    check(result, "every_marker_traces_four_marks", mapTraces.every((trace) => trace.users === 2 && trace.by_user.every((user) => user.marks === 4)), { traces: mapTraces.map((trace) => ({ municipality: trace.municipality, users: trace.users, by_user: trace.by_user })) });
    check(result, "every_marker_has_distinct_coordinates", mapTraces.every((trace) => trace.by_user.every((user) => user.distinct_coords >= 2)), { single_point: mapTraces.flatMap((trace) => trace.by_user.filter((user) => user.distinct_coords < 2).map((user) => ({ municipality: trace.municipality, user_name: user.user_name, distinct: user.distinct_coords }))) });
    check(result, "every_route_has_eight_located_punch_points", mapTraces.every((trace) => trace.located_punch_points === 8), { located: mapTraces.map((trace) => ({ municipality: trace.municipality, located_punch_points: trace.located_punch_points })) });
    // Destinos distintos por horario: los centroides de cada municipio no colapsan en un unico punto.
    const municipalityCentroids = SCHEDULES.map((schedule) => {
      const lat = schedule.people.flatMap((person) => person.stops.map((stop) => stop[0])).reduce((a, b) => a + b, 0) / 8;
      const lng = schedule.people.flatMap((person) => person.stops.map((stop) => stop[1])).reduce((a, b) => a + b, 0) / 8;
      return { municipality: schedule.municipality, lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
    });
    const uniqueCentroids = new Set(municipalityCentroids.map((centroid) => `${centroid.lat},${centroid.lng}`));
    result.observations.municipality_centroids = municipalityCentroids;
    check(result, "distinct_destinations_per_schedule", uniqueCentroids.size === SCHEDULES.length, { centroids: municipalityCentroids });

    // Hora extra registrada en las salidas tardias.
    const overtimeRows = await prisma.runWithTenant(tenant.id, () => prisma.timePunch.findMany({
      where: { tenant_id: tenant.id, type: "salida", route_id: { in: createdRoutes.map((route) => route.id) } }, select: { route_id: true, extra_minutes: true }
    }));
    result.observations.overtime = { rows: overtimeRows.length, with_extra: overtimeRows.filter((row) => Number(row.extra_minutes) > 0).length, sample_minutes: overtimeRows.map((row) => row.extra_minutes) };
    check(result, "overtime_recorded_on_late_exits", overtimeRows.length === 10 && overtimeRows.every((row) => Number(row.extra_minutes) > 0), { rows: overtimeRows.length, with_extra: overtimeRows.filter((row) => Number(row.extra_minutes) > 0).length });

    // Sonda de idempotencia: doble tap simultaneo con la MISMA clave -> una creacion + un replay, nunca 409/500.
    const probeEmail = `qa.med.probe.${RUN_ID}@scj.test`;
    const probeUser = await admin.createUser(tenant.id, {
      name: `Sonda Idempotencia ${RUN_ID}`, first_names: "Sonda", last_names: `Idempotencia ${RUN_ID}`,
      email: probeEmail, password: PASSWORD, role_id: markingRole.id, company: "SCJ",
      document: `QMEDP${RUN_ID}`.slice(0, 20), code: `QA-MED-P-${RUN_ID}`, department: "QA", position: "Sonda",
      operational_classification: "operario", can_punch_time: true, can_be_assigned_routes: true, require_password_change: false
    });
    createdUsers.push(probeUser);
    const probeRoute = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: { tenant_id: tenant.id, date: new Date(`${TODAY}T05:00:00.000Z`), vehicle_plate: "", employees: [probeEmail], start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: TOLERANCE, notes: `Sonda idempotencia ${RUN_ID}`, status: "active" }
    }));
    createdRoutes.push(probeRoute);
    const probeToken = await loginWithRetry(probeEmail, PASSWORD, "probe");
    const sharedKey = crypto.randomUUID();
    const probePunch = { employee_id: probeUser.employee_id, user_name: probeEmail, route_id: probeRoute.id, type: "entrada", punched_at: bogotaIso("07:00"), latitude: 6.2442, longitude: -75.5812, accuracy_meters: 8, idempotency_key: sharedKey };
    const [tapA, tapB] = await Promise.all([
      capture("/api/v1/hr/self/time-punches", { token: probeToken, method: "POST", body: probePunch, actor: "probe", step: "idempotency-A" }),
      capture("/api/v1/hr/self/time-punches", { token: probeToken, method: "POST", body: probePunch, actor: "probe", step: "idempotency-B" })
    ]);
    result.observations.idempotency_probe = { tapA: { status: tapA.status, code: tapA.code, replayed: tapA.payload?.replayed }, tapB: { status: tapB.status, code: tapB.code, replayed: tapB.payload?.replayed } };
    check(result, "idempotent_double_tap_no_conflict", [tapA.status, tapB.status].every((status) => status === 200 || status === 201), { tapA: tapA.status, tapB: tapB.status, codeA: tapA.code, codeB: tapB.code });

    // Sonda de secuencia: salida antes de entrada debe rechazarse de forma controlada (409), nunca 500.
    const outOfOrder = await capture("/api/v1/hr/self/time-punches", {
      token: probeToken, method: "POST", actor: "probe", step: "out-of-order",
      body: { employee_id: probeUser.employee_id, user_name: probeEmail, route_id: probeRoute.id, type: "salida", punched_at: bogotaIso("08:00"), latitude: 6.2442, longitude: -75.5812, accuracy_meters: 8, idempotency_key: crypto.randomUUID() }
    });
    result.observations.sequence_probe = { status: outOfOrder.status, code: outOfOrder.code };
    check(result, "out_of_order_sequence_controlled_409", outOfOrder.status === 409, { status: outOfOrder.status, code: outOfOrder.code });

    result.observations.concurrency = { wall_ms: concurrencyWallMs, markers: 10, note: "10 jornadas completas ejecutadas en paralelo (Promise.all), locks advisory por empleado/ruta/dia." };
    result.request_log_summary = {
      total: requestLog.length,
      by_status: result.aggregates.by_status,
      failures: requestLog.filter((entry) => !entry.ok).map((entry) => ({ actor: entry.actor, step: entry.step, status: entry.status, code: entry.code, error: entry.error }))
    };
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    result.request_log_summary = {
      total: requestLog.length,
      by_status: requestLog.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {}),
      failures: requestLog.filter((entry) => !entry.ok).map((entry) => ({ actor: entry.actor, step: entry.step, status: entry.status, code: entry.code, error: entry.error }))
    };
    throw error;
  } finally {
    if (FIXTURE_OUTPUT && result.status === "passed") {
      fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
      fs.writeFileSync(FIXTURE_OUTPUT, `${JSON.stringify({
        environment: ENVIRONMENT, api_url: API_URL, admin_email: `qa.med.admin.${RUN_ID}@scj.test`, admin_password: PASSWORD,
        tenant_id: tenant.id, password: PASSWORD, date: TODAY, run_id: RUN_ID,
        routes: createdRoutes.map((route) => route.id), generated_at: new Date().toISOString()
      }, null, 2)}\n`);
    } else {
      for (const user of createdUsers) await admin.setUserActive(tenant.id, user.id, false).catch(() => undefined);
      for (const route of createdRoutes) await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: route.id }, data: { status: "inactive" } })).catch(() => undefined);
    }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`SIMULACRO MARCACIONES MEDELLIN APROBADO: ${result.checks.length} controles, ${requestLog.length} peticiones, ${result.aggregates.concurrency_wall_ms}ms en paralelo`);
}

main().catch((error) => {
  console.error(`SIMULACRO MARCACIONES MEDELLIN FALLIDO: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
