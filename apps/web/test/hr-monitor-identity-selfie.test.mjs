import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// La marcacion de la app llega firmada con la huella del telefono registrado y
// con una selfie. El monitor de horarios debe:
//  1) mostrar la selfie junto al soporte de horas extra, no en su lugar;
//  2) pedirla a la API como fuente "identity" (el listado no trae su contenido);
//  3) distinguir las marcaciones verificadas con una insignia.

const source = readFileSync(
  new URL("../app/dashboard/talento-humano/rutas/page.tsx", import.meta.url),
  "utf8"
);

test("la evidencia de una marcacion incluye el soporte extra y la selfie", () => {
  assert.match(source, /evidence: \[event\.extra_evidence, event\.identity_evidence\]\.filter\(hasEvidenceFile\)/);
  assert.match(source, /source\?: "activity" \| "punch" \| "identity"/);
});

test("cada evidencia se carga con su propia fuente", () => {
  assert.match(source, /const source = summary\.source \|\| \(event\.kind === "marca" \? "punch" : "activity"\)/);
  assert.match(source, /\/api\/v1\/hr\/monitor-evidence\/\$\{source\}\//);
});

test("el lote del monitor une soporte extra y selfie por marcacion", () => {
  assert.match(source, /batch\.identity_evidence/);
  assert.match(source, /\[batch\.punch_evidence\?\.\[id\], batch\.identity_evidence\?\.\[id\]\]/);
});

test("las marcaciones verificadas llevan la insignia de identidad", () => {
  assert.match(source, /identityVerified: event\.metadata\?\.identity_verification\?\.status === "verified"/);
  assert.match(source, /Identidad verificada/);
});
