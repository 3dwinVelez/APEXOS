import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Certificacion UX de la ronda hr-contention-p2028-20261026. Las mallas ya recibieron el mensaje
// amable; esta ronda baja el mismo patron a las otras dos escrituras de Talento Humano que esperaban
// su advisory lock de forma bloqueante: la marcacion del operario y el ajuste de nomina (novedades IBC).
// Lo que no puede volver a pasar es que un "intente de nuevo en unos segundos" se vea como caida del
// backend, ni que el dispositivo fuera de linea descarte la marcacion por tratar el 503 como rechazo
// definitivo.

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8");

const api = read("../lib/api.ts");
const offline = read("../lib/hrOfflineMarking.ts");
const markingPage = read("../app/dashboard/talento-humano/marcacion/page.tsx");
const payrollPage = read("../app/dashboard/talento-humano/nomina/page.tsx");

const messageFor = (() => {
  const start = api.indexOf("function requestErrorMessage(");
  const fromStart = api.slice(start);
  const end = fromStart.search(/\n\}[ \t]*\r?\n/);
  return fromStart.slice(0, end);
})();

test("los tres codigos de concurrencia comparten el mensaje amable y ninguno anuncia caida", () => {
  const busyCodes = (api.match(/const RETRYABLE_BUSY_CODES = \[[^\]]*\]/) || [""])[0];
  for (const code of ["ROUTE_ASSIGNMENT_BUSY", "MARCACION_CONCURRENCIA_TEMPORAL", "AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL"]) {
    assert.ok(busyCodes.includes(`"${code}"`), `${code} debe ser reintentable en el cliente`);
    assert.ok(messageFor.includes("RETRYABLE_BUSY_CODES.includes(code)"), "debe existir la rama de edicion simultanea");
  }
  assert.match(messageFor, /Otra persona está guardando/, "instruccion en lenguaje claro");
  assert.match(messageFor, /no se perdi/, "debe afirmar que el trabajo no se perdio");
  assert.match(messageFor, /Referencia para soporte: \$\{requestId\}/, "el operario necesita la referencia");
  // El aviso global sale del mismo mensaje: "backend caido" solo puede aparecer cuando realmente
  // no hubo respuesta HTTP (fetch revienta), nunca para un 503 con codigo de concurrencia.
  const alertBody = (() => {
    const start = api.indexOf("function alertRequestFailure(");
    assert.ok(start >= 0, "debe existir el aviso global");
    const fromStart = api.slice(start);
    return fromStart.slice(0, fromStart.search(/\n\}[ \t]*\r?\n/));
  })();
  assert.ok(!/Backend no disponible/i.test(alertBody), "el aviso global no puede anunciar caida por un lock tomado");
  assert.match(api, /error instanceof Error \? error\.message : "Backend no disponible\."/, "la caida solo se anuncia cuando el fetch no obtuvo respuesta");
});

test("la marcacion del operario muestra el mensaje del servidor y no inventa una caida", () => {
  assert.ok(markingPage.includes("error instanceof Error"), "el aviso debe salir del mensaje clasificado");
  assert.match(markingPage, /Marcacion pendiente de confirmar: \$\{error\.message\}/, "el fallo transitorio se muestra como pendiente, no como error de fondo");
  assert.match(markingPage, /La marcacion quedo pendiente de confirmar: \$\{error\.message\}/, "el reintento en cola conserva el texto amable");
  assert.ok(!/Backend no disponible/i.test(markingPage), "la pantalla no puede anunciar backend caido por un lock tomado");
});

test("la pantalla de nomina muestra el mensaje amable del ajuste dentro del propio formulario", () => {
  const submit = payrollPage.slice(payrollPage.indexOf("async function createAdjustment"));
  const body = submit.slice(0, submit.indexOf("\n  }"));
  assert.ok(body.length > 0, "debe existir el alta de ajuste de nomina");
  assert.match(body, /err instanceof Error \? err\.message/, "el detalle tecnico lo da el pipeline compartido, no la pantalla");
  assert.ok(body.includes("setAdjustmentError(errorMessage)"), "el fallo se muestra junto al formulario, no solo en un toast");
  assert.ok(!/Backend no disponible/i.test(payrollPage), "la nomina no puede anunciar backend caido por un lock tomado");
});

test("el 503 de concurrencia no se descarta: la cola fuera de linea lo conserva para reintentar", () => {
  const classify = (() => {
    const start = offline.indexOf("export function classifySyncFailure(");
    const fromStart = offline.slice(start);
    return fromStart.slice(0, fromStart.search(/\n\}[ \t]*\r?\n/));
  })();
  assert.ok(classify.includes("permanent"), "debe existir la clasificacion de fallos");
  assert.match(classify, /status >= 400 && status < 500/, "5xx es reintentable: solo 4xx permanentes descartan la marcacion");
  assert.match(classify, /408, 429/, "timeout y limite tambien son reintentables");
  const reason = (() => {
    const start = offline.indexOf("export function syncFailureReason(");
    const fromStart = offline.slice(start);
    return fromStart.slice(0, fromStart.search(/\n\}[ \t]*\r?\n/));
  })();
  assert.match(reason, /failure\.code/, "el codigo acompana el motivo para que soporte identifique el lock");
});
