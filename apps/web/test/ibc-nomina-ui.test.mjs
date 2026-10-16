import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "app/dashboard/talento-humano");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("nomina UI distingue novedades IBC y exige referencia historica congelada", () => {
  const source = read("nomina/page.tsx");
  assert.match(source, /VAC disfrutadas/);
  assert.match(source, /VAC compensadas en dinero/);
  assert.match(source, /SLN · suspensión disciplinaria\/licencia no remunerada/);
  assert.match(source, /IBC histórico congelado al inicio/);
  assert.match(source, /IBC PILA legacy \(no sustituye referencia histórica\)/);
  assert.match(source, /Obligación del anticipo/);
  assert.match(source, /requiresPilaAttestation = isSegmentedNovelty && adjustment.adjustment_type !== "vacaciones_compensadas"/);
  assert.match(source, /Fecha reconocimiento/);
  assert.match(source, /advance_retention_health: adjustment\.advance_retention_health !== "" \? Number\(adjustment\.advance_retention_health\) : undefined/);
  assert.match(source, /advance_retention_pension: adjustment\.advance_retention_pension !== "" \? Number\(adjustment\.advance_retention_pension\) : undefined/);
  assert.doesNotMatch(source, /advance_retention_health: Number\(adjustment\.advance_retention_health \|\| 0\)/);
  assert.doesNotMatch(source, /advance_retention_pension: Number\(adjustment\.advance_retention_pension \|\| 0\)/);
  assert.doesNotMatch(source, /advance_retentions:/);
});

test("aportes UI muestra trazabilidad por segmento y subsistema", () => {
  const source = read("aportes-sociales/page.tsx");
  assert.match(source, /Base y novedades por segmento/);
  assert.match(source, /Días reportados/);
  assert.match(source, /Cargo empleador/);
  assert.match(source, /Retenciones anticipadas/);
  assert.match(source, /Referencia \/ soporte/);
});

test("configuracion UI ofrece elegibilidad ET 114-1 explicita", () => {
  const source = read("configuracion-laboral/page.tsx");
  assert.match(source, /EXONERACION_EMPRESA_ELEGIBLE/);
  assert.match(source, /nunca se presume/);
});

test("maestro de empleados permite configurar elegibilidad y régimen soportado", () => {
  const source = read("empleados/page.tsx");
  assert.match(source, /exoneration_eligible/);
  assert.match(source, /Soporte elegibilidad ET 114-1/);
  assert.match(source, /Ordinario privado/);
  assert.match(source, /Pensión patronal SLN/);
});
