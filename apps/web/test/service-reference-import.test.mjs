import test from "node:test";
import assert from "node:assert/strict";
import { SERVICE_REFERENCE_COLUMNS, rowsFromWorksheet, validateServiceReferenceImport } from "../lib/serviceReferenceImport.ts";

const headers = SERVICE_REFERENCE_COLUMNS.map((column) => column.header);
const validRows = [
  ["REF-001", "Sofa modular", "muebles", "Montaje", 90, "APEX", "SM-2026", "SI", "Estructura", 1, "und", "Tornilleria", "Manual", "https://ejemplo.com/manual.pdf", "Consultar"],
  ["REF-001", "Sofa modular", "muebles", "Montaje", 90, "APEX", "SM-2026", "SI", "Cojineria", 3, "und", "Costuras", "", "", ""]
];

test("extrae las columnas oficiales de la hoja Referencias", () => {
  const extracted = rowsFromWorksheet([headers, ...validRows]);
  assert.deepEqual(extracted.issues, []);
  assert.equal(extracted.rows.length, 2);
  assert.equal(extracted.rows[0].code, "REF-001");
  assert.equal(extracted.rows[0].__row, 2);
});

test("rechaza plantillas alteradas antes de preparar datos", () => {
  const extracted = rowsFromWorksheet([[...headers.slice(0, -1)], validRows[0].slice(0, -1)]);
  assert.equal(extracted.rows.length, 0);
  assert.match(extracted.issues[0].message, /notas_manual/);
});

test("normaliza un Excel valido y agrupa sus filas por referencia", () => {
  const extracted = rowsFromWorksheet([headers, ...validRows]);
  const validation = validateServiceReferenceImport(extracted.rows);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.referenceCount, 1);
  assert.equal(validation.rows[0].active, true);
  assert.equal(validation.rows[1].part_quantity, 3);
});

test("informa fila y campo y bloquea el lote completo cuando hay errores", () => {
  const invalid = validRows.map((row) => [...row]);
  invalid[1][1] = "Nombre diferente";
  invalid[1][8] = "Estructura";
  invalid[1][9] = 0;
  invalid[1][13] = "archivo-local.pdf";
  const extracted = rowsFromWorksheet([headers, ...invalid]);
  const validation = validateServiceReferenceImport(extracted.rows);
  assert.ok(validation.issues.some((issue) => issue.row === 3 && issue.field === "codigo"));
  assert.ok(validation.issues.some((issue) => issue.row === 3 && issue.field === "pieza"));
  assert.ok(validation.issues.some((issue) => issue.row === 3 && issue.field === "cantidad_pieza"));
  assert.ok(validation.issues.some((issue) => issue.row === 3 && issue.field === "manual"));
  assert.ok(validation.issues.some((issue) => issue.row === 3 && issue.field === "url_manual"));
});
