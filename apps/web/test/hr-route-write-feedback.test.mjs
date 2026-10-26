import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Certificacion UX del incidente 2026-10-26 (hr-route-p2028-20261026): el operario de SJ C vio
// "Error 500 en /api/v1/hr/routes. Backend no disponible" cuando lo que paso fue que otra edicion
// tenia tomado el lock de su fecha. El servicio estaba arriba y la escritura no ocurrio: el mensaje
// debia decir que reintentara, no que el backend se cayo, y el modal debia conservar el horario.

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8");

const api = read("../lib/api.ts");
const routesPage = read("../app/dashboard/talento-humano/rutas/page.tsx");

// El fuente conserva CRLF: el cierre de funcion se busca con regex, no con "\n}\n" literal.
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `debe existir ${signature}`);
  const fromStart = source.slice(start);
  const end = fromStart.search(/\n\}[ \t]*\r?\n/);
  assert.ok(end > 0, `${signature} debe cerrar a nivel de columna cero`);
  return fromStart.slice(0, end);
}

const messageFor = functionBody(api, "function requestErrorMessage(");

test("el mensaje amable distingue leer de guardar y ya no anuncia backend caido", () => {
  assert.ok(messageFor.includes("isWriteRequest(method)"), "debe ramificar por metodo HTTP");
  assert.ok(messageFor.includes('const action = writing ? "guardar" : "cargar"'), "debe nombrar la accion en lenguaje claro");
  assert.ok(!messageFor.includes("Backend no disponible"), "ningun fallo puede anunciarle al operario que el backend no existe");
  assert.match(messageFor, /Tu sesi[oó]n venci[oó]/, "401 en lenguaje de usuario");
});

test("el conflicto de edicion simultanea se explica y da la instruccion correcta", () => {
  assert.match(api, /const RETRYABLE_BUSY_CODES = \[[^\]]*ROUTE_ASSIGNMENT_BUSY/, "el codigo del servidor debe estar mapeado");
  assert.ok(messageFor.includes("RETRYABLE_BUSY_CODES.includes(code)"), "debe existir la rama de edicion simultanea");
  assert.match(messageFor, /no se perdi/, "debe afirmar que el trabajo no se perdio");
  assert.match(messageFor, /Otra persona está guardando/, "instruccion en lenguaje claro");
});

test("la referencia de soporte llega al mensaje y el detalle tecnico deja de imprimirse crudo", () => {
  assert.match(messageFor, /Referencia para soporte: \$\{requestId\}/, "debe incluir request_id legible");
  assert.match(messageFor, /\.replace\(\/\^\\s\*\\{/, "un payload JSON no puede llegar como detalle al banner");
  const reader = functionBody(api, "function readFailurePayload(");
  assert.ok(reader.includes("JSON.parse"), "el cuerpo JSON del 5xx se lee para sacar code y request_id");
});

test("el 5xx conserva status y retryable y ademas expone code al llamador", () => {
  const internal = api.slice(api.indexOf("async function apiInternal<"));
  const branch = internal.slice(internal.indexOf("if (response.status >= 500)"), internal.indexOf("if (response.status >= 500)") + 900);
  assert.match(branch, /const failure = readFailurePayload\(await response\.text\(\)\.catch\(\(\) => ""\)\)/);
  // Regresion FM-02: la forma literal del throw que consume la cola de marcaciones fuera de linea.
  assert.match(branch, /Object\.assign\(new Error\(message\), \{ status: response\.status, retryable: true \}\)/);
  assert.match(branch, /code: failure\.code, request_id: failure\.requestId/, "el llamador necesita el codigo para decidir el reintento");
});

test("el aviso global se silencia solo cuando el llamador ya muestra el estado, sin perder la captura", () => {
  const internal = api.slice(api.indexOf("async function apiInternal<"));
  assert.ok(internal.includes("const silenced = alertsAreSilenced(options);"), "apiInternal debe leer la opcion del llamador");
  assert.match(internal, /if \(!silenced\) alertRequestFailure\(path, response\.status, detail\);/);
  assert.ok(internal.includes("reportClientFailure(path, response.status, detail"), "la evidencia tecnica se sigue registrando");
  assert.ok(api.includes("type ApiRequestOptions = RequestInit & { silentFailureAlert?: boolean }"), "la opcion es parte del contrato de api()");
});

test("guardar una malla reintenta el conflicto de concurrencia con limite fijo", () => {
  const helper = functionBody(routesPage, "async function runRouteWriteWithBusyRetry");
  assert.match(routesPage, /async function runRouteWriteWithBusyRetry<T>\(action: \(\) => Promise<T>, onRetry: \(attempt: number\) => void\): Promise<T> \{/,
    "el helper es generico: si devolviera unknown, los llamadores pierden el tipo de la respuesta (results/ok/created) y el typecheck se cae");
  assert.ok(routesPage.includes('const ROUTE_BUSY_ERROR_CODE = "ROUTE_ASSIGNMENT_BUSY"'));
  assert.match(routesPage, /const ROUTE_BUSY_RETRY_LIMIT = 2;/, "los reintentos son acotados");
  assert.match(helper, /attempt >= ROUTE_BUSY_RETRY_LIMIT/, "debe rendirse despues del limite");
  assert.match(helper, /isBusyRouteWriteFailure\(error\)/, "solo reintenta fallos transitorios");
});

test("el guardado de mallas usa el reintento, silencia el toast tecnico y muestra el estado dentro del modal", () => {
  const save = routesPage.slice(routesPage.indexOf("async function saveRoute()"));
  const body = save.slice(0, save.search(/\n  \}[ \t]*\r?\n/));
  assert.equal((body.match(/runRouteWriteWithBusyRetry\(/g) || []).length, 4, "edicion, prevalidacion, bulk y alta individual");
  assert.ok(body.includes("silentFailureAlert: true"), "sin alerta tecnica global duplicada");
  assert.ok(body.includes('setSaveNotice({ tone: "error", text: friendly })'), "el fallo se muestra dentro del modal");
  assert.match(body, /setSaveNotice\(null\);\r?\n\s+await Promise\.all/, "solo se limpia el aviso cuando la escritura confirmo");
  const notice = routesPage.slice(routesPage.indexOf("{saveNotice ? ("));
  assert.ok(notice.includes('role={saveNotice.tone === "error" ? "alert" : "status"}'), "accesible para lector de pantalla");
});

test("el reintento le dice al operario que no repita el registro", () => {
  assert.match(routesPage, /Reintentamos autom[aá]ticamente/, "mensaje de reintento en lenguaje claro");
  assert.match(routesPage, /No repitas el registro/, "evita el doble horario por impaciencia");
});
