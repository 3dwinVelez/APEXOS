process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const purchasesService = fs.readFileSync(path.resolve(__dirname, "../src/modules/purchases/service.js"), "utf8");
const receiptPage = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/compras/ordenes/recibir/page.tsx"), "utf8");
const transferPage = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/inventario/traslados/page.tsx"), "utf8");

test("cada documento EM expone las posiciones físicas con SKU y cantidad", () => {
  assert.match(purchasesService, /operational_lines/);
  assert.match(purchasesService, /movement\.item\?\.code/);
  assert.match(purchasesService, /qty: Number\(movement\.qty\)/);
  assert.match(receiptPage, /Posiciones de mercancía/);
  assert.match(receiptPage, /selectedAccountingDocument\.operational_lines/);
});

test("la remisión de traslado contiene origen, destino, tipo, detalle, observaciones y firmas", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../web/lib/transferRemissionPdf.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, TextEncoder, Blob, URL, document: {} });
  const bytes = module.exports.buildTransferRemissionPdf({
    number: "TR-000123", society_code: "SOC-01", status: "in_transit", reason: "Reposición", created_at: "2026-08-13T14:00:00Z",
    origin: { code: "BOG", name: "Bodega Bogotá", warehouse_type: "owned", address: "Calle 1", city: "Bogotá" },
    destination: { code: "MED", name: "Bodega Medellín", warehouse_type: "consignment", address: "Carrera 2", city: "Medellín" },
    created_by_user: { name: "Operador" }, lines: [{ item: { code: "SKU-01", name: "Producto prueba", unit: "UND" }, qty: 5 }]
  });
  const pdf = Buffer.from(bytes).toString("latin1");
  assert.match(pdf, /^%PDF-1\.4/);
  for (const expected of ["REMISION DE TRASLADO", "BODEGA DE ORIGEN", "BODEGA DE DESTINO", "Consignacion", "SKU-01", "OBSERVACIONES", "Recibe - nombre, firma y documento"]) assert.match(pdf, new RegExp(expected));
  assert.match(transferPage, /Descargar remisión PDF/);
  assert.match(transferPage, /downloadTransferRemissionPdf\(selected\)/);
});
