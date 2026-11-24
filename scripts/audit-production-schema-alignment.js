#!/usr/bin/env node

const loadEnv = require("./load-env");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
let prisma;

function resolveTarget() {
  const target = String(args.target || process.env.TARGET_ENV || "").toLowerCase();
  if (target !== "qa" && target !== "production") {
    throw new Error("El destino debe ser qa o production.");
  }
  return target;
}

function assertTarget(target) {
  const expectedProject = target === "production"
    ? "jzbwzmkidfthknsohhnr"
    : "jbirkghkekuifgfsgquq";
  let databaseUrl;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL || "");
  } catch {
    throw new Error("DATABASE_URL debe ser una URL PostgreSQL válida.");
  }
  const host = databaseUrl.hostname.toLowerCase();
  const directHost = host === `db.${expectedProject}.supabase.co`
    && databaseUrl.username === "postgres";
  const sessionPooler = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(host)
    && databaseUrl.username === `postgres.${expectedProject}`;
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)
    || (!directHost && !sessionPooler)
    || (databaseUrl.port !== "" && databaseUrl.port !== "5432")
    || databaseUrl.pathname !== "/postgres"
    || databaseUrl.hash
    || [...databaseUrl.searchParams.keys()].some((key) => ["host", "hostaddr", "port", "user", "dbname", "options"].includes(key.toLowerCase()))) {
    throw new Error(`DATABASE_URL no corresponde al proyecto ${target} autorizado.`);
  }
}

async function main() {
  const target = resolveTarget();
  loadEnv(args["env-file"] || `config/${target}.env`);
  assertTarget(target);

  const { Prisma } = require("@prisma/client");
  const models = Prisma?.dmmf?.datamodel?.models;
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error("El cliente Prisma debe contener modelos para auditar.");
  }
  prisma = require("../apps/api/src/core/prisma");
  const columns = await prisma.$queryRawUnsafe(
    "select table_name, column_name from information_schema.columns where table_schema = 'public'"
  );
  const catalog = new Map();
  for (const row of columns) {
    if (!catalog.has(row.table_name)) catalog.set(row.table_name, new Set());
    catalog.get(row.table_name).add(row.column_name);
  }

  const missing_tables = [];
  const missing_columns = [];
  let columns_checked = 0;
  for (const model of models) {
    const table = model.dbName || model.name;
    if (!catalog.has(table)) {
      missing_tables.push({ model: model.name, table });
      continue;
    }
    for (const field of model.fields) {
      if (!["scalar", "enum"].includes(field.kind) || field.relationName) continue;
      columns_checked += 1;
      const column = field.dbName || field.name;
      if (!catalog.get(table).has(column)) missing_columns.push({ model: model.name, table, column });
    }
  }

  const result = {
    ok: missing_tables.length === 0 && missing_columns.length === 0,
    environment: target,
    models_checked: models.length,
    // Presence only: no validation of types, enum values, constraints, RLS or data.
    scope: "presence_only_public_tables_and_scalar_enum_columns",
    columns_checked,
    missing_tables,
    missing_columns
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(() => {
  console.error("[schema-alignment] No se pudo completar la auditoría de presencia del esquema; revise destino, configuración, modelos y acceso.");
  process.exitCode = 1;
}).finally(async () => {
  if (!prisma) return;
  try {
    await prisma.$disconnect();
  } catch {
    console.error("[schema-alignment] No se pudo cerrar la conexión de auditoría.");
    process.exitCode = 1;
  }
});
