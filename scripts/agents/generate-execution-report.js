#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, currentBranch, git, lines, requireSuccess } = require("./lib");

const branch = currentBranch();
const commit = requireSuccess(git(["rev-parse", "HEAD"]), "No fue posible leer HEAD");
const status = requireSuccess(git(["status", "--porcelain=v1", "--untracked-files=all"]), "No fue posible leer Git");
const files = lines(status).map((line) => line.slice(3));
const testPath = path.join(ROOT, ".agents", "reports", "latest-test-results.json");
const tests = fs.existsSync(testPath) ? JSON.parse(fs.readFileSync(testPath, "utf8")) : null;
const timestamp = new Date();
const id = timestamp.toISOString().replace(/[:.]/g, "-");
const reportDir = path.join(ROOT, ".agents", "reports");
fs.mkdirSync(reportDir, { recursive: true });

const report = {
  generated_at: timestamp.toISOString(),
  branch,
  commit,
  working_tree_clean: files.length === 0,
  changed_files: files,
  tests
};

const jsonPath = path.join(reportDir, `execution-${id}.json`);
const markdownPath = path.join(reportDir, `execution-${id}.md`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const testSummary = tests
  ? `${tests.summary.passed} aprobada(s), ${tests.summary.failed} fallida(s), ${tests.summary.not_run} no ejecutada(s)`
  : "Sin ejecución registrada";
const markdown = [
  "# Informe de ejecución de agente",
  "",
  `- Fecha: ${report.generated_at}`,
  `- Rama: \`${branch}\``,
  `- Commit base: \`${commit}\``,
  `- Estado limpio: ${report.working_tree_clean ? "sí" : "no"}`,
  `- Pruebas: ${testSummary}`,
  "",
  "## Archivos modificados",
  "",
  ...(files.length ? files.map((file) => `- \`${file}\``) : ["- Ninguno"]),
  ""
].join("\n");
fs.writeFileSync(markdownPath, markdown);

console.log(`Informe JSON: ${path.relative(ROOT, jsonPath)}`);
console.log(`Informe Markdown: ${path.relative(ROOT, markdownPath)}`);
