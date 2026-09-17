import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("talent landing exposes novelties, employees and mallas navigation", () => {
  const source = read("app/dashboard/talento-humano/page.tsx");
  assert.match(source, /Novedades de jornada/);
  assert.match(source, /Maestro de empleados/);
  assert.match(source, /Entidades y afiliaciones/);
  assert.match(source, /Configuración laboral/);
  assert.match(source, /\/dashboard\/talento-humano\/mallas/);
});

test("mobile closing flow requires day mileage when the schedule has a vehicle", () => {
  const source = read("app/dashboard/talento-humano/marcacion/page.tsx");
  assert.match(source, /Kilometraje recorrido del dia/);
  assert.match(source, /kilometraje_dia/);
  assert.match(source, /maximo un decimal/);
});

test("new talent pages consume talento humano API aliases", () => {
  const novelties = read("app/dashboard/talento-humano/novedades/page.tsx");
  const employees = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(novelties, /\/api\/v1\/talento-humano\/novedades/);
  assert.match(employees, /\/api\/v1\/talento-humano\/empleados/);
});

test("employee master exposes view and edit actions per row", () => {
  const employees = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(employees, /Ver informacion del empleado/);
  assert.match(employees, /Editar empleado/);
  assert.match(employees, /\/api\/v1\/talento-humano\/empleados\/\$\{selected\.id\}/);
  assert.match(employees, /Guardar cambios/);
});

test("labor entities page exposes entity CRUD and employee affiliations", () => {
  const source = read("app/dashboard/talento-humano/entidades/page.tsx");
  assert.match(source, /\/api\/v1\/talento-humano\/entidades/);
  assert.match(source, /\/api\/v1\/talento-humano\/empleados\/\$\{selectedEmployeeId\}\/afiliaciones/);
  assert.match(source, /Nueva entidad/);
  assert.match(source, /Cerrar vigencia/);
  assert.match(source, /NIT difiere/);
});

test("labor configuration page edits night range, overtime limits and surcharge concepts", () => {
  const source = read("app/dashboard/talento-humano/configuracion-laboral/page.tsx");
  assert.match(source, /JORNADA_NOCTURNA_INICIO/);
  assert.match(source, /MAX_HE_DIARIO/);
  assert.match(source, /RECARGO_NOCTURNO/);
  assert.match(source, /porcentaje_adicional/);
  assert.match(source, /factor_total/);
  assert.match(source, /\/api\/v1\/talento-humano\/configuracion-laboral\/parametros/);
  assert.match(source, /\/api\/v1\/talento-humano\/configuracion-laboral\/conceptos/);
});
