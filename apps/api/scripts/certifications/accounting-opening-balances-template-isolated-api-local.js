const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../..");
const API_ROOT = path.resolve(__dirname, "../..");
const OUTPUT = path.resolve(process.env.OUTPUT || path.join(ROOT, "docs", "qa", "evidence", "gastos-saldos-iniciales-20261014", "accounting-opening-balances-template-isolated-api-local.json"));
const LOCAL_DATABASE_URL = "postgresql://apex@127.0.0.1:55439/apex_test";

function check(result, name, condition, detail = {}) {
  result.checks.push({ name, status: condition ? "passed" : "failed", detail });
  assert.ok(condition, `${name} failed`);
}

function runCommand(command, args, options) {
  if (process.platform !== "win32") return execFileSync(command, args, options);
  const quote = (value) => {
    const text = String(value);
    return /[\s"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
  };
  const commandLine = [command, ...args].map(quote).join(" ");
  return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], options);
}

function runIsolatedApi(tempRoot) {
  const runner = path.join(tempRoot, "run-template.js");
  fs.writeFileSync(runner, `
process.env.REDIS_DISABLED = "true";
const ExcelJS = require("exceljs");
const service = require("./src/modules/accounting/service");
(async () => {
  const buffer = await service.createOpeningBalancesTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Saldos iniciales");
  if (!sheet) throw new Error("missing expected worksheet");
  const headers = sheet.getRow(4).values.slice(1).map((value) => String(value || "").trim());
  sheet.addRow([new Date("2026-01-31T00:00:00Z"), "110505", "CC-001", "SUC-001", 1250.5, ""]);
  sheet.addRow([new Date("2026-01-31T00:00:00Z"), "220505", "CC-001", "SUC-001", -1250.5, ""]);
  const roundtripBuffer = await workbook.xlsx.writeBuffer();
  const roundtrip = new ExcelJS.Workbook();
  await roundtrip.xlsx.load(roundtripBuffer);
  const roundtripSheet = roundtrip.getWorksheet("Saldos iniciales");
  const positive = roundtripSheet.getRow(5).getCell(5).value;
  const negative = roundtripSheet.getRow(6).getCell(5).value;
  process.stdout.write(JSON.stringify({
    exceljs_path: require.resolve("exceljs"),
    exceljs_version: require("exceljs/package.json").version,
    buffer_bytes: buffer.length,
    headers,
    positive,
    negative
  }));
})().catch((error) => { process.stderr.write(String(error.message)); process.exit(1); });
`, "utf8");
  const { NODE_PATH: ignoredNodePath, ...baseEnv } = process.env;
  const env = {
    ...baseEnv,
    NODE_ENV: "test",
    REDIS_DISABLED: "true",
    DATABASE_URL: LOCAL_DATABASE_URL
  };
  const output = execFileSync(process.execPath, [runner], { cwd: tempRoot, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output);
}

async function main() {
  const result = {
    certification: "accounting-opening-balances-template-isolated-api-local",
    certification_role: "local_api_dependency_isolation_support",
    environment: "LOCAL_ISOLATED_API",
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    status: "running",
    generated_at: new Date().toISOString(),
    checks: [],
    limitations: [
      "Instala dependencias de produccion en una carpeta temporal; no conecta a PostgreSQL, Supabase, Railway ni una base remota.",
      "No acredita el flujo de navegador QA ni el posteo transaccional contra QA."
    ]
  };
  let tempRoot;
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(API_ROOT, "package.json"), "utf8"));
    check(result, "api_package_declares_exceljs_exact_version", packageJson.dependencies?.exceljs === "4.4.0", { declared: packageJson.dependencies?.exceljs || null });
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apex-api-isolated-template-"));
    const runtimePackage = {
      name: "apex-opening-balances-isolated-runtime",
      private: true,
      dependencies: {
        exceljs: packageJson.dependencies.exceljs,
        "@prisma/client": packageJson.dependencies["@prisma/client"],
        prisma: packageJson.dependencies.prisma
      }
    };
    fs.writeFileSync(path.join(tempRoot, "package.json"), `${JSON.stringify(runtimePackage, null, 2)}\n`, "utf8");
    fs.cpSync(path.join(API_ROOT, "src"), path.join(tempRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "prisma"), { recursive: true });
    fs.copyFileSync(path.join(API_ROOT, "prisma", "schema.prisma"), path.join(tempRoot, "prisma", "schema.prisma"));
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    runCommand(npm, ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tempRoot, env: { ...process.env, NODE_PATH: undefined }, stdio: "ignore" });
    check(result, "isolated_node_modules_contains_exceljs", fs.existsSync(path.join(tempRoot, "node_modules", "exceljs")));
    const prismaBin = path.join(tempRoot, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
    runCommand(prismaBin, ["generate", "--schema", path.join(tempRoot, "prisma", "schema.prisma")], { cwd: tempRoot, env: { ...process.env, NODE_PATH: undefined, DATABASE_URL: LOCAL_DATABASE_URL }, stdio: "ignore" });
    const isolated = runIsolatedApi(tempRoot);
    check(result, "isolated_require_resolves_inside_temp_node_modules", isolated.exceljs_path.startsWith(path.join(tempRoot, "node_modules")), { path_root: isolated.exceljs_path.split("node_modules")[0] + "node_modules" });
    check(result, "isolated_runtime_uses_expected_exceljs_version", isolated.exceljs_version === "4.4.0", { version: isolated.exceljs_version });
    check(result, "isolated_service_generates_nonempty_xlsx", isolated.buffer_bytes > 1000, { bytes: isolated.buffer_bytes });
    check(result, "isolated_workbook_has_required_headers", JSON.stringify(isolated.headers) === JSON.stringify(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]), { headers: isolated.headers });
    check(result, "isolated_workbook_roundtrips_positive_and_negative_balances", Number(isolated.positive) === 1250.5 && Number(isolated.negative) === -1250.5, { positive: isolated.positive, negative: isolated.negative });
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error.message);
    throw error;
  } finally {
    const tempPrefix = path.join(os.tmpdir(), "apex-api-isolated-template-");
    if (tempRoot && tempRoot.startsWith(tempPrefix)) fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(`CERTIFICACION AISLADA API TEMPLATE ${result.status.toUpperCase()}: ${result.checks.length} controles, evidencia=${OUTPUT}`);
}

if (require.main === module) main().catch(() => process.exitCode = 1);

module.exports = { main };
