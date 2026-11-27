import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/talento-humano/page.tsx", import.meta.url), "utf8");

const HR_ACCESS_ROUTES = [
  "rutas",
  "mallas",
  "marcacion",
  "novedades",
  "mapa",
  "empleados",
  "entidades",
  "configuracion-laboral",
  "nomina",
  "provisiones",
  "aportes-sociales",
  "prestaciones-pagos",
  "libranzas",
  "liquidacion-trabajador",
  "reportes"
];

test("la portada usa el patron de hub por tarjetas de los demas modulos", () => {
  assert.match(source, /import \{ ActionCard \} from "@\/components\/ui\/ActionCard"/);
  assert.match(source, /className="apex-dense-actions"/);
  assert.match(source, /actions\.map\(\(action\) => <ActionCard key=\{action\.href\} \{\.\.\.action\} \/>\)/);
});

test("la portada expone como acceso cada pantalla del modulo, incluida nomina", () => {
  for (const route of HR_ACCESS_ROUTES) assert.match(source, new RegExp(`/dashboard/talento-humano/${route}"`));
  assert.match(source, /Nómina/);
  assert.doesNotMatch(source, /Disponible próximamente|cursor-not-allowed/, "ningun acceso funcional debe quedar bloqueado como proximamente");
});

test("mallas conserva acceso a planeacion, marcaciones, monitor y reportes", () => {
  for (const route of ["rutas", "marcacion", "mapa", "reportes"]) assert.match(source, new RegExp(`/dashboard/talento-humano/${route}`));
});

test("la portada no mezcla vehiculos ni depende de consultas operativas", () => {
  assert.doesNotMatch(source, /transport\/vehicles|Gestionar vehículos|\/dashboard\/transporte/);
  assert.doesNotMatch(source, /useEffect|Promise\.all|api</);
});

test("los paneles respetan el fondo tematico sin degradados blancos forzados", () => {
  assert.doesNotMatch(source, /bg-gradient[^\n]*via-white|from-apex\/10[^\n]*to-white/);
});
