const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationsRoot = path.resolve(__dirname, "../prisma/migrations");
const baseName = "20260814140000_commercial_management_base";
const firstAlterName = "20260814150000_commercial_visit_scheduling";

test("la cadena comercial crea su esquema antes de alterarlo", () => {
  const names = fs.readdirSync(migrationsRoot).filter((name) => /^\d+_/.test(name)).sort();
  assert.ok(names.includes(baseName), "Falta la migracion base comercial");
  assert.ok(names.indexOf(baseName) < names.indexOf(firstAlterName), "La base debe ejecutarse antes de las extensiones comerciales");

  const sql = fs.readFileSync(path.join(migrationsRoot, baseName, "migration.sql"), "utf8");
  const requiredTables = [
    "commercial_advisors",
    "commercial_customers",
    "commercial_periods",
    "commercial_advisor_budgets",
    "commercial_customer_budgets",
    "commercial_visits",
    "commercial_products",
    "commercial_sales_orders",
    "commercial_sales_order_lines"
  ];

  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`), `${table} debe tener creacion versionada`);
  }
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i, "La migracion base no puede borrar datos ni relaciones");
});

test("las rutas que fallaron en QA permanecen registradas en el API", () => {
  const server = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/commercial-management/routes.js"), "utf8");
  assert.match(server, /registerRoutes\("commercial-management"/);
  assert.match(routes, /fastify\.get\("\/commercial-management\/commitments"/);
  assert.match(routes, /fastify\.get\("\/commercial-management\/visits"/);
});
