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

test("restablecer se arma con dos clics en el panel y usa la ruta del API", () => {
  assert.doesNotMatch(source, /window\.confirm\(/, "la pregunta ya no tapa la pantalla: vive en el panel");
  assert.match(source, /const \[armed, setArmed\] = useState\(false\);/);
  assert.match(source, /onClick=\{\(\) => setArmed\(true\)\}/, "el primer clic arma, no borra");
  assert.match(source, /onClick=\{\(\) => setArmed\(false\)\}/, "cancelar desarma: el panel no puede quedar apuntando a un empleado viejo");
  assert.match(source, /\{busy \? "Restableciendo\.\.\." : "Confirmar restablecimiento"\}/);
  assert.match(source, /\/api\/v1\/hr\/employees\/\$\{encodeURIComponent\(String\(employee\.id\)\)\}\/biometric-enrollment/);
  assert.match(source, /method: "DELETE"/);
});

test("el panel se remonta al cambiar de empleado y no hereda el disparador armado", () => {
  // Sin el key, React conserva el estado y el segundo clic borraría el registro del empleado
  // equivocado: el panel queda montado sobre otra ficha con "armed" todavía en true.
  const montaje = source.match(/<BiometricEnrollmentPanel key=\{String\(selected\.id\)\}[^>]*employee=\{selected\}/);
  assert.ok(montaje, "el panel debe ir remontado por empleado: si cambió de forma, este control ya no mide nada");
});

test("el panel solo aparece sobre un empleado existente", () => {
  assert.match(source, /selected && mode !== "create" \? <BiometricEnrollmentPanel/);
});
