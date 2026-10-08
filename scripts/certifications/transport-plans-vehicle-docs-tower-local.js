// Certificacion LOCAL (en vivo) del paquete: planes de despacho + adjuntos vehiculares
// + catálogos maestros vehiculares + consolidación de liquidación por vehículo.
//
// Alcance certificado (incremento 2026-10-07/08 del módulo Transporte):
//   - Planes de despacho: contenedor por origen con ciclo completo
//     (crear -> agregar necesidades -> listo -> consultar -> liberar -> eliminar).
//   - Catálogos maestros vehiculares globales: marcas y líneas con jerarquía
//     marca -> línea (parent_code) consumida por la ficha vehicular.
//   - Adjuntos vehiculares: carga multipart con validación de firma/ MIME y
//     vista previa firmada (Supabase Storage); la carga real se certifica con
//     almacenamiento simulado en la suite versionada porque el .env local apunta
//     al storage compartido y la certificación no escribe en la nube.
//   - Consolidación de liquidación por vehículo (torre de liquidación, vista vehículos).
//   - Estado de inteligencia de rutas (Google Routes) con degradación controlada
//     sin clave configurada.
//
// Arranca la API Fastify contra la base LOCAL y ejercita los endpoints reales por HTTP
// con el administrador demo. NO escribe en QA ni en producción: aborta si DATABASE_URL
// no apunta a localhost/127.0.0.1. Sale con código distinto de cero ante cualquier fallo.

