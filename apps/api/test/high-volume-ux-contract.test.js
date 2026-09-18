process.env.NODE_ENV = "test";
process.env.DISABLE_BACKGROUND_WORKERS = "true";
process.env.DISABLE_REDIS = "true";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");

test("traslados soportan captura consecutiva con búsqueda y disponibilidad", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/inventario/traslados/nuevo/page.tsx"), "utf8");
  assert.match(page, /inventory\/costs\?all=true/);
  assert.match(page, /Código o nombre/);
  assert.match(page, /Disponible/);
  assert.match(page, /Crear y nuevo/);
  assert.match(page, /supera la existencia disponible/);
});

test("pagos filtran referencias y permiten marcar todo sin autoasignación", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/tesoreria/page.tsx"), "utf8");
  assert.match(page, /Facturas por referencia/);
  assert.match(page, /Marcar todo/);
  assert.match(page, /Desmarcar todo/);
  assert.match(page, /visibleItems\.map\(\(item\) => \(\{ source_id/);
  assert.doesNotMatch(page, /Aplicar.*antigu/i);
});

test("documentos operativos ofrecen continuidad de captura", () => {
  const purchaseInvoices = fs.readFileSync(path.join(root, "apps/web/app/dashboard/compras/facturas/page.tsx"), "utf8");
  const salesInvoices = fs.readFileSync(path.join(root, "apps/web/app/dashboard/ventas/facturas/nueva/page.tsx"), "utf8");
  const purchaseOrders = fs.readFileSync(path.join(root, "apps/web/app/dashboard/compras/ordenes/nueva/page.tsx"), "utf8");
  const receipts = fs.readFileSync(path.join(root, "apps/web/app/dashboard/compras/ordenes/recibir/page.tsx"), "utf8");
  assert.match(purchaseInvoices, /Registrar y nueva/);
  assert.match(salesInvoices, /Emitir y nueva/);
  assert.match(purchaseOrders, /Aprobar y nueva/);
  assert.match(receipts, /Confirmar y siguiente OC/);
});
