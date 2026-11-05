import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// El supervisor restablece desde el maestro de empleados el telefono con el
// que el empleado marca usando su huella (cambio de equipo o huella nueva
// inscrita en el suyo). Sin esto, el empleado quedaria bloqueado.

const source = readFileSync(
  new URL("../app/dashboard/talento-humano/empleados/page.tsx", import.meta.url),
  "utf8"
);

test("la ficha del empleado muestra el telefono registrado para marcar", () => {
  assert.match(source, /function BiometricEnrollmentPanel/);
  assert.match(source, /Telefono para marcar con huella/);
  assert.match(source, /employee\.metadata\?\.mobile_biometric/);
});

test("restablecer pide confirmacion y usa la ruta del API", () => {
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /\/api\/v1\/hr\/employees\/\$\{encodeURIComponent\(String\(employee\.id\)\)\}\/biometric-enrollment/);
  assert.match(source, /method: "DELETE"/);
});

test("el panel solo aparece sobre un empleado existente", () => {
  assert.match(source, /selected && mode !== "create" \? <BiometricEnrollmentPanel/);
});
