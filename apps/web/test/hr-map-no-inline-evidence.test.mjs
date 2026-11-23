import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// El panel de la marca del mapa de operaciones pintaba `<Image src={metadata.evidence[0].base64_data}>`.
// Medido el 2026-11-23 sobre las 2.623 marcaciones de Produccion: la rama `metadata.evidence` existe en
// CERO filas, y la unica rama de `metadata` que lleva binarios es `identity_photo`. El `src` jamas se
// pinto: era codigo muerto fingiendo una filtracion de bytes, y el verdadero camino de la evidencia ya
// estaba servido por `HrTimelineEvidence`, que pide el archivo por id.

const mapaUrl = "../app/dashboard/talento-humano/mapa/page.tsx";
const read = (url) => readFileSync(new URL(url, import.meta.url), "utf8");

// Un binario incrustado en un `src` es lo que se retiro: una expresion que lee una rama `evidence` de
// `metadata` y la pasa como imagen. El detector se exercita abajo contra la linea retirada, porque un
// guardado que no puede fallar no protege nada.
function inlineEvidenceSources(source) {
  return source.match(/metadata\??\.evidence[^\r\n]*?src=\{[^}]*base64_data[^}]*\}/g) || [];
}

test("el panel de la marca ya no pinta binarios incrustados de metadata.evidence", () => {
  const source = read(mapaUrl);
  assert.deepEqual(inlineEvidenceSources(source), [], "ningun src del mapa debe arrastrar base64 desde metadata.evidence");
  assert.doesNotMatch(source, /metadata\?\.evidence/);
});

test("el detector de binarios incrustados puede fallar", () => {
  const retirado = '{Array.isArray(selectedMark.metadata?.evidence) && selectedMark.metadata.evidence[0]?.base64_data ? <Image alt="Evidencia operativa" src={String(selectedMark.metadata.evidence[0].base64_data)} unoptimized /> : null}';
  assert.equal(inlineEvidenceSources(retirado).length, 1, "la linea retirada debe ser detectada por el guardado");
  assert.equal(inlineEvidenceSources("sin nada que ver con evidencia").length, 0, "y un fuente limpio no debe dar falsos positivos");
});

test("la evidencia sigue llegando por referencia, no por payload", () => {
  const source = read(mapaUrl);
  assert.match(source, /<HrTimelineEvidence evidence=\{\[selectedMark\.extra_evidence, selectedMark\.identity_evidence\]\.filter\(scheduleMonitorHasEvidenceFile\)\} \/>/);
});

test("retirar el binario no huerfano el import de Image", () => {
  const source = read(mapaUrl);
  assert.match(source, /import Image from "next\/image";/);
  const usos = source.match(/<Image[\s>]/g) || [];
  assert.ok(usos.length >= 1, "Image debe seguir usandose en la pantalla o el import sobra");
});
