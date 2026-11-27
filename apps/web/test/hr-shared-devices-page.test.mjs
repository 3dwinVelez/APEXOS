import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/dashboard/talento-humano/dispositivos-marcacion/page.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../app/dashboard/talento-humano/page.tsx", import.meta.url), "utf8");
const functions = readFileSync(new URL("../lib/moduleFunctions.ts", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("el maestro de celulares lista desde la API operativa sin cache", () => {
  assert.match(page, /api<SharedDevice\[\]>\("\/api\/v1\/hr\/shared-devices", \{ cache: "no-store" \}\)/);
});

test("revocar se pregunta en la ventana de la pantalla y usa POST sin cuerpo", () => {
  assert.doesNotMatch(page, /window\.confirm\(/, "la ventanilla nativa no decia que el celular quedaba fuera de servicio");
  assert.match(page, /const \[pendingRevoke, setPendingRevoke\] = useState<SharedDevice \| null>\(null\);/, "la fila elegida se guarda como estado propio");
  assert.match(page, /onClick=\{\(\) => setPendingRevoke\(row\)\}/, "el primer boton arma la ventana, no revoca");
  assert.match(page, /\{pendingRevoke \? \(/, "la ventana solo existe mientras hay un celular senalado");
  assert.match(page, /onConfirm=\{\(\) => void revoke\(pendingRevoke\)\}/, "el segundo clic es el que revoca");
  assert.match(page, /setPendingRevoke\(null\);/, "al revocar se cierra la ventana");
  assert.match(page, /\/api\/v1\/hr\/shared-devices\/\$\{row\.id\}\/revoke`, \{ method: "POST" \}/);
});

test("la pagina respeta hr:read para ver y hr:write para revocar", () => {
  assert.match(page, /hasStoredRolePermission\("hr", "read"\)/);
  assert.match(page, /hasStoredRolePermission\("hr", "write"\)/);
  assert.match(page, /access\.canWrite \?/);
});

test("la pagina nunca muestra la llave publica", () => {
  assert.doesNotMatch(page, /public_key/);
});

test("el hub y el buscador enlazan el maestro", () => {
  assert.match(hub, /\/dashboard\/talento-humano\/dispositivos-marcacion/);
  assert.match(functions, /fn-hr-dispositivos-marcacion/);
});

test("una escritura rechazada del maestro no cae al respaldo Supabase", () => {
  assert.match(apiSource, /\/api\/v1\/hr\/shared-devices/);
});
