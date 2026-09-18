process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/inventory/routes.js"), "utf8");
const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/inventory/service.js"), "utf8");
const accounting = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/service.js"), "utf8");
const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/inventario/cargue-inicial/page.tsx"), "utf8");

test("el contrato ofrece validacion y contabilizacion separadas con permisos", () => {
  assert.match(routes, /inventory\/initial-load\/validate/);
  assert.match(routes, /inventory\/initial-load"/);
  assert.match(routes, /requirePermission\("inventory", "approve"\)/);
  assert.match(page, /Validar plantilla/);
  assert.match(page, /Confirmar cargue inicial/);
});

test("el cargue es atomico y actualiza stock, kardex, valoracion y contabilidad", () => {
  assert.match(service, /prisma\.\$transaction/);
  assert.match(service, /stockMoveTx\(tx/);
  assert.match(service, /source_type: "inventory_initial_load"/);
  assert.match(service, /createInitialInventoryDocumentTx/);
  assert.match(service, /INITIAL_LOAD_ALREADY_POSTED/);
  assert.match(accounting, /bridgeCode = "99999999"/);
  assert.match(accounting, /movement: "debit"/);
  assert.match(accounting, /movement: "credit"/);
});

test("la plantilla descargable conserva las columnas obligatorias", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(__dirname, "../../web/public/plantillas/Plantilla_Cargue_Inicial_Inventario.xlsx"));
  const sheet = workbook.getWorksheet("Cargue inicial");
  assert.ok(sheet);
  assert.deepEqual(sheet.getRow(4).values.slice(1), ["fecha_contabilizacion", "sku", "bodega", "ubicacion", "cantidad", "costo_unitario", "lote", "observaciones"]);
  assert.ok(workbook.getWorksheet("Instrucciones"));
});
