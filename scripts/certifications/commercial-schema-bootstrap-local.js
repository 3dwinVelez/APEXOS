const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const output = path.resolve(root, process.argv[2] || "docs/qa/evidence/commercial-schema-bootstrap-20260903/certification.json");
const pgBin = process.env.POSTGRES_BIN || "C:/Program Files/PostgreSQL/16/bin";
const commercialMigrations = [
  "20260814140000_commercial_management_base",
  "20260814150000_commercial_visit_scheduling",
  "20260814170000_commercial_advisor_masters",
  "20260814190000_commercial_customer_details",
  "20260828143000_commercial_visit_masters",
  "20260828170000_commercial_customer_commitments",
  "20260828203000_commercial_visit_timeline_catalog_bridge",
  "20260829100000_commercial_quotations",
  "20260829113000_commercial_daily_budgets",
  "20260831120000_commercial_prospect_visits"
];
const checks = [];
const startedAt = new Date().toISOString();
let temporaryRoot;
let dataDirectory;
let port;

function executable(name) {
  return path.join(pgBin, process.platform === "win32" ? `${name}.exe` : name);
}

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    stdio: options.stdio || "pipe"
  });
  checks.push({
    name,
    status: result.status === 0 ? "passed" : "failed",
    command: [command, ...args].join(" "),
    exit_code: result.status,
    stdout: String(result.stdout || "").slice(-8000),
    stderr: String(result.stderr || "").slice(-8000)
  });
  if (result.status !== 0) throw new Error(`${name} fallo con codigo ${result.status}: ${result.stderr || result.stdout}`);
}

