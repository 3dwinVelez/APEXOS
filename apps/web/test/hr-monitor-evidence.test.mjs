import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../app/dashboard/talento-humano/rutas/page.tsx"), "utf8");

test("el monitor carga la foto de cada actividad solo cuando el usuario la solicita", () => {
  assert.match(source, /work-activities\/\$\{encodeURIComponent\(String\(activityId\)\)\}\/evidence\/\$\{encodeURIComponent\(String\(evidence\.id\)\)\}/);
  assert.match(source, /loadingEvidenceKey === evidenceKey \? "Cargando\.\.\." : "Ver evidencia"/);
  assert.match(source, /loadedEvidence\[evidenceKey\]/);
  assert.match(source, /alt=\{`Evidencia de \$\{event\.title\}`\}/);
});
