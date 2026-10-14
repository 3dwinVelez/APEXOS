const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ExcelJS = require("exceljs");

process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";

const ROOT = path.resolve(__dirname, "../../../..");
const API_ROOT = path.resolve(__dirname, "../..");
const OUTPUT = path.resolve(process.env.OUTPUT || path.join(ROOT, "docs", "qa", "evidence", "gastos-saldos-iniciales-20261014", "accounting-opening-balances-template-api-local.json"));
const SERVICE_SOURCE = fs.readFileSync(path.join(API_ROOT, "src", "modules", "accounting", "service.js"), "utf8");
const ROUTES_SOURCE = fs.readFileSync(path.join(API_ROOT, "src", "modules", "accounting", "routes.js"), "utf8");
const PACKAGE = JSON.parse(fs.readFileSync(path.join(API_ROOT, "package.json"), "utf8"));

function check(result, name, condition, detail = {}) {
  result.checks.push({ name, status: condition ? "passed" : "failed", detail });
  assert.ok(condition, `${name} failed`);
}

async function main() {
  const result = {
    certification: "accounting-opening-balances-template-api-local",
    certification_role: "local_api_dependency_support",
    environment: "LOCAL",
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    status: "running",
    generated_at: new Date().toISOString(),
    checks: [],
    limitations: [
      "No conecta a PostgreSQL, Supabase, Railway ni una base remota.",
      "No acredita la certificacion funcional de navegador ni el posteo transaccional contra QA."
    ]
  };
  try {
    check(result, "api_declares_exceljs_runtime_dependency", PACKAGE.dependencies?.exceljs === "4.4.0", { declared: PACKAGE.dependencies?.exceljs || null });
    check(result, "api_resolves_exceljs", require.resolve("exceljs", { paths: [API_ROOT] }), { version: require("exceljs/package.json").version });

    const service = require(path.join(API_ROOT, "src", "modules", "accounting", "service.js"));
    const buffer = await service.createOpeningBalancesTemplate();
    check(result, "service_generates_nonempty_xlsx", Buffer.isBuffer(buffer) && buffer.length > 1000, { bytes: buffer.length });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Saldos iniciales");
    check(result, "generated_workbook_has_expected_sheet", Boolean(sheet));
    const headers = sheet.getRow(4).values.slice(1).map((value) => String(value || "").trim());
    check(result, "generated_workbook_has_required_headers", JSON.stringify(headers) === JSON.stringify(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]), { headers });

    sheet.addRow([new Date("2026-01-31T00:00:00Z"), "110505", "CC-001", "SUC-001", 1250.5, ""]);
    sheet.addRow([new Date("2026-01-31T00:00:00Z"), "220505", "CC-001", "SUC-001", -1250.5, ""]);
    const positive = sheet.getRow(5).getCell(5).value;
    const negative = sheet.getRow(6).getCell(5).value;
    check(result, "positive_and_negative_balances_roundtrip_as_numbers", Number(positive) === 1250.5 && Number(negative) === -1250.5, { positive, negative });
    check(result, "service_contains_date_and_balance_validation", /OPENING_BALANCE_SINGLE_DATE/.test(SERVICE_SOURCE) && /OPENING_BALANCE_UNBALANCED/.test(SERVICE_SOURCE));
    check(result, "service_contains_period_and_master_contracts", /assertPeriodOpen/.test(SERVICE_SOURCE) && /DEFAULT_ACCOUNTING_DOCUMENT_TYPES/.test(SERVICE_SOURCE) && /mergeNumbering/.test(SERVICE_SOURCE));
    check(result, "route_contract_is_accounting_permission_protected", /accounting\/opening-balances\/template/.test(ROUTES_SOURCE) && /requirePermission\("accounting", "read"\)/.test(ROUTES_SOURCE) && /accounting\/opening-balances\/validate/.test(ROUTES_SOURCE) && /requirePermission\("accounting", "write"\)/.test(ROUTES_SOURCE));

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error.message);
    throw error;
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(`CERTIFICACION LOCAL API TEMPLATE ${result.status.toUpperCase()}: ${result.checks.length} controles, evidencia=${OUTPUT}`);
}

if (require.main === module) main().catch(() => process.exitCode = 1);

module.exports = { main };
