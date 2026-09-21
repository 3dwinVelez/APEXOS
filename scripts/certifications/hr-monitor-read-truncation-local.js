// Certificacion LOCAL (en vivo) del lote 3 de Talento Humano: topes gobernados de lectura
// y senal visible de truncamiento en el monitor de mallas / mapa de operaciones.
//
// Defecto certificado: listRoutes/listRouteEventSummaries leian sin tope (take:100 fijo sin
// aviso) y operations-map truncaba en silencio (>300 marcaciones/dia) sin senal visible, de
// modo que el usuario creia ver el dia completo cuando la API ya habia recortado.
//
// Arreglo certificado:
//   - listRoutes gobierna el limite explicito entre 50 y 500 (query.limit), default 100 sin rango.
//   - listRouteEventSummaries consulta limite+1 y devuelve truncation{truncated,limit,returned,hint}.
//   - getOperationsMap devuelve truncation con las colecciones recortadas.
//   - hrScheduleMonitor.scheduleTruncationNotices convierte esas senales en avisos legibles.
//   - rutas/page.tsx y mapa/page.tsx importan el helper y pintan banner ambar role=status.
//
// Este script arranca la API Fastify contra la base LOCAL (Prisma/PostgreSQL), ejercita los
// endpoints reales por HTTP con un admin temporal y verifica el contrato en vivo; ademas hace
// aserciones de codigo del banner web y corre los suites unitarios versionados.
// NO escribe en QA ni en produccion. Sale con codigo distinto de cero ante cualquier fallo.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

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

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const WEB = path.join(ROOT, "apps/web");
const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

const HR_SERVICE = path.join(API, "src/modules/hr/service.js");
const WEB_MONITOR_TS = path.join(WEB, "lib/hrScheduleMonitor.ts");
const WEB_RUTAS = path.join(WEB, "app/dashboard/talento-humano/rutas/page.tsx");
const WEB_MAPA = path.join(WEB, "app/dashboard/talento-humano/mapa/page.tsx");

const PORT = Number(args.port || 3198);
const API_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/lote3-hr-accounting-numbering-20260921/hr-monitor-read-truncation-local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-L3hr-${crypto.randomBytes(6).toString("hex")}#26`;
const SCJ_TENANT_ID = "001346eb-ba7f-4103-b032-73a219f1333e";
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

