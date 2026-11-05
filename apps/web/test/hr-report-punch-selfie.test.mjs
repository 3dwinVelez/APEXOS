import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// La vista consolidada de Reportes contaba las marcaciones siempre con cero
// evidencias ("Sin evidencia fotografica") aunque la marcacion de la app trae
// su selfie. Ahora cuenta selfie y soporte de horas extra, muestra la selfie y
// la insignia de identidad verificada.

const page = readFileSync(
  new URL("../app/dashboard/talento-humano/reportes/page.tsx", import.meta.url),
  "utf8"
);

test("las marcaciones ya no tienen evidencias fijas en cero", () => {
  assert.doesNotMatch(page, /evidenceCount: 0 \}/);
  assert.match(page, /evidenceCount: punchEvidenceCount\(punch\)/);
});

test("lee la selfie en las dos formas en que puede estar guardada", () => {
  assert.match(page, /photo\?\.base64_data \|\| photo\?\.base64/);
  assert.match(page, /content\.startsWith\("data:"\)/);
});

test("cuenta selfie y soporte de horas extra", () => {
  assert.match(page, /punch\.extra_evidence\?\.base64_data \|\| punch\.extra_evidence\?\.file_url/);
});

test("muestra la selfie y la insignia de identidad verificada", () => {
  assert.match(page, /alt=\{`Selfie de \$\{event\.userName\}`\}/);
  assert.match(page, /identityVerified: punch\.metadata\?\.identity_verification\?\.status === "verified"/);
  assert.match(page, /Identidad verificada/);
});
