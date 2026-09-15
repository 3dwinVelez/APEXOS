import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("el adaptador estándar cubre todos los listados del dashboard desde el shell", () => {
  const shell = read("components/shell/DashboardChrome.tsx");
  const experience = read("components/system/StandardTableExperience.tsx");
  assert.match(shell, /<StandardTableExperience \/>/);
  assert.match(experience, /#apex-main-content table/);
  assert.match(experience, /MutationObserver/);
  assert.match(experience, /cleanups\.forEach/);
});

test("preserva tablas inteligentes, formularios, diálogos y detalles", () => {
  const source = read("components/system/StandardTableExperience.tsx");
  assert.match(source, /aria-label=\"Tabla de datos\"/);
  assert.match(source, /dialog,\[role=dialog\],form/);
  assert.match(source, /tableLayout === \"detail\"/);
  assert.match(source, /tableLayout === \"editor\"/);
});

test("ofrece contador y configuración persistente de columnas", () => {
  const source = read("components/system/StandardTableExperience.tsx");
  assert.match(source, /registros/);
  assert.match(source, /seleccionados/);
  assert.match(source, /Configurar columnas de la tabla/);
  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /visible\.length === 1/);
});
