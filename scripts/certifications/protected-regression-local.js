#!/usr/bin/env node

/*
 * Local protected regression for the accounting/cash/purchases/inventory scope.
 *
 * This certificate deliberately runs the repository's versioned suites as child
 * processes so one failing or skipped suite cannot be hidden by a later pass.
 * It is a local pre-QA certificate; it does not call Railway or Supabase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const git = (args, options) => execFileSync("git", args, options);

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const root = path.resolve(rootArg ? rootArg.slice("--root=".length) : path.resolve(__dirname, "../.."));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const output = outputArg ? path.resolve(root, outputArg.slice("--output=".length)) : null;

const databaseUrl = String(process.env.DATABASE_URL || "");

function localDatabaseGuard() {
  if (!databaseUrl) return { status: "blocked", reason: "DATABASE_URL no configurada" };
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { return { status: "blocked", reason: "DATABASE_URL invalida" }; }
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    return { status: "blocked", reason: `DATABASE_URL no es local (${parsed.hostname})` };
  }
  return { status: "passed", host: parsed.hostname, port: parsed.port || "5432" };
}

function runSuite(file, extraEnv = {}) {
  const started = Date.now();
  try {
    const stdout = execFileSync(process.execPath, ["--test", file], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DISABLE_REDIS: "true", REDIS_DISABLED: "true", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { file, status: "passed", duration_ms: Date.now() - started, output_tail: stdout.slice(-1200) };
  } catch (error) {
    return {
      file,
      status: "failed",
      duration_ms: Date.now() - started,
      exit_code: error.status ?? 1,
      output_tail: `${String(error.stdout || "")}\n${String(error.stderr || "")}`.slice(-2400)
    };
  }
}

function main() {
  const database = localDatabaseGuard();
  if (database.status !== "passed") {
    const blocked = {
      certification: "protected-regression-local",
      version: 1,
      certification_role: "support_only",
      environment: "LOCAL",
      status: "blocked",
      commit: git(["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      database,
      suites: [],
      limitations: ["No se ejecutaron suites porque el guard local bloqueo antes de cualquier prueba."]
    };
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(blocked, null, 2)}\n`);
    }
    console.log(JSON.stringify(blocked, null, 2));
    process.exitCode = 1;
    return;
  }
  const suites = [
    { capability: "accounting_opening_balances_and_numbering", file: "apps/api/test/accounting-opening-balances.test.js" },
    { capability: "accounting_routes_contract", file: "apps/api/test/accounting-routes-contract.test.js" },
    { capability: "petty_cash_masters_and_numbering_GM_APC_LCM", file: "apps/api/test/petty-cash-masters.test.js" },
    { capability: "petty_cash_vouchers_and_reversal", file: "apps/api/test/petty-cash-vouchers.test.js" },
    { capability: "petty_cash_reports", file: "apps/api/test/petty-cash-reports.test.js" },
    { capability: "purchases_supplier_and_transaction_flow", file: "apps/api/test/purchases-supplier-flow.test.js" },
    { capability: "purchases_invoice_transaction", file: "apps/api/test/purchase-invoice-transaction.test.js" },
    { capability: "inventory_adjustments_and_accounting", file: "apps/api/test/inventory-adjustments-contract.test.js" },
    { capability: "inventory_transfer_tenancy", file: "apps/api/test/inventory-transfer-tenancy-contract.test.js" },
    { capability: "rbac_module_access", file: "apps/api/test/rbac-module-access.test.js" }
  ];
  const results = suites.map(({ capability, file }) => ({ capability, ...runSuite(file) }));
  const missing = suites.filter(({ file }) => !fs.existsSync(path.join(root, file))).map(({ file }) => file);
  const failed = results.filter((result) => result.status !== "passed");
  const result = {
    certification: "protected-regression-local",
    version: 1,
    certification_role: "support_only",
    environment: "LOCAL",
    status: database.status === "passed" && !missing.length && !failed.length ? "passed" : "failed",
    commit: git(["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    database,
    coverage_mode: "versioned_contract_and_service_harness",
    suites: results,
    missing,
    limitations: [
      "Esta certificacion no sustituye la certificacion de navegador en QA ni la regresion sobre el commit desplegado.",
      "Las suites seleccionadas incluyen contratos y harnesses de servicio; cualquier flujo de base local o navegador debe adjuntarse por separado.",
      "No se ejecutan llamadas a Railway, Supabase ni migraciones remotas."
    ]
  };
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "passed") process.exitCode = 1;
}

main();
