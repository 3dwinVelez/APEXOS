// Certificacion LOCAL de las migraciones puntuales de Gastos Menores y Saldos Iniciales.
// Crea dos bases temporales propias en PostgreSQL local, nunca toca una base existente,
// y bloquea cualquier DATABASE_URL que no sea localhost/127.0.0.1.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function argsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return args;
}

const args = argsFrom(process.argv.slice(2));
const ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/gastos-saldos-iniciales-20261014/local-migrations.json"));
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const result = {
  change_id: "gastos-saldos-iniciales-migrations-local-20261014",
  certification: "expenses-opening-balances-migrations-local",
  environment: "LOCAL",
  generated_at: new Date().toISOString(),
  database_url_host: "redacted-local-only",
  checks: [],
  limitations: [
    "prisma migrate deploy no es aplicable sobre una base vacia porque la primera migracion historica 20260602_accounting_inventory_purchases_payroll asume las tablas Item y Place; esa limitacion se conserva como evidencia y no se modifica la migracion historica.",
    "Esta certificacion prueba las dos migraciones nuevas en bases temporales aisladas; no sustituye la certificacion funcional HTTP ni la certificacion navegador."
  ],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

function localDatabaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) return null;
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return null;
  return parsed;
}

function binary(name) {
  if (process.platform === "win32") {
    const candidate = path.join("C:", "Program Files", "PostgreSQL", "16", "bin", `${name}.exe`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return `${name}${process.platform === "win32" ? ".exe" : ""}`;
}

function run(command, args, env) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env }
  }).trim();
}

function psql(base, database, sql, env) {
  return run(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-h", base.hostname, "-p", String(base.port || 5432), "-U", decodeURIComponent(base.username || ""), "-d", database, "-At", "-c", sql], env);
}

function applySql(base, database, file, env) {
  return run(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-h", base.hostname, "-p", String(base.port || 5432), "-U", decodeURIComponent(base.username || ""), "-d", database, "-f", file], env);
}

function createDatabase(base, database, env) {
  run(binary("createdb"), ["-h", base.hostname, "-p", String(base.port || 5432), "-U", decodeURIComponent(base.username || ""), database], env);
}

function dropDatabase(base, database, env) {
  try { run(binary("dropdb"), ["--if-exists", "-h", base.hostname, "-p", String(base.port || 5432), "-U", decodeURIComponent(base.username || ""), database], env); } catch { /* best effort for the database created by this run */ }
}

async function main() {
  const base = localDatabaseUrl(DATABASE_URL);
  if (!base) throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL local (localhost/127.0.0.1)");
  const passwordEnv = base.password ? { PGPASSWORD: decodeURIComponent(base.password) } : {};
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const nullableDb = `apex_nullable_${suffix}`;
  const pettyDb = `apex_petty_${suffix}`;
  const nullableMigration = path.join(ROOT, "apps/api/prisma/migrations/20261014120000_accounting_opening_balances_nullable_party/migration.sql");
  const pettyMigration = path.join(ROOT, "apps/api/prisma/migrations/20261009180000_petty_cash_foundation/migration.sql");
  if (!fs.existsSync(nullableMigration) || !fs.existsSync(pettyMigration)) throw new Error("Faltan migraciones nuevas para certificar");
  try {
    createDatabase(base, nullableDb, passwordEnv);
    psql(base, nullableDb, `CREATE TABLE "cnt_cuedoc" ("id" serial PRIMARY KEY, "party_id" integer NOT NULL); INSERT INTO "cnt_cuedoc" ("party_id") VALUES (7);`, passwordEnv);
    applySql(base, nullableDb, nullableMigration, passwordEnv);
    const nullable = psql(base, nullableDb, `SELECT is_nullable FROM information_schema.columns WHERE table_name='cnt_cuedoc' AND column_name='party_id';`, passwordEnv);
    check("opening_balances_party_nullable", nullable === "YES", { is_nullable: nullable });

    createDatabase(base, pettyDb, passwordEnv);
    psql(base, pettyDb, `CREATE TABLE "Account" ("id" serial PRIMARY KEY, "tenant_id" text NOT NULL, "code" text NOT NULL, "name" text NOT NULL, "type" text NOT NULL, "active" boolean NOT NULL DEFAULT true, "allows_tx" boolean NOT NULL DEFAULT true); INSERT INTO "Account" ("tenant_id","code","name","type","active","allows_tx") VALUES ('tenant-cert','5395','Otros Gastos','expense',true,true);`, passwordEnv);
    applySql(base, pettyDb, pettyMigration, passwordEnv);
    const tables = psql(base, pettyDb, `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'petty_cash%';`, passwordEnv);
    const concepts = psql(base, pettyDb, 'SELECT count(*) FROM petty_cash_concepts;', passwordEnv);
    check("petty_cash_foundation_tables", tables === "5", { tables: Number(tables) });
    check("petty_cash_seeded_concepts", concepts === "7", { concepts: Number(concepts) });
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error?.message || error);
    throw error;
  } finally {
    const env = passwordEnv;
    dropDatabase(base, nullableDb, env);
    dropDatabase(base, pettyDb, env);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(`MIGRACIONES LOCALES BLOQUEADAS: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
