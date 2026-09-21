// Certificacion extremo a extremo (LOCAL) del cierre del split-brain de horarios.
//
// Defecto certificado: en QA la pantalla "Monitor de mallas horarias / Asignar horarios"
// reportaba "Horario asignado correctamente." pero el horario nunca aparecia. Causa: la
// escritura POST /api/v1/hr/routes era rechazada por la API (400 HORARIO_CRUZA_MEDIANOCHE
// o 409 MALLA_SOLAPADA) y apiInternal caia en silencio al respaldo Supabase, que escribia
// en operational_routes/route_assignments: tablas que el monitor (que lee TimeRoute via
// GET /api/v1/hr/routes) nunca consulta. El horario quedaba huerfano con exito aparente.
//
// Este script NO escribe en QA ni en produccion: levanta la API Fastify contra la base
// local (Prisma/PostgreSQL) y ejercita el flujo real por HTTP + verificacion en base.
//
// Cubre:
//  1. Jornada que cruza medianoche (20:35 -> 05:00): 400 HORARIO_CRUZA_MEDIANOCHE y NO
//     crea horario. Se afirma el contrato API y el predicado cliente que la bloquea antes.
//  2. Asignacion solapada (misma persona, misma fecha): 409 MALLA_SOLAPADA y NO crea horario.
//  3. Control positivo: un horario VALIDO creado por la API es devuelto por
//     GET /api/v1/hr/routes y visible en /api/v1/hr/operations-map de esa fecha, y persiste
//     en TimeRoute (la tabla que el monitor lee).
//  4. Cierre del split-brain: a nivel de codigo, el guard shouldBlockHrWriteFallback cubre
//     toda escritura no-GET de /api/v1/hr/routes* en AMBAS ramas de respaldo de apiInternal.
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

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
const hrPolicy = require(path.join(ROOT, "apps/api/src/modules/hr/policy"));

const WEB_API_TS = path.join(ROOT, "apps/web/lib/api.ts");
const WEB_SCHEDULE_TS = path.join(ROOT, "apps/web/lib/hrScheduleMonitor.ts");
const WEB_RUTAS_PAGE = path.join(ROOT, "apps/web/app/dashboard/talento-humano/rutas/page.tsx");

const PORT = Number(args.port || 3199);
const EXTERNAL_API_URL = args["api-url"] ? String(args["api-url"]).replace(/\/$/, "") : "";
const API_URL = EXTERNAL_API_URL || `http://127.0.0.1:${PORT}`;
// Solo se permite ambiente local: nunca QA ni produccion.
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(API_URL)) {
  throw new Error(`La certificacion de integridad de horarios solo permite localhost/127.0.0.1 (recibido: ${API_URL}).`);
}
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-schedule-write-integrity-20260920/local-simulation-certification.json"));
const FIXTURE_OUTPUT = path.resolve(String(args["fixture-output"] || "docs/qa/evidence/hr-schedule-write-integrity-20260920/local-fixture.json"));

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Hrw-${crypto.randomBytes(6).toString("hex")}#26`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const SCJ_TENANT_ID = "001346eb-ba7f-4103-b032-73a219f1333e";

// Personas unicas por corrida para no chocar con datos existentes en la base local.
const OVERNIGHT_PERSON = `qa.hrw.nocturna.${RUN_ID}@scj.test`;
const OVERLAP_PERSON = `qa.hrw.juliana.${RUN_ID}@scj.test`;
const CONTROL_PERSON = `qa.hrw.control.${RUN_ID}@scj.test`;
const CONTROL_PLATE = `QAHRW${RUN_ID.slice(-6)}`;

