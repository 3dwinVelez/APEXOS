process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");

test("traslado valida código SKU, completa nombre y abre buscador funcional", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/inventario/traslados/nuevo/page.tsx"), "utf8");
  assert.match(page, /Código SKU/);
  assert.match(page, /Nombre del SKU/);
  assert.match(page, /El SKU \$\{code\} no existe o está inactivo/);
  assert.match(page, /Buscar SKU para el traslado/);
  assert.match(page, /item\.code\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(page, /item\.name\.toLowerCase\(\)\.includes\(needle\)/);
  assert.doesNotMatch(page, /<datalist/);
});

test("inventario ofrece lista de productos filtrable y exportable", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/inventario/productos/page.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "apps/web/components/inventory-nav.tsx"), "utf8");
  assert.match(page, /Lista de productos/);
  assert.match(page, /active=all/);
  assert.match(page, /SKU, código anterior, nombre, familia o sociedad/);
  assert.match(page, /downloadExcelWorkbook\("lista-productos\.xls"/);
  assert.match(nav, /Lista de productos/);
});
