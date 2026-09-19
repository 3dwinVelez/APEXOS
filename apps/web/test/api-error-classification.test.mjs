import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8");

// Regresion FM-02: apiInternal debe adjuntar status/code/retryable a los errores que lanza.
// Sin ellos, permanentSyncFailure() no puede distinguir un 4xx permanente de un fallo transitorio
// y reintenta para siempre (cada 12s) marcaciones deterministicas ya rechazadas -> "se bloquea".

test("FM-02: apiInternal adjunta status y retryable en la rama 5xx", () => {
  const api = read("../lib/api.ts");
  const start = api.indexOf("async function apiInternal");
  assert.ok(start >= 0, "debe existir apiInternal");
  const body = api.slice(start);
  const branch500 = body.slice(body.indexOf("if (response.status >= 500)"), body.indexOf("if (response.status >= 500)") + 600);
  assert.match(branch500, /throw Object\.assign\(new Error\(message\), \{ status: response\.status, retryable: true \}\)/);
});

test("FM-02: apiInternal adjunta status, code y retryable selectivo en la rama 4xx", () => {
  const api = read("../lib/api.ts");
  const start = api.indexOf("async function apiInternal");
  const body = api.slice(start);
  const after500 = body.slice(body.indexOf("if (response.status >= 500)"));
  const branch4xx = after500.slice(after500.indexOf("const body = await response.json()"), after500.indexOf("const body = await response.json()") + 700);
  assert.match(branch4xx, /status: response\.status/);
  assert.match(branch4xx, /code: typeof body\.code === "string" \? body\.code : ""/);
  assert.match(branch4xx, /retryable: response\.status === 408 \|\| response\.status === 429/);
});

test("FM-02: la cola de marcacion clasifica como permanente todo 4xx no reintentable", () => {
  const marking = read("../app/dashboard/talento-humano/marcacion/page.tsx");
  const start = marking.indexOf("function permanentSyncFailure");
  assert.ok(start >= 0, "debe existir permanentSyncFailure");
  const fn = marking.slice(start, start + 260);
  assert.match(fn, /Number\(\(error as \{ status\?: number \}\)\?\.status \|\| 0\)/);
  assert.match(fn, /status >= 400 && status < 500 && !\[408, 429\]\.includes\(status\)/);
});