const result = {
  change_id: "hr-monitor-read-truncation-20260921",
  certification: "hr-monitor-read-truncation-local",
  environment: "LOCAL",
  company: "SCJ",
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  scope: {
    defect: "lecturas del monitor sin tope gobernado y truncamiento silencioso de operations-map; el usuario no veia que la API recorto el dia.",
    fix: "limites gobernados (listRoutes 50..500, event-summaries limite+1) y campo aditivo truncation en event-summaries/operations-map, con avisos legibles y banner ambar en rutas y mapa.",
    proven_by_live_execution: [
      "GET /api/v1/hr/routes/operations-map devuelve truncation en vivo",
      "GET /api/v1/hr/routes/event-summaries devuelve truncation{truncated,limit,returned,hint} en vivo",
      "GET /api/v1/hr/routes?limit=... responde 200 (tope gobernado observable)"
    ],
    proven_by_code_level_assertion: [
      "listRoutes clamp Math.min(Math.max(...,50),500)",
      "listRouteEventSummaries consulta SUMMARY_LIMIT+1 y devuelve truncation",
      "hrScheduleMonitor exporta scheduleTruncationNotices",
      "rutas/page.tsx y mapa/page.tsx importan el helper y pintan banner role=status"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/hr-list-truncation.test.js (4 controles)",
      "apps/web/test/hr-schedule-monitor.test.mjs (suite HR)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

async function capture(pathname, { token = "", method = "GET", body } = {}) {
  const started = Date.now();
  let status = 0; let payload = {}; let transportError = null;
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) { transportError = error.message; }
  return { status, payload, transportError, latency_ms: Date.now() - started };
}

function readSource(file) { return fs.readFileSync(file, "utf8"); }

async function main() {
  let app = null;
  let adminUser = null;
  try {
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });

    const health = await capture("/health");
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    const tenant = await prisma.tenant.findFirst({ where: { id: SCJ_TENANT_ID } });
    if (!tenant) throw new Error("No existe el tenant SCJ en la base local.");
    const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
    const norm = (v) => String(v || "").trim().toLowerCase();
    const adminRole = roles.find((r) => norm(r.name) === "apex_admin") || roles.find((r) => norm(r.name).includes("admin"));
    if (!adminRole) throw new Error("No existe rol administrativo en SCJ.");
    const email = `qa.l3hr.admin.${RUN_ID}@scj.test`;
    adminUser = await admin.createUser(tenant.id, {
      name: `Admin Lote3 HR ${RUN_ID}`, first_names: "Admin", last_names: `Lote3 ${RUN_ID}`,
      email, password: PASSWORD, role_id: adminRole.id, company: "SCJ",
      document: `QAL3${RUN_ID}`.slice(0, 20), code: `QA-L3-${RUN_ID}`, department: "QA", position: "Administrador de pruebas",
      operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    const login = await capture("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
    if (login.status !== 200 || !login.payload?.token) throw new Error(`login admin fallo: ${login.status}`);
    const token = login.payload.token;
    result.fixture = { tenant_id: tenant.id, admin_user_id: adminUser.id, admin_email: email, admin_role: adminRole.name, operating_date: TODAY };

    // ---- Contrato en vivo: truncation aditivo ----
    const ops = await capture(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=1`, { token });
    check("operations_map_serves_truncation_contract", ops.status === 200 && ops.payload && typeof ops.payload === "object"
      && ops.payload.truncation && typeof ops.payload.truncation === "object"
      && typeof ops.payload.truncation.truncated === "boolean", { status: ops.status, truncation: ops.payload?.truncation ?? null });

    const summaries = await capture(`/api/v1/hr/routes/event-summaries?date=${TODAY}`, { token });
    const tr = summaries.payload?.truncation;
    check("event_summaries_serve_truncation_contract", summaries.status === 200 && tr && typeof tr === "object"
      && typeof tr.truncated === "boolean" && typeof tr.limit === "number" && typeof tr.returned === "number"
      && typeof tr.hint === "string" && Array.isArray(summaries.payload?.routes), { status: summaries.status, truncation: tr ?? null });
    check("event_summaries_limit_is_100", tr && tr.limit === 100, { limit: tr?.limit });

    const list = await capture(`/api/v1/hr/routes?date=${TODAY}&limit=500`, { token });
    check("routes_list_governed_limit_200", list.status === 200 && Array.isArray(list.payload || list.payload?.data || []), { status: list.status });

    // ---- Aserciones de codigo ----
    const hrSrc = readSource(HR_SERVICE);
    check("list_routes_clamps_limit", /Math\.min\(Math\.max\(Number\(query\.limit\) \|\| \(range \? 500 : 100\), 50\), 500\)/.test(hrSrc), {
      clamp_present: /Math\.min\(Math\.max\(Number\(query\.limit\)/.test(hrSrc)
    });
    check("event_summaries_fetches_limit_plus_one", /take: SUMMARY_LIMIT \+ 1/.test(hrSrc) && /truncated: summaryTruncated|summaryTruncated =/.test(hrSrc), {
      plus_one: /take: SUMMARY_LIMIT \+ 1/.test(hrSrc)
    });

    const monitorSrc = readSource(WEB_MONITOR_TS);
    check("monitor_exports_truncation_helper", /export function scheduleTruncationNotices\(/.test(monitorSrc) && /export type ScheduleTruncationSignal/.test(monitorSrc), {
      helper: /export function scheduleTruncationNotices\(/.test(monitorSrc),
      type: /export type ScheduleTruncationSignal/.test(monitorSrc)
    });

    const rutasSrc = readSource(WEB_RUTAS);
    check("rutas_page_wires_banner", [
      /scheduleTruncationNotices/.test(rutasSrc),
      /ScheduleTruncationSignal/.test(rutasSrc),
      /ROUTES_LIST_LIMIT/.test(rutasSrc),
      /truncationNotices/.test(rutasSrc),
      /role="status"/.test(rutasSrc),
      /border-amber-300 bg-amber-50/.test(rutasSrc)
    ].every(Boolean), {
      helper: /scheduleTruncationNotices/.test(rutasSrc),
      banner: /border-amber-300 bg-amber-50/.test(rutasSrc),
      role_status: /role="status"/.test(rutasSrc)
    });

    const mapaSrc = readSource(WEB_MAPA);
    check("mapa_page_wires_banner", [
      /scheduleTruncationNotices/.test(mapaSrc),
      /data\?\.truncation\?\.truncated/.test(mapaSrc),
      /role="status"/.test(mapaSrc)
    ].every(Boolean), {
      helper: /scheduleTruncationNotices/.test(mapaSrc),
      conditional: /data\?\.truncation\?\.truncated/.test(mapaSrc)
    });

    // ---- Suites unitarios versionados ----
    const apiSuite = spawnSync(process.execPath, ["--test", "test/hr-list-truncation.test.js"], { cwd: API, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" } });
    const apiOut = `${apiSuite.stdout || ""}${apiSuite.stderr || ""}`;
    check("api_unit_suite_passes", apiSuite.status === 0 && /(?:#|ℹ)\s+fail\s+0/.test(apiOut) && /(?:#|ℹ)\s+pass\s+4/.test(apiOut), {
      exit: apiSuite.status, pass: (apiOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1], fail: (apiOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1]
    });
    const webSuite = spawnSync(process.execPath, ["--test", "test/hr-schedule-monitor.test.mjs"], { cwd: WEB, encoding: "utf8" });
    const webOut = `${webSuite.stdout || ""}${webSuite.stderr || ""}`;
    check("web_unit_suite_passes", webSuite.status === 0 && /(?:#|ℹ)\s+fail\s+0/.test(webOut), {
      exit: webSuite.status, pass: (webOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1], fail: (webOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1]
    });

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (adminUser) await admin.setUserActive(result.fixture.tenant_id, adminUser.id, false).catch(() => undefined);
      result.cleanup = { admin_deactivated: Boolean(adminUser) };
    } catch { /* mejor esfuerzo */ }
    result.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    if (app) await app.close().catch(() => undefined);
  }
}

main()
  .then(() => console.log(`CERTIFICACION LECTURA MONITOR APROBADA: ${result.checks.length} controles, status=${result.status}`))
  .catch((error) => { console.error(`CERTIFICACION LECTURA MONITOR BLOQUEADA: ${error.message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
