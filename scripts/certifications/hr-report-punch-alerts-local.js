// Certificacion LOCAL del reflejo de alertas criticas de marcacion (puntualidad)
// en el reporte de Talento Humano ("Detalle profesional de jornada").
//
// Alcance certificado:
//   - apps/web/lib/punchPunctuality.ts es la fuente unica de las reglas de puntualidad
//     (En punto / Anticipado / Dentro de tolerancia / Tarde / Cierre a tiempo /
//      Cierre anticipado / Salida temprana) compartida por el monitor de rutas y el reporte.
//   - El reporte muestra una columna "Alertas" con una insignia por marcacion critica
//     (entrada y cierre), insignias en el detalle de trazabilidad y columnas de alerta
//     en la exportacion Excel (Jornadas y Trazabilidad) mas el indicador de resumen.
//   - El monitor de rutas conserva su comportamiento (misma etiqueta e iconos) sin
//     logica duplicada.
//
// Este script NO toca base de datos ni ambientes remotos: ejecuta los suites unitarios
// versionados y aserciones de codigo. Sale con codigo distinto de cero ante cualquier fallo.

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
const WEB = path.join(ROOT, "apps/web");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-report-punch-alerts-20260928/local-certification.json"));

const LIB = path.join(WEB, "lib/punchPunctuality.ts");
const REPORT_PAGE = path.join(WEB, "app/dashboard/talento-humano/reportes/page.tsx");
const ROUTES_PAGE = path.join(WEB, "app/dashboard/talento-humano/rutas/page.tsx");

const result = {
  change_id: "hr-report-alerts-presentation-20261001",
  certification: "hr-report-punch-alerts-local",
  environment: "LOCAL",
  generated_at: new Date().toISOString(),
  scope: {
    capability: "Las alertas criticas de marcacion (tarde, dentro de tolerancia, salida temprana, etc.) calculadas por el monitor de rutas se reflejan por marcacion en el reporte de Talento Humano: columna Alertas, detalle de trazabilidad y exportacion Excel.",
    proven_by_versioned_unit_suite: [
      "apps/web/test/hr-report-punch-alerts.test.mjs (4 controles)",
      "apps/web/test/hr-reports-xlsx.test.mjs (2 controles)",
      "apps/web/test/hr-monitor-modal-per-user.test.mjs (8 controles)"
    ],
    proven_by_code_level_assertion: [
      "lib/punchPunctuality.ts concentra las reglas de puntualidad y los nombres de marcacion",
      "reportes/page.tsx renderiza la columna Alertas, las insignias del detalle y las columnas alerta_entrada/alerta_cierre/alerta del Excel",
      "rutas/page.tsx consume el lib compartido sin duplicar la logica de puntualidad"
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

function readSource(file) {
  return fs.readFileSync(file, "utf8");
}

function runSuite(files, expectedPass) {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { cwd: WEB, encoding: "utf8" });
  const out = `${run.stdout || ""}${run.stderr || ""}`;
  return {
    exit: run.status,
    pass: Number((out.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1] || 0),
    fail: Number((out.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1] || 0),
    expectedPass
  };
}

function main() {
  check("lib_punchPunctuality_exists", fs.existsSync(LIB), { lib: path.relative(ROOT, LIB) });

  const libSrc = readSource(LIB);
  check("lib_concentrates_punctuality_rules", [
    /export function punctualityAlert/,
    /Dentro de tolerancia \(\+\$\{diff\} min\)/,
    /Tarde \$\{diff\} min/,
    /Salida temprana \$\{diff\} min/,
    /Cierre anticipado \$\{diff\} min/,
    /export function punchClockTime/,
    /America\/Bogota/
  ].every((pattern) => pattern.test(libSrc)), { rules: true });

  const reportSrc = readSource(REPORT_PAGE);
  check("report_renders_alert_column_and_badges", [
    /from "@\/lib\/punchPunctuality"/,
    /"Cierre", "Alertas", "Laboradas"/,
    /function PunchAlertStack/,
    /function reportPunchAlerts/,
    /alerts\.map/,
    /rowKey=\{row\.key\}/,
    /w-\[22rem\]/,
    /const punchAlerts = reportPunchAlerts\(entry, exit, route\)/,
    /<Badge className="min-h-8 w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-left leading-4"/,
    /colSpan=\{13\}/
  ].every((pattern) => pattern.test(reportSrc)) && !/const punchAlerts = events\.flatMap/.test(reportSrc), { column: /"Alertas"/.test(reportSrc) });

  check("report_exports_alerts_in_xlsx", [
    /alerta_entrada: row\.punchAlerts\.find\(\(alert\) => alert\.type === "entrada"\)/,
    /alerta_cierre: row\.punchAlerts\.find\(\(alert\) => alert\.type === "salida"\)/,
    /alerta: event\.alert\?\.label \|\| ""/,
    /Jornadas con alerta critica/
  ].every((pattern) => pattern.test(reportSrc)), { xlsx: true });

  check("report_detail_shows_alert_badge", /event\.alert \? <Badge tone=\{event\.alert\.tone\}>\{event\.alert\.label\}<\/Badge> : null/.test(reportSrc), { detail: true });

  const routesSrc = readSource(ROUTES_PAGE);
  check("routes_monitor_shares_lib_without_duplication", [
    /from "@\/lib\/punchPunctuality"/,
    /punctualityAlert\(\{/
  ].every((pattern) => pattern.test(routesSrc))
    && !/function minutesFromTime/.test(routesSrc)
    && !/Tarde \$\{diff\} min/.test(routesSrc), { shared: true });

  const punchAlerts = runSuite(["test/hr-report-punch-alerts.test.mjs"], 4);
  check("unit_suite_punch_alerts_passes", punchAlerts.exit === 0 && punchAlerts.fail === 0 && punchAlerts.pass === 4, punchAlerts);

  const reportsXlsx = runSuite(["test/hr-reports-xlsx.test.mjs"], 2);
  check("unit_suite_reports_xlsx_passes", reportsXlsx.exit === 0 && reportsXlsx.fail === 0 && reportsXlsx.pass === 2, reportsXlsx);

  const monitorModal = runSuite(["test/hr-monitor-modal-per-user.test.mjs"], 8);
  check("unit_suite_monitor_modal_passes", monitorModal.exit === 0 && monitorModal.fail === 0 && monitorModal.pass === 8, monitorModal);

  result.versioned_suites = {
    "apps/web/test/hr-report-punch-alerts.test.mjs": { pass: punchAlerts.pass, fail: punchAlerts.fail },
    "apps/web/test/hr-reports-xlsx.test.mjs": { pass: reportsXlsx.pass, fail: reportsXlsx.fail },
    "apps/web/test/hr-monitor-modal-per-user.test.mjs": { pass: monitorModal.pass, fail: monitorModal.fail }
  };
  result.status = "passed";
}

try {
  main();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`CERTIFICACION ALERTAS DE MARCACION EN REPORTE APROBADA: ${result.checks.length} controles, status=${result.status}`);
} catch (error) {
  result.status = "failed";
  result.error = { message: error.message, stack: error.stack };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.error(`CERTIFICACION ALERTAS DE MARCACION EN REPORTE BLOQUEADA: ${error.message}`);
  process.exitCode = 1;
}
