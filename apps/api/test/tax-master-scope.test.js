process.env.NODE_ENV = "test";
process.env.DISABLE_BACKGROUND_WORKERS = "true";
process.env.DISABLE_REDIS = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

test("IVA separa maestros de compras y ventas", () => {
  const service = fs.readFileSync(path.join(root, "apps/api/src/modules/accounting/service.js"), "utf8");
  assert.match(service, /scope: "purchases"/);
  assert.match(service, /scope: "sales"/);
  assert.match(service, /getVatMasters\(tenantId, scope = "purchases"\)/);
  assert.match(service, /\(row\.scope \|\| "purchases"\) === normalizedScope/);
});

test("Ventas exige IVA activo y contabiliza la cuenta del maestro", () => {
  const service = fs.readFileSync(path.join(root, "apps/api/src/modules/sales-invoice/service.js"), "utf8");
  assert.match(service, /VAT_MASTER_NOT_FOUND/);
  assert.match(service, /vat\.master\.account_code/);
  assert.match(service, /tax_code: vat\.master\.code/);
});

test("Contabilidad expone maestros fiscales sin captura libre de cuentas", () => {
  const retentions = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/retenciones/page.tsx"), "utf8");
  const vat = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/iva/page.tsx"), "utf8");
  assert.match(retentions, /Retenciones de compras/);
  assert.match(retentions, /Retenciones de ventas/);
  assert.match(retentions, /Seleccione del PUCC/);
  assert.match(vat, /IVA de compras/);
  assert.match(vat, /IVA de ventas/);
  assert.match(vat, /Seleccione del PUCC/);
  assert.doesNotMatch(retentions, /Asignacion por proveedor/);
  assert.doesNotMatch(retentions, /accounting\/suppliers/);
  assert.match(retentions, /Guardar cambios/);
  assert.match(vat, /Guardar cambios/);
  assert.match(retentions, /ModalFrame/);
  assert.match(retentions, /Crear retención/);
  assert.match(vat, /ModalFrame/);
  assert.match(vat, /Crear IVA/);
});

test("Los maestros fiscales eliminan sin uso y desactivan cuando tienen movimientos", () => {
  const service = fs.readFileSync(path.join(root, "apps/api/src/modules/accounting/service.js"), "utf8");
  const routes = fs.readFileSync(path.join(root, "apps/api/src/modules/accounting/routes.js"), "utf8");
  assert.match(service, /async function deleteRetentionMaster/);
  assert.match(service, /prisma\.cxcCuedoc\.count/);
  assert.match(service, /prisma\.cxpCuedoc\.count/);
  assert.match(service, /active: false/);
  assert.match(routes, /delete\("\/accounting\/retention-masters\/:code"/);
  assert.match(routes, /put\("\/accounting\/retention-masters\/:id"/);
});

test("Ventas solo admite retenciones asignadas al cliente", () => {
  const { retentionCodesFromCustomer, assertCustomerRetentionAssignment } = require("../src/modules/sales-invoice/service");
  const customer = { metadata: { customer_retentions: [{ code: "RF-VENTAS" }, { code: "RIVA-VENTAS" }] } };
  assert.deepEqual(retentionCodesFromCustomer(customer), ["RF-VENTAS", "RIVA-VENTAS"]);
  assert.equal(assertCustomerRetentionAssignment(customer, [{ code: "RF-VENTAS" }]).length, 2);
  assert.throws(() => assertCustomerRetentionAssignment(customer, [{ code: "RF-AJENA" }]), (error) => error.code === "CUSTOMER_RETENTION_NOT_ASSIGNED" && error.statusCode === 422);
});

test("La factura de ventas filtra y precarga retenciones del tercero", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/ventas/facturas/nueva/page.tsx"), "utf8");
  assert.match(page, /customer_retentions/);
  assert.match(page, /customerRetentions\.map/);
  assert.match(page, /applyCustomerRetentions\(customer\)/);
  assert.doesNotMatch(page, /\{retentions\.map\(\(retention\)/);
});