function psql(name, database, args) {
  run(name, executable("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database, ...args]);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const selected = server.address().port;
      server.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

function writeEvidence(status, error) {
  const evidence = {
    change_id: "commercial-schema-bootstrap-20260903",
    status,
    environment: "DISPOSABLE_LOCAL_POSTGRESQL_16",
    commit: process.env.CERTIFIED_COMMIT || "WORKTREE",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    remote_qa: "not_executed_requires_independent_authorization",
    error: error || null,
    checks
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function main() {
  port = await reservePort();
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-commercial-schema-"));
  dataDirectory = path.join(temporaryRoot, "data");
  const dependenciesSql = path.join(temporaryRoot, "dependencies.sql");
  const verificationSql = path.join(temporaryRoot, "verification.sql");

  fs.writeFileSync(dependenciesSql, [
    'CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);',
    'CREATE TABLE "Category" ("id" SERIAL PRIMARY KEY);',
    'CREATE TABLE "Item" ("id" SERIAL PRIMARY KEY);',
    'INSERT INTO "Tenant" ("id") VALUES (\'tenant-a\'), (\'tenant-b\');'
  ].join("\n"));
  fs.writeFileSync(verificationSql, `
DO $$
DECLARE relation_count integer;
BEGIN
  SELECT count(*) INTO relation_count
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname LIKE 'commercial_%'
    AND relkind = 'r';
  IF relation_count <> 18 THEN
    RAISE EXCEPTION 'expected 18 commercial tables, got %', relation_count;
  END IF;
END $$;

INSERT INTO commercial_advisors (tenant_id, code, name, updated_at)
VALUES ('tenant-a', 'ADV-1', 'Asesor QA', CURRENT_TIMESTAMP);
INSERT INTO commercial_customers (tenant_id, code, legal_name, advisor_id, updated_at)
VALUES ('tenant-a', 'CLI-1', 'Cliente QA', 1, CURRENT_TIMESTAMP);
INSERT INTO commercial_visits (tenant_id, advisor_id, customer_id, visit_date, visit_type, created_at, updated_at)
VALUES ('tenant-a', 1, 1, CURRENT_TIMESTAMP, 'IN_PERSON', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO commercial_customer_commitments (tenant_id, customer_id, advisor_id, visit_id, description, due_date, updated_at)
VALUES ('tenant-a', 1, 1, 1, 'Seguimiento QA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DO $$
BEGIN
  IF (SELECT count(*) FROM commercial_settings) <> 2 THEN RAISE EXCEPTION 'settings seed incomplete'; END IF;
  IF (SELECT count(*) FROM commercial_visit_reasons) <> 8 THEN RAISE EXCEPTION 'reasons seed incomplete'; END IF;
  IF (SELECT count(*) FROM commercial_visit_results) <> 12 THEN RAISE EXCEPTION 'results seed incomplete'; END IF;
  IF (SELECT count(*) FROM commercial_visits WHERE tenant_id = 'tenant-b') <> 0 THEN RAISE EXCEPTION 'visit tenant leakage'; END IF;
  IF (SELECT count(*) FROM commercial_customer_commitments WHERE tenant_id = 'tenant-b') <> 0 THEN RAISE EXCEPTION 'commitment tenant leakage'; END IF;
END $$;
`);

  run("postgres_init", executable("initdb"), ["-D", dataDirectory, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
  run("postgres_start", executable("pg_ctl"), ["-D", dataDirectory, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  run("database_create", executable("createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "commercial_schema_cert"]);
  run("flow_database_create", executable("createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "commercial_flow_cert"]);
  psql("dependency_bootstrap", "commercial_schema_cert", ["-f", dependenciesSql]);

  for (const migration of commercialMigrations) {
    const file = path.join(root, "apps/api/prisma/migrations", migration, "migration.sql");
    psql(`migration_${migration}`, "commercial_schema_cert", ["-f", file]);
  }
  psql("schema_and_minimal_flow", "commercial_schema_cert", ["-f", verificationSql]);

  run("migration_contracts", process.execPath, ["--test", "apps/api/test/commercial-migration-chain.test.js"]);
  run("commercial_api_contracts", process.execPath, ["--test", "apps/api/test/commercial-management-contract.test.js"]);
  const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  run("prisma_schema", process.execPath, [npmCli, "run", "prisma:validate"]);
  run("prisma_client", process.execPath, [npmCli, "run", "prisma:generate"]);
  const flowDatabaseUrl = `postgresql://postgres@127.0.0.1:${port}/commercial_flow_cert?schema=public`;
  run("flow_schema_push", process.execPath, [npmCli, "run", "db:push"], { env: { DATABASE_URL: flowDatabaseUrl } });
  run("commercial_route_registration", process.execPath, ["--test", "apps/api/test/commercial-route-registration.integration.test.js"], {
    env: { DATABASE_URL: flowDatabaseUrl, COMMERCIAL_ROUTE_INTEGRATION: "1", REDIS_DISABLED: "true", DISABLE_REDIS: "true", JWT_SECRET: "commercial-route-certification-secret-with-32-characters" }
  });
  run("commercial_service_flow", process.execPath, ["--test", "apps/api/test/commercial-document-flow.integration.test.js"], {
    env: { DATABASE_URL: flowDatabaseUrl, COMMERCIAL_LOCAL_INTEGRATION: "1", REDIS_DISABLED: "true", DISABLE_REDIS: "true" }
  });
  run("commercial_web_contracts", process.execPath, ["--test", "apps/web/test/commercial-visit-selection.test.mjs", "apps/web/test/commercial-module-catalog.test.mjs"]);
  run("rbac_and_tenant_regression", process.execPath, ["--test", "apps/api/test/rbac-module-access.test.js", "apps/api/test/supabase-auth-modules.test.js"]);
  writeEvidence("passed");
  console.log(`CERTIFICACION ESQUEMA COMERCIAL APROBADA: ${output}`);
}

main().catch((error) => {
  writeEvidence("failed", error.message);
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => {
  if (dataDirectory && fs.existsSync(dataDirectory)) {
    spawnSync(executable("pg_ctl"), ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { encoding: "utf8", windowsHide: true, shell: false, stdio: "ignore" });
  }
  if (temporaryRoot && fs.existsSync(temporaryRoot) && path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir()))) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
