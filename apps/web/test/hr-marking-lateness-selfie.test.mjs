import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Reglas de captura de la marcacion web: llegada tarde sustentada, selfie en las
// cuatro marcaciones y kilometraje al abrir la jornada con vehiculo.
const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const marking = read("app/dashboard/talento-humano/marcacion/page.tsx");
// La lista de requisitos vive en dos lados y tienen que decir lo mismo: el navegador
// pregunta y el API exige. Cuando divergen aparece el rechazo que costo jornadas.
const mobileIdentity = fs.readFileSync(
  path.resolve(root, "../api/src/modules/hr/mobile-identity.js"),
  "utf8"
);

function setLiteral(source, declaration) {
  const match = source.match(new RegExp(`${declaration} = new Set\\(\\[([^\\]]+)\\]\\)`));
  assert.ok(match, `no se encontro la declaracion ${declaration}`);
  return match[1].split(",").map((item) => item.trim().replace(/^"|"$/g, "")).sort();
}

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

test("las cuatro marcaciones web exigen selfie y el navegador y el API piden las mismas", () => {
  const cuatro = ["entrada", "fin_almuerzo", "inicio_almuerzo", "salida"];
  assert.deepEqual(setLiteral(marking, "selfieRequiredPunches"), cuatro);
  assert.deepEqual(setLiteral(mobileIdentity, "WEB_SELFIE_REQUIRED_TYPES"), cuatro);
  // El canal firmado NO cambia con esto: las apps instaladas firman el almuerzo sin
  // foto, y exigirselas se convierte en firma invalida, no en un pedido de selfie.
  assert.deepEqual(setLiteral(mobileIdentity, "SELFIE_REQUIRED_TYPES"), ["entrada", "salida"]);

  assert.match(marking, /facing="user"/);
  // La etiqueta nombra la marcacion que se esta tomando: con cuatro tipos ya no sirve
  // el viejo "entrada / cierre".
  assert.match(marking, /label=\{`Selfie de \$\{punchLabels\[nextType/);
  assert.doesNotMatch(marking, /Selfie de validacion de entrada/);
  assert.match(marking, /degradedPhoto && degradedPhoto\.step === type/);
  assert.match(marking, /Las cuatro marcaciones piden foto/);
  assert.doesNotMatch(marking, /El almuerzo y el retorno no piden foto/);

  const body = markBody();
  assert.match(body, /selfieRequiredPunches\.has\(type\) && !identitySelfie && !degradedFor\(type\)/);
  // El envio degradado solo cuenta en el paso donde la camara fallo.
  assert.match(body, /degradedFor\(type\) && selfieRequiredPunches\.has\(type\)/);
  assert.match(body, /payload\.identity_photo = \{ base64: identitySelfie\.base64/);
  // El blob: del navegador no sirve en el servidor ni sobrevive a la cola.
  assert.doesNotMatch(body, /payload\.identity_photo = identitySelfie;/);
});

test("la selfie queda ligada al paso que se esta marcando", () => {
  assert.match(marking, /const \[selfieType, setSelfieType\] = useState\(""\)/);
  assert.match(marking, /onChange=\{\(photo\) => \{ setIdentitySelfie\(photo\); setSelfieType\(nextType \?\? ""\); \}\}/);
  assert.match(marking, /value=\{selfieType === nextType \? identitySelfie : null\}/);
  assert.match(marking, /key=\{nextType\}/, "la camara se reinicia en cada paso");
  assert.match(markBody(), /identitySelfie && selfieType !== type && !degradedFor\(type\)/);
  assert.match(markBody(), /setSelfieType\(""\);/, "marcar suelta la foto: si no, el paso siguiente heredaria la del anterior");
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
