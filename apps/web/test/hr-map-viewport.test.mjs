import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "America/Bogota";

const { bogotaCalendarDate, hasMapCoordinates, historicalMapViewport } = await import("../lib/hrMapViewport.ts");

test("el mapa usa la fecha de Bogota cuando UTC ya avanzo", () => {
  assert.equal(bogotaCalendarDate("2026-09-11T02:00:00.000Z"), "2026-09-10");
});

test("el mapa excluye marcaciones y actividades sin GPS en vez de ubicarlas en cero cero", () => {
  assert.equal(hasMapCoordinates({ latitude: null, longitude: null }), false);
  assert.equal(hasMapCoordinates({ latitude: 0, longitude: 0 }), true);
  assert.equal(hasMapCoordinates({ latitude: 4.65, longitude: -74.11 }), true);
});

test("el historico ajusta centro y zoom para contener el recorrido completo", () => {
  const viewport = historicalMapViewport([
    { latitude: 4.5981, longitude: -74.0761 },
    { latitude: 4.711, longitude: -74.0721 },
    { latitude: 4.762, longitude: -74.046 }
  ]);
  assert.ok(viewport.center.latitude > 4.59 && viewport.center.latitude < 4.77);
  assert.ok(viewport.center.longitude > -74.08 && viewport.center.longitude < -74.04);
  assert.ok(viewport.zoom >= 11 && viewport.zoom <= 14);
});
