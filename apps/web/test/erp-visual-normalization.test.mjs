import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("los accesos ERP muestran únicamente herramientas activas y usan el sistema visual APEXOS", () => {
  const inventory = read("apps/web/app/dashboard/inventario/page.tsx");
  const accounting = read("apps/web/app/dashboard/contabilidad/page.tsx");
  const sales = read("apps/web/app/dashboard/ventas/page.tsx");

  for (const source of [inventory, accounting, sales]) {
    assert.match(source, /apex-workspace-shell/);
    assert.match(source, /apex-section-card/);
    assert.match(source, /apex-dense-actions/);
    assert.match(source, /ActionCard/);
    assert.doesNotMatch(source, /Workspaces|Panel operativo|Accion recomendada|Flujo transversal|futura|Preparado|En planeación/i);
  }

  for (const href of ["/productos/nuevo", "/productos", "/familias", "/bodegas", "/stock", "/wms", "/cargue-inicial", "/traslados", "/reportes"]) {
    assert.match(inventory, new RegExp(href.replaceAll("/", "\\/")));
  }
  for (const href of ["/asientos", "/plan-cuentas", "/cuentas-por-pagar", "/cxc/documentos", "/terceros", "/iva", "/retenciones", "/estructura", "/reportes"]) {
    assert.match(accounting, new RegExp(href.replaceAll("/", "\\/")));
  }
  for (const href of ["/ordenes/nueva", "/ordenes", "/facturas/nueva", "/facturas", "/clientes", "/reportes"]) {
    assert.match(sales, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("la navegación diferencia acciones de alta y maestros fiscales activos", () => {
  const inventoryNav = read("apps/web/components/inventory-nav.tsx");
  const accountingNav = read("apps/web/components/contabilidad-nav.tsx");
  const salesNav = read("apps/web/components/ventas-nav.tsx");
  assert.match(inventoryNav, /label: "Nuevo producto"/);
  assert.match(accountingNav, /label: "IVA"/);
  assert.match(accountingNav, /label: "Retenciones"/);
  assert.match(salesNav, /label: "Nueva factura"/);
  for (const source of [inventoryNav, accountingNav, salesNav]) assert.match(source, /aria-label="Navegación/);
});

test("los formularios comerciales tienen etiquetas visibles y conservan sus contratos", () => {
  const customers = read("apps/web/app/dashboard/ventas/clientes/page.tsx");
  const order = read("apps/web/app/dashboard/ventas/ordenes/nueva/page.tsx");
  for (const label of ["Nombre o razón social", "Documento tributario", "Correo", "Ciudad", "País (ISO 2)", "Segmento"]) assert.ok(customers.includes(label), label);
  for (const label of ["Cliente", "Producto o servicio", "Cantidad", "Precio unitario", "Notas o condiciones"]) assert.ok(order.includes(label), label);
  assert.match(customers, /"\/api\/v1\/sales\/customers"/);
  assert.match(order, /"\/api\/v1\/sales\/orders"/);
  assert.match(order, /lines: \[\{ item_id:/);
  assert.doesNotMatch(customers, /Cartera de clientes/);
});

test("tesorería conserva pagos bancos reportes y anticipos con una jerarquía compacta", () => {
  const treasury = read("apps/web/app/dashboard/tesoreria/page.tsx");
  for (const marker of ["Recaudos y pagos", "Bancos", "Movimientos", "Anticipos y cruces", "Datos del movimiento", "Selección de documentos"]) assert.match(treasury, new RegExp(marker));
  for (const endpoint of ["/api/v1/treasury/banks", "/api/v1/treasury/payments", "/api/v1/treasury/open-items"]) assert.match(treasury, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(treasury, /submitPayment/);
  assert.match(treasury, /cancelPayment/);
});

test("el formulario de productos conserva sus funciones y elimina paneles de relleno", () => {
  const product = read("apps/web/app/dashboard/inventario/productos/nuevo/page.tsx");

  for (const label of ["Datos básicos", "Valores y existencias", "Opciones operativas", "Crear producto", "Directorio", "Trazabilidad"]) {
    assert.match(product, new RegExp(label));
  }
  for (const field of ["Sociedad", "Sucursal", "Nombre", "Tipo", "Unidad", "Familia", "Impuesto", "Costo unitario", "Precio venta", "Stock minimo", "Stock maximo", "Peso kg", "Volumen m3", "Notas operativas"]) {
    assert.ok(product.includes(field), field);
  }
  assert.match(product, /"\/api\/v1\/inventory\/items"/);
  assert.match(product, /method: "POST"/);
  assert.match(product, /method: "PATCH"/);
  assert.match(product, /lot_control: form\.lot_control/);
  assert.match(product, /serial_control: form\.serial_control/);
  assert.match(product, /selectedItem\?\.id === item\.id/);
  assert.match(product, /Boolean\(selectedItem && selectedItem\.metadata\.purchase_profile/);
  assert.match(product, /selectedItem\?\.stock_current/);
  assert.doesNotMatch(product, /Centro de control|Plantillas rapidas|Acciones conectadas|Workspace de productos|Codigo automatico por familia/);
});
