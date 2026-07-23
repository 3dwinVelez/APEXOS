const fs = require("node:fs");
const path = require("node:path");

const reportsDir = path.resolve(process.cwd(), "reports", "performance");
const files = fs.existsSync(reportsDir)
  ? fs.readdirSync(reportsDir).filter((file) => file.startsWith("qa-root-cause-") && file.endsWith(".json")).sort()
  : [];

if (!files.length) {
  console.error("[performance] No existe una linea base. Ejecuta npm run qa:root-cause.");
  process.exit(1);
}

const reportFile = files.at(-1);
const report = JSON.parse(fs.readFileSync(path.join(reportsDir, reportFile), "utf8"));
const budgets = {
  frontend_document: Number(process.env.PERF_FRONTEND_DOCUMENT_P95_MS || 1000),
  api: Number(process.env.PERF_API_P95_MS || 1000),
  supabase_rest: Number(process.env.PERF_SUPABASE_P95_MS || 700)
};
const minimumConcurrency = Number(process.env.PERF_GUARD_CONCURRENCY || 10);
const evaluated = (report.results || []).filter((row) => row.concurrency === minimumConcurrency && budgets[row.category]);
const failures = evaluated.filter((row) => row.errors > 0 || row.p95_ms > budgets[row.category]);

console.log(`[performance] report=${reportFile} targets=${evaluated.length} failures=${failures.length}`);
for (const row of failures) {
  console.error(`[performance] ${row.category}/${row.target} p95=${row.p95_ms}ms budget=${budgets[row.category]}ms errors=${row.errors}`);
}
if (failures.length) process.exit(1);
