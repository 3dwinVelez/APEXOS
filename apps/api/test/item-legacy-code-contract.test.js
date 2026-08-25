const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "../..");

test("el maestro persiste y busca el codigo anterior sin reemplazar el SKU", () => {
  const schema = fs.readFileSync(path.join(apiRoot, "prisma/schema.prisma"), "utf8");
  const service = fs.readFileSync(path.join(apiRoot, "src/modules/inventory/service.js"), "utf8");
  assert.match(schema, /legacy_code\s+String\?/);
  assert.match(service, /legacy_code:\s*String\(legacy_code/);
  assert.match(service, /legacy_code:\s*\{ contains: search, mode: "insensitive" \}/);
});

test("inventario compras ventas y traslados filtran por codigo anterior", () => {
  const files = [
    "apps/web/app/dashboard/inventario/productos/page.tsx",
    "apps/web/app/dashboard/inventario/reportes/page.tsx",
    "apps/web/app/dashboard/inventario/stock/page.tsx",
    "apps/web/app/dashboard/inventario/traslados/nuevo/page.tsx",
    "apps/web/app/dashboard/compras/ordenes/nueva/page.tsx",
    "apps/web/app/dashboard/ventas/facturas/nueva/page.tsx"
  ];
  for (const file of files) assert.match(fs.readFileSync(path.join(repoRoot, file), "utf8"), /legacy_code/, file);
});
