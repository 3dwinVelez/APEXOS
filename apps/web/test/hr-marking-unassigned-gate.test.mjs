import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8");

// La ventana de marcacion se abrìa con cinco lecturas en paralelo. Si el usuario no tiene ficha
// de empleado, las cinco devuelven 404 y cada 404 levantaba su tarjeta de "Fallo tecnico
// detectado": el cliente leia cuatro errores de sistema donde solo habìa un estado de negocio
// (sin horario). Estas pruebas fijan que la ficha se resuelve primero, que su 404 no habla de
// caida y que la pantalla muestra un solo panel grande en su lugar.
const marking = () => read("../app/dashboard/talento-humano/marcacion/page.tsx");
const loadBody = () => marking().match(/const load = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[\]\);/)?.[0] || "";

test("la ficha se lee sola, antes que las otras lecturas y sin alerta global", () => {
  const load = loadBody();
  const selfAt = load.indexOf('"/api/v1/hr/self"');
  const routesAt = load.indexOf('"/api/v1/hr/self/routes"');
  assert.ok(selfAt > 0 && routesAt > selfAt, "el horario se pide antes de saber si el usuario tiene ficha");
  assert.match(load, /api<Employee>\("\/api\/v1\/hr\/self", \{ silentFailureAlert: true \}\)/,
    "la lectura de la ficha vuelve a levantar la tarjeta de fallo tecnico");
  assert.match(load, /status === 404/, "el 404 de la ficha dejo de tratarse como estado de negocio");
  assert.equal((load.match(/Promise\.all\(\[\s*settle<Employee/g) || []).length, 0,
    "la ficha volvio a entrar en el lote paralelo que dispara las cinco tarjetas");
});

test("sin ficha no se lanzan las lecturas que dependen de ella", () => {
  const load = loadBody();
  const gate = load.match(/if \(!meResult\.ok && meResult\.status === 404[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(gate, "desaparecio el corte por ficha inexistente");
  assert.match(gate, /setBlocked\("no_ficha"\)/);
  assert.match(gate, /return;/);
  const beforePromiseAll = load.slice(0, load.indexOf("const [routesResult"));
  assert.ok(beforePromiseAll.includes("return;"), "el corte ya no devuelve antes de consultar los horarios");
  // El respaldo del dispositivo tambien es una fuente de ficha: si hoy hay instantanea, la
  // pantalla sigue dejando marcar sin conexion en vez de anunciar que no hay horario.
  assert.match(gate, /cached\.taken_day === todayBogota\(\)/, "el corte ignora el respaldo local del dia");
});

test("el panel unico reemplaza la ventana de marcado y dice que no es una falla", () => {
  const source = marking();
  assert.match(source, /\{blocked \? null : <section className="grid grid-cols-2/,
    "las pestanas Marcar/Historial siguen visibles sin horario");
  assert.match(source, /\{blocked \? \(\s*<section[\s\S]*?role="status"[\s\S]*?Sin horario asignado/);
  assert.match(source, /!blocked && view === "marcar"/, "la ventana de marcado se monta sin horario");
  assert.match(source, /!blocked && view === "historial"/, "el historial se monta sin horario");
  assert.match(marking(), /No es una falla de la aplicación/, "el panel perdio la linea que descarta la caida");
  // `hidden` por CSS dejaria la superficie montada: el certificado tiene que poder probar ausencia.
  assert.doesNotMatch(source, /shadow-sm\$\{blocked \? " hidden"/);
});

test("el modo respaldo nunca bloquea: sin conexion se sigue marcando", () => {
  const load = loadBody();
  assert.match(load, /setBlocked\(resolved\.source === "live" && !resolved\.routes\.length \? "no_horario" : null\)/,
    "un dia sin horarios en modo respaldo volvio a cerrar la ventana de marcacion");
  // El panel distingue los dos casos: sin ficha es Administracion, sin horario es Talento Humano.
  assert.match(marking(), /no tiene una ficha laboral asociada/);
  assert.match(marking(), /Talento Humano publique tu horario/);
});
