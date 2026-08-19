const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

test("el control numerico permite vacio temporal y normaliza a cero al salir", () => {
  const component = fs.readFileSync(path.join(root, "apps/web/components/ui/ZeroFriendlyNumberInput.tsx"), "utf8");
  assert.match(component, /setDraft\(raw\)/);
  assert.match(component, /raw === "" \? 0/);
  assert.match(component, /value\.trim\(\) === "" \? 0/);
  assert.match(component, /currentTarget\.select\(\)/);
});

test("compras ventas IVA y retenciones reutilizan el control numerico", () => {
  const files = [
    "apps/web/app/dashboard/compras/facturas/page.tsx",
    "apps/web/app/dashboard/compras/ordenes/nueva/page.tsx",
    "apps/web/app/dashboard/compras/proveedores/page.tsx",
    "apps/web/app/dashboard/ventas/facturas/nueva/page.tsx",
    "apps/web/app/dashboard/ventas/ordenes/nueva/page.tsx",
    "apps/web/app/dashboard/contabilidad/iva/page.tsx",
    "apps/web/app/dashboard/contabilidad/retenciones/page.tsx",
    "apps/web/app/dashboard/cxc/retenciones/page.tsx"
  ];
  for (const file of files) assert.match(fs.readFileSync(path.join(root, file), "utf8"), /ZeroFriendlyNumberInput/, file);
});
