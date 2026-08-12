import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/servicios/[id]/page.tsx", import.meta.url), "utf8");

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
});

test("el inicio de la primera solicitud tambien inicia la orden", () => {
  assert.match(source, /status === "en_curso" && order\?\.status === "pendiente"/);
  assert.match(source, /\/api\/v1\/services\/orders\/\$\{params\.id\}\/start/);
});
