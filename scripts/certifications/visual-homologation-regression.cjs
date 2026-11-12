// Regresion del candidato de capa visual: tipos, lint y suite web contra una linea base medida.
// No escribe en base de datos ni toca la API: solo compila y ejecuta pruebas del arbol indicado.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const repo = path.resolve(process.env.CERT_REPO_DIR || root);
const web = path.join(repo, "apps/web");
const evidenceDir = path.resolve(
  process.env.CERT_EVIDENCE_DIR || path.join(root, "docs/qa/evidence/homologacion-visual-candidate-20261112")
);
const commit = String(process.env.CERT_COMMIT || "").trim();
assert.match(commit, /^[a-f0-9]{7,40}$/i, "CERT_COMMIT must be the evaluated commit SHA");
assert.ok(fs.existsSync(path.join(web, "package.json")), `apps/web is missing under ${repo}`);

const baselineFile = path.join(__dirname, "visual-homologation-known-failures.json");
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : { web: [], reason: "" };

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function suiteFailures(output) {
  const names = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^not ok \d+ - (.+)$/.exec(line);
    if (match) names.push(match[1].trim());
  }
  const count = (key) => Number((output.match(new RegExp(`^# ${key} ([0-9]+)`, "m")) || [])[1] || 0);
  return { names, tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped") };
}

const evidence = {
  commit,
  environment: "LOCAL",
  repo,
  status: "running",
  started_at: new Date().toISOString(),
  baseline: { file: path.relative(root, baselineFile).replace(/\\/g, "/"), web: baseline.web, reason: baseline.reason },
  steps: []
};

function step(name, result, extra) {
  evidence.steps.push({ name, status: result.status === 0 ? "passed" : "failed", exit_code: result.status, ...extra });
  return result;
}

fs.mkdirSync(evidenceDir, { recursive: true });
const typescript = path.join(repo, "node_modules/typescript/bin/tsc");
const eslint = path.join(repo, "node_modules/eslint/bin/eslint.js");
const tests = fs.readdirSync(path.join(web, "test")).filter((name) => name.endsWith(".test.mjs")).sort();

const typecheck = step("typecheck", run(process.execPath, [typescript, "-p", "tsconfig.typecheck.json", "--noEmit"], web));
const lint = step("lint", run(process.execPath, [eslint, "."], web));
const suiteRun = run(process.execPath, ["--experimental-strip-types", "--test", ...tests.map((name) => path.join("test", name))], web);
const suite = suiteFailures(suiteRun.output);
const known = new Set(baseline.web);
const failures = { known: suite.names.filter((name) => known.has(name)), unexpected: suite.names.filter((name) => !known.has(name)) };
// La suite de develop no esta en verde: la linea base fija que un fallo conocido no es una regresion.
const suiteStatus = failureStatus() === "passed" ? "passed" : "failed";
evidence.steps.push({ name: "web_suite", status: suiteStatus, exit_code: suiteRun.status, files: tests.length, ...suite });

evidence.typecheck_output = typecheck.output.slice(-4000);
evidence.lint_output = lint.output.slice(-4000);
evidence.suite = { ...suite, known_failures: failures.known, unexpected_failures: failures.unexpected, raw_tail: suiteRun.output.slice(-4000) };
evidence.status = failureStatus();
fs.writeFileSync(path.join(evidenceDir, "visual-homologation-regression.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: evidence.status, commit, tests: suite.tests, fail: suite.fail, unexpected: failures.unexpected.length, evidence: path.relative(root, evidenceDir) }));
process.exitCode = evidence.status === "passed" ? 0 : 1;

function failureStatus() {
  if (typecheck.status !== 0) return "failed";
  if (lint.status !== 0) return "failed";
  if (!suite.tests) return "failed";
  if (failures.unexpected.length) return "failed";
  if (suite.fail !== failures.known.length) return "failed";
  return "passed";
}
