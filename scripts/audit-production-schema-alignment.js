#!/usr/bin/env node

const { Prisma } = require("@prisma/client");
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
loadEnv(args["env-file"] || "config/production.env");

const prisma = require("../apps/api/src/core/prisma");

function assertTarget() {
  const target = String(args.target || process.env.TARGET_ENV || "").toLowerCase();
  const expectedProject = target === "production"
    ? "jzbwzmkidfthknsohhnr"
    : target === "qa"
      ? "jbirkghkekuifgfsgquq"
      : "";
  if (!expectedProject) throw new Error("El destino debe ser qa o production.");
  if (!String(process.env.DATABASE_URL || "").includes(expectedProject)) {
    throw new Error(`DATABASE_URL no corresponde al proyecto ${target} autorizado.`);
  }
  return target;
}

async function main() {
  const target = assertTarget();
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
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    if (!catalog.has(table)) {
      missing_tables.push({ model: model.name, table });
      continue;
    }
    for (const field of model.fields) {
      if (field.kind !== "scalar" || field.relationName) continue;
      const column = field.dbName || field.name;
      if (!catalog.get(table).has(column)) missing_columns.push({ model: model.name, table, column });
    }
  }

  const result = {
    ok: missing_tables.length === 0 && missing_columns.length === 0,
    environment: target,
    models_checked: Prisma.dmmf.datamodel.models.length,
    missing_tables,
    missing_columns
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[schema-alignment] ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
