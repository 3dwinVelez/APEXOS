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

test("cuenta selfie y soporte de horas extra, también cuando el listado solo los anuncia", () => {
  // Contrato del 2026-11-19: `/hr/attendance` dejo de arrastrar el binario (MAR-109) y anuncia
  // el soporte con `has_base64_data`; el archivo lo pide `HrTimelineEvidence` por id. Contar
  // solo los bytes habria dejado el reporte otra vez en "Sin evidencia fotografica".
  assert.match(page, /punchEvidenceAnnounced\(punch\.extra_evidence\) \? 1 : 0/);
  assert.match(page, /evidence\.has_base64_data \|\| evidence\.base64_data \|\| evidence\.base64/);
  assert.match(page, /if \(punchEvidenceAnnounced\(punch\.extra_evidence\)\) photos\.push\(\{ \.\.\.punch\.extra_evidence, id: punch\.id, source: "punch" \}\)/);
});

test("muestra la selfie y la insignia de identidad verificada", () => {
  assert.match(page, /alt=\{`Selfie de \$\{event\.userName\}`\}/);
  assert.match(page, /identityVerified: punch\.metadata\?\.identity_verification\?\.status === "verified"/);
  assert.match(page, /Identidad verificada/);
});
