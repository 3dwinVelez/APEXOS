"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MonitorHistory, measuredSeries, DEFAULT_SIZE } = require("../lib/monitor-history");

// El anillo es la unica defensa contra la barra decorativa: si guarda un cero donde
// no hubo lectura, el panel muestra una historia llena y el propietario no puede
// distinguir "rapido" de "nadie midio".
test("el anillo guarda solo lecturas medidas", () => {
  const ring = new MonitorHistory();
  const sample = ring.record("local", "2026-11-05T10:00:00.000Z", {
    gauges: [
      { key: "dbLatency", value: 42 },
      { key: "dataVolume", value: null },
      { key: "uptime", value: "2 h" },
      { key: "heapPressure", value: 0 }
    ],
    components: [
      { key: "db", latencyMs: 42 },
      { key: "mail", latencyMs: null },
      { key: "cache", latency_ms: 7 }
    ],
    checks: [
      { id: "api", durationMs: 53 },
      { id: "web", durationMs: 0 }
    ]
  });
  assert.equal(sample.at, "2026-11-05T10:00:00.000Z");
  // Cero medido (heapPressure 0) es una lectura; null o texto no lo son.
  assert.deepEqual(sample.gauges, { dbLatency: 42, heapPressure: 0 });
  assert.deepEqual(sample.components, { db: 42, cache: 7 }, "la latencia llega en camelCase o snake_case: las dos son la misma lectura");
  assert.deepEqual(sample.checks, { api: 53 }, "un viaje de 0 ms es ausencia, no la muestra mas rapida");
});

test("un sondeo sin ninguna lectura no deja muestra que se confunda con historia", () => {
  const ring = new MonitorHistory();
  assert.equal(ring.record("local", "2026-11-05T10:00:00.000Z", { gauges: [{ key: "p95", value: null }] }), null);
  assert.equal(ring.record("local", "2026-11-05T10:01:00.000Z"), null);
  assert.equal(ring.seriesFor("local").length, 0);
});

test("la serie de un monitor omite los huecos y conserva la hora de lo medido", () => {
  const ring = new MonitorHistory();
  ring.record("local", "2026-11-05T10:00:00.000Z", { gauges: [{ key: "dbLatency", value: 42 }] });
  ring.record("local", "2026-11-05T10:01:00.000Z", { gauges: [{ key: "p95", value: 180 }] });
  ring.record("local", "2026-11-05T10:02:00.000Z", { gauges: [{ key: "dbLatency", value: 900 }] });
  const series = ring.seriesFor("local");
  assert.equal(series.length, 3, "el sondeo que no leyo este monitor sigue contando como sondeo");
  assert.deepEqual(measuredSeries(series, "gauges", "dbLatency", (value) => (value <= 100 ? "optimal" : "critical")), [
    { at: "2026-11-05T10:00:00.000Z", value: 42, band: "optimal" },
    { at: "2026-11-05T10:02:00.000Z", value: 900, band: "critical" }
  ], "la banda se aplica al leer, con el umbral vigente");
  assert.deepEqual(measuredSeries(series, "gauges", "p95", () => "unknown"), [
    { at: "2026-11-05T10:01:00.000Z", value: 180, band: "unknown" }
  ]);
  assert.deepEqual(measuredSeries(null, "gauges", "dbLatency", () => "unknown"), []);
});

test("el anillo gira, no crece, y sobrevive al reinicio de la torre", () => {
  const ring = new MonitorHistory({ maxSamples: 4 });
  for (let index = 0; index < 10; index += 1) {
    ring.record("local", `2026-11-05T10:${String(index).padStart(2, "0")}:00.000Z`, { gauges: [{ key: "p95", value: index }] });
  }
  assert.deepEqual(ring.seriesFor("local", { size: 3 }).map((sample) => sample.gauges.p95), [7, 8, 9],
    "los mas recientes, en el orden en que sucedieron");
  assert.deepEqual(new MonitorHistory({ persisted: ring.toJSON() }).seriesFor("local").map((sample) => sample.gauges.p95),
    [6, 7, 8, 9], "la historia medida no se pierde al reiniciar");
  const corrupto = new MonitorHistory({ persisted: { local: [{ at: null, gauges: null }, "basura", { at: "x" }], develop: "no es lista" } });
  assert.equal(corrupto.seriesFor("local").length, 0);
  assert.equal(corrupto.seriesFor("develop").length, 0);
  assert.equal(new MonitorHistory({ maxSamples: 1 }).maxSamples, 2, "el anillo minimo puede contar la regla sostenido");
});

test("la mesa del puesto comparte el anillo con los ambientes sin mezclarse", () => {
  const ring = new MonitorHistory();
  ring.record("puesto", "2026-11-05T10:00:00.000Z", { gauges: [{ key: "openAlerts", value: 3 }] });
  ring.record("local", "2026-11-05T10:00:00.000Z", { gauges: [{ key: "openAlerts", value: 99 }] });
  assert.deepEqual(ring.seriesFor("puesto")[0].gauges, { openAlerts: 3 });
  assert.deepEqual(ring.seriesFor("local")[0].gauges, { openAlerts: 99 });
  assert.equal(DEFAULT_SIZE, 40, "ventana por defecto del anillo");
});
