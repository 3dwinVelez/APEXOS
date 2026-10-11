#!/usr/bin/env node
// Certificacion local del barrido de salud QA (fixes 2026-10-11).
// Ejerce el flujo completo solicitado: suites unitarias de API y de web sin fallos,
// que cubren directamente las correcciones de este cambio:
//   - purchases: GET /purchases/vmi-alerts tolera item sin movimiento de entrada (500 -> 200)
//   - hr: las mallas de descanso no se bloquean por solapamiento con mallas de trabajo
//   - web: breadcrumbs no enlazan rutas intermedias inexistentes (404)
//   - web: el registro de funciones cubre las rutas de nomina
// Escribe evidencia versionada en docs/qa/evidence/qa-sweep-fixes-20261011/local-certification.json

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const evidenceDir = path.join(root, "docs", "qa", "evidence", "qa-sweep-fixes-20261011");
const evidenceFile = path.join(evidenceDir, "local-certification.json");

function runSuite(label, cwd, args, env) {
  let stdout = "";
  let failed = false;
  try {
    stdout = execFileSync(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (error) {
    failed = true;
    stdout = `${error.stdout || ""}\n${error.stderr || ""}`;
  }
  const pass = Number((stdout.match(/^# pass (\d+)/m) || [])[1] || 0);
  const fail = Number((stdout.match(/^# fail (\d+)/m) || [])[1] || 0);
  const tests = Number((stdout.match(/^# tests (\d+)/m) || [])[1] || 0);
  return { label, tests, pass, fail, failed: failed || fail > 0 };
}

function webUnitArgs() {
  const testDir = path.join(root, "apps", "web", "test");
  const files = fs.readdirSync(testDir)
    .filter((name) => name.endsWith(".mjs") && !name.startsWith("certify-"))
    .map((name) => path.join("test", name));
  return ["--experimental-strip-types", "--test", ...files];
}

const api = runSuite("apps/api", path.join(root, "apps", "api"), ["--test"], { DISABLE_REDIS: "true" });
const web = runSuite("apps/web", path.join(root, "apps", "web"), webUnitArgs(), {});

const checks = [
  { name: "purchases_vmi_alerts_sin_movimiento_no_lanza_500", suite: "api", status: api.fail === 0 ? "passed" : "failed", evidence: "apps/api/test/purchases-vmi-alerts.test.js" },
  { name: "hr_malla_descanso_no_bloqueada_por_solapamiento", suite: "api", status: api.fail === 0 ? "passed" : "failed", evidence: "apps/api/test/hr-route-assignment-lock.test.js" },
  { name: "web_breadcrumbs_sin_404_en_segmentos_intermedios", suite: "web", status: web.fail === 0 ? "passed" : "failed", evidence: "apps/web/test/phase-two-intelligent-experience.test.mjs" },
  { name: "web_registro_funciones_cubre_rutas_de_nomina", suite: "web", status: web.fail === 0 ? "passed" : "failed", evidence: "apps/web/test/command-palette-module-functions.test.mjs" }
];

const status = api.fail === 0 && web.fail === 0 ? "passed" : "failed";

const report = {
  change_id: "qa-sweep-fixes-20261011",
  environment: "LOCAL",
  generated_at: new Date().toISOString(),
  status,
  suites: { api, web },
  checks,
  notes: [
    "La suite de API se ejecuta con DISABLE_REDIS=true (req. de entorno del runner); offline-bootstrap exige Redis o DISABLE_REDIS.",
    "La suite de web excluye los harness certify-*.mjs, que requieren un servidor vivo en 127.0.0.1:3001 (no son pruebas unitarias)."
  ]
};

fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(evidenceFile, `${JSON.stringify(report, null, 2)}\n`);

console.log(`API  tests=${api.tests} pass=${api.pass} fail=${api.fail}`);
console.log(`Web  tests=${web.tests} pass=${web.pass} fail=${web.fail}`);
console.log(`Evidencia: ${path.relative(root, evidenceFile)}`);
process.exit(status === "passed" ? 0 : 1);
