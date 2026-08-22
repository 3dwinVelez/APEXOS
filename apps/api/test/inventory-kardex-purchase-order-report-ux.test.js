process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");

test("reportes de inventario validan SKU libre y ofrecen buscador modal", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/inventario/reportes/page.tsx"), "utf8");
  assert.match(page, /placeholder="Escribe el SKU"/);
  assert.match(page, /El SKU \$\{code\} no existe o está inactivo/);
  assert.match(page, /title="Seleccionar producto"/);
  assert.match(page, /Buscar todos los SKU por código o nombre/);
  assert.doesNotMatch(page, /<option value="">Seleccionar SKU<\/option>/);
});

test("compras expone reporte de posiciones de OC con filtros y Excel", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/compras/reportes/ordenes/page.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "apps/web/components/compras-nav.tsx"), "utf8");
  const service = fs.readFileSync(path.join(root, "apps/api/src/modules/purchases/service.js"), "utf8");
  for (const label of ["Cantidad pedida", "Cantidad recibida", "Cantidad pendiente", "Costo pedido", "Costo recibido", "Costo pendiente", "Proveedor", "Bodega", "Estado", "Fecha desde", "Fecha hasta"]) assert.match(page, new RegExp(label));
  assert.match(page, /downloadExcelWorkbook\("reporte-ordenes-compra\.xls"/);
  assert.match(page, /receivedQty \* unitCost/);
  assert.match(page, /pendingQty \* unitCost/);
  assert.match(nav, /Reporte de OC/);
  assert.match(service, /String\(query\.all\) === "true" \? 5000/);
  assert.match(service, /itemById\.get\(line\.item_id\)/);
});