const result = {
  change_id: "hr-schedule-write-integrity-20260920",
  certification: "hr-schedule-write-integrity-local",
  environment: "LOCAL",
  company: "SCJ",
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_date: TODAY,
  scope: {
    defect: "split-brain de horarios: escritura rechazada por la API caia al respaldo Supabase (operational_routes) que el monitor nunca lee; exito aparente sin horario visible.",
    product_decision: "Las jornadas que cruzan medianoche siguen SIN soporte. No se cambio ninguna regla de negocio del backend.",
    proven_by_live_execution: [
      "400 HORARIO_CRUZA_MEDIANOCHE y ningun TimeRoute creado",
      "409 MALLA_SOLAPADA y ningun TimeRoute adicional creado",
      "horario valido creado por la API, devuelto por GET /api/v1/hr/routes y visible en operations-map, persistido en TimeRoute"
    ],
    proven_by_code_level_assertion: [
      "shouldBlockHrWriteFallback cubre /api/v1/hr/routes, /api/v1/hr/routes/bulk y /api/v1/hr/routes/<id> para todo metodo distinto de GET",
      "AMBAS ramas de respaldo de apiInternal (pre-vuelo y !response.ok) consultan el guard",
      "el formulario de rutas bloquea la medianoche antes de setSavingRoute(true) y de cualquier api()",
      "el banner de mensajes pinta los errores en rosa con role=alert",
      "ausencia de huerfanos en operational_routes (tabla exclusiva de Supabase): el guard impide que supabaseApiFallback sea invocado para estas escrituras; NO se consulta Supabase en vivo"
    ]
  },
  checks: [],
  fixture: {},
  aggregates: {},
  observations: {},
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

// Lanzador no abortivo: captura status/code/latencia de TODA respuesta (incluidas 4xx/5xx).
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

function readSource(file) {
  return fs.readFileSync(file, "utf8");
}

function sliceBetween(source, startMarker, endMarker, fromIndex = 0) {
  const start = source.indexOf(startMarker, fromIndex);
  if (start < 0) return "";
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
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
  let adminUser = null;
  let adminToken = "";
  const createdRouteIds = [];

  try {
    // ---- Arranque del ambiente local ----
    if (!EXTERNAL_API_URL) {
      const build = require(path.join(ROOT, "apps/api/server.js"));
      app = await build();
      await app.listen({ port: PORT, host: "127.0.0.1" });
    }

    const health = await capture("/health", { actor: "cert", step: "health" });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    // ---- Fixtures: tenant SCJ + admin con bypass hr:write ----
    const tenant = await prisma.tenant.findFirst({ where: { id: SCJ_TENANT_ID } });
    if (!tenant) throw new Error("No existe el tenant SCJ en la base local.");
    const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const adminRole = roles.find((item) => normalize(item.name) === "apex_admin") || roles.find((item) => normalize(item.name).includes("admin"));
    if (!adminRole) throw new Error("No existe rol administrativo en SCJ.");

    adminUser = await admin.createUser(tenant.id, {
      name: `Admin Integridad Horarios ${RUN_ID}`, first_names: "Admin", last_names: `Integridad ${RUN_ID}`,
      email: `qa.hrw.admin.${RUN_ID}@scj.test`, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
      document: `QAHRW${RUN_ID}`.slice(0, 20), code: `QA-HRW-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
      operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    const login = await capture("/api/v1/auth/login", { method: "POST", body: { email: `qa.hrw.admin.${RUN_ID}@scj.test`, password: PASSWORD }, actor: "admin", step: "login" });
    if (login.status !== 200 || !login.payload?.token) throw new Error(`login admin fallo: ${login.status} (${login.code || login.error})`);
    adminToken = login.payload.token;
    result.fixture = {
      tenant_id: tenant.id,
      admin_user_id: adminUser.id,
      admin_email: `qa.hrw.admin.${RUN_ID}@scj.test`,
      admin_role: adminRole.name,
      operating_date: TODAY,
      persons: { overnight: OVERNIGHT_PERSON, overlap: OVERLAP_PERSON, control: CONTROL_PERSON },
      control_plate: CONTROL_PLATE
    };

    // =====================================================================
    // BLOQUE A - Predicado cliente espejo de la regla API (antes del request)
    // =====================================================================
    const schedule = await import(pathToFileURL(WEB_SCHEDULE_TS).href);
    const sameDayIssue = schedule.scheduleSameDayShiftIssue;
    if (typeof sameDayIssue !== "function") throw new Error("scheduleSameDayShiftIssue no esta exportado por hrScheduleMonitor.ts");

    let apiOvernightMessage = "";
    let apiOvernightCode = "";
    try {
      hrPolicy.assertSameDayShift({ startTime: "20:35", endTime: "05:00" });
    } catch (error) {
      apiOvernightMessage = error.message;
      apiOvernightCode = error.code;
    }
    const clientOvernightMessage = sameDayIssue("20:35", "05:00");
    check("client_predicate_mirrors_api_rule", [
      apiOvernightCode === "HORARIO_CRUZA_MEDIANOCHE",
      clientOvernightMessage === apiOvernightMessage,
      clientOvernightMessage === "La hora final debe ser estrictamente posterior a la hora inicial dentro de la misma fecha.",
      sameDayIssue("08:00", "17:00") === "",
      sameDayIssue("15:50", "16:00") === "",
      sameDayIssue("08:00", "08:00") === apiOvernightMessage,
      sameDayIssue("08:00:00", "17:00:00") === "",
      sameDayIssue("", "17:00") === "Define horas validas en formato HH:mm.",
      sameDayIssue("08:00", "25:00") === "Define horas validas en formato HH:mm."
    ].every(Boolean), {
      api_code: apiOvernightCode,
      api_message: apiOvernightMessage,
      client_message: clientOvernightMessage,
      valid_same_day: sameDayIssue("08:00", "17:00"),
      valid_overlap_window: sameDayIssue("15:50", "16:00"),
      equal_hours: sameDayIssue("08:00", "08:00"),
      hms_valid: sameDayIssue("08:00:00", "17:00:00"),
      malformed: sameDayIssue("", "17:00")
    });

    // =====================================================================
    // BLOQUE B - Cierre del split-brain a nivel de codigo (api.ts + page.tsx)
    // =====================================================================
    const apiSource = readSource(WEB_API_TS);
    const guard = sliceBetween(apiSource, "function shouldBlockHrWriteFallback", "\n}");
    check("fallback_guard_blocks_all_hr_route_writes", [
      guard.includes('"/api/v1/hr/routes"'),
      guard.includes('"/api/v1/hr/routes/bulk"'),
      guard.includes("hrRouteDetailWrite"),
      guard.includes("[^/]+"),
      guard.includes('method !== "GET"')
    ].every(Boolean), {
      has_collection_path: guard.includes('"/api/v1/hr/routes"'),
      has_bulk_path: guard.includes('"/api/v1/hr/routes/bulk"'),
      has_detail_regex: guard.includes("hrRouteDetailWrite") && guard.includes("[^/]+"),
      blocks_non_get_only: guard.includes('method !== "GET"')
    });

    // Se busca sobre todo el fuente: la rama !response.ok aparece despues de otras
    // funciones y un corte por "export" podria truncarla.
    const preflightBranch = "if (supabaseSession && !preferOperationalApi && !shouldBlockHrWriteFallback(path, method))";
    const notOkBranch = "if (supabaseSession && !shouldBlockHrWriteFallback(path, method))";
    check("both_fallback_branches_consult_guard", [
      apiSource.includes(preflightBranch),
      apiSource.includes(notOkBranch)
    ].every(Boolean), {
      preflight_guarded: apiSource.includes(preflightBranch),
      not_ok_guarded: apiSource.includes(notOkBranch)
    });

    const pageSource = readSource(WEB_RUTAS_PAGE);
    const saveRoute = sliceBetween(pageSource, "async function saveRoute()", "const totalAssigned");
    const issuesBeforeSave = saveRoute.indexOf("if (issues.length) {");
    const savingFlag = saveRoute.indexOf("setSavingRoute(true)");
    const sameDayCall = saveRoute.indexOf("scheduleSameDayShiftIssue(form.start_time, form.end_time)");
    const banner = sliceBetween(pageSource, "{message ? <div", "</div>");
    check("routes_form_blocks_midnight_before_request", [
      sameDayCall >= 0,
      issuesBeforeSave >= 0 && savingFlag >= 0 && issuesBeforeSave < savingFlag,
      sameDayCall >= 0 && sameDayCall < issuesBeforeSave,
      !/form\.end_time === form\.start_time/.test(saveRoute),
      saveRoute.includes('api<TimeRoute>("/api/v1/hr/routes", { method: "POST"'),
      saveRoute.includes('"/api/v1/hr/routes/bulk", { method: "POST"')
    ].every(Boolean), {
      predicate_feeds_issues: sameDayCall >= 0 && sameDayCall < issuesBeforeSave,
      issues_abort_before_saving: issuesBeforeSave >= 0 && issuesBeforeSave < savingFlag,
      weak_equality_removed: !/form\.end_time === form\.start_time/.test(saveRoute)
    });
    check("error_banner_not_painted_as_success", [
      pageSource.includes('const [messageTone, setMessageTone] = useState<"success" | "error">'),
      banner.includes('messageTone === "error" ? "border-rose-200 bg-rose-50 text-rose-900"'),
      banner.includes('role={messageTone === "error" ? "alert" : "status"}'),
      /setMessageTone\("error"\)/.test(sliceBetween(pageSource, "} catch (error) {", "} finally {", pageSource.indexOf("async function saveRoute()")))
    ].every(Boolean), {
      tone_state_present: pageSource.includes("setMessageTone"),
      rose_palette: banner.includes("border-rose-200 bg-rose-50 text-rose-900"),
      alert_role: banner.includes('role={messageTone === "error" ? "alert" : "status"}')
    });

    // =====================================================================
    // BLOQUE C - Flujo real por HTTP contra la API local + verificacion en base
    // =====================================================================

    // C1. Jornada que cruza medianoche: 400 HORARIO_CRUZA_MEDIANOCHE y no crea horario.
    const overnightBefore = await countRoutesForPerson(tenant.id, OVERNIGHT_PERSON, TODAY);
    const overnight = await capture("/api/v1/hr/routes", {
      token: adminToken, method: "POST", actor: "admin", step: "overnight-reject",
      body: { date: TODAY, employees: [OVERNIGHT_PERSON], start_time: "20:35", end_time: "05:00", tolerance_minutes: 15, notes: `Certificacion integridad horarios ${RUN_ID}` }
    });
    const overnightAfter = await countRoutesForPerson(tenant.id, OVERNIGHT_PERSON, TODAY);
    check("overnight_shift_rejected_400", overnight.status === 400 && overnight.code === "HORARIO_CRUZA_MEDIANOCHE", { status: overnight.status, code: overnight.code, error: overnight.error });
    check("overnight_shift_creates_no_horario", overnightBefore === 0 && overnightAfter === 0, { before: overnightBefore, after: overnightAfter });

    // C2. Asignacion solapada: base valida 08:00-17:00 + intento 15:50-16:00 => 409 MALLA_SOLAPADA.
    const overlapBase = await capture("/api/v1/hr/routes", {
      token: adminToken, method: "POST", actor: "admin", step: "overlap-base",
      body: { date: TODAY, employees: [OVERLAP_PERSON], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, notes: `Base solapamiento ${RUN_ID}` }
    });
    if (!(overlapBase.status === 200 || overlapBase.status === 201) || !overlapBase.payload?.id) {
      throw new Error(`no se pudo crear la ruta base del solapamiento: ${overlapBase.status} (${overlapBase.code || overlapBase.error})`);
    }
    createdRouteIds.push(overlapBase.payload.id);
    const overlapCountAfterBase = await countRoutesForPerson(tenant.id, OVERLAP_PERSON, TODAY);
    const overlap = await capture("/api/v1/hr/routes", {
      token: adminToken, method: "POST", actor: "admin", step: "overlap-reject",
      body: { date: TODAY, employees: [OVERLAP_PERSON], start_time: "15:50", end_time: "16:00", tolerance_minutes: 15, notes: `Intento solapado ${RUN_ID}` }
    });
    const overlapCountAfterReject = await countRoutesForPerson(tenant.id, OVERLAP_PERSON, TODAY);
    check("overlapping_assignment_rejected_409", overlap.status === 409 && overlap.code === "MALLA_SOLAPADA", { status: overlap.status, code: overlap.code, error: overlap.error, conflicts: overlap.payload?.details?.conflicts || null });
    check("overlap_creates_no_extra_horario", overlapCountAfterBase === 1 && overlapCountAfterReject === 1, { after_base: overlapCountAfterBase, after_reject: overlapCountAfterReject });

    // C3. Control positivo: horario valido creado por la API, leido por el monitor.
    const control = await capture("/api/v1/hr/routes", {
      token: adminToken, method: "POST", actor: "admin", step: "control-create",
      body: { date: TODAY, employees: [CONTROL_PERSON], start_time: "09:00", end_time: "13:00", tolerance_minutes: 15, vehicle_plate: CONTROL_PLATE, notes: `Control positivo ${RUN_ID}` }
    });
    const controlId = control.payload?.id;
    check("valid_route_created_via_api", (control.status === 200 || control.status === 201) && Number.isFinite(Number(controlId)), { status: control.status, id: controlId, code: control.code });
    createdRouteIds.push(controlId);

    const list = await capture(`/api/v1/hr/routes?date=${TODAY}`, { token: adminToken, actor: "admin", step: "list-read" });
    const listed = Array.isArray(list.payload) ? list.payload : (list.payload?.data || []);
    const listedControl = listed.find((row) => Number(row.id) === Number(controlId));
    check("valid_route_returned_by_list", list.status === 200 && Boolean(listedControl), { status: list.status, found: Boolean(listedControl), h_inicio: listedControl?.h_inicio, h_fin: listedControl?.h_fin, placa: listedControl?.placa });

    const operations = await capture(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=1&ping_limit=2000&punch_limit=2000&activity_limit=1000`, { token: adminToken, actor: "admin", step: "operations-map" });
    const monitored = (operations.payload?.routes || []).find((row) => Number(row.id) === Number(controlId));
    check("valid_route_visible_in_operations_map", operations.status === 200 && Boolean(monitored), { status: operations.status, present: Boolean(monitored), start_time: monitored?.start_time, end_time: monitored?.end_time });

    const persisted = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.findUnique({ where: { id: Number(controlId) } }));
    check("valid_route_persisted_in_timmeroute_table", Boolean(persisted) && persisted.status === "active" && persisted.start_time === "09:00" && persisted.end_time === "13:00", { id: persisted?.id, status: persisted?.status, start_time: persisted?.start_time, end_time: persisted?.end_time, employees: persisted?.employees });

    // C4. Las escrituras rechazadas no dejaron huerfanos en la tabla que el monitor lee.
    const orphanOvernight = await countRoutesForPerson(tenant.id, OVERNIGHT_PERSON, TODAY);
    const orphanOverlapExtra = overlapCountAfterReject; // debe seguir en 1 (solo la base valida)
    check("rejected_writes_produced_no_orphan_timmeroute", orphanOvernight === 0 && orphanOverlapExtra === 1, { overnight_routes: orphanOvernight, overlap_person_routes: orphanOverlapExtra });

    result.observations.split_brain_closure = {
      level: "code-level + live",
      live_proven: "Las dos escrituras rechazadas (400 medianoche, 409 solapada) no crearon TimeRoute; el control positivo si queda en TimeRoute y es leido por GET /api/v1/hr/routes y operations-map.",
      code_proven: "shouldBlockHrWriteFallback cubre /api/v1/hr/routes, /bulk y /<id> para todo metodo != GET, y ambas ramas de respaldo de apiInternal lo consultan; por tanto supabaseApiFallback nunca es invocado para estas escrituras y no puede generar filas huerfanas en operational_routes.",
      not_live_proven: "operational_routes/route_assignments son tablas exclusivas de Supabase. No se consultan ni se escriben en vivo (ambiente local, sin writes remotos). Su imposibilidad de huerfanos se demuestra por la ausencia de invocacion del respaldo (codigo), no por una consulta a Supabase."
    };

    result.aggregates = {
      total_requests: requestLog.length,
      by_status: requestLog.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {}),
      server_errors: requestLog.filter((entry) => entry.status >= 500).length,
      created_route_ids: createdRouteIds,
      rejected_writes: requestLog.filter((entry) => entry.status === 400 || entry.status === 409).map((entry) => ({ step: entry.step, status: entry.status, code: entry.code }))
    };

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null, stack: error.stack };
    throw error;
  } finally {
    result.request_log_summary = {
      total: requestLog.length,
      by_status: requestLog.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {}),
      entries: requestLog.map((entry) => ({ step: entry.step, method: entry.method, pathname: entry.pathname, status: entry.status, code: entry.code }))
    };

    // Limpieza selectiva: desactivar el admin temporal y las rutas creadas (solo locales).
    try {
      if (adminUser) await admin.setUserActive(result.fixture.tenant_id, adminUser.id, false).catch(() => undefined);
      for (const routeId of createdRouteIds) {
        await prisma.runWithTenant(result.fixture.tenant_id, () => prisma.timeRoute.updateMany({ where: { id: Number(routeId) }, data: { status: "inactive" } })).catch(() => undefined);
      }
      result.cleanup = { admin_deactivated: Boolean(adminUser), routes_deactivated: createdRouteIds.length };
    } catch { /* limpieza es mejor esfuerzo */ }

    result.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
    fs.writeFileSync(FIXTURE_OUTPUT, `${JSON.stringify({
      environment: "LOCAL", api_url: API_URL, run_id: RUN_ID, operating_date: TODAY,
      tenant_id: result.fixture.tenant_id, admin_email: result.fixture.admin_email,
      admin_credential: "no persistida: la contrasena se genera por corrida, solo se usa para el login de esta certificacion y el usuario queda inactivo al terminar.",
      persons: result.fixture.persons, control_plate: CONTROL_PLATE,
      created_route_ids: createdRouteIds, generated_at: result.finished_at,
      note: "Fixture local desactivado al terminar (admin inactivo, rutas en status inactive). No toca QA ni produccion."
    }, null, 2)}\n`);

    if (app) await app.close().catch(() => undefined);
  }
}

main()
  .then(() => {
    console.log(`CERTIFICACION INTEGRIDAD HORARIOS APROBADA: ${result.checks.length} controles, ${requestLog.length} peticiones, status=${result.status}`);
  })
  .catch((error) => {
    console.error(`CERTIFICACION INTEGRIDAD HORARIOS BLOQUEADA: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
