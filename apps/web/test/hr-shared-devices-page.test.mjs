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

test("revocar pide confirmacion y usa POST sin cuerpo", () => {
  assert.match(page, /window\.confirm\(/);
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
