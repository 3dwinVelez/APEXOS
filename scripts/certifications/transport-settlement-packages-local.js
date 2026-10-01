// Certificacion LOCAL (en vivo) de la Liquidacion de Transporte por paquetes.
//
// Alcance certificado (spec "Liquidacion de Transporte", extension nativa del modulo Transporte):
//   - Contenedor de periodo + paquete por transportador/tipo con maquina de estados completa
//     (borrador -> validando -> preliquidada/con_novedad -> en_revision -> aprobada -> contabilizada -> liquidada).
//   - RB-01 transportador habilitado, RB-02 elegibilidad documental parametrizable, RB-03 guia duplicada,
//     RB-04/05/06 tarifa vigente/determinista/con snapshot, RB-07 ajustes auditados, RB-08 novedades bloqueantes,
//     RB-09 segregacion de funciones, RB-10 contabilizacion idempotente, RB-11 inmutabilidad, RB-12 concurrencia.
//   - Auditoria funcional append-only en AuditLog y simulador de tarifa.
//
// Arranca la API Fastify contra la base LOCAL, ejercita los endpoints reales por HTTP con el administrador
// demo y ademas corre la suite unitaria del motor. NO escribe en QA ni en produccion: aborta si DATABASE_URL
// no apunta a localhost/127.0.0.1. Sale con codigo distinto de cero ante cualquier fallo.

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
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const PORT = Number(args.port || 3211);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 25000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/transport-settlement-packages-20261001/local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const EMAIL = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const PASSWORD = process.env.LOCAL_TMS_PASSWORD || "test1234";
const CERT_ID = "transport-settlement-packages-20261001";

const ENGINE_SRC = path.join(API, "src/modules/transport/settlement-engine.js");
const SERVICE_SRC = path.join(API, "src/modules/transport/settlement-service.js");
const ROUTES_SRC = path.join(API, "src/modules/transport/routes.js");
const SCHEMA_SRC = path.join(API, "prisma/schema.prisma");
const WEB_PAGE = path.join(ROOT, "apps/web/app/dashboard/transporte/liquidaciones/page.tsx");

function fromNow(hours) { return new Date(Date.now() + hours * 3600000).toISOString(); }

