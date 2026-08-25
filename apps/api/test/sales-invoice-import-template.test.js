const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

test("nueva factura permite descargar la plantilla oficial con ejemplo", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/ventas/facturas/nueva/page.tsx"), "utf8");
  const template = path.join(root, "apps/web/public/plantillas/Plantilla_Importacion_Facturas_Venta.xlsx");
  assert.match(page, /Descargar formato con ejemplo/);
  assert.match(page, /Plantilla_Importacion_Facturas_Venta\.xlsx/);
  assert.equal(fs.existsSync(template), true);
  assert.ok(fs.statSync(template).size > 1000);
});
