import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const monitor = fs.readFileSync(new URL("../app/dashboard/servicios/page.tsx", import.meta.url), "utf8");
const modal = fs.readFileSync(new URL("../components/ui/ModalFrame.tsx", import.meta.url), "utf8");

test("la edicion representa cada articulo como una solicitud independiente", () => {
  assert.match(monitor, /Solicitudes del servicio/);
  assert.match(monitor, /md:grid-cols-2/);
  assert.doesNotMatch(monitor, /Cantidad \*<input/);
});

test("el modal limita su ancho al viewport y bloquea el desbordamiento horizontal", () => {
  assert.match(modal, /max-w-\[100vw\]/);
  assert.match(modal, /md:max-w-\[calc\(100vw-3rem\)\]/);
  assert.match(modal, /overflow-x-hidden/);
  assert.match(modal, /min-w-0 p-3 sm:p-4/);
});

test("la edicion tolera maestros envueltos y ordenes historicas sin colecciones", () => {
  assert.match(monitor, /function collectionFromResponse<T>\(value: unknown\)/);
  assert.match(monitor, /Array\.isArray\(data\)/);
  assert.match(monitor, /function normalizeServiceOrder\(order: ServiceOrder\)/);
  assert.match(monitor, /incidents: Array\.isArray\(order\.incidents\) \? order\.incidents : \[\]/);
  assert.match(monitor, /photos: Array\.isArray\(order\.photos\) \? order\.photos : \[\]/);
  assert.match(monitor, /availableReferences\.find/);
  assert.match(monitor, /Array\.isArray\(serviceStores\)/);
});
