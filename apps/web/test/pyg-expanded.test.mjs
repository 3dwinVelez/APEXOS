import assert from "node:assert/strict";
import test from "node:test";

const {
  isPygPeriod,
  normalizePyPlate,
  parsePyVehicleSelection,
  pygBackHref,
  pygExpandedHref,
  PYG_BASE_PATH,
  PYG_EXPANDED_PATH,
  PYG_PLATE_PARAM,
  PYG_PERIOD_PARAM,
  PYG_UNASSIGNED_CODE
} = await import("../lib/pyg-expanded.ts");

const params = (href) => new URL(href, "https://apex.test").searchParams;

test("el enlace siempre parte de la ruta interna y nunca de un origen externo", () => {
  const href = pygExpandedHref({ plate: "ABC123", period: "2026-10" });
  assert.equal(href.startsWith(`${PYG_EXPANDED_PATH}?`), true);
  assert.equal(params(href).get(PYG_PLATE_PARAM), "ABC123");
  assert.equal(params(href).get(PYG_PERIOD_PARAM), "2026-10");
});

test("una placa con forma de URL externa se descarta y no se escribe en el enlace", () => {
  for (const hostile of [
    "https://evil.example/steal",
    "http://evil.example",
    "javascript:alert(1)",
    "ftp://evil.example/file",
    "data:text/html,<script>"
  ]) {
    const href = pygExpandedHref({ plate: hostile, period: "2026-10" });
    assert.equal(href, `${PYG_EXPANDED_PATH}?${PYG_PERIOD_PARAM}=2026-10`);
    assert.equal(parsePyVehicleSelection(hostile), "");
  }
});

test("el sentinel solo se acuña por parsePyVehicleSelection y no por normalizePyPlate", () => {
  assert.equal(PYG_UNASSIGNED_CODE, "SIN_VEHICULO");
  assert.equal(parsePyVehicleSelection(PYG_UNASSIGNED_CODE), "SIN_VEHICULO");
  assert.equal(parsePyVehicleSelection(" sin_vehiculo "), "SIN_VEHICULO");
  // normalizePyPlate no tiene rama de sentinel: normaliza el literal como cualquier placa.
  assert.equal(normalizePyPlate("sin_vehiculo"), "SIN_VEHICULO");
});

test("el enlace sin vehículo conserva el sentinel para sobrevivir a F5", () => {
  const href = pygExpandedHref({ plate: PYG_UNASSIGNED_CODE, period: "2026-10" });
  assert.equal(params(href).get(PYG_PLATE_PARAM), "SIN_VEHICULO");
  const back = new URL(href, "https://apex.test");
  assert.equal(parsePyVehicleSelection(back.searchParams.get(PYG_PLATE_PARAM)), "SIN_VEHICULO");
});

test("una placa real conserva su identificador exacto, con guiones, puntos y guion bajo", () => {
  // Espejo del normalizePlate del backend: solo trim, espacios internos y mayúsculas.
  assert.equal(normalizePyPlate(" abc-123 "), "ABC-123");
  assert.equal(normalizePyPlate("ABC.123"), "ABC.123");
  assert.equal(normalizePyPlate("abc·123"), "");
  assert.equal(normalizePyPlate(""), "");
  assert.equal(normalizePyPlate(null), "");
  assert.equal(normalizePyPlate(42), "");
});

test("una placa real tipo SIN-VEHICULO no se convierte en el bloque sin vehículo", () => {
  assert.equal(normalizePyPlate("SIN-VEHICULO"), "SIN-VEHICULO");
  assert.equal(parsePyVehicleSelection("SIN-VEHICULO"), "SIN-VEHICULO");
  assert.equal(parsePyVehicleSelection("sin vehiculo"), "SINVEHICULO");
  assert.notEqual(parsePyVehicleSelection("SIN-VEHICULO"), PYG_UNASSIGNED_CODE);
});

test("no se impone una longitud máxima inventada: la API no la tiene", () => {
  const longPlate = "P" + "1".repeat(40);
  assert.equal(normalizePyPlate(longPlate), longPlate);
  assert.equal(parsePyVehicleSelection(longPlate), longPlate);
});

test("el guion bajo de una placa real se conserva y no se confunde con el sentinel", () => {
  assert.equal(normalizePyPlate("DEMO_1"), "DEMO_1");
  assert.equal(normalizePyPlate(" demo_1 "), "DEMO_1");
  assert.equal(parsePyVehicleSelection("DEMO_1"), "DEMO_1");
  assert.notEqual(parsePyVehicleSelection("DEMO_1"), PYG_UNASSIGNED_CODE);
  assert.equal(parsePyVehicleSelection("ABC_123"), "ABC_123");
  // Solo el sentinel literal se traduce; un sufijo extra sigue siendo una placa real.
  assert.equal(parsePyVehicleSelection("SIN_VEHICULO_X"), "SIN_VEHICULO_X");
});

test("parsePyVehicleSelection acepta solo placas reales o el sentinel", () => {
  assert.equal(parsePyVehicleSelection("XYZ99"), "XYZ99");
  assert.equal(parsePyVehicleSelection("XYZ-99"), "XYZ-99");
  assert.equal(parsePyVehicleSelection("http://evil.example"), "");
  assert.equal(parsePyVehicleSelection("../admin"), "");
  assert.equal(parsePyVehicleSelection(undefined), "");
});

test("la selección generada desde report.vehicle.plate abre exactamente ese vehículo", () => {
  for (const plate of ["ABC-123", "ABC.123", "DEMO_1", "WKQ123"]) {
    const href = pygExpandedHref({ plate, period: "2026-10" });
    assert.equal(params(href).get(PYG_PLATE_PARAM), plate);
    assert.equal(parsePyVehicleSelection(params(href).get(PYG_PLATE_PARAM)), plate);
  }
});

test("un período malformado no se convierte en el actual ni se escribe en el enlace", () => {
  for (const invalid of ["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", "", null]) {
    assert.equal(isPygPeriod(invalid), false);
    assert.equal(pygExpandedHref({ plate: "ABC123", period: invalid }), `${PYG_EXPANDED_PATH}?${PYG_PLATE_PARAM}=ABC123`);
  }
  assert.equal(isPygPeriod("2026-10"), true);
  assert.equal(isPygPeriod("2026-01"), true);
});

test("sin placa ni período el enlace apunta al módulo ampliado sin query", () => {
  assert.equal(pygExpandedHref({ plate: "", period: "" }), PYG_EXPANDED_PATH);
});

test("volver al PYG apunta siempre a la página normal, nunca a la ampliada", () => {
  assert.equal(pygBackHref(), "/dashboard/contabilidad/pyg");
  assert.equal(PYG_BASE_PATH, "/dashboard/contabilidad/pyg");
  assert.notEqual(pygBackHref(), PYG_EXPANDED_PATH);
  assert.equal(pygBackHref().includes("/ampliado"), false);
});
