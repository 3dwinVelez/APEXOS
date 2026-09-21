import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8");

// Regresion split-brain de horarios: el monitor lee las mallas desde la API operativa
// (Prisma TimeRoute), pero el respaldo Supabase escribe en operational_routes/route_assignments,
// tablas que el monitor nunca lee. Cuando la API rechazaba la escritura (400
// HORARIO_CRUZA_MEDIANOCHE o 409 MALLA_SOLAPADA), apiInternal caia en silencio al respaldo y la
// pantalla mostraba "Horario asignado correctamente." sin que el horario apareciera nunca.

function hrWriteFallbackGuard() {
  const api = read("../lib/api.ts");
  const start = api.indexOf("function shouldBlockHrWriteFallback");
  assert.ok(start >= 0, "debe existir shouldBlockHrWriteFallback");
  return api.slice(start, api.indexOf("\n}", start) + 2);
}

test("las escrituras de horarios nunca caen al respaldo Supabase", () => {
  const guard = hrWriteFallbackGuard();
  assert.match(guard, /"\/api\/v1\/hr\/routes"/);
  assert.match(guard, /"\/api\/v1\/hr\/routes\/bulk"/);
  assert.match(guard, /\^\\\/api\\\/v1\\\/hr\\\/routes\\\/\[\^\/\]\+\$/);
  assert.match(guard, /method !== "GET"/);
});

test("apiInternal consulta el guard antes de intentar el respaldo en respuestas no OK", () => {
  const api = read("../lib/api.ts");
  const start = api.indexOf("async function apiInternal");
  assert.ok(start >= 0, "debe existir apiInternal");
  const body = api.slice(start);
  const notOk = body.slice(body.indexOf("if (!response.ok) {"), body.indexOf("if (!response.ok) {") + 400);
  assert.match(notOk, /if \(supabaseSession && !shouldBlockHrWriteFallback\(path, method\)\)/);
});

test("la lectura del monitor conserva su respaldo: solo se bloquean metodos distintos de GET", () => {
  const api = read("../lib/api.ts");
  // shouldPreferOperationalApi sigue enviando /api/v1/hr/* a Fastify primero, y el guard
  // exige method !== "GET", de modo que GET /api/v1/hr/routes y /event-summaries no cambian.
  const prefer = api.slice(api.indexOf("function shouldPreferOperationalApi"), api.indexOf("function shouldPreferOperationalApi") + 400);
  assert.match(prefer, /path\.startsWith\("\/api\/v1\/hr"\)/);
  assert.match(hrWriteFallbackGuard(), /return method !== "GET" &&/);
});

test("el respaldo preventivo tambien consulta el guard cuando no hay API configurada", () => {
  const api = read("../lib/api.ts");
  const start = api.indexOf("async function apiInternal");
  assert.ok(start >= 0, "debe existir apiInternal");
  const body = api.slice(start);
  // preferOperationalApi depende de HAS_CONFIGURED_API_URL; sin esa variable el respaldo
  // preventivo corria antes de cualquier respuesta y podia huerfanar la escritura.
  assert.match(body, /if \(supabaseSession && !preferOperationalApi && !shouldBlockHrWriteFallback\(path, method\)\)/);
});

test("el banner de horarios no pinta un error como si fuera exito", () => {
  const routes = read("../app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(routes, /const \[messageTone, setMessageTone\] = useState<"success" \| "error">/);
  const banner = routes.slice(routes.indexOf("{message ? <div"), routes.indexOf("{message ? <div") + 400);
  assert.ok(banner.length > 0, "debe existir el banner de mensajes");
  assert.match(banner, /messageTone === "error" \? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"/);
  assert.match(banner, /role=\{messageTone === "error" \? "alert" : "status"\}/);
  const start = routes.indexOf("async function saveRoute()");
  const saveRoute = routes.slice(start, routes.indexOf("const totalAssigned", start));
  const catchBlock = saveRoute.slice(saveRoute.indexOf("} catch (error) {"));
  assert.match(catchBlock, /setMessageTone\("error"\)/);
  assert.ok(
    catchBlock.indexOf("setMessageTone(\"error\")") < catchBlock.indexOf("} finally {"),
    "el tono de error debe fijarse dentro del catch"
  );
});

test("el formulario de horarios bloquea la medianoche antes de enviar la solicitud", () => {
  const routes = read("../app/dashboard/talento-humano/rutas/page.tsx");
  const start = routes.indexOf("async function saveRoute()");
  assert.ok(start >= 0, "debe existir saveRoute");
  const saveRoute = routes.slice(start, routes.indexOf("const totalAssigned", start));
  assert.match(saveRoute, /scheduleSameDayShiftIssue\(form\.start_time, form\.end_time\)/);
  // El corte debe ocurrir en la fase de validacion, antes de marcar savingRoute y llamar a la API.
  assert.ok(
    saveRoute.indexOf("if (issues.length) {") < saveRoute.indexOf("setSavingRoute(true)"),
    "la validacion debe cortar antes de iniciar el guardado"
  );
  assert.ok(
    saveRoute.indexOf("scheduleSameDayShiftIssue") < saveRoute.indexOf("if (issues.length) {"),
    "la regla de mismo dia debe alimentar la lista de issues"
  );
  assert.match(saveRoute, /api<TimeRoute>\("\/api\/v1\/hr\/routes", \{ method: "POST"/);
  assert.match(saveRoute, /"\/api\/v1\/hr\/routes\/bulk", \{ method: "POST"/);
  assert.doesNotMatch(saveRoute, /form\.end_time === form\.start_time/);
});
