#!/usr/bin/env node
// Certificador del candidato de la Fase 3 (causas A y D) sobre el árbol donde se promove.
// Corre las suites apuntadas del API y de la web y, si se le da una base, compara el conjunto
// de rojos de la suite web completa para que la no-regresión sea demostrable y no recordada.
//
//   node scripts/certifications/fase-3-ad-candidate-suites.js --out docs/qa/evidence/<carpeta> \
//        [--baseline docs/qa/evidence/<carpeta>/rojos-base-destino.txt]
//
// No necesita node_modules: las suites que barre son node:test sobre contratos de fuente.
// Los rojos por paquetes ausentes en un worktree auxiliar se reportan como tales, no se ocultan.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const root = path.resolve(__dirname, "..", "..");
const outDir = path.resolve(root, flag("out") || "docs/qa/evidence/fase-3-ad-candidate");
const baselineFile = flag("baseline") ? path.resolve(root, flag("baseline")) : null;

const API_SUITES = ["test/api-error-congestion.test.js", "test/api-error-mapping.test.js"];
const WEB_CONTRACTS = [
  "test/technical-detail-not-leaked.test.mjs",
  "test/hr-employee-biometric-reset.test.mjs",
];

function runSuite(cwdRel, files) {
  const cwd = path.join(root, cwdRel);
  const res = spawnSync(process.execPath, ["--test", ...files], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  const count = (label) => Number((out.match(new RegExp(`^# ${label} (\\d+)$`, "m")) || [])[1] || 0);
  const reds = [...out.matchAll(/^not ok \d+ - (.+?)(?: #.*)?$/gm)].map((m) => m[1].trim()).sort();
  return {
    cwd: cwdRel,
    files,
    exit: res.status,
    tests: count("tests"),
    passed: count("pass"),
    failed: count("fail"),
    reds,
    output: out,
  };
}

function summarize(run) {
  return [
    `# suite: ${run.cwd} :: ${run.files.join(" ")}`,
    `# exit: ${run.exit}`,
    `# tests ${run.tests}`,
    `# pass ${run.passed}`,
    `# fail ${run.failed}`,
    `# rojos: ${run.reds.join(" | ") || "(ninguno)"}`,
  ].join("\n");
}

fs.mkdirSync(outDir, { recursive: true });

const api = runSuite("apps/api", API_SUITES);
const webContracts = runSuite("apps/web", WEB_CONTRACTS);
const webFull = spawnSync(process.execPath, ["--test", "test/*.test.mjs"], {
  cwd: path.join(root, "apps/web"),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: false,
});
const fullOut = `${webFull.stdout || ""}${webFull.stderr || ""}`;
const fullReds = [...fullOut.matchAll(/^not ok \d+ - (.+?)(?: #.*)?$/gm)].map((m) => m[1].trim()).sort();
const fullCount = (label) =>
  Number((fullOut.match(new RegExp(`^# ${label} (\\d+)$`, "m")) || [])[1] || 0);
const full = {
  cwd: "apps/web",
  files: ["test/*.test.mjs"],
  exit: webFull.status,
  tests: fullCount("tests"),
  passed: fullCount("pass"),
  failed: fullCount("fail"),
  reds: fullReds,
  output: fullOut,
};

const baseline = baselineFile && fs.existsSync(baselineFile)
  ? fs.readFileSync(baselineFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).sort()
  : null;
const nuevosRojos = baseline ? full.reds.filter((r) => !baseline.includes(r)) : null;
const desaparecidos = baseline ? baseline.filter((r) => !full.reds.includes(r)) : null;

const checks = [
  { name: "mapeador_de_congestion_en_el_arbol_del_candidato", ok: api.failed === 0 && api.tests > 0, payload: { tests: api.tests, passed: api.passed } },
  { name: "barrido_de_detalle_del_proveedor_en_el_arbol_del_candidato", ok: webContracts.failed === 0 && webContracts.tests > 0, payload: { tests: webContracts.tests, passed: webContracts.passed } },
  { name: "suite_web_sin_rojos_nuevos_contra_la_base_del_destino", ok: baseline ? nuevosRojos.length === 0 : null, payload: { rojos: full.reds.length, nuevos: nuevosRojos, desaparecidos } },
];

const files = {
  "suite-api-candidato.txt": summarize(api) + "\n",
  "suite-web-contratos-candidato.txt": summarize(webContracts) + "\n",
  "suite-web-completa-candidato.txt": summarize(full) + "\n",
  "rojos-candidato.txt": full.reds.join("\n") + "\n",
};
for (const [name, body] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), body, "utf8");
}

const verdict = {
  passed: checks.filter((c) => c.ok === true).length,
  failed: checks.filter((c) => c.ok === false).length,
  total: checks.length,
};
fs.writeFileSync(
  path.join(outDir, "certification.json"),
  `${JSON.stringify({
    format: "fase-3-ad-candidate-suites/v1",
    started_at: new Date().toISOString(),
    tree: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    baseline_tree: spawnSync("git", ["rev-parse", "HEAD~1"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    suites: { api, web_contracts: webContracts, web_full: { tests: full.tests, passed: full.passed, failed: full.failed } },
    baseline_comparada: baselineFile ? path.relative(root, baselineFile) : null,
    checks,
    verdict,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`[fase-3-ad] api ${api.passed}/${api.tests} · contratos web ${webContracts.passed}/${webContracts.tests} · suite web ${full.passed}/${full.tests} (${full.failed} rojos)`);
if (baseline) console.log(`[fase-3-ad] rojos nuevos vs base del destino: ${nuevosRojos.length}`);
console.log(`[fase-3-ad] evidencia en ${path.relative(root, outDir)} · veredicto ${verdict.passed}/${verdict.total}`);
process.exit(verdict.failed > 0 || (baseline && nuevosRojos.length > 0) ? 1 : 0);
