import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Sincronizacion de jornada entre dispositivos operativos: la lectura une los grupos de
// asistencia del mismo empleado y el boton revalida contra el servidor antes de escribir.
// Sin estas dos piezas, dos celulares sobre la misma jornada abren la misma pierna dos veces.
const root = path.resolve(import.meta.dirname, "..");
const marking = fs.readFileSync(path.join(root, "app/dashboard/talento-humano/marcacion/page.tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "lib/hrAttendanceState.ts"), "utf8");

function region(start, end) {
  const from = marking.indexOf(start);
  const to = marking.indexOf(end, from);
  assert.ok(from > -1 && to > from, `no se encontro la region ${start}`);
  return marking.slice(from, to);
}

test("la pantalla lee la union de grupos, no la primera fila que coincida", () => {
  const body = region("const optimisticPunchesForRoute", "const sessionActivities");
  assert.match(body, /attendancePunches\(attendance, employee\?\.id, \[\.\.\.aliases, userName, employeeName\(employee\)\], route\?\.id, optimisticPunchesForRoute\)/);
  assert.equal(body.includes("...(attendanceForRoute?.punches || [])"), false, "volvio a mergear una sola fila de asistencia");
});

test("la libreria compartida es la que hace la union por identidad", () => {
  assert.match(marking, /import \{ attendancePunches \} from "@\/lib\/hrAttendanceState";/);
  assert.match(library, /groups\.filter\(group =>/);
  assert.match(library, /String\(group\.employee_id\) === String\(employeeId\)/);
});

test("la revalidacion es de un solo vuelo y no abre una lectura distinta a la que se muestra", () => {
  const body = region("function refreshOperationalState", "async function refreshGps");
  assert.match(body, /if \(operationalRefresh\.current\) return operationalRefresh\.current;/);
  assert.match(body, /api<Attendance\[\]>\("\/api\/v1\/hr\/self\/attendance", options\)/);
  assert.match(body, /api<TimeRoute\[\]>\("\/api\/v1\/hr\/self\/routes", options\)/);
  assert.match(body, /cache: "no-store" as const, silentFailureAlert: true/);
  assert.match(body, /setAttendance\(freshAttendance\)/);
});

test("las actividades con foto solo se releen cuando cambia la firma de marcaciones", () => {
  const body = region("function refreshOperationalState", "async function refreshGps");
  assert.match(body, /if \(signature !== punchSignature\.current\) \{/);
  assert.equal(/setSession\(value\)/.test(body.match(/if \(signature !== punchSignature\.current\) \{[\s\S]*?\n      \}/)?.[0] || ""), true, "el releo de actividades se salio de la guarda de firma");
});

test("antes de marcar se consulta el servidor y la pierna ya tomada no se repite", () => {
  const body = region("async function mark(type: string)", "async function openActivityModal");
  assert.match(body, /latest = await refreshOperationalState\(\)/);
  assert.match(body, /El horario cambió en el servidor/);
  assert.match(body, /La jornada se actualizó desde otro dispositivo/);
  assert.match(body, /La jornada ya fue cerrada desde otro dispositivo/);
  assert.match(body, /const expected = nextPunchForTypes\(types\);[\s\S]{0,240}if \(expected !== type\)/);
});

test("un fallo de red en la revalidacion no le niega la marcacion al operario", () => {
  const body = region("async function mark(type: string)", "async function openActivityModal");
  assert.match(body, /try \{ latest = await refreshOperationalState\(\); \} catch \{/);
  assert.match(body, /if \(isOnline\) \{[\s\S]{0,1600}if \(latest\) \{/);
  assert.equal(/if \(latest\)[\s\S]{0,1200}?notify\([^)]*, "error"\)[\s\S]{0,80}?return;[\s\S]{0,400}?catch/.test(body.slice(0, body.indexOf("if (latest) {") + 1400)), false);
});

test("la cola pendiente sigue contando como pierna propia durante la revalidacion", () => {
  const body = region("async function mark(type: string)", "async function openActivityModal");
  assert.match(body, /readPendingSync\(\)\.filter\(\(item\) => !isBlockedItem\(item\)\)/);
  assert.match(body, /optimisticPunchesForRoute\.filter\(\(punch\) => punch\.idempotency_key && pendingKeys\.has\(punch\.idempotency_key\)\)/);
  assert.match(body, /attendancePunches\(latest\.attendance, employee\.id, \[\.\.\.aliases, userName, employeeName\(employee\)\], route\.id, localPunches\)/);
});

test("la revalidacion no despierta el dialogo nativo del navegador", () => {
  const body = region("function refreshOperationalState", "async function refreshGps") + region("async function mark(type: string)", "async function openActivityModal");
  for (const native of ["window.alert(", "window.confirm(", "window.prompt(", "alert(", "confirm(", "prompt("]) {
    assert.equal(body.includes(native), false, `${native} volvio a la ruta de marcacion`);
  }
});
