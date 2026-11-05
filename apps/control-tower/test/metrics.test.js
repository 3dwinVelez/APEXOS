"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GAUGES,
  BUDGET_API_P95_MS,
  PROBE_BUDGET_MS,
  bandForValue,
  probeBand,
  gauge,
  gaugesFor,
  freshnessRatio,
  moduleBand,
  moduleTicks,
  worstFreshness,
  coveragePercent,
  latencyVerdict,
  p95Definition,
  totalRecords,
  componentLatency,
  componentBand,
  componentBands
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

test("la frescura puede empeorar la banda: 40x vencido es critico aunque el status sea ok", () => {
  assert.equal(moduleBand(module({ status: "ok", data: { age_minutes: 2400, expected_minutes: 60 } })), "critical");
  assert.equal(moduleBand(module({ status: "ok", data: { age_minutes: 120, expected_minutes: 60 } })), "risk");
  // El estado nunca mejora la frescura: un modulo caido sigue siendo critico.
  assert.equal(moduleBand(module({ status: "down", data: { age_minutes: 1, expected_minutes: 60 } })), "critical");
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
    components: [{ key: "db", status: "ok", latencyMs: 42 }],
    modules: { modules: [module({ data: { age_minutes: 30, expected_minutes: 10, records: 940 } })] }
  };
  const byKey = Object.fromEntries(gaugesFor(environment).map((entry) => [entry.key, entry]));
  assert.equal(byKey.p95.band, "optimal");
  assert.equal(byKey.errorRate.band, "critical");
  assert.equal(byKey.memoryRss.band, "optimal");
  assert.equal(byKey.slowQueries.band, "optimal");
  assert.equal(byKey.dataCoverage.band, "critical");
  assert.equal(byKey.freshness.band, "risk");
  assert.equal(byKey.dbLatency.band, "optimal");
  assert.equal(byKey.dbLatency.value, 42);
  assert.equal(byKey.dataVolume.band, "informational");
  assert.equal(byKey.dataVolume.value, 940);
  assert.equal(byKey.uptime.band, "informational");
  assert.equal(byKey.requests.band, "informational");
  assert.equal(byKey.requests.label_text, "Informativo");
});

