const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const output = path.resolve(root, process.argv[2] || "docs/qa/evidence/commercial-management-m27-20260901/certification.json");
const startedAt = new Date().toISOString();
const checks = [];

function run(name, command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...extraEnv }, encoding: "utf8", shell: process.platform === "win32" });
  checks.push({ name, status: result.status === 0 ? "passed" : "failed", command: [command, ...args].join(" "), exit_code: result.status, stdout: result.stdout.slice(-12000), stderr: result.stderr.slice(-12000) });
  if (result.status !== 0) throw new Error(`${name} fallo con codigo ${result.status}`);
}

try {
  const localDatabase = process.env.DATABASE_URL || "postgresql://apex:apex_dev_password@127.0.0.1:54321/apexos?schema=public";
  run("prisma_schema", "npm", ["run", "prisma:validate"]);
  run("commercial_unit_contracts", "node", ["--test", "apps/api/test/commercial-management-contract.test.js", "apps/api/test/commercial-management-domain.test.js", "apps/api/test/commercial-advisor-report.test.js", "apps/api/test/commercial-quotation-conversion.test.js", "apps/api/test/commercial-quotation-report.test.js"]);
  run("commercial_database_flow", "node", ["--test", "apps/api/test/commercial-document-flow.integration.test.js"], { DATABASE_URL: localDatabase, COMMERCIAL_LOCAL_INTEGRATION: "1" });
  run("commercial_web_contracts", "node", ["--test", "apps/web/test/commercial-visit-selection.test.mjs"]);
  run("commercial_lint", "npm", ["--workspace", "apps/web", "exec", "eslint", "--", "app/dashboard/gestion-comercial", "lib/commercial-report-export.ts", "lib/commercialDocumentPdf.ts", "test/commercial-visit-selection.test.mjs"]);
  run("web_typecheck", "npm", ["--workspace", "apps/web", "run", "typecheck"]);
  run("web_production_build", "npm", ["--workspace", "apps/web", "run", "build"]);
  run("protected_module_regression", "node", ["--test", "apps/api/test/rbac-module-access.test.js", "apps/api/test/purchases-supplier-flow.test.js", "apps/api/test/purchase-order-entry-grid.test.js", "apps/api/test/purchase-order-close-pdf.test.js", "apps/api/test/inventory-valuation-transit.test.js", "apps/api/test/service-order-items-domain.test.js", "apps/api/test/supabase-auth-modules.test.js"]);
  const evidence = { change_id: "commercial-management-m27-20260901", status: "passed", commit: process.env.CERTIFIED_COMMIT || "WORKTREE", started_at: startedAt, finished_at: new Date().toISOString(), checks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`CERTIFICACION M-27 APROBADA: ${output}`);
} catch (error) {
  const evidence = { change_id: "commercial-management-m27-20260901", status: "failed", commit: process.env.CERTIFIED_COMMIT || "WORKTREE", started_at: startedAt, finished_at: new Date().toISOString(), error: error.message, checks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(error.message);
  process.exit(1);
}
