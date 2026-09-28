import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../components/system/CommandPalette.tsx", import.meta.url), "utf8");

test("el buscador expone todas las funciones navegables de Talento Humano", () => {
  const routes = [
    "configuracion-laboral",
    "empleados",
    "entidades",
    "rutas",
    "mapa",
    "marcacion",
    "nomina",
    "novedades",
    "reportes"
  ];

  for (const route of routes) {
    assert.match(source, new RegExp(`/dashboard/talento-humano/${route}`));
  }
});

test("las funciones de Talento Humano respetan la habilitacion del modulo", () => {
  assert.match(source, /enabled\("talento-humano"\) \? HR_FUNCTIONS : \[\]/);
});