const fs = require("node:fs");
const path = require("node:path");
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
require("../load-env")(path.resolve(String(args["env-file"] || ".env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificación solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const PORT = Number(args.port || 3212);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 25000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/transport-plans-vehicle-docs-tower-20261008/local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const EMAIL = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const PASSWORD = process.env.LOCAL_TMS_PASSWORD || "test1234";
const CERT_ID = "transport-plans-vehicle-docs-tower-20261008";

const ENGINE_SRC = path.join(API, "src/modules/transport/settlement-engine.js");
const ROUTES_SRC = path.join(API, "src/modules/transport/routes.js");
const STORAGE_SRC = path.join(API, "src/modules/transport/vehicle-document-storage.js");
const MIGRATION_PLANS = path.join(API, "prisma/migrations/20261007120000_transport_plans/migration.sql");
const MIGRATION_CATALOGS = path.join(ROOT, "supabase/migrations/20261008120000_vehicle_master_catalogs.sql");
const MIGRATION_DOCS = path.join(ROOT, "supabase/migrations/20261008130000_vehicle_documents_storage.sql");
const WEB_TOWER = path.join(ROOT, "apps/web/app/dashboard/transporte/liquidaciones/page.tsx");
const WEB_VEHICLE = path.join(ROOT, "apps/web/app/dashboard/transporte/page.tsx");
const WEB_API_LIB = path.join(ROOT, "apps/web/lib/api.ts");

function fromNow(hours) { return new Date(Date.now() + hours * 3600000).toISOString(); }

const result = {
  change_id: CERT_ID,
  certification: "transport-plans-vehicle-docs-tower-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  scope: {
    capability: "Planes de despacho (consolidación por origen), catálogos maestros vehiculares con jerarquía marca->línea, adjuntos vehiculares multipart con vista previa firmada, consolidación de liquidación por vehículo en la torre e inteligencia de rutas con degradación controlada; extensión nativa del módulo Transporte sin duplicar subsistemas.",
    proven_by_live_execution: [
      "GET /transport/vehicles lista la flota con campos de catálogo (marca/línea)",
      "POST /transport/vehicles/:id/documents rechaza multipart sin archivo (400) y sin tipo documental (400) antes de tocar storage",
      "POST /transport/origins + /transport/delivery-points + /transport/needs alimentan el plan",
      "POST /transport/plans crea el plan en borrador ligado al origen",
      "POST /transport/plans/:id/needs consolida la necesidad en el plan (caso #1 manual)",
      "PUT /transport/plans/:id lo marca listo y GET /transport/planning/workbench lo expone",
      "DELETE /transport/plans/:id/needs/:needId libera la necesidad y DELETE /transport/plans/:id limpia",
      "GET /transport/route-intelligence/status responde 200 con estado de configuración",
      "GET /transport/settlement-vehicle-consolidation agrega ingresos por vehículo (>=3 vehículos semilla)",
      "POST /admin/user-master-data/vehicle_brands/items responde 400 VALIDACION: los catálogos vehiculares viven en Supabase (global compartido + override por empresa), no en el almacén tenant de la API; la edición la sirve la interceptación del cliente web hacia un catálogo por empresa",
      "GET anónimo responde 401"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/transport-route-intelligence.test.js",
      "apps/api/test/transport-settlement-vehicle-consolidation.test.js",
      "apps/api/test/transport-vehicle-documents.test.js (incluye firma MIME, límites y URL firmada con storage simulado)",
      "apps/web/test/transport-vehicle-master-catalogs.test.mjs (defaults con jerarquía, escritura tenant-safe y fusión global+empresa)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificación: ${name}`);
}

let TOKEN = "";
async function capture(pathname, { method = "GET", body, auth = true, form = null } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const headers = { ...(auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
    let requestBody;
    if (form) {
      requestBody = form;
    } else if (body) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers,
      ...(requestBody ? { body: requestBody } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    const text = await res.text();
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 300) }; }
  } catch (error) {
    transportError = error.message;
  }
  return { status, payload, transportError, latency_ms: Date.now() - started };
}

async function main() {
  let app = null;
  try {
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });

    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    const anon = await capture("/api/v1/transport/plans", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await capture("/api/v1/auth/login", { method: "POST", auth: false, body: { email: EMAIL, password: PASSWORD } });
    check("admin_login", login.status === 200 && Boolean(login.payload?.token), { status: login.status });
    TOKEN = login.payload.token;

    // ---- Catálogos maestros vehiculares (jerarquía marca -> línea) ----
    // Diseño dual: la API /admin/user-master-data RECHAZA los catálogos vehicle_*
    // (viven en Supabase como catálogo global compartido, no en el almacén tenant de la API);
    // la edición desde Administración la sirve la interceptación del cliente web, que escribe
    // en un catálogo POR EMPRESA (nunca sobre el global, único índice (catalog_id, code)).
    const apiReject = await capture("/api/v1/admin/user-master-data/vehicle_brands/items", { method: "POST", body: { code: `qa-${RUN_ID}`, name: "QA no persistir" } });
    check("vehicle_catalogs_rejected_by_api_store_by_design", apiReject.status === 400 && apiReject.payload?.code === "VALIDACION", { status: apiReject.status, code: apiReject.payload?.code });

    const webApiSource = fs.readFileSync(WEB_API_LIB, "utf8");
    const staticVehicleCatalogChecks = [
      [/vehicle_lines: \[[\s\S]+?\]\.map\(\(\[code, name, parent_code\]\) => \(\{ code, name, parent_code \}\)\)/, "defaults_locales_con_parent_code"],
      [/select=catalog_id,company_id,code,name,description,active,sort_order,parent_code/, "carga_supabase_transporta_parent_code"],
      [/async function ensureSupabaseCompanyMasterCatalog\(companyId: string, catalogCode: string\)/, "helper_catalogo_por_empresa"],
      [/const catalogId = await ensureSupabaseCompanyMasterCatalog\(membership\.company_id, catalogCode\)/, "escritura_en_catalogo_empresa"],
      [/const catalogsByCode = new Map<string, Array<\(typeof catalogs\)\[number\]>>\(\)/, "carga_fusiona_catalogos_por_codigo"]
    ];
    const staticFailed = staticVehicleCatalogChecks.filter(([pattern]) => !pattern.test(webApiSource)).map(([, label]) => label);
    check("vehicle_master_catalogs_hierarchy", staticFailed.length === 0, { checked: staticVehicleCatalogChecks.length, failed: staticFailed });

    // ---- Flota con campos de catálogo ----
    const vehicles = await capture("/api/v1/transport/vehicles?limit=5");
    const vehicleList = Array.isArray(vehicles.payload) ? vehicles.payload : (vehicles.payload?.items || []);
    check("vehicles_listed_for_documents", vehicles.status === 200 && vehicleList.length > 0, { status: vehicles.status, count: vehicleList.length });
    const vehicleId = vehicleList[0].id;

    // ---- Adjuntos vehiculares: validaciones previas al storage (seguras en vivo) ----
    const formNoFile = new FormData();
    formNoFile.append("document_type", "SOAT");
    const noFile = await capture(`/api/v1/transport/vehicles/${vehicleId}/documents`, { method: "POST", form: formNoFile });
    check("vehicle_document_requires_file", noFile.status === 400, { status: noFile.status, code: noFile.payload?.code });

    const formNoType = new FormData();
    formNoType.append("file", new Blob(["contenido de prueba no firmado"], { type: "text/plain" }), "nota.txt");
    const noType = await capture(`/api/v1/transport/vehicles/${vehicleId}/documents`, { method: "POST", form: formNoType });
    check("vehicle_document_requires_type", noType.status === 400, { status: noType.status, code: noType.payload?.code });

    // ---- Cadena completa del plan de despacho ----
    const origin = await capture("/api/v1/transport/origins", { method: "POST", body: { code: `QA-PLAN-ORG-${RUN_ID}`.slice(0, 40), name: `Origen certificación ${RUN_ID}`, address: "Zona industrial QA", city: "Bogota", latitude: 4.65, longitude: -74.1, active: true } });
    check("origin_created", origin.status === 201 && Boolean(origin.payload?.id), { status: origin.status });
    const originId = origin.payload.id;

    const dp = await capture("/api/v1/transport/delivery-points", { method: "POST", body: { code: `QA-PLAN-DP-${RUN_ID}`.slice(0, 40), name: `Punto entrega ${RUN_ID}`, address: "Centro QA", city: "Bogota", latitude: 4.7, longitude: -74.05, window_start: "08:00", window_end: "18:00", active: true } });
    check("delivery_point_created", dp.status === 201 && Boolean(dp.payload?.id), { status: dp.status });
    const dpId = dp.payload.id;

    const need = await capture("/api/v1/transport/needs", { method: "POST", body: { code: `QA-PLAN-NEED-${RUN_ID}`.slice(0, 40), source_type: "manual", origin_id: originId, origin_name: `Origen certificación ${RUN_ID}`, delivery_point_id: dpId, available_at: fromNow(1), due_at: fromNow(48), weight_kg: 120, volume_m3: 1.2 } });
    check("need_created_pending", need.status === 201 && need.payload?.status === "pendiente", { status: need.status, state: need.payload?.status });
    const needId = need.payload.id;

    const plan = await capture("/api/v1/transport/plans", { method: "POST", body: { code: `QA-PLAN-${RUN_ID}`.slice(0, 40), name: `Plan certificación ${RUN_ID}`, origin_id: originId, due_date: fromNow(72), notes: "Plan de certificación local" } });
    check("plan_created_borrador", plan.status === 201 && plan.payload?.status === "borrador" && plan.payload?.origin_id === originId, { status: plan.status, state: plan.payload?.status });
    const planId = plan.payload.id;

    const linked = await capture(`/api/v1/transport/plans/${planId}/needs`, { method: "POST", body: { need_ids: [needId] } });
    const planAfterLink = await capture(`/api/v1/transport/plans/${planId}`);
    const linkedNeeds = planAfterLink.payload?.needs || [];
    check("plan_consolidates_need", [200, 201].includes(linked.status) && linkedNeeds.some((n) => n.id === needId), { status: linked.status, needs: linkedNeeds.length });

    const ready = await capture(`/api/v1/transport/plans/${planId}`, { method: "PUT", body: { status: "listo" } });
    check("plan_marked_ready", ready.status === 200 && ready.payload?.status === "listo", { status: ready.status, state: ready.payload?.status });

    const workbench = await capture("/api/v1/transport/planning/workbench");
    const wbPlans = workbench.payload?.plans || [];
    check("planning_workbench_exposes_plan", workbench.status === 200 && wbPlans.some((p) => p.id === planId), { status: workbench.status, plans: wbPlans.length });

    const released = await capture(`/api/v1/transport/plans/${planId}/needs/${needId}`, { method: "DELETE" });
    check("plan_releases_need", [200, 204].includes(released.status), { status: released.status });

    const removed = await capture(`/api/v1/transport/plans/${planId}`, { method: "DELETE" });
    check("plan_deleted_cleanup", [200, 204].includes(removed.status), { status: removed.status });

    // ---- Inteligencia de rutas: estado accesible con degradación controlada ----
    const ri = await capture("/api/v1/transport/route-intelligence/status");
    check("route_intelligence_status_accessible", ri.status === 200 && typeof ri.payload === "object" && ri.payload !== null, { status: ri.status, configured: ri.payload?.configured });

    // ---- Consolidación de liquidación por vehículo (semilla demo del tenant) ----
    const consolidation = await capture("/api/v1/transport/settlement-vehicle-consolidation");
    const consolidatedVehicles = consolidation.payload?.vehicles || [];
    check("settlement_vehicle_consolidation_aggregates", consolidation.status === 200 && consolidation.payload?.total_packages > 0 && consolidatedVehicles.length >= 3 && typeof consolidation.payload?.totals === "object", { status: consolidation.status, packages: consolidation.payload?.total_packages, vehicles: consolidatedVehicles.length });

    // ---- Suites unitarias versionadas ----
    const suites = [
      "test/transport-route-intelligence.test.js",
      "test/transport-settlement-vehicle-consolidation.test.js",
      "test/transport-vehicle-documents.test.js"
    ];
    for (const suite of suites) {
      const run = spawnSync(process.execPath, ["--test", suite], { cwd: API, encoding: "utf8" });
      const out = `${run.stdout || ""}${run.stderr || ""}`;
      const passMatch = out.match(/# pass (\d+)/);
      check(`unit_suite_${path.basename(suite, ".test.js")}`, run.status === 0 && /# fail 0\b/.test(out), { status: run.status, pass: passMatch ? passMatch[1] : "0", fail: (out.match(/# fail (\d+)/) || [])[1] });
    }
    const webSuite = spawnSync(process.execPath, ["--test", "test/transport-vehicle-master-catalogs.test.mjs"], { cwd: path.join(ROOT, "apps/web"), encoding: "utf8" });
    const webSuiteOut = `${webSuite.stdout || ""}${webSuite.stderr || ""}`;
    check("unit_suite_transport-vehicle-master-catalogs", webSuite.status === 0 && /# fail 0\b/.test(webSuiteOut), { status: webSuite.status, pass: (webSuiteOut.match(/# pass (\d+)/) || [])[1], fail: (webSuiteOut.match(/# fail (\d+)/) || [])[1] });

    // ---- Aserciones a nivel de código (estructura versionada) ----
    check("migration_files_present", [MIGRATION_PLANS, MIGRATION_CATALOGS, MIGRATION_DOCS].every((p) => fs.existsSync(p)), {});
    const engineSrc = fs.readFileSync(ENGINE_SRC, "utf8");
    check("engine_exports_vehicle_consolidation", /consolidateByVehicle/.test(engineSrc), {});
    const routesSrc = fs.readFileSync(ROUTES_SRC, "utf8");
    check("routes_guard_plans_and_documents", /\/transport\/plans"/.test(routesSrc) && /\/transport\/vehicles\/:id\/documents"/.test(routesSrc) && /settlement-vehicle-consolidation"/.test(routesSrc) && (routesSrc.match(/requirePermission\("transport"/g) || []).length >= 20, {});
    const storageSrc = fs.readFileSync(STORAGE_SRC, "utf8");
    check("storage_signed_urls_and_limits", /SIGNED_URL_TTL_SECONDS\s*=\s*600/.test(storageSrc) && /vehicle-documents/.test(storageSrc) && /10 \* 1024 \* 1024/.test(storageSrc), {});
    const towerSrc = fs.readFileSync(WEB_TOWER, "utf8");
    check("web_tower_three_views", /semanas/.test(towerSrc) && /vehiculos/.test(towerSrc) && /settlement-vehicle-consolidation/.test(towerSrc), {});
    const vehicleSrc = fs.readFileSync(WEB_VEHICLE, "utf8");
    check("web_vehicle_documents_ui", /FormData/.test(vehicleSrc) && /\/view`/.test(vehicleSrc), {});

    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
  } finally {
    if (app) { try { await app.close(); } catch { /* noop */ } }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(ROOT, OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
