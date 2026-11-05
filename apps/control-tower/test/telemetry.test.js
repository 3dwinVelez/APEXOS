"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ModuleTelemetry, DEFAULT_SIZE } = require("../lib/telemetry");

function modules(band) {
  const age = band === "critico" ? 300 : 5;
  return [{ key: "hr", name: "Talento Humano", status: "ok", data: { age_minutes: age, expected_minutes: 10, records: 12 } }];
}

test("el anillo guarda un tick por sondeo con su lectura de la API", () => {
  const telemetry = new ModuleTelemetry();
  const sample = telemetry.record("local", modules(), "2026-11-05T10:00:00.000Z", { ms: 182, ok: true });
  assert.equal(sample.at, "2026-11-05T10:00:00.000Z");
  assert.equal(sample.ticks.hr.band, "optimal");
  assert.deepEqual(sample.api, { ms: 182, ok: true, band: "optimal" });
  assert.equal(telemetry.seriesFor("local").length, 1);
});

test("un sondeo sin modulos medidos no deja marca: el mapa no pinta relleno", () => {
  const telemetry = new ModuleTelemetry();
  assert.equal(telemetry.record("local", [], "2026-11-05T10:00:00.000Z", null), null);
  assert.equal(telemetry.record("develop", undefined, "2026-11-05T10:00:00.000Z", null), null);
  assert.deepEqual(telemetry.seriesFor("develop"), []);
  assert.deepEqual(telemetry.seriesFor("inexistente"), []);
});

test("el anillo esta acotado y descarta lo mas viejo", () => {
  const telemetry = new ModuleTelemetry({ maxSamples: 4 });
  for (let index = 0; index < 9; index += 1) {
    telemetry.record("local", modules(), `2026-11-05T10:0${index}:00.000Z`, { ms: 100 + index, ok: true });
  }
  const series = telemetry.seriesFor("local", { size: 40 });
  assert.equal(series.length, 4);
  assert.equal(series[0].at, "2026-11-05T10:05:00.000Z");
  assert.equal(series[series.length - 1].api.ms, 108);
});

test("seriesFor recorta a la ventana que pide el panel", () => {
  const telemetry = new ModuleTelemetry({ maxSamples: 40 });
  for (let index = 0; index < 30; index += 1) {
    telemetry.record("local", modules(), `2026-11-05T10:${String(index).padStart(2, "0")}:00.000Z`, { ms: 200, ok: true });
  }
  const window = telemetry.seriesFor("local", { size: 24 });
  assert.equal(window.length, 24);
  assert.equal(window[0].at, "2026-11-05T10:06:00.000Z");
  assert.equal(telemetry.seriesFor("local").length, 30);
  assert.equal(DEFAULT_SIZE, 40);
});

test("el anillo persistido se recupura filtrando entradas corruptas", () => {
  const persisted = {
    local: [
      { at: "2026-11-05T09:00:00.000Z", ticks: { hr: { band: "risk", ratio: 2, records: 1 } }, api: { ms: 90, ok: true, band: "optimal" } },
      { ticks: {} },
      null,
      "basura"
    ],
    develop: "no es un arreglo"
  };
  const telemetry = new ModuleTelemetry({ persisted });
  assert.equal(telemetry.seriesFor("local").length, 1);
  assert.deepEqual(telemetry.seriesFor("develop"), []);
  assert.equal(Object.keys(telemetry.toJSON()).includes("develop"), false);
});

test("toJSON conserva el tamano del anillo para el proximo arranque", () => {
  const telemetry = new ModuleTelemetry({ maxSamples: 3 });
  for (let index = 0; index < 5; index += 1) {
    telemetry.record("main", modules(index === 4 ? "critico" : ""), `2026-11-05T10:0${index}:00.000Z`, { ms: 500, ok: true });
  }
  const dumped = telemetry.toJSON();
  assert.equal(dumped.main.length, 3);
  assert.equal(dumped.main[dumped.main.length - 1].ticks.hr.band, "critical");
});
