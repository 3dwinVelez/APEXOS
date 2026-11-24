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
let report;
try {
  report = JSON.parse(fs.readFileSync(path.join(reportsDir, reportFile), "utf8"));
} catch {
  console.error(`[performance] No se pudo leer o parsear el reporte JSON ${reportFile}.`);
  process.exit(1);
}
if (!report || !Array.isArray(report.results)) {
  console.error(`[performance] Reporte invalido ${reportFile}: results debe ser un array.`);
  process.exit(1);
}

const budgets = {
  frontend_document: Number(process.env.PERF_FRONTEND_DOCUMENT_P95_MS ?? 1000),
  api: Number(process.env.PERF_API_P95_MS ?? 1000),
  supabase_rest: Number(process.env.PERF_SUPABASE_P95_MS ?? 700)
};
const minimumConcurrency = Number(process.env.PERF_GUARD_CONCURRENCY ?? 10);
if (Object.values(budgets).some((budget) => !Number.isFinite(budget) || budget <= 0)) {
  console.error("[performance] Configuracion invalida: los presupuestos deben ser numeros finitos > 0.");
  process.exit(1);
}
if (!Number.isInteger(minimumConcurrency) || minimumConcurrency < 1) {
  console.error("[performance] Configuracion invalida: PERF_GUARD_CONCURRENCY debe ser un entero >= 1.");
  process.exit(1);
}

// La elegibilidad depende solo de categoria conocida y concurrencia exacta, no de las metricas.
const evaluated = report.results.filter((row) => row?.concurrency === minimumConcurrency
  && typeof row.category === "string" && Object.hasOwn(budgets, row.category));
if (!evaluated.length) {
  console.error(`[performance] No hay objetivos elegibles en ${reportFile} para concurrency=${minimumConcurrency}.`);
  process.exit(1);
}

const failures = [];
for (const row of evaluated) {
  const reasons = [];
  const validP95 = Number.isFinite(row.p95_ms) && row.p95_ms >= 0;
  const validErrors = Number.isInteger(row.errors) && row.errors >= 0;
  const validRequests = Number.isInteger(row.requests) && row.requests >= minimumConcurrency;
  if (!validP95) reasons.push("p95_ms debe ser un number finito >= 0");
  if (!validErrors) reasons.push("errors debe ser un entero >= 0");
  if (!validRequests) reasons.push(`requests debe ser un entero >= ${minimumConcurrency}`);
  if (validErrors && validRequests && row.errors > row.requests) reasons.push("errors > requests");
  if (validErrors && row.errors > 0) reasons.push("errors > 0");
  if (validP95 && row.p95_ms > budgets[row.category]) reasons.push("p95_ms supera el presupuesto");
  if (reasons.length) failures.push({ row, reasons });
}

const display = (value) => value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
console.log(`[performance] report=${reportFile} targets=${evaluated.length} failures=${failures.length}`);
for (const { row, reasons } of failures) {
  console.error(`[performance] ${row.category}/${display(row.target)} p95=${display(row.p95_ms)}ms budget=${budgets[row.category]}ms errors=${display(row.errors)}: ${reasons.join("; ")}`);
}
if (failures.length) process.exit(1);
