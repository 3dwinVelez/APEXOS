import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("../app/dashboard/servicios/[id]/page.tsx", import.meta.url), "utf8");
const serviceSource = fs.readFileSync(new URL("../../api/src/modules/services/service.js", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("la vista agrupa soportes, novedades e inspeccion por solicitud", () => {
  assert.match(pageSource, /\["cerrada", "no_ejecutada"\]\.includes\(data\.status\)[\s\S]*\? "historial"/);
  assert.match(pageSource, /const supportGroups = order\.items\.map/);
  assert.match(pageSource, /photoBelongsToItem\(photo, String\(item\.id\)\)/);
  assert.match(pageSource, /item\.metadata\?\.inspection\?\.items/);
  assert.match(pageSource, /supportGroups\.map\(\(\{ item, index, photos, incidents, inspection: itemInspection \}\)/);
  assert.match(pageSource, /Validacion de piezas/);
  assert.match(pageSource, /Validacion completada · referencia sin piezas configuradas/);
  assert.match(pageSource, /Novedades de la solicitud/);
  assert.match(pageSource, /<details className="mt-3 border-t border-line pt-2">/);
  assert.match(pageSource, /Ver detalle de las \{itemInspection\.length\} piezas/);
  assert.match(pageSource, /issues\.map\(\(piece\)/);
  assert.match(pageSource, /const orderLevelEvidence = type === "firma_cliente"/);
  assert.match(pageSource, /configuredParts\.length \? configuredParts : selectedItem/);
  assert.match(pageSource, /name: item\.reference\?\.name \|\| "Producto completo"/);
  assert.match(pageSource, /signaturePhotos\[signaturePhotos\.length - 1\]/);
});

test("los soportes sin item se conservan como generales", () => {
  assert.match(pageSource, /photo\.item_id == null \|\| photo\.type === "firma_cliente"/);
  assert.match(serviceSource, /const isGeneralEvidence = \(photo\) => photo\.item_id == null \|\| photo\.type === "firma_cliente"/);
  assert.match(pageSource, /Soportes generales de la orden/);
});

test("las ordenes heredadas no duplican sus soportes generales", () => {
  assert.match(pageSource, /const hasLegacyItem = order\.items\.some\(\(item\) => item\.legacy\)/);
  assert.match(pageSource, /const generalPhotos = hasLegacyItem \? \[\] :/);
  assert.match(serviceSource, /const generalEvidence = hasPersistedItems \?/);
});

test("una orden heredada de una solicitud conserva soportes historicos sin clave", () => {
  assert.match(pageSource, /item\.legacy && order\.items\.length === 1 && !photo\.metadata\?\.service_item_key/);
  assert.match(pageSource, /item\.legacy && order\.items\.length === 1 && !incident\.metadata\?\.service_item_key/);
});

test("la deduplicacion de evidencia se limita a cada solicitud externa", () => {
  assert.match(apiSource, /const serviceItemKey = String\(body\.metadata\?\.service_item_key \|\| ""\)/);
  assert.match(apiSource, /String\(item\.metadata\?\.service_item_key \|\| ""\) === serviceItemKey/);
  assert.match(apiSource, /originalType === "firma_cliente"/);
});

test("el reporte PDF usa los mismos grupos por referencia", () => {
  assert.match(serviceSource, /request_groups: requestGroups/);
  assert.match(serviceSource, /Producto \$\{index \+ 1\} de/);
  assert.match(serviceSource, /Evidencias del Producto \$\{index \+ 1\}/);
  assert.match(serviceSource, /await evidenceGallery\(group\.evidence, accent, index \+ 1\)/);
  assert.match(serviceSource, /Producto \$\{productNumber\} \| \$\{entry\.item\.label\}/);
  assert.match(serviceSource, /\/Subtype \/Image/);
  assert.match(serviceSource, /index % 2 === 0/);
  assert.match(serviceSource, /group\.inspection_items/);
  assert.match(serviceSource, /inspectionGrid\(group\.inspection_items\)/);
  assert.match(serviceSource, /requireEvidence\(id, \["firma_cliente"\]\)/);
  assert.match(serviceSource, /signatures\[signatures\.length - 1\]/);
  assert.match(serviceSource, /group\.evidence/);
  assert.match(serviceSource, /group\.incidents\.slice/);
  assert.match(serviceSource, /report\.general_evidence/);
  assert.doesNotMatch(serviceSource, /Indice de servicios/);
  assert.match(serviceSource, /Cierre del contenedor/);
  assert.match(serviceSource, /function pageFooter\(\)/);
  assert.match(serviceSource, /Pagina \$\{pageNumber\}/);
  assert.match(serviceSource, /word\.length <= maxChars/);
  assert.doesNotMatch(serviceSource, /\.slice\(0, 96\)/);
});
