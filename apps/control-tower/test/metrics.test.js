"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GAUGES,
  BUDGET_API_P95_MS,
  bandForValue,
  probeBand,
  gauge,
  gaugesFor,
  freshnessRatio,
  moduleBand,
  moduleTicks,
  worstFreshness,
  coveragePercent
} = require("../lib/metrics");

function module(extra = {}) {
  return { key: "hr", name: "Talento Humano", status: "ok", data: null, ...extra };
}

test("el corte de latencia sale del presupuesto versionado, no del navegador", () => {
  assert.equal(BUDGET_API_P95_MS, 1000);
  assert.equal(GAUGES.p95.risk, BUDGET_API_P95_MS);
  assert.equal(GAUGES.p95.optimal, Math.round(BUDGET_API_P95_MS * 0.6));
});

test("bandForValue usa la direccion de la metrica y nunca adivina un valor ausente", () => {
  assert.equal(bandForValue(GAUGES.p95, 600), "optimal");
  assert.equal(bandForValue(GAUGES.p95, 601), "risk");
  assert.equal(bandForValue(GAUGES.p95, 1000), "risk");
  assert.equal(bandForValue(GAUGES.p95, 1001), "critical");
  assert.equal(bandForValue(GAUGES.p95, null), "unknown");
  assert.equal(bandForValue(GAUGES.dataCoverage, 20), "optimal");
  assert.equal(bandForValue(GAUGES.dataCoverage, 10), "risk");
  assert.equal(bandForValue(GAUGES.dataCoverage, 1), "critical");
  assert.equal(bandForValue(GAUGES.uptime, 7200), "informational");
  assert.equal(bandForValue(GAUGES.uptime, null), "unknown");
});

test("gauge publica valor, banda, tono y los limites que la produjeron", () => {
  const entry = gauge("p95", 182);
  assert.equal(entry.band, "optimal");
  assert.equal(entry.tone, "ok");
  assert.equal(entry.label_text, "Óptimo");
  assert.deepEqual(entry.limits, { optimal: 600, risk: 1000 });
  assert.match(entry.source, /PERF_API_P95_MS/);
  assert.equal(gauge("inexistente", 1), null);
});

test("la frescura se mide como ratio sobre el intervalo esperado", () => {
  assert.equal(freshnessRatio(module({ data: { age_minutes: 30, expected_minutes: 10 } })), 3);
  assert.equal(freshnessRatio(module({ data: { age_minutes: 5, expected_minutes: 10 } })), 0.5);
  assert.equal(freshnessRatio(module({ data: { age_minutes: 5 } })), null);
  assert.equal(freshnessRatio(module()), null);
});

test("un modulo caido es critico aunque tenga datos frescos", () => {
  assert.equal(moduleBand(module({ status: "down", data: { age_minutes: 1, expected_minutes: 60 } })), "critical");
  assert.equal(moduleBand(module({ status: "unknown" })), "unknown");
  assert.equal(moduleBand(module({ status: "degraded" })), "risk");
  assert.equal(moduleBand(module({ data: { age_minutes: 5, expected_minutes: 60 } })), "optimal");
  assert.equal(moduleBand(module({ data: { age_minutes: 90, expected_minutes: 60 } })), "risk");
  assert.equal(moduleBand(module({ data: { age_minutes: 190, expected_minutes: 60 } })), "critical");
});

test("coveragePercent y worstFreshness devuelven null cuando no hay medicion", () => {
  assert.equal(coveragePercent(null), null);
  assert.equal(coveragePercent({ tenants: { summary: { active: 4, with_activity: 1 } } }), 25);
  assert.equal(coveragePercent({ tenants: { summary: { active: 0, with_activity: 0 } } }), null);
  assert.equal(worstFreshness([]), null);
  assert.equal(worstFreshness([module({ data: { age_minutes: 20, expected_minutes: 10 } }), module()]), 2);
});

test("gaugesFor banda cada medicion del ambiente por su propio umbral", () => {
  const environment = {
    performance: { p95: 182, errorRate: 30.8, failures: 37, samples: 120 },
    deployed: {
      memory: { rss: 107.9, heapUsed: 18, heapTotal: 40 },
      usage: { requestsTotal: 98432, slowQueries: 0, byStatus: {} },
      uptimeSeconds: 7200
    },
    activity: { tenants: { summary: { active: 200, with_activity: 1 } } },
    modules: { modules: [module({ data: { age_minutes: 30, expected_minutes: 10 } })] }
  };
  const byKey = Object.fromEntries(gaugesFor(environment).map((entry) => [entry.key, entry]));
  assert.equal(byKey.p95.band, "optimal");
  assert.equal(byKey.errorRate.band, "critical");
  assert.equal(byKey.memoryRss.band, "optimal");
  assert.equal(byKey.slowQueries.band, "optimal");
  assert.equal(byKey.dataCoverage.band, "critical");
  assert.equal(byKey.freshness.band, "risk");
  assert.equal(byKey.uptime.band, "informational");
  assert.equal(byKey.requests.band, "informational");
  assert.equal(byKey.requests.label_text, "Informativo");
});

test("un ambiente sin lecturas no inventa medidores verdes", () => {
  const gauges = gaugesFor({});
  assert.equal(gauges.length, 8);
  assert.ok(gauges.every((entry) => entry.band === "unknown"));
  assert.deepEqual(gaugesFor(null), []);
});

test("la sonda individual usa el mismo corte del p95 y una falla es critica", () => {
  assert.equal(probeBand(182, true), "optimal");
  assert.equal(probeBand(700, true), "risk");
  assert.equal(probeBand(1400, true), "critical");
  assert.equal(probeBand(12, false), "critical");
  assert.equal(probeBand(null, true), "unknown");
});

test("moduleTicks guarda la lectura de la API dentro del mismo tick", () => {
  const sample = moduleTicks([module({ status: "degraded", data: { age_minutes: 90, expected_minutes: 60 } })], "2026-11-05T10:00:00.000Z", { ms: 182, ok: true });
  assert.equal(sample.at, "2026-11-05T10:00:00.000Z");
  assert.deepEqual(sample.ticks.hr, { band: "risk", ratio: 1.5, records: null });
  assert.deepEqual(sample.api, { ms: 182, ok: true, band: "optimal" });
  assert.equal(moduleTicks([], "x", { ms: 1 }).ticks.hr, undefined);
});
