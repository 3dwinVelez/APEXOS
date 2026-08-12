import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("../app/dashboard/servicios/[id]/page.tsx", import.meta.url), "utf8");
const serviceSource = fs.readFileSync(new URL("../../api/src/modules/services/service.js", import.meta.url), "utf8");

test("la vista agrupa soportes, novedades e inspeccion por solicitud", () => {
  assert.match(pageSource, /\["cerrada", "no_ejecutada"\]\.includes\(data\.status\)[\s\S]*\? "historial"/);
  assert.match(pageSource, /const supportGroups = order\.items\.map/);
  assert.match(pageSource, /String\(photo\.item_id \|\| ""\) === String\(item\.id\)/);
  assert.match(pageSource, /item\.metadata\?\.inspection\?\.items/);
  assert.match(pageSource, /supportGroups\.map\(\(\{ item, index, photos, incidents, inspection: itemInspection \}\)/);
  assert.match(pageSource, /Validacion de piezas/);
});

test("los soportes sin item se conservan como generales", () => {
  assert.match(pageSource, /photo\.item_id == null \|\| photo\.type === "firma_cliente"/);
  assert.match(serviceSource, /const isGeneralEvidence = \(photo\) => photo\.item_id == null \|\| photo\.type === "firma_cliente"/);
  assert.match(pageSource, /Soportes generales de la orden/);
});

test("las ordenes heredadas no duplican sus soportes generales", () => {
  assert.match(pageSource, /photos: item\.legacy \? order\.photos/);
  assert.match(serviceSource, /const generalEvidence = hasPersistedItems \?/);
});

test("el reporte PDF usa los mismos grupos por referencia", () => {
  assert.match(serviceSource, /request_groups: requestGroups/);
  assert.match(serviceSource, /Solicitudes, piezas y soportes por referencia/);
  assert.match(serviceSource, /group\.inspection_items/);
  assert.match(serviceSource, /group\.evidence/);
  assert.match(serviceSource, /report\.general_evidence/);
});
