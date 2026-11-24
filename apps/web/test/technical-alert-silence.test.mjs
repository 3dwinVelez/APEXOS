// Contrato de la capa de alertas: un fallo tecnico se registra, nunca se convierte en ventana.
//
// Esta regresion existe porque la intervencion del 2026-11-18 enmudecio `alertRequestFailure` (la
// unica funcion que convertia cualquier 5xx, 429 o corte de red en una tarjeta flotante con la ruta
// y el codigo de estado) y retiro el canal `apex:alert`. Sin estas comprobaciones, un import
// inocente puede volver a montar la ventana en cualquier pantalla y el cliente otra vez ve
// "Fallo tecnico detectado" saturandole la vista.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const apiSource = read("lib/api.ts");
const alertsModule = read("lib/platformAlerts.ts");
const alertShell = read("components/system/PlatformAlerts.tsx");
const globalError = read("app/error.tsx");
const loginPage = read("app/login/page.tsx");
const supabaseClient = read("lib/supabaseClient.ts");

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".next-hr-marking-gate"].includes(entry.name)) continue;
      sourceFiles(relative, found);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) found.push(relative);
  }
  return found;
}

test("el punto unico de fallo tecnico emite diagnostico, no ventana de usuario", () => {
  const body = apiSource.slice(apiSource.indexOf("function alertRequestFailure"));
  assert.match(body.slice(0, 1200), /emitPlatformDiagnostic\(/, "alertRequestFailure debe usar el canal de diagnostico");
  assert.doesNotMatch(body.slice(0, 1200), /emitAppAlert|notifyPlatform\(/, "ningun fallo puede volver a abrir la alerta de usuario");
});

test("el canal apex:alert esta retirado del cliente", () => {
  assert.doesNotMatch(alertsModule, /apex:alert/, "platformAlerts ya no puede publicar alertas de usuario");
  assert.doesNotMatch(alertsModule, /export function notifyPlatform/, "la funcion de ventana global debe seguir retirada");
  for (const file of sourceFiles(".")) {
    const source = read(file);
    assert.doesNotMatch(source, /\bemitAppAlert\b/, `${file} no puede reimportar emitAppAlert`);
    assert.doesNotMatch(source, /notifyPlatform/, `${file} no puede reimportar notifyPlatform`);
  }
});

test("la tarjeta tecnica vive detras del modo diagnostico y con presupuesto", () => {
  assert.match(alertShell, /if \(!technicalDiagnosticsEnabled\(\)\) return;/, "sin la llave de soporte el componente no escucha fallos");
  assert.match(alertShell, /DIAGNOSTIC_BUDGET_CARDS/, "el detalle tecnico tampoco puede saturar la pantalla de soporte");
  assert.match(alertShell, /platformDiagnosticEventName\(\)/, "el unico evento que monta tarjetas es el diagnostico");
});

test("el mensaje que ve el operario no lleva ruta ni codigo de estado", () => {
  assert.match(apiSource, /function requestErrorMessage\(status: number, detail: string/, "la firma retiro la ruta: no hay nada que filtrar");
  assert.match(apiSource, /function friendlyFailure\(status: number, method: string, failure: FailureEnvelope\)/);
  const body = apiSource.slice(apiSource.indexOf("function requestErrorMessage"), apiSource.indexOf("type ApiRequestOptions"));
  assert.ok(body.length > 200, "el cuerpo del mensaje debe seguir siendo auditable");
  assert.doesNotMatch(body, /\$\{path\}|\$\{input\}/, "la ruta jamas se interpola en el texto de pantalla");
  assert.doesNotMatch(body, /Ruta: /, "la cadena tecnica pertenece al diagnostico, no al banner");
});

test("un corte de red se dice en espanol de operario, no en ingles de navegador", () => {
  assert.match(apiSource, /function browserNetworkNotice\(/, "debe existir la traduccion del fallo de red");
  assert.match(apiSource, /const notice = browserNetworkNotice\(error\);/, "el catch de red lanza la frase accionable");
  assert.match(apiSource, /No fue posible conectar con el servicio/, "el operario sabe que revisar y que su trabajo no se perdio");
  assert.doesNotMatch(apiSource, /throw new Error\("API no disponible/, "el texto tecnico crudo ya no es el mensaje de pantalla");
});

test("la pantalla de error global no pinta el detalle crudo", () => {
  assert.doesNotMatch(globalError, /error\.message/, "el mensaje del Error no se muestra al cliente");
  assert.match(globalError, /digest/, "la referencia de soporte sigue disponible para quien la necesite");
});

test("el aviso de sesion reemplaza a la ventana de 401", () => {
  assert.match(loginPage, /apex_session_end_reason/, "el login lee el motivo que clearSession ya guardaba");
  assert.match(loginPage, /idle_timeout:/, "el cierre por inactividad tiene su propio aviso");
  assert.match(loginPage, /role="status"/, "el aviso es texto del formulario, no una tarjeta flotante");
  assert.match(apiSource, /clearSession\(isSupabaseSession\(\) \? "supabase_unauthorized" : "unauthorized"\)/);
});

test("el fallback de base de datos no filtra su codigo al operario", () => {
  assert.doesNotMatch(supabaseClient, /new Error\(`Supabase \$\{/, "el envelope tecnico dejo de ser el mensaje de pantalla");
  assert.match(supabaseClient, /function supabaseFailureNotice\(status: number\)/, "existe la traduccion por estado");
  assert.match(supabaseClient, /\(error as \{ status\?: number \}\)\.status === 401/, "la deteccion de 401 usa la propiedad, no el literal");
});

test("los temporizadores de a pie no vuelven a multiplicar la tormenta", () => {
  const rutas = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(rutas, /const ROUTES_BACKSTOP_POLL_MS = 30_000;/, "el respaldo del monitor de horarios no baja de 30 s");
  assert.doesNotMatch(rutas, /window\.setInterval\(refreshVisible, 5000\)/);
  const mapa = read("app/dashboard/talento-humano/mapa/page.tsx");
  assert.match(mapa, /const LIVE_REFRESH_SECONDS = (30|60);/, "la malla GPS en vivo espera al presupuesto del servidor");
  const monitoreo = read("app/dashboard/transporte/monitoreo/page.tsx");
  assert.match(monitoreo, /document\.visibilityState === "visible"/, "el monitoreo de flota deja de consultar en pestana oculta");
  assert.match(monitoreo, /El mapa conserva la ultima lectura/, "con datos viejos la pantalla lo dice, no lo calla");
});

test("la validacion de empleados se pinta en el campo, no en una ventana", () => {
  const empleados = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.doesNotMatch(empleados, /(\bwindow\.|\bglobalThis\.)?alert\s*\(/, "ningun mensaje de validacion puede volver a ser ventanilla nativa");
  assert.match(empleados, /setFormErrors\(errors\);/, "el guardado agrupa los motivos y los entrega al formulario");
  assert.match(empleados, /role="alert">\{error\}<\/span>/, "el motivo se lee debajo del campo que lo incumple");
  assert.match(empleados, /aria-invalid=\{error \? true : undefined\}/, "el campo marcado como invalido lo dice tambien para el lector de pantalla");
});

test("corregir el dato limpia el motivo en linea", () => {
  const empleados = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(empleados, /onChange=\{\(value\) => \{ clearFormError\("exoneration_support"\);/, "escribir el soporte ET 114-1 retira su propio mensaje");
  assert.match(empleados, /if \(!event\.target\.checked\) clearFormError\("exoneration_support"\);/, "desmarcar la casilla no puede dejar el motivo colgado");
});

test("la pantalla de Empleados no levanta ninguna ventanilla nativa (ni aviso, ni pregunta, ni captura de fecha)", () => {
  const empleados = read("app/dashboard/talento-humano/empleados/page.tsx");
  const ventanillas = /(?:\bwindow\.|\bglobalThis\.)(alert|confirm|prompt)\s*\(/g;
  // Control de contraste: el mismo barrido tiene que ver una ventanilla si existe. Sin esta linea,
  // un regex mal escrito sale verde para siempre y el contrato no afirma nada.
  assert.deepEqual([...`window.confirm("x"); globalThis.prompt("y");`.matchAll(ventanillas)].map((m) => m[1]).sort(), ["confirm", "prompt"], "el barrido detecta las ventanillas que dice detectar");
  ventanillas.lastIndex = 0;
  assert.deepEqual([...empleados.matchAll(ventanillas)].map((m) => m[1]), [], "la pantalla cerro el alert, el confirm de huella y el prompt de fecha");
});

test("el cierre de vigencia pide la fecha en la propia fila y el motivo se queda debajo del campo", () => {
  const empleados = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(empleados, /aria-label="Fecha final de vigencia"[^>]*type="date"/, "la fecha se escribe en un control de fecha, no en un cuadro de texto libre");
  assert.match(empleados, /setAffiliationClose\(\{ id: row\.id, valid_to: today\(\), reason: "" \}\)/, "el boton abre el editor de la fila en lugar de interrumpir la pantalla");
  assert.match(empleados, /role="alert">\{affiliationClose\.reason\}<\/p>/, "el motivo se lee debajo del campo que lo incumple");
  assert.match(empleados, /aria-invalid=\{affiliationClose\.reason \? true : undefined\}/, "el campo invalido lo declara al lector de pantalla");
  assert.match(empleados, /current \? \{ \.\.\.current, valid_to, reason: "" \}/, "escribir la fecha retira su propio motivo");
  assert.match(empleados, /affiliationClose\.valid_to < row\.valid_from/, "el orden de vigencias se comprueba antes de tocar la red");
  assert.match(empleados, /setAffiliationClose\(null\);\r?\n\s*await loadAffiliations/, "el cierre exitoso cierra el editor en linea");
});

test("restablecer la huella se confirma en dos clics dentro del panel", () => {
  const empleados = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(empleados, /const \[armed, setArmed\] = useState\(false\);/, "el panel guarda el paso de confirmacion como estado propio");
  assert.match(empleados, /onClick=\{\(\) => setArmed\(true\)\} type="button">\s*\{busy \? "Restableciendo\.\.\." : "Restablecer registro"\}/, "el primer clic arma la pregunta");
  assert.match(empleados, /El empleado tendra que registrar su huella otra vez en la app antes de volver a marcar\./, "la advertencia se lee en la pantalla, no en un cuadro modal");
  assert.match(empleados, /onClick=\{\(\) => void reset\(\)\} type="button">\{busy \? "Restableciendo\.\.\." : "Confirmar restablecimiento"\}/, "el segundo clic es el que ejecuta");
  assert.match(empleados, /setArmed\(false\);\r?\n\s*setMessage\("Registro restablecido/, "al restablecer se desarma la pregunta");
  assert.match(empleados, /<BiometricEnrollmentPanel key=\{String\(selected\.id\)\}/, "cambiar de empleado no puede heredar la pregunta armada");
});

test("un visitante sin sesion tambien deja su fallo en el buzon", () => {
  const reporte = apiSource.slice(apiSource.indexOf("function reportClientFailure"));
  assert.doesNotMatch(reporte.slice(0, 900), /if \(!token\) return;/, "la ausencia de token no puede silenciar el reporte");
  assert.match(apiSource, /post\(CLIENT_LOG_PUBLIC_ENDPOINT, anonymousPayload, false\)\.catch/, "el reporte anonimo usa la ruta publica y nunca rompe la pantalla");
  assert.match(apiSource, /response\.status === 401 \|\| response\.status === 403 \? post\(CLIENT_LOG_PUBLIC_ENDPOINT/, "si el canal autenticado rechaza, el reporte cae al buzon publico");
  assert.match(apiSource, /function isPlatformLogsPath/, "el buzon propio no se reporta a si mismo");
});
