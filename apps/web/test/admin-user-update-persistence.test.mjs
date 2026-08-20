import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "app/dashboard/administracion/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/admin/users/route.ts"), "utf8");
const api = fs.readFileSync(path.join(root, "lib/api.ts"), "utf8");
const modal = fs.readFileSync(path.join(root, "components/ui/ModalFrame.tsx"), "utf8");

test("el formulario envia los campos editables que deben persistir", () => {
  assert.match(page, /const fullName = explicitName \|\| form\.name/);
  assert.match(page, /name: fullName/);
  for (const field of ["phone", "position", "department", "hire_date", "operational_classification"]) {
    assert.match(page, new RegExp(`${field}: form\\.${field}`), `el payload omitio ${field}`);
  }
});

test("el endpoint persiste columnas del empleado sin borrar campos omitidos", () => {
  assert.match(route, /phone: body\.phone === undefined \? current\.phone : clean\(body\.phone\)/);
  assert.match(route, /position: body\.position === undefined \? current\.position : clean\(body\.position\)/);
  assert.match(route, /department: body\.department === undefined \? current\.department : clean\(body\.department\)/);
  assert.match(route, /await requireCompanyAdmin\(token, String\(current\.company_id\)\)/);
});

test("el listado rehidrata los cambios despues de recargar", () => {
  assert.match(api, /document_number,phone,position,department,hire_date,status/);
  assert.match(api, /phone: employee\.phone \|\| ""/);
  assert.match(api, /operational_classification: String\(operational\.classification/);
});

test("exito y error se anuncian por encima del modal", () => {
  const modalLayer = Number(modal.match(/z-\[(\d+)\]/)?.[1]);
  const toastLayer = Number(page.match(/fixed bottom-4 right-4 z-\[(\d+)\]/)?.[1]);
  assert.ok(toastLayer > modalLayer, `toast z=${toastLayer} debe superar modal z=${modalLayer}`);
  assert.match(page, /notify\("No se pudo guardar el usuario", errorMessage, "error"\)/);
  assert.match(page, /role="status" aria-live="polite"/);
});
