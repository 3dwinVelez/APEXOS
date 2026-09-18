const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
process.env.REDIS_DISABLED = "true";
const { validateReferenceImportRows } = require("../src/modules/services/service");

function row(overrides = {}) {
  return {
    code: "REF-001",
    name: "Sofa modular",
    category: "muebles",
    description: "Montaje",
    estimated_minutes: 90,
    brand: "APEX",
    model: "SM-2026",
    active: true,
    part_name: "Estructura",
    part_quantity: 1,
    part_unit: "und",
    part_description: "Verificar tornilleria",
    manual_title: "Manual",
    manual_url: "https://ejemplo.com/manual.pdf",
    manual_notes: "Consultar",
    ...overrides
  };
}

test("el backend agrupa filas validas sin omitir datos", () => {
  const result = validateReferenceImportRows([row(), row({ part_name: "Cojineria", part_quantity: 3, manual_title: "", manual_url: "", manual_notes: "" })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].parts.length, 2);
  assert.equal(result[0].manuals.length, 1);
  assert.equal(result[0].active, true);
});

test("el backend rechaza todo el lote ante una fila inconsistente", () => {
  assert.throws(
    () => validateReferenceImportRows([row(), row({ name: "Otro producto", part_name: "Cojineria" })]),
    (error) => error.code === "INVALID_REFERENCE_IMPORT" && /fila 3/.test(error.message)
  );
});

test("el backend no acepta duplicados, cantidades invalidas ni URLs inseguras", () => {
  assert.throws(
    () => validateReferenceImportRows([row(), row({ part_quantity: 0, manual_url: "file:///manual.pdf" })]),
    (error) => error.code === "INVALID_REFERENCE_IMPORT" && /cantidad_pieza/.test(error.message) && /url_manual/.test(error.message)
  );
});

test("la ruta conserva autenticacion, tenant y permiso de escritura", () => {
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/services/routes.js"), "utf8");
  assert.match(routes, /post\("\/services\/references\/import"[^\n]+requirePermission\("services", "write"\)/);
  assert.match(routes, /addHook\("preHandler", fastify\.authenticate\)/);
  assert.match(routes, /addHook\("preHandler", tenancy\)/);
});
