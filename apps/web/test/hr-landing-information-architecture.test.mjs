import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/talento-humano/page.tsx", import.meta.url), "utf8");

test("la portada agrupa Talento Humano en mallas horarias y nomina", () => {
  assert.match(source, /Mallas horarias/);
  assert.match(source, /Nómina/);
  assert.match(source, /Disponible próximamente/);
});

test("mallas conserva acceso a planeacion, marcaciones, monitor y reportes", () => {
  for (const route of ["rutas", "marcacion", "mapa", "reportes"]) assert.match(source, new RegExp(`/dashboard/talento-humano/${route}`));
});

test("la portada no mezcla vehiculos ni depende de consultas operativas", () => {
  assert.doesNotMatch(source, /transport\/vehicles|Gestionar vehículos|\/dashboard\/transporte/);
  assert.doesNotMatch(source, /useEffect|Promise\.all|api</);
});
