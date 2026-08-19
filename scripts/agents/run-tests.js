#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, output, parseOption, run } = require("./lib");

const profile = parseOption("profile", "safe");
const profiles = {
  static: [
    ["runtime", "npm", ["run", "doctor:node"]],
    ["prisma", "npm", ["run", "prisma:validate"]],
    ["lint", "npm", ["run", "lint"]],
    ["typecheck", "npm", ["--workspace", "apps/web", "run", "typecheck"]]
  ],
  unit: [
    ["inventory-unit", "npm", ["run", "test:inventory:unit"]]
  ]
};
profiles.safe = [...profiles.static, ...profiles.unit,
  ["web-build", "npm", ["--workspace", "apps/web", "run", "build"]]
];

if (!profiles[profile]) {
  console.error(`Perfil desconocido "${profile}". Usar: static, unit o safe.`);
  process.exit(2);
}

const branchCheck = run(process.execPath, ["scripts/agents/assert-safe-branch.js"]);
if (branchCheck.status !== 0) {
  console.error(output(branchCheck));
  process.exit(branchCheck.status || 1);
}

const results = [];
for (const [name, command, args] of profiles[profile]) {
  const startedAt = Date.now();
  console.log(`\n[RUN] ${command} ${args.join(" ")}`);
  const result = run(command, args);
  const durationMs = Date.now() - startedAt;
  const combined = output(result);
  if (combined) console.log(combined);
  const passed = result.status === 0;
  results.push({
    name,
    command: [command, ...args].join(" "),
    status: passed ? "passed" : "failed",
    exit_code: result.status,
    duration_ms: durationMs
  });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name} (${durationMs} ms)`);
}

const reportDir = path.join(ROOT, ".agents", "reports");
fs.mkdirSync(reportDir, { recursive: true });
const report = {
  generated_at: new Date().toISOString(),
  profile,
  summary: {
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    not_run: profiles[profile].length - results.length
  },
  results
};
fs.writeFileSync(path.join(reportDir, "latest-test-results.json"), JSON.stringify(report, null, 2));

if (report.summary.failed) process.exit(1);
console.log(`\n[OK] Perfil ${profile} completado.`);