test("un ambiente sin lecturas no inventa medidores verdes", () => {
  const gauges = gaugesFor({});
  assert.equal(gauges.length, Object.keys(GAUGES).length);
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

// ---------------------------------------------------------------- vistas-pregunta

test("cada medidor declara la pregunta que responde y la vista donde vive su evidencia", () => {
  for (const entry of Object.values(GAUGES)) {
    assert.match(entry.question, /^¿.*\?$/, `${entry.key} debe preguntar en español`);
    assert.ok(["latencia", "api", "modulos", "datos"].includes(entry.view), `${entry.key} apunta a una vista inexistente: ${entry.view}`);
  }
  assert.equal(GAUGES.p95.view, "latencia");
  assert.equal(GAUGES.dbLatency.view, "datos");
  assert.equal(gauge("p95", 182).question, "¿Cómo está la latencia?");
});

test("los medidores salen en el orden de las preguntas del panel, no alfabeticos", () => {
  const keys = gaugesFor({ id: "local" }).map((entry) => entry.key);
  assert.deepEqual(keys, ["p95", "errorRate", "memoryRss", "requests", "uptime", "freshness", "dbLatency", "slowQueries", "dataVolume", "dataCoverage"]);
});

// ---------------------------------------------------------------- presupuestos por ambiente

test("la sonda de cada ambiente se corta por su propio presupuesto, no por el del API", () => {
  assert.equal(PROBE_BUDGET_MS.local, 400);
  const local = p95Definition("local");
  assert.equal(local.risk, 400);
  assert.equal(local.optimal, 240);
  assert.match(local.source, /presupuesto de sonda 400 ms \(viaje torre->local/);
  assert.match(local.source, /no latencia del API/);
  // Un ambiente desconocido (o sin id) no se inventa un corte: usa el del API.
  assert.equal(p95Definition("noexiste").risk, BUDGET_API_P95_MS);
  assert.equal(p95Definition(null).risk, BUDGET_API_P95_MS);
});

test("el viaje de la sonda se juzga por el corte del ambiente, no por el del API", () => {
  assert.equal(probeBand(200, true, "local"), "optimal");
  assert.equal(probeBand(300, true, "local"), "risk");
  assert.equal(probeBand(500, true, "local"), "critical");
  assert.equal(probeBand(500, true, "develop"), "optimal");
  assert.equal(probeBand(1500, true, "main"), "critical");
  assert.equal(probeBand(300, false, "local"), "critical");
});

test("el medidor p95 publicado lleva el corte del ambiente, no el genérico", () => {
  const [entry] = gaugesFor({ id: "local", performance: { p95: 200 } });
  assert.deepEqual(entry.limits, { optimal: 240, risk: 400 });
  assert.equal(entry.band, "optimal");
});

// ---------------------------------------------------------------- sostenido vs picos

test("sin serie no hay veredicto: el panel no puede decir que todo esta bien", () => {
  const verdict = latencyVerdict([], 400);
  assert.equal(verdict.state, "unknown");
  assert.equal(verdict.label_text, "Sin dato");
  assert.equal(latencyVerdict([{ ms: 100 }], null).state, "unknown");
  assert.equal(latencyVerdict(null, 400).state, "unknown");
});

test("ninguna muestra sobre el tope es 'dentro del tope'", () => {
  const verdict = latencyVerdict([{ ms: 100 }, { ms: 200 }, { ms: 300 }], 400);
  assert.equal(verdict.state, "optimal");
  assert.equal(verdict.label_text, "Dentro del tope");
  assert.equal(verdict.over, 0);
});

test("uno o dos picos aislados son un evento, no un problema que atender", () => {
  const series = [];
  for (let i = 0; i < 20; i += 1) series.push({ ms: 120 });
  series[5] = { ms: 900 };
  series[13] = { ms: 850 };
  const verdict = latencyVerdict(series, 400);
  assert.equal(verdict.state, "spikes");
  assert.equal(verdict.label_text, "Picos por evento: vigilar");
  assert.equal(verdict.longest_run, 1);
  assert.equal(verdict.over, 2);
  assert.match(verdict.rule, /2\/20 muestras sobre 400 ms · racha máxima 1/);
});

test("una franja continua de 3 muestras sobre el tope se attende, no se vigila", () => {
  const series = [{ ms: 100 }, { ms: 500 }, { ms: 520 }, { ms: 540 }, { ms: 110 }];
  const verdict = latencyVerdict(series, 400);
  assert.equal(verdict.state, "sustained");
  assert.equal(verdict.label_text, "Fuera del tope: atender");
  assert.equal(verdict.longest_run, 3);
});

test("la mayoria de la ventana fuera del tope es sostenido aunque no haya racha", () => {
  const verdict = latencyVerdict([{ ms: 500 }, { ms: 100 }, { ms: 500 }, { ms: 100 }, { ms: 500 }], 400);
  assert.equal(verdict.state, "sustained");
  assert.equal(verdict.longest_run, 1);
  assert.equal(verdict.over_percent, 60);
});

test("el veredicto solo mira la ventana: los sondeos viejos no condenan un ambiente recuperado", () => {
  const series = [];
  for (let i = 0; i < 25; i += 1) series.push({ ms: 900 });
  for (let i = 0; i < 30; i += 1) series.push({ ms: 120 });
  const verdict = latencyVerdict(series, 400);
  assert.equal(verdict.samples, 30);
  assert.equal(verdict.state, "optimal");
  assert.equal(verdict.over, 0);
});

// ---------------------------------------------------------------- volumen y componentes

test("totalRecords suma solo lo medido y devuelve null si nada se midio", () => {
  assert.equal(totalRecords([]), null);
  assert.equal(totalRecords([module({ data: { records: 40 } }), module({ data: {} })]), 40);
  assert.equal(totalRecords([module({ data: { records: 40 } }), module({ data: { records: 900 } })]), 940);
});

test("la latencia de la base sale del componente db medido por el API", () => {
  const components = [{ key: "db", status: "ok", latencyMs: 42 }, { key: "cache", status: "ok", latency_ms: 7 }];
  assert.equal(componentLatency(components, "db"), 42);
  assert.equal(componentLatency(components, "cache"), 7);
  assert.equal(componentLatency(components, "inexistente"), null);
  assert.equal(componentLatency(null, "db"), null);
});

test("un componente caido es critico y la base lenta sube de banda por umbral", () => {
  assert.equal(componentBand({ key: "api", status: "down", latencyMs: 5 }), "critical");
  assert.equal(componentBand({ key: "api", status: "unknown" }), "unknown");
  assert.equal(componentBand({ key: "queue", status: "degraded" }), "risk");
  assert.equal(componentBand({ key: "db", status: "ok", latencyMs: 80 }), "optimal");
  assert.equal(componentBand({ key: "db", status: "ok", latencyMs: 150 }), "risk");
  assert.equal(componentBand({ key: "db", status: "ok", latencyMs: 800 }), "critical");
});

test("componentBands publica banda, tono y etiqueta sin borrar lo que trajo el API", () => {
  const [db] = componentBands([{ key: "db", status: "ok", latencyMs: 900, detail: "pool 4/10" }]);
  assert.equal(db.band, "critical");
  assert.equal(db.tone, "down");
  assert.equal(db.label_text, "Crítico");
  assert.equal(db.detail, "pool 4/10");
  assert.deepEqual(componentBands(null), []);
});