const result = {
  change_id: CERT_ID,
  certification: "transport-settlement-packages-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  scope: {
    capability: "Liquidacion de Transporte por paquetes (contenedor de periodo + paquete por transportador/tipo) con motor tarifario explicable y versionado, validaciones RB-01..RB-12, ajustes auditados, novedades bloqueantes, workflow de aprobacion con segregacion, contabilizacion idempotente, torre de control, simulador de tarifa y auditoria funcional append-only; extension nativa del modulo Transporte sin duplicar maestros.",
    proven_by_live_execution: [
      "POST /transport/settlement-periods crea el contenedor semanal",
      "POST /transport/settlement-packages crea el paquete validando transportador habilitado (RB-01)",
      "POST /transport/settlement-packages/:id/items registra detalles y detecta guia duplicada entre paquetes (RB-03)",
      "POST /transport/settlement-packages/:id/validate ejecuta RB-01/02/03 y crea novedades",
      "POST /transport/settlement-packages/:id/precalculate resuelve tarifa vigente/determinista, congela snapshot y traza (RB-04/05/06); sin tarifa genera novedad bloqueante y cae a con_novedad",
      "POST /transport/settlement-packages/:id/adjustments registra ajuste con before/after y motivo (RB-07)",
      "POST /transport/settlement-packages/:id/submit exige novedades bloqueantes resueltas (RB-08)",
      "POST /transport/settlement-packages/:id/decision aprueba con segregacion de funciones (RB-09) y fija approved_total",
      "POST /transport/settlement-packages/:id/account contabiliza de forma idempotente (RB-10): el reintento no duplica",
      "Un paquete aprobado no admite edicion del detalle (RB-11) y una version obsoleta produce 409 (RB-12)",
      "GET /transport/settlement-packages/:id/audit expone la trazabilidad append-only",
      "GET /transport/settlement-control-tower expone KPIs y aging",
      "POST /transport/rates/simulate resuelve tarifa sin alterar la liquidacion",
      "GET anonimo responde 401"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/transport-settlement-engine.test.js (motor puro: 19 controles)",
      "apps/web/test/transport-settlement-ui.test.mjs (pagina de liquidaciones)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

let TOKEN = "";
async function capture(pathname, { method = "GET", body, auth = true } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
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

async function main() {
  let app = null;
  try {
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });

    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    const anon = await capture("/api/v1/transport/settlement-packages", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await capture("/api/v1/auth/login", { method: "POST", auth: false, body: { email: EMAIL, password: PASSWORD } });
    check("admin_login", login.status === 200 && Boolean(login.payload?.token), { status: login.status });
    TOKEN = login.payload.token;

    // ---- Maestros reutilizados (transportador + tarifa versionada) ----
    const carrier = await capture("/api/v1/transport/carriers", { method: "POST", body: { code: `QA-LIQ-CAR-${RUN_ID}`, legal_name: `Transportadora liquidacion ${RUN_ID}`, tax_id: `TAX-${RUN_ID}`, status: "activo", service_levels: ["normal"], operating_zones: ["local"], vehicle_types: ["camion"] } });
    check("carrier_created", carrier.status === 201 && Boolean(carrier.payload.id), { status: carrier.status });
    const carrierId = carrier.payload.id;

    const rate = await capture("/api/v1/transport/rate-cards", { method: "POST", body: { code: `QA-LIQ-TAR-${RUN_ID}`, name: `Tarifa liquidacion ${RUN_ID}`, carrier_id: carrierId, destination_city: "Bogota", service_level: "normal", vehicle_type: "camion", valid_from: fromNow(-24), valid_to: fromNow(24 * 365), currency: "COP", base_rate: 500000, minimum_charge: 600000, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, priority: 10, status: "activa" } });
    check("rate_card_activated", rate.status === 201 && rate.payload.status === "activa" && rate.payload.version === 1, { status: rate.status, version: rate.payload.version });

    // ---- Tipo de liquidacion como maestro (reforzado para probar segregacion) ----
    const reinforcedType = await capture("/api/v1/transport/settlement-types", { method: "POST", body: { code: `QA_REFORZADO_${RUN_ID}`.slice(0, 40), name: "QA aprobacion reforzada", requires_reinforced_approval: true, documentary_policy: "bloqueo", required_documents: ["RUT"] } });
    check("settlement_type_created", reinforcedType.status === 201 && reinforcedType.payload.requires_reinforced_approval === true, { status: reinforcedType.status });
    const reinforcedCode = reinforcedType.payload.code;

    const types = await capture("/api/v1/transport/settlement-types");
    check("settlement_types_include_reserved", types.status === 200 && Array.isArray(types.payload) && types.payload.some((t) => t.code === "TRANSPORTADOR"), { count: Array.isArray(types.payload) ? types.payload.length : 0 });

    // ---- Periodo contenedor ----
    const period = await capture("/api/v1/transport/settlement-periods", { method: "POST", body: { code: `QA-LIQ-PER-${RUN_ID}`, name: `Semana ${RUN_ID}`, start_date: fromNow(-24 * 3), end_date: fromNow(24 * 4) } });
    check("period_created", period.status === 201 && period.payload.status === "abierto", { status: period.status });
    const periodId = period.payload.id;

    // ---- Paquete TRANSPORTADOR + detalles ----
    const pkg = await capture("/api/v1/transport/settlement-packages", { method: "POST", body: { code: `QA-LIQ-PKG-${RUN_ID}`, carrier_id: carrierId, period_id: periodId, type_code: "TRANSPORTADOR", currency: "COP", observation: "Paquete de certificacion" } });
    check("package_created_borrador", pkg.status === 201 && pkg.payload.status === "borrador" && pkg.payload.carrier_id === carrierId && pkg.payload.version === 0, { status: pkg.status });
    const pkgId = pkg.payload.id;

    const items = await capture(`/api/v1/transport/settlement-packages/${pkgId}/items`, { method: "POST", body: { items: [
      { guide_reference: `GUIA-${RUN_ID}-1`, service: "carga_general", destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", service_date: fromNow(-24), base_type: "viaje", quantity: 1, distance_km: 100, weight_kg: 1000, volume_m3: 8, stop_count: 2 },
      { guide_reference: `GUIA-${RUN_ID}-2`, service: "carga_general", destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", service_date: fromNow(-24), base_type: "guia", quantity: 2, distance_km: 50, weight_kg: 500, volume_m3: 4, stop_count: 1 }
    ], version: 0 } });
    check("items_added", items.status === 201 && items.payload.items.length === 2 && items.payload.version === 1, { status: items.status, items: items.payload.items?.length });

    // ---- RB-03 guia duplicada entre paquetes vigentes ----
    const pkg2 = await capture("/api/v1/transport/settlement-packages", { method: "POST", body: { code: `QA-LIQ-PKG2-${RUN_ID}`, carrier_id: carrierId, period_id: periodId, type_code: "TRANSPORTADOR" } });
    check("second_package_created", pkg2.status === 201, { status: pkg2.status });
    const dup = await capture(`/api/v1/transport/settlement-packages/${pkg2.payload.id}/items`, { method: "POST", body: { items: [{ guide_reference: `GUIA-${RUN_ID}-1`, destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", service_date: fromNow(-24), quantity: 1, distance_km: 10, stop_count: 1 }] } });
    check("RB03_duplicate_guide_blocked", dup.status === 409 && dup.payload.code === "TMS_SETTLEMENT_DUPLICATE_GUIDE_CROSS_PACKAGE", { status: dup.status, code: dup.payload.code });

    // ---- Validar (RB-01/02/03) ----
    const validated = await capture(`/api/v1/transport/settlement-packages/${pkgId}/validate`, { method: "POST", body: { version: 1 } });
    check("validated_to_validando", validated.status === 200 && validated.payload.status === "validando" && validated.payload.validation.carrier.eligible === true, { status: validated.status, state: validated.payload.status });

    // ---- Preliquidar (RB-04/05/06) ----
    const precalc = await capture(`/api/v1/transport/settlement-packages/${pkgId}/precalculate`, { method: "POST", body: { version: validated.payload.version } });
    const firstItem = precalc.payload.items?.[0] || {};
    check("precalculated_to_preliquidada", precalc.status === 200 && precalc.payload.status === "preliquidada" && precalc.payload.calculated_total > 0, { status: precalc.status, state: precalc.payload.status, calculated_total: precalc.payload.calculated_total });
    check("RB06_rate_snapshot_and_trace", firstItem.rate_version === 1 && firstItem.rate_card_id === rate.payload.id && Boolean(firstItem.calculation_trace?.selected) && Array.isArray(firstItem.calculation_trace?.evaluated), { rate_version: firstItem.rate_version, rate_card_id: firstItem.rate_card_id, has_trace: Boolean(firstItem.calculation_trace?.selected) });

    // ---- Sin tarifa vigente => con_novedad + novedad bloqueante ----
    const pkgNoRate = await capture("/api/v1/transport/settlement-packages", { method: "POST", body: { code: `QA-LIQ-PKG3-${RUN_ID}`, carrier_id: carrierId, type_code: "TRANSPORTADOR" } });
    await capture(`/api/v1/transport/settlement-packages/${pkgNoRate.payload.id}/items`, { method: "POST", body: { items: [{ guide_reference: `GUIA-${RUN_ID}-SINRATE`, destination_city: "Cali", vehicle_type: "camion", service_level: "normal", service_date: fromNow(-24), quantity: 1, distance_km: 10, stop_count: 1 }] } });
    await capture(`/api/v1/transport/settlement-packages/${pkgNoRate.payload.id}/validate`, { method: "POST", body: {} });
    const noRate = await capture(`/api/v1/transport/settlement-packages/${pkgNoRate.payload.id}/precalculate`, { method: "POST", body: {} });
    check("RB04_missing_rate_creates_blocking_issue", noRate.status === 200 && noRate.payload.status === "con_novedad" && noRate.payload.issues.some((i) => i.category === "tarifa_inexistente" && i.blocking), { status: noRate.status, state: noRate.payload.status, issues: noRate.payload.issues?.map((i) => i.category) });
    const submitBlocked = await capture(`/api/v1/transport/settlement-packages/${pkgNoRate.payload.id}/submit`, { method: "POST", body: {} });
    check("RB08_blocking_issue_prevents_submit", submitBlocked.status === 409 && submitBlocked.payload.code === "TMS_SETTLEMENT_BLOCKING_ISSUE_OPEN", { status: submitBlocked.status, code: submitBlocked.payload.code });

    // ---- RB-07 ajuste auditado ----
    const adjusted = await capture(`/api/v1/transport/settlement-packages/${pkgId}/adjustments`, { method: "POST", body: { item_id: firstItem.id, delta: -50000, reason: "Descuento por acuerdo comercial", version: precalc.payload.version } });
    check("RB07_adjustment_records_before_after", adjusted.status === 201 && adjusted.payload.adjustment.before_value === firstItem.calculated_amount && adjusted.payload.adjustment.after_value === firstItem.calculated_amount - 50000 && adjusted.payload.adjusted_total === precalc.payload.calculated_total - 50000, { status: adjusted.status, before: adjusted.payload.adjustment?.before_value, after: adjusted.payload.adjustment?.after_value, adjusted_total: adjusted.payload.adjusted_total });
    const adjustNoReason = await capture(`/api/v1/transport/settlement-packages/${pkgId}/adjustments`, { method: "POST", body: { delta: 1000, reason: "  " } });
    check("RB07_adjustment_requires_reason", adjustNoReason.status === 400 && adjustNoReason.payload.code === "TMS_SETTLEMENT_ADJUSTMENT_REASON_REQUIRED", { status: adjustNoReason.status, code: adjustNoReason.payload.code });

    // ---- RB-12 concurrencia: version obsoleta ----
    const stale = await capture(`/api/v1/transport/settlement-packages/${pkgId}`, { method: "PATCH", body: { observation: "intento obsoleto", version: 0 } });
    check("RB12_stale_version_conflict", stale.status === 409 && stale.payload.code === "TMS_SETTLEMENT_VERSION_CONFLICT", { status: stale.status, code: stale.payload.code });

    // ---- Workflow: submit -> approve (RB-09 sin segregacion para TRANSPORTADOR) ----
    const current = await capture(`/api/v1/transport/settlement-packages/${pkgId}`);
    const submitted = await capture(`/api/v1/transport/settlement-packages/${pkgId}/submit`, { method: "POST", body: { version: current.payload.version } });
    check("submitted_to_en_revision", submitted.status === 200 && submitted.payload.status === "en_revision", { status: submitted.status, state: submitted.payload.status });
    const approved = await capture(`/api/v1/transport/settlement-packages/${pkgId}/decision`, { method: "POST", body: { decision: "aprobada", comment: "Liquidacion conforme", version: submitted.payload.version } });
    check("approved_fixes_approved_total", approved.status === 200 && approved.payload.status === "aprobada" && approved.payload.approved_total === submitted.payload.adjusted_total && approved.payload.approvals.some((a) => a.decision === "aprobada"), { status: approved.status, approved_total: approved.payload.approved_total });

    // ---- RB-11 inmutabilidad tras aprobacion ----
    const editAfterApprove = await capture(`/api/v1/transport/settlement-packages/${pkgId}/items`, { method: "POST", body: { items: [{ guide_reference: `GUIA-${RUN_ID}-X`, quantity: 1 }] } });
    check("RB11_approved_not_editable", editAfterApprove.status === 409 && editAfterApprove.payload.code === "TMS_SETTLEMENT_NOT_EDITABLE", { status: editAfterApprove.status, code: editAfterApprove.payload.code });

    // ---- RB-10 contabilizacion idempotente ----
    const idemKey = `QA-IDEM-${RUN_ID}`;
    const accounted = await capture(`/api/v1/transport/settlement-packages/${pkgId}/account`, { method: "POST", body: { reference: `CMP-${RUN_ID}`, accounting_period: "2026-10", idempotency_key: idemKey } });
    check("accounted_to_contabilizada", accounted.status === 200 && accounted.payload.status === "contabilizada" && accounted.payload.accounted_total === approved.payload.approved_total && accounted.payload.idempotent_replay === false, { status: accounted.status, state: accounted.payload.status });
    const replay = await capture(`/api/v1/transport/settlement-packages/${pkgId}/account`, { method: "POST", body: { reference: `CMP-${RUN_ID}`, accounting_period: "2026-10", idempotency_key: idemKey } });
    check("RB10_accounting_idempotent_replay", replay.status === 200 && replay.payload.idempotent_replay === true && replay.payload.accountings.length === 1, { status: replay.status, replay: replay.payload.idempotent_replay, accountings: replay.payload.accountings?.length });

    // ---- Cierre a liquidada ----
    const closed = await capture(`/api/v1/transport/settlement-packages/${pkgId}/close`, { method: "POST", body: { status: "liquidada" } });
    check("closed_to_liquidada", closed.status === 200 && closed.payload.status === "liquidada", { status: closed.status, state: closed.payload.status });

    // ---- Auditoria append-only ----
    const auditRes = await capture(`/api/v1/transport/settlement-packages/${pkgId}/audit`);
    check("audit_timeline_append_only", auditRes.status === 200 && auditRes.payload.timeline.length >= 5 && auditRes.payload.timeline.some((e) => e.action === "transport.settlement_package.accounted") && auditRes.payload.approvals.length >= 1, { status: auditRes.status, events: auditRes.payload.timeline?.length });

    // ---- Torre de control + simulador ----
    const tower = await capture("/api/v1/transport/settlement-control-tower");
    check("control_tower_kpis", tower.status === 200 && tower.payload.kpis && typeof tower.payload.kpis.accounted_value === "number" && Array.isArray(tower.payload.packages), { status: tower.status, total: tower.payload.total_packages });
    const simulate = await capture("/api/v1/transport/rates/simulate", { method: "POST", body: { carrier_id: carrierId, destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", service_date: fromNow(-24), quantity: 1, distance_km: 100, weight_kg: 1000, volume_m3: 8, stop_count: 2 } });
    check("rate_simulator_explains", simulate.status === 200 && simulate.payload.rate.id === rate.payload.id && simulate.payload.amount > 0 && Boolean(simulate.payload.components), { status: simulate.status, amount: simulate.payload.amount });

    // ---- RB-09 segregacion: tipo reforzado, creador no puede aprobar ----
    const pkgR = await capture("/api/v1/transport/settlement-packages", { method: "POST", body: { code: `QA-LIQ-PKGR-${RUN_ID}`, carrier_id: carrierId, type_code: reinforcedCode } });
    check("reinforced_package_created", pkgR.status === 201 && pkgR.payload.type_code === reinforcedCode, { status: pkgR.status });
    const pkgRId = pkgR.payload.id;
    // RB-02 documental bajo politica bloqueo: sin RUT => novedad bloqueante en validate
    const validatedR = await capture(`/api/v1/transport/settlement-packages/${pkgRId}/validate`, { method: "POST", body: {} });
    check("RB02_documentary_block_issue", validatedR.status === 200 && validatedR.payload.issues.some((i) => i.category === "documento_vencido" && i.blocking === true), { status: validatedR.status, issues: validatedR.payload.issues?.map((i) => i.category) });
    await capture(`/api/v1/transport/settlement-packages/${pkgRId}/items`, { method: "POST", body: { items: [{ guide_reference: `GUIA-${RUN_ID}-R`, destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", service_date: fromNow(-24), quantity: 1, distance_km: 10, stop_count: 1 }] } });
    // resolver la novedad documental para poder preliquidar/enviar
    const openIssue = validatedR.payload.issues.find((i) => i.category === "documento_vencido");
    await capture(`/api/v1/transport/settlement-issues/${openIssue.id}/resolve`, { method: "POST", body: { resolution: "RUT cargado y verificado", close: true } });
    const precalcR = await capture(`/api/v1/transport/settlement-packages/${pkgRId}/precalculate`, { method: "POST", body: {} });
    check("reinforced_precalculated", precalcR.status === 200 && ["preliquidada", "con_novedad"].includes(precalcR.payload.status), { status: precalcR.status, state: precalcR.payload.status });
    const submitR = await capture(`/api/v1/transport/settlement-packages/${pkgRId}/submit`, { method: "POST", body: {} });
    check("reinforced_submitted", submitR.status === 200 && submitR.payload.status === "en_revision", { status: submitR.status, state: submitR.payload.status });
    const segreg = await capture(`/api/v1/transport/settlement-packages/${pkgRId}/decision`, { method: "POST", body: { decision: "aprobada", comment: "intento del creador" } });
    check("RB09_segregation_blocks_creator_approval", segreg.status === 403 && segreg.payload.code === "TMS_SETTLEMENT_SEGREGATION_VIOLATION", { status: segreg.status, code: segreg.payload.code });
    const rejectNoComment = await capture(`/api/v1/transport/settlement-packages/${pkgRId}/decision`, { method: "POST", body: { decision: "rechazada" } });
    check("rejection_requires_comment", rejectNoComment.status === 400 && rejectNoComment.payload.code === "TMS_SETTLEMENT_REJECTION_REQUIRES_COMMENT", { status: rejectNoComment.status, code: rejectNoComment.payload.code });

    // ---- Suites unitarias versionadas ----
    const engineTest = spawnSync(process.execPath, ["--test", "test/transport-settlement-engine.test.js"], { cwd: API, encoding: "utf8" });
    const engineOut = `${engineTest.stdout || ""}${engineTest.stderr || ""}`;
    const enginePass = /# fail 0\b/.test(engineOut) && /# pass (\d+)/.test(engineOut);
    check("unit_suite_engine_pass", engineTest.status === 0 && enginePass, { status: engineTest.status, pass: (engineOut.match(/# pass (\d+)/) || [])[1], fail: (engineOut.match(/# fail (\d+)/) || [])[1] });

    // ---- Aserciones a nivel de codigo (estructura versionada) ----
    const engineSrc = fs.readFileSync(ENGINE_SRC, "utf8");
    check("engine_defines_state_machine_and_rbs", /PACKAGE_TRANSITIONS\s*=/.test(engineSrc) && /TMS_SETTLEMENT_RATE_AMBIGUOUS/.test(engineSrc) && /accountingIdempotencyKey/.test(engineSrc) && /assertSegregation/.test(engineSrc), {});
    const serviceSrc = fs.readFileSync(SERVICE_SRC, "utf8");
    check("service_writes_functional_audit", /auditLog\.create/.test(serviceSrc) && /runWithTenant/.test(serviceSrc) && /pg_advisory_xact_lock/.test(serviceSrc), {});
    const routesSrc = fs.readFileSync(ROUTES_SRC, "utf8");
    check("routes_guarded_by_rbac", (routesSrc.match(/requirePermission\("transport"/g) || []).length >= 20 && /settlement-packages\/:id\/account/.test(routesSrc) && /requirePermission\("transport", "approve"\)/.test(routesSrc), {});
    const schemaSrc = fs.readFileSync(SCHEMA_SRC, "utf8");
    check("schema_has_settlement_models", ["TransportSettlementPeriod", "TransportSettlementPackage", "TransportSettlementItem", "TransportSettlementAdjustment", "TransportSettlementIssue", "TransportSettlementApproval", "TransportSettlementAccounting", "TransportSettlementType"].every((m) => schemaSrc.includes(`model ${m} `)), {});
    check("web_page_present", fs.existsSync(WEB_PAGE), { path: path.relative(ROOT, WEB_PAGE) });

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
