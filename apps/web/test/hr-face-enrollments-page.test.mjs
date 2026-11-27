import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/dashboard/talento-humano/rostros/page.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../app/dashboard/talento-humano/page.tsx", import.meta.url), "utf8");
const functions = readFileSync(new URL("../lib/moduleFunctions.ts", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const reports = readFileSync(new URL("../app/dashboard/talento-humano/reportes/page.tsx", import.meta.url), "utf8");

test("el maestro de rostros lista desde la API operativa sin cache", () => {
  assert.match(page, /api<FaceEnrollment\[\]>\("\/api\/v1\/hr\/face-enrollments", \{ cache: "no-store" \}\)/);
});

test("restablecer se pregunta en la ventana de la pantalla y usa DELETE del empleado", () => {
  assert.doesNotMatch(page, /window\.confirm\(/, "la ventanilla nativa tapaba la tabla y no explicaba la perdida");
  assert.match(page, /const \[pendingReset, setPendingReset\] = useState<FaceEnrollment \| null>\(null\);/, "la fila elegida se guarda como estado propio");
  assert.match(page, /onClick=\{\(\) => setPendingReset\(row\)\}/, "el primer boton arma la ventana, no ejecuta");
  assert.match(page, /\{pendingReset \? \(/, "la ventana solo existe mientras hay una fila senalada");
  assert.match(page, /onConfirm=\{\(\) => void reset\(pendingReset\)\}/, "el segundo clic es el que restablece");
  assert.match(page, /setPendingReset\(null\);/, "al restablecer se cierra la ventana");
  assert.match(page, /\/api\/v1\/hr\/employees\/\$\{encodeURIComponent\(String\(row\.employee_id\)\)\}\/face-enrollment`, \{ method: "DELETE"/);
});

test("la pagina respeta hr:read para ver y hr:write para restablecer, y no muestra el embedding", () => {
  assert.match(page, /hasStoredRolePermission\("hr", "read"\)/);
  assert.match(page, /hasStoredRolePermission\("hr", "write"\)/);
  assert.doesNotMatch(page, /embedding/);
});

test("el hub, el buscador y el bloqueo de respaldo incluyen el maestro de rostros", () => {
  assert.match(hub, /\/dashboard\/talento-humano\/rostros/);
  assert.match(functions, /fn-hr-rostros/);
  assert.match(apiSource, /face-enrollment/);
});

test("los reportes senalan cuando el rostro no coincide", () => {
  assert.match(reports, /function faceMatchNote\(/);
  assert.match(reports, /ROSTRO NO COINCIDE/);
});
