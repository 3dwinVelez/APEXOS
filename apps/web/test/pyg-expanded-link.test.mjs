import test from "node:test";
import assert from "node:assert/strict";
import {
  PYG_BASE_PATH,
  PYG_EXPANDED_PATH,
  PYG_PLATE_PARAM,
  PYG_PERIOD_PARAM,
  PYG_UNASSIGNED_CODE,
  isPygPeriod,
  normalizePyPlate,
  parsePyVehicleSelection,
  pygExpandedHref
} from "../lib/pyg-expanded.ts";

test("acepta solo periodos AAAA-MM con mes 01-12", () => {
  assert.equal(isPygPeriod("2026-01"), true);
  assert.equal(isPygPeriod("2026-12"), true);
  for (const value of ["2026-00", "2026-13", "2026-1", "26-01", "2026-01-01", "", null, undefined, 202601, ["2026-01"]]) {
    assert.equal(isPygPeriod(value), false, `debe rechazar ${String(value)}`);
  }
});

test("normaliza la placa como el backend: sin espacios, en mayusculas, conservando guiones y puntos", () => {
  assert.equal(normalizePyPlate("abc-123"), "ABC-123");
  assert.equal(normalizePyPlate(" abc 123 "), "ABC123");
  assert.equal(normalizePyPlate("ABC.123"), "ABC.123");
  assert.equal(normalizePyPlate("wkq123"), "WKQ123");
});

test("el guion bajo de una placa real se conserva y solo el literal SIN_VEHICULO es el sentinel", () => {
  assert.equal(normalizePyPlate("ABC_123"), "ABC_123");
  assert.equal(normalizePyPlate("DEMO_1"), "DEMO_1");
  assert.equal(parsePyVehicleSelection("DEMO_1"), "DEMO_1");
  assert.equal(parsePyVehicleSelection("ABC_123"), "ABC_123");
  assert.notEqual(parsePyVehicleSelection("DEMO_1"), PYG_UNASSIGNED_CODE);
  assert.notEqual(parsePyVehicleSelection("ABC_123"), PYG_UNASSIGNED_CODE);
  assert.equal(parsePyVehicleSelection("sin_vehiculo"), PYG_UNASSIGNED_CODE);
  const href = pygExpandedHref({ plate: "DEMO_1", period: "2026-10" });
  assert.equal(href, `${PYG_EXPANDED_PATH}?${PYG_PLATE_PARAM}=DEMO_1&${PYG_PERIOD_PARAM}=2026-10`);
  const url = new URL(href, "https://apex.test");
  assert.equal(url.origin, "https://apex.test");
  assert.equal(url.pathname, PYG_EXPANDED_PATH);
  assert.equal(url.searchParams.get(PYG_PLATE_PARAM), "DEMO_1");
});

test("rechaza placas con caracteres de ruta, URL o inyeccion", () => {
  for (const value of ["../admin", "javascript:alert(1)", "https://evil.test", "abc/123", "abc?x=1", "abc#frag", "abc&x", "<script>", "abc*123", "abc·123", "", null, 42, ["ABC123"]]) {
    assert.equal(normalizePyPlate(value), "", `debe rechazar ${JSON.stringify(value)}`);
  }
});

test("solo el codigo literal SIN_VEHICULO es el sentinel; una placa real no se transforma", () => {
  assert.equal(parsePyVehicleSelection("sin_vehiculo"), PYG_UNASSIGNED_CODE);
  assert.equal(parsePyVehicleSelection("SIN_VEHICULO"), PYG_UNASSIGNED_CODE);
  assert.equal(parsePyVehicleSelection("SIN-VEHICULO"), "SIN-VEHICULO");
  assert.notEqual(parsePyVehicleSelection("SIN-VEHICULO"), PYG_UNASSIGNED_CODE);
});

test("el enlace siempre apunta a la ruta interna del modulo", () => {
  const href = pygExpandedHref({ plate: "abc-123", period: "2026-03" });
  assert.equal(href.startsWith(`${PYG_EXPANDED_PATH}?`), true);
  const url = new URL(href, "https://apex.test");
  assert.equal(url.origin, "https://apex.test");
  assert.equal(url.pathname, PYG_EXPANDED_PATH);
  assert.equal(url.searchParams.get(PYG_PLATE_PARAM), "ABC-123");
  assert.equal(url.searchParams.get(PYG_PERIOD_PARAM), "2026-03");
});

test("valores invalidos nunca convierten el enlace en una URL externa", () => {
  const href = pygExpandedHref({ plate: "https://evil.test/x", period: "javascript:alert(1)" });
  assert.equal(href, PYG_EXPANDED_PATH);
  assert.equal(new URL(href, "https://apex.test").origin, "https://apex.test");
});

test("omite parametros ausentes en lugar de enviarlos vacios", () => {
  assert.equal(pygExpandedHref({ plate: "", period: "2026-05" }), `${PYG_EXPANDED_PATH}?${PYG_PERIOD_PARAM}=2026-05`);
  assert.equal(pygExpandedHref({ plate: "ABC123", period: "" }), `${PYG_EXPANDED_PATH}?${PYG_PLATE_PARAM}=ABC123`);
});

test("la fuente del enlace no introduce handshake, puentes ni aperturas programaticas", async () => {
  const fs = await import("node:fs");
  const helpers = fs.readFileSync(new URL("../lib/pyg-expanded.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../app/dashboard/contabilidad/pyg/page.tsx", import.meta.url), "utf8");
  for (const source of [helpers, page]) {
    assert.doesNotMatch(source, /BroadcastChannel/, "no debe existir un puente entre ventanas");
    assert.doesNotMatch(source, /window\.open/, "el enlace es nativo, no apertura programatica");
    assert.doesNotMatch(source, /announcePygExpandedOpen|watchPygExpandedOpen|EXPANDED_OPEN_TIMEOUT_MS/, "no existe handshake de apertura");
  }
  assert.doesNotMatch(helpers, /setTimeout|setInterval/, "la libreria de URL no usa temporizadores");
});

test("el enlace de la pantalla normal es nativo, interno y seguro", async () => {
  const fs = await import("node:fs");
  const page = fs.readFileSync(new URL("../app/dashboard/contabilidad/pyg/page.tsx", import.meta.url), "utf8");
  assert.match(page, /href=\{href\}/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /pygExpandedHref\(\{ plate: vehicle\.plate, period: report\.period \}\)/, "la seleccion usa la placa exacta del reporte");
  assert.doesNotMatch(page, /if \(!popup\)|if \(!window\.open/, "no hay referencias de ventana que bloqueen en falso");
});

test("el destino base del modulo sigue siendo la ruta conocida", () => {
  assert.equal(PYG_BASE_PATH, "/dashboard/contabilidad/pyg");
  assert.equal(PYG_EXPANDED_PATH, "/dashboard/contabilidad/pyg/ampliado");
});
