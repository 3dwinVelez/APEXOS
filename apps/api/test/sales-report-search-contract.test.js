const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("los reportes de ventas filtran por cliente y producto en todas las vistas", () => {
  const service = read("apps/api/src/modules/sales-invoice/service.js");
  assert.match(service, /query\.item_id \? \{ lines: \{ some: \{ item_id:/);
  assert.match(service, /query\.customer_id \? \{ customer_id:/);
  assert.match(service, /if \(query\.item_id\) where\.lines/);
});

test("cliente y producto usan texto libre y buscador con Enter vacio", () => {
  const page = read("apps/web/app/dashboard/ventas/reportes/page.tsx");
  assert.match(page, /handleLookupEnter\("customer"\)/);
  assert.match(page, /handleLookupEnter\("item"\)/);
  assert.match(page, /SKU, código anterior o nombre; Enter para buscar/);
  assert.match(page, /title=\{lookup === "customer" \? "Buscar cliente" : "Buscar producto"\}/);
});
