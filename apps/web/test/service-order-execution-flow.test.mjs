import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/servicios/[id]/page.tsx", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("cada solicitud controla su propio panel de inspeccion y ejecucion", () => {
  assert.match(source, /panelForStatus\(nextItem\?\.status \|\| data\.status\)/);
  assert.match(source, /\["en_curso", "inspeccion"\]\.includes\(selectedItem\.status\)/);
  assert.match(source, /selectedItem\?\.status === "ejecucion" \|\| Boolean\(order\.item_progress\?\.all_completed\)/);
  assert.match(source, /selectedItem\?\.metadata\?\.inspection\?\.items/);
});

test("la solicitud solo se finaliza desde ejecucion con ambas evidencias", () => {
  assert.match(source, /disabled=\{working \|\| !executionPhotosReady\(\)\}/);
  assert.match(source, /onClick=\{\(\) => transitionItem\("completada"\)\}/);
  assert.doesNotMatch(source, /selectedItem\.status !== "pendiente" \? <button[^>]+transitionItem\("completada"\)/);
});

test("al terminar una solicitud se selecciona la siguiente pendiente", () => {
  assert.match(source, /currentItem && !itemIsFinished\(currentItem\.status\)/);
  assert.match(source, /data\.items\.find\(\(item\) => !itemIsFinished\(item\.status\)\)/);
  assert.match(source, /setClosureMode\(Boolean\(data\.item_progress\?\.all_completed\)\)/);
  assert.match(source, /if \(order\.item_progress\?\.all_completed\) setClosureMode\(true\)/);
  assert.doesNotMatch(source, /executionPhotoTypes\.every\(\(type\) => order\.photos/);
  assert.match(source, /status === "completada" \|\| status === "no_ejecutada"/);
  assert.match(source, /setCaptures\(\{\}\);\s+setUploading\(\{\}\);\s+setUploadStatus\(\{\}\);/);
});

test("la evidencia visible y el contador pertenecen a la solicitud seleccionada", () => {
  assert.match(source, /selectedItem\?\.photos\?\.length \|\| 0/);
  assert.match(source, /photoBelongsToItem\(photo, selectedItemId\)/);
  assert.match(source, /const targetItemId = !orderLevelEvidence && selectedItem && !selectedItem\.legacy/);
  assert.match(source, /const targetItemKey = !orderLevelEvidence && selectedItem/);
  assert.match(source, /service_item_key: targetItemKey/);
  assert.match(source, /items: targetItemKey \? current\.items\.map/);
});

test("el inicio de la primera solicitud tambien inicia la orden", () => {
  assert.match(source, /status === "en_curso" && order\?\.status === "pendiente"/);
  assert.match(source, /\/api\/v1\/services\/orders\/\$\{params\.id\}\/start/);
});

test("las solicitudes externas no quedan bloqueadas por la marca legacy", () => {
  assert.doesNotMatch(source, /if \(!selectedItem \|\| selectedItem\.legacy\) return/);
  assert.match(source, /selectedItem\?\.legacy \? \{ item_key: selectedItemId \} : \{\}/);
  assert.match(apiSource, /serviceOrderItemStatusMatch/);
  assert.match(apiSource, /service_item_key/);
  assert.match(apiSource, /status: String\(item\.status \|\| "pendiente"\)/);
  assert.match(apiSource, /item_progress: itemProgress/);
});

test("una solicitud bloqueada se puede reanudar", () => {
  assert.match(source, /selectedItem\.status === "bloqueada"/);
  assert.match(source, /onClick=\{\(\) => transitionItem\("en_curso"\)\}[^>]*><Play[^>]*\/> Reanudar solicitud/);
  assert.match(source, /bloqueada: "Bloqueada"/);
});
