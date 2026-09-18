const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("hr routes expose talento humano aliases and route prevalidation", () => {
  const source = read("apps/api/src/modules/hr/routes.js");
  assert.match(source, /\/talento-humano\/mallas\/prevalidar/);
  assert.match(source, /\/talento-humano\/novedades/);
  assert.match(source, /\/talento-humano\/configuracion-laboral/);
  assert.match(source, /\/talento-humano\/configuracion-laboral\/parametros/);
  assert.match(source, /\/talento-humano\/configuracion-laboral\/conceptos/);
  assert.match(source, /\/talento-humano\/entidades/);
  assert.match(source, /\/talento-humano\/empleados\/:id\/afiliaciones/);
  assert.match(source, /\/talento-humano\/entidades\/:id\/vincular-tercero/);
  assert.match(source, /prevalidateRoutes/);
});

test("hr service blocks overlapping employee schedules without vehicle exclusivity", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /findRouteAssignmentConflicts/);
  assert.match(source, /MALLA_SOLAPADA/);
  assert.doesNotMatch(source, /vehicle_plate[^;\n]+unique/i);
});

test("closing punch with vehicle requires day mileage and writes novelty when unusual", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /validateMileage/);
  assert.match(source, /kilometraje_dia/);
  assert.match(source, /KILOMETRAJE_INCONSISTENTE/);
  assert.match(source, /th_jornada_kilometrajes/);
});

test("migration seeds novelty types and labor parameters as editable data", () => {
  const migration = read("apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS th_tipos_novedad/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS th_parametros_laborales/);
  assert.match(migration, /JORNADA_NOCTURNA_INICIO/);
  assert.match(migration, /MAX_HE_DIARIO/);
  assert.match(migration, /KILOMETRAJE_INCONSISTENTE/);
});

test("hr service supports labor entity CRUD and non-overlapping employee affiliations", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /async function listLaborEntities/);
  assert.match(source, /async function createLaborEntity/);
  assert.match(source, /async function updateLaborEntity/);
  assert.match(source, /async function linkLaborEntityAccountingParty/);
  assert.match(source, /async function createEmployeeAffiliation/);
  assert.match(source, /AFILIACION_SUPERPUESTA/);
  assert.match(source, /nit_mismatch/);
});

test("hr service stores labor configuration by validity instead of hardcoding rates", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /createLaborParameter/);
  assert.match(source, /updateLaborParameter/);
  assert.match(source, /createSurchargeConcept/);
  assert.match(source, /updateSurchargeConcept/);
  assert.match(source, /VIGENCIA_LABORAL_SUPERPUESTA/);
});
