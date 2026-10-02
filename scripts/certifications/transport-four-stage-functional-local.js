// Certificacion funcional LOCAL del modulo Transporte en 4 etapas.
//
// Etapas cubiertas:
//   1. Preparar pedidos: maestros, pedidos/importacion, necesidad completa/incompleta.
//   2. Ejecutar y entregar: planeacion, asignacion, despacho, tracking/POD.
//   3. Preparar la operacion: flota, transportador, conductor, origen, destino, tarifas.
//   4. Liquidar el costo: preliquidacion, ajustes, aprobacion, contabilizacion/cierre.
//
// Este orquestador solo permite API local. Genera evidencia reproducible y falla si
// no puede crear datos reales por HTTP.

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
const ROOT = path.resolve(__dirname, "..", "..");
const API_URL = String(args["api-url"] || "http://localhost:3000").replace(/\/$/, "");
const CHANGE_ID = String(args.changeId || "transport-four-stage-functional-local");
const OUTPUT_DIR = path.resolve(String(args["output-dir"] || `docs/qa/evidence/${CHANGE_ID}`));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(API_URL)) {
  throw new Error("La certificacion funcional de Transporte solo permite API local localhost/127.0.0.1.");
}

const summary = {
  change_id: CHANGE_ID,
  certification: "transport-four-stage-functional-local",
  environment: "LOCAL_DESARROLLO",
  api_url: API_URL,
  run_id: RUN_ID,
  status: "running",
  checks: []
};

function record(name, status, detail = {}) {
  summary.checks.push({ name, status, detail });
  console.error(`[transport-4-stage] ${status.toUpperCase()} ${name}`);
  if (status === "failed") throw new Error(name);
}

function run(name, command, commandArgs, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    timeout: Number(options.timeoutMs || 120000)
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.log`), output);
  const detail = {
    command: [command, ...commandArgs].join(" "),
    exit_code: result.status,
    duration_ms: Date.now() - started,
    log: `${name}.log`
  };
  if (result.error) detail.error = result.error.message;
  record(name, result.status === 0 ? "passed" : "failed", detail);
}

async function request(pathname) {
  try {
    const response = await fetch(`${API_URL}${pathname}`, { signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: {}, transportError: error.message };
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  try {
    const health = await request("/health");
    record("api_health", health.status === 200 && health.body.status === "OK" ? "passed" : "failed", { status: health.status, body: health.body, transport_error: health.transportError });

    const seedOutput = path.join(OUTPUT_DIR, "substantial-data-seed.json");
    run("substantial_data_seed", process.execPath, [
      "scripts/seed-transport-intelligent-local.js",
      "--api-url", API_URL,
      "--output", seedOutput
    ], { timeoutMs: 180000 });

    const tmsOutput = path.join(OUTPUT_DIR, "four-stage-tms-certification.json");
    run("four_stage_tms_certification", process.execPath, [
      "scripts/certifications/transport-tms-local.js",
      "--api-url", API_URL,
      "--output", tmsOutput
    ], { timeoutMs: 240000 });

    run("transport_api_domain_tests", process.execPath, [
      "--test",
      "apps/api/test/transport-tms-foundation.test.js",
      "apps/api/test/transport-settlement-engine.test.js",
      "apps/api/test/transport-packing.test.js"
    ]);

    run("transport_web_contract_tests", process.execPath, [
      "--experimental-strip-types",
      "--test",
      "apps/web/test/transport-tms-ui.test.mjs",
      "apps/web/test/transport-settlement-ui.test.mjs",
      "apps/web/test/transport-master-access.test.mjs"
    ]);

    if (args["include-settlement"] !== false && args["include-settlement"] !== "false") {
      const databaseUrl = String(process.env.DATABASE_URL || "");
      if (/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) {
        run("settlement_package_certification", process.execPath, [
          "scripts/certifications/transport-settlement-packages-local.js",
          "--output", path.join(OUTPUT_DIR, "settlement-package-certification.json")
        ], { timeoutMs: 240000 });
      } else {
        record("settlement_package_certification", "blocked", { reason: "DATABASE_URL local no disponible para certificacion viva de liquidaciones." });
      }
    }

    summary.status = summary.checks.some((check) => check.status === "failed") ? "failed" : "passed";
  } catch (error) {
    summary.status = "failed";
    summary.error = error.message;
  } finally {
    summary.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.error(`[transport-4-stage] evidencia: ${path.relative(ROOT, OUTPUT_DIR)} status=${summary.status}`);
    process.exit(summary.status === "passed" ? 0 : 1);
  }
}

main();
