import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Reglas de captura de la marcacion web: llegada tarde sustentada, selfie en
// entrada y cierre, y kilometraje al abrir la jornada con vehiculo.
const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const marking = read("app/dashboard/talento-humano/marcacion/page.tsx");

function markBody() {
  const start = marking.indexOf("async function mark(type: string)");
  const end = marking.indexOf("async function openActivityModal");
  assert.ok(start > -1 && end > start, "no se encontro el cuerpo de mark()");
  return marking.slice(start, end);
}

test("la llegada tarde se sustenta con motivo, texto y foto, igual que la extension", () => {
  assert.match(marking, /Llegada tarde detectada/);
  assert.match(marking, /const latenessReasons = \[/);
  assert.match(marking, /Motivo de la llegada tarde \*/);
  assert.match(marking, /Foto obligatoria de soporte de la llegada tarde/);

  const body = markBody();
  assert.match(body, /type === "entrada" && isArrivingLate && \(!extraReason \|\| !extraDetail\.trim\(\) \|\| !extraEvidence\)/);
  assert.match(body, /type === "salida" && isClosingLate && \(!extraReason \|\| !extraDetail\.trim\(\) \|\| !extraEvidence\)/);
});

test("la tolerancia del horario es la que decide si hay que justificar", () => {
  // Sin restar la tolerancia la pantalla pedia sustento que el servidor no
  // exigia, y el empleado llenaba motivo y foto para nada.
  assert.match(marking, /const toleranceMinutes = Math\.max\(0, Number\(route\?\.tolerance_minutes \?\? 15\)\)/);
  assert.match(marking, /minutesNow > expected \+ toleranceMinutes/);
  assert.match(marking, /tolerance_minutes\?: number \| null/);
});

test("entrada y cierre exigen selfie; el almuerzo no lleva foto", () => {
  assert.match(marking, /const selfieRequiredPunches = new Set\(\["entrada", "salida"\]\)/);
  assert.match(marking, /facing="user"/);
  assert.match(marking, /Selfie de validacion de entrada/);
  assert.match(marking, /Selfie de validacion de cierre/);
  assert.match(marking, /El almuerzo y el retorno no piden foto/);

  const body = markBody();
  assert.match(body, /selfieRequiredPunches\.has\(type\) && !identitySelfie/);
  assert.match(body, /payload\.identity_photo = \{ base64: identitySelfie\.base64/);
  // El blob: del navegador no sirve en el servidor ni sobrevive a la cola.
  assert.doesNotMatch(body, /payload\.identity_photo = identitySelfie;/);
});

test("la camara frontal es lo que hace que la selfie sea selfie", () => {
  const photo = read("components/operations/PhotoCapture.tsx");
  assert.match(photo, /facing\?: "user" \| "environment"/);
  assert.match(photo, /capture=\{capture \? facing : undefined\}/);
  assert.doesNotMatch(photo, /capture=\{capture \? "environment" : undefined\}/);
});

test("la selfie sale del localStorage a IndexedDB como las demas evidencias", () => {
  // En base64 una foto por marcacion llena la cuota del navegador.
  assert.match(marking, /const evidencePayloadKeys = \["photo", "extra_evidence", "identity_photo"\] as const/);
});

test("abrir jornada con vehiculo pide kilometraje inicial", () => {
  assert.match(marking, /Kilometraje inicial del dia/);
  assert.match(marking, /kilometraje_inicial/);

  const body = markBody();
  assert.match(body, /type === "entrada" && vehiclePlate/);
  assert.match(body, /Registra el kilometraje inicial con maximo un decimal/);
});

test("el reporte muestra la justificacion de la llegada tarde, no solo la de extension", () => {
  // Atarla a extra_minutes la escondia: llegar tarde se justifica igual pero
  // no suma hora extra, asi que el recuadro nunca salia para una entrada.
  const reportes = read("app/dashboard/talento-humano/reportes/page.tsx");
  assert.match(reportes, /const justified = sorted\.find\(\(item\) => item\.extra_reason \|\| item\.extra_detail\)/);
  assert.match(reportes, /justificationKind: !justified \? "" : justified\.type === "entrada" \? "tarde" : "extension"/);
  assert.match(reportes, /\{selected\.justificationKind \? \(/);
  assert.match(reportes, /Justificacion de llegada tarde/);
  assert.match(reportes, /min de retardo/);
  assert.doesNotMatch(reportes, /\{selected\.overtimeMinutes \? <div className="mt-4 rounded-md border border-amber-200/);
  assert.match(reportes, /late_minutes\?: number/);
});

test("el monitor nombra el retardo aparte de los minutos extra", () => {
  // Llegar tarde no es hora extra: contarlo como tal desajusta el recargo.
  const rutas = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(rutas, /function punchObservation\(event: PunchPoint\)/);
  assert.match(rutas, /minuto\(s\) de retardo/);
  assert.match(rutas, /late_minutes\?: number/);
});
