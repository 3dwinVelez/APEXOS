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
  componentBands,
  operationGauges,
  bandFromEntry,
  viewVerdict,
  viewVerdicts,
  heapPressurePercent,
  serverErrorPercent,
  requestsPerMinute,
  worstCloudLatency,
  limitText,
  windowLimits,
  applyWindowLimits,
  percentileOf,
  WINDOW_MIN_READINGS,
  formatGaugeValue
} = require("../lib/metrics");

function module(extra = {}) {
  return { key: "hr", name: "Talento Humano", status: "ok", data: null, ...extra };
}

// Las seis vistas-pregunta con evidencia propia. "resumen" queda fuera porque no
// es una fuente de datos: es la peor banda de todas las demas.
const VIEWS = ["latencia", "api", "modulos", "datos", "nube", "operacion"];

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
  // El uptime dejo de ser informativo: un API que lleva 2 minutos vivo empezo de
  // nuevo y eso se ve, no se decora.
  assert.equal(bandForValue(GAUGES.uptime, 7200), "optimal");
  assert.equal(bandForValue(GAUGES.uptime, 600), "risk");
  assert.equal(bandForValue(GAUGES.uptime, 120), "critical");
  assert.equal(bandForValue(GAUGES.uptime, null), "unknown");
  // Un medidor de ventana todavia sin banda calculada no es "sin dato" ni verde:
  // es informativo hasta que el servidor trace su corte sobre sus lecturas.
  assert.equal(bandForValue(GAUGES.requestRate, 820), "informational");
});

test("gauge publica valor, banda, tono y los limites que la produjeron", () => {
  const entry = gauge("p95", 182);
  assert.equal(entry.band, "optimal");
  assert.equal(entry.tone, "ok");
  assert.equal(entry.label_text, "Óptimo");
  assert.deepEqual(entry.limits, { optimal: 600, risk: 1000, kind: "budget" });
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
      usage: { requestsTotal: 98432, slowQueries: 0, byStatus: { "2xx": 98400, "4xx": 24, "5xx": 8 } },
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
  // El uptime ya no es contexto decorativo: dos horas de proceso es una banda
  // medida y un reinicio hace dos minutos se ve en rojo.
  assert.equal(byKey.uptime.band, "optimal");
  assert.equal(gauge("uptime", 120).band, "critical");
  // Presion de heap: 18/40 = 45 %, dentro del optimo de 60 %.
  assert.equal(byKey.heapPressure.value, 45);
  assert.equal(byKey.heapPressure.band, "optimal");
  // 8 de 98432 peticiones con 5xx = 0.01 %. El corte de esta vista es "cero
  // errores": cualquier 5xx real ya es para mirar, aunque 1 % es incidente.
  assert.equal(byKey.serverErrors.value, 0.01);
  assert.equal(byKey.serverErrors.band, "risk");
  assert.equal(gauge("serverErrors", 0).band, "optimal");
  assert.equal(gauge("serverErrors", 1).band, "risk");
  assert.equal(gauge("serverErrors", 2).band, "critical");
  // Trafico como tasa: 98432 peticiones en 120 minutos de proceso.
  assert.equal(byKey.requestRate.value, 820.3);
  assert.equal(byKey.requestRate.band, "informational");
  // Sin sondas a la nube en este sondeo, la latencia de la nube no se finge.
  assert.equal(byKey.cloudLatency.value, null);
  assert.equal(byKey.cloudLatency.band, "unknown");
});

test("los medidores nuevos se calculan solo con datos que existen", () => {
  assert.equal(heapPressurePercent(null), null);
  assert.equal(heapPressurePercent({ memory: { heapUsed: 20 } }), null);
  assert.equal(heapPressurePercent({ memory: { heapUsed: 30, heapTotal: 40 } }), 75);
  assert.equal(serverErrorPercent({ usage: { requestsTotal: 200, byStatus: { "5xx": 4 } } }), 2);
  assert.equal(serverErrorPercent({ usage: { byStatus: { "5xx": 4 } } }), null);
  assert.equal(serverErrorPercent({ usage: { requestsTotal: 200, byStatus: {} } }), null);
  // Un proceso con menos de un minuto de vida no tiene tasa: no se divide entre segundos.
  assert.equal(requestsPerMinute({ uptimeSeconds: 30, usage: { requestsTotal: 10 } }), null);
  assert.equal(requestsPerMinute({ uptimeSeconds: 120, usage: { requestsTotal: 10 } }), 5);
});

test("la latencia de la nube es la peor sonda medida al proveedor del ambiente", () => {
  const checks = [
    { source: "railway", environment: "main", durationMs: 640 },
    { source: "supabase", environment: "main", durationMs: 190 },
    { source: "apex-api", environment: "main", durationMs: 9000 },
    { source: "railway", environment: "local", durationMs: 80 },
    // Cero = no hubo viaje (proveedor sin token o simulacion), no una nube instantanea.
    { source: "vercel", environment: "main", durationMs: 0 }
  ];
  assert.equal(worstCloudLatency(checks, "main"), 640);
  assert.equal(worstCloudLatency(checks, "local"), 80);
  assert.equal(worstCloudLatency([{ source: "vercel", environment: "main", durationMs: 0 }], "main"), null);
  assert.equal(worstCloudLatency([], "main"), null);
  assert.equal(worstCloudLatency(null, null), null);
});

test("gaugesFor publica cada medidor del catalogo que no sea de la mesa del puesto", () => {
  const gauges = gaugesFor({});
  const esperado = Object.keys(GAUGES).filter((key) => GAUGES[key].view !== "operacion");
  assert.equal(gauges.length, esperado.length);
  // El catalogo no define el orden del panel: gaugesFor publica en el orden de
  // las preguntas, asi que se compara el conjunto y el orden se prueba aparte.
  assert.deepEqual([...gauges.map((entry) => entry.key)].sort(), [...esperado].sort());
  assert.ok(gauges.every((entry) => entry.band === "unknown"));
  assert.deepEqual(gaugesFor(null), []);
});

test("la nube del ambiente se bandea con la peor sonda real del sondeo", () => {
  const gauges = gaugesFor({ id: "main" }, { checks: [{ source: "railway", environment: "main", durationMs: 900 }] });
  const cloud = gauges.find((entry) => entry.key === "cloudLatency");
  assert.equal(cloud.value, 900);
  assert.equal(cloud.band, "critical");
  assert.equal(cloud.limits.risk, 800);
});

test("la vista Operacion mide la mesa del puesto, no un ambiente", () => {
  const gauges = operationGauges({
    alerts: [{ status: "down" }, { status: "degraded", resolvedAt: "2026-11-05T10:00:00.000Z" }, { status: "down" }],
    jobs: { counts: { awaiting_approval: 4 } }
  });
  const byKey = Object.fromEntries(gauges.map((entry) => [entry.key, entry]));
  assert.equal(byKey.openAlerts.value, 2);
  assert.equal(byKey.openAlerts.band, "risk");
  assert.equal(byKey.queuedJobs.value, 4);
  assert.equal(byKey.queuedJobs.band, "critical");
  // Con la mesa vacia, cero alertas es una medicion real; los trabajos sin
  // lectura del almacen siguen siendo "sin dato", no un cero comodo.
  const limpio = Object.fromEntries(operationGauges().map((entry) => [entry.key, entry]));
  assert.equal(limpio.openAlerts.value, 0);
  assert.equal(limpio.openAlerts.band, "optimal");
  assert.equal(limpio.queuedJobs.band, "unknown");
});

// ---------------------------------------------------------------- veredicto por vista

test("el veredicto de una vista es la peor banda entre sus medidores medidos", () => {
  const gauges = [gauge("p95", 182), gauge("errorRate", 12), gauge("uptime", 7200)];
  const verdict = viewVerdict(gauges);
  assert.equal(verdict.state, "critical");
  assert.equal(verdict.tone, "down");
  assert.equal(verdict.worst_key, "errorRate");
  assert.match(verdict.text, /Sondas fallidas 12 % · Crítico/);
  assert.match(verdict.rule, /p95 de la sonda al API 182 ms \(óptimo ≤ 600, tope 1000\)/);
  assert.equal(viewVerdict([gauge("p95", 100)]).state, "optimal");
});

test("lo no medido no es cero: una vista sin lecturas se declara sin dato", () => {
  assert.equal(viewVerdict([]).state, "unknown");
  assert.match(viewVerdict([gauge("p95", null)]).text, /Ningún medidor/);
  assert.equal(viewVerdict([gauge("p95", null)]).rule, "lo no medido no es cero");
  assert.equal(viewVerdict([gauge("p95", null)]).state, "unknown");
});

test("viewVerdicts agrupa por la vista que el propio medidor declara", () => {
  const verdicts = viewVerdicts(gaugesFor({ id: "local", performance: { p95: 200 } }, {}));
  for (const key of ["latencia", "api", "modulos", "datos", "nube"]) {
    assert.ok(verdicts[key], `falta el veredicto de ${key}`);
    assert.match(verdicts[key].question, /^¿.*\?$/);
  }
  assert.deepEqual(viewVerdicts([]), {});
});

test("limitText y formatGaugeValue dicen el corte en español, no en crudo", () => {
  const p95 = gauge("p95", 182);
  assert.equal(limitText(p95), "óptimo ≤ 600, tope 1000");
  assert.equal(limitText(gauge("dataCoverage", 30)), "óptimo ≥ 20, en riesgo ≥ 5");
  assert.equal(limitText(gauge("uptime", 7200)), "óptimo ≥ 900, en riesgo ≥ 300");
  assert.equal(formatGaugeValue(p95), "182 ms");
  assert.equal(formatGaugeValue(gauge("errorRate", 2.5)), "2,5 %");
  assert.equal(formatGaugeValue(gauge("p95", null)), "sin dato");
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
    assert.ok(VIEWS.includes(entry.view), `${entry.key} apunta a una vista inexistente: ${entry.view}`);
  }
  assert.equal(GAUGES.p95.view, "latencia");
  assert.equal(GAUGES.dbLatency.view, "datos");
  assert.equal(GAUGES.cloudLatency.view, "nube");
  assert.equal(GAUGES.openAlerts.view, "operacion");
  assert.equal(gauge("p95", 182).question, "¿Cómo está la latencia?");
});

test("los medidores salen en el orden de las preguntas del panel, no alfabeticos", () => {
  const keys = gaugesFor({ id: "local" }).map((entry) => entry.key);
  assert.deepEqual(keys, [
    "p95", "errorRate", "serverErrors", "memoryRss", "heapPressure", "requestRate",
    "uptime", "cloudLatency", "freshness", "dbLatency", "slowQueries", "dataVolume", "dataCoverage",
    "activityToday", "activeUsers", "activeSessions", "websocketClients", "gpsPings"
  ]);
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
  assert.deepEqual(entry.limits, { optimal: 240, risk: 400, kind: "budget" });
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

// La marca de una historia se colorea con el umbral del medidor, no con un criterio
// del navegador. La misma definicion llega en dos formas (entrada publicada con
// limits o entrada del catalogo con optimal/risk crudos) y debe dar el mismo color.
test("bandFromEntry colorea la historia con el umbral del medidor", () => {
  assert.equal(bandFromEntry(gauge("dbLatency", 42), 42), "optimal");
  assert.equal(bandFromEntry(GAUGES.dbLatency, 42), "optimal");
  assert.equal(bandFromEntry(GAUGES.dbLatency, 150), "risk");
  assert.equal(bandFromEntry(GAUGES.dbLatency, 900), "critical");
  // Informativo es banda propia: hay lectura, lo que falta es umbral. Pintarla de
  // "sin dato" contaria como no medido un numero que si se midio.
  assert.equal(bandFromEntry(GAUGES.dataVolume, 940), "informational");
  assert.equal(bandFromEntry(GAUGES.dataVolume, null), "unknown");
  assert.equal(bandFromEntry(GAUGES.p95, 42), "optimal");
  assert.equal(bandFromEntry(null, 42), "unknown");
  assert.equal(bandFromEntry({ direction: "lower", label: "sin cortes" }, 42), "unknown", "sin umbral no se inventa color");
});

// ---------------------------------------------------------------- banda de ventana

// Las magnitudes sin presupuesto versionado (tráfico, registros, uso real) no
// reciben un corte inventado: reciben el que sale de sus propias lecturas. Con
// menos de ocho lecturas el servidor dice que todavía no tiene banda, y eso es
// otra respuesta que un verde.
test("la banda habitual necesita ocho lecturas medidas y no cuenta huecos", () => {
  assert.equal(WINDOW_MIN_READINGS, 8);
  assert.deepEqual(windowLimits(GAUGES.requestRate, [1, 2, 3, 4, 5, 6, 7]), {
    optimal: null,
    risk: null,
    kind: "pending",
    readings: 7,
    needed: 8
  });
  assert.equal(windowLimits(GAUGES.requestRate, [null, "", 2, undefined, 2]).readings, 2, "lo no medido no es una lectura");
  // Un medidor con presupuesto versionado nunca se banda por ventana.
  assert.equal(windowLimits(GAUGES.p95, [1, 2, 3, 4, 5, 6, 7, 8, 9]), null);
});

test("la banda de ventana se calcula por percentiles y mira hacia donde duele", () => {
  const carga = windowLimits(GAUGES.requestRate, [10, 10, 11, 11, 12, 12, 13, 40]);
  assert.equal(carga.kind, "window");
  assert.equal(carga.watch, "up");
  assert.equal(carga.optimal, 12, "p65 de la ventana");
  assert.equal(carga.risk, 13, "p90 de la ventana");
  assert.equal(carga.readings, 8);
  assert.match(carga.source, /p65\/p90/);
  // En uso y registros lo que duele es caerse de la banda, asi que el corte es el
  // piso: por encima del p35 todo es normal.
  const registros = windowLimits(GAUGES.dataVolume, [100, 110, 120, 130, 140, 150, 160, 170]);
  assert.equal(registros.watch, "down");
  assert.equal(registros.optimal, 120);
  assert.equal(registros.risk, 110);
  assert.match(registros.source, /p35\/p10/);
  assert.equal(percentileOf([], 0.5), null);
});

test("el corte de ventana cambia la banda del valor y queda firmado en la fuente", () => {
  const entry = gauge("requestRate", 820.3);
  assert.equal(entry.limits.kind, "window");
  assert.equal(entry.band, "informational", "sin lecturas guardadas no hay semaforo que fingir");
  applyWindowLimits(entry, [700, 720, 740, 760, 780, 800, 810, 820]);
  assert.equal(entry.limits.kind, "window");
  assert.equal(entry.limits.risk, 810);
  assert.equal(entry.band, "critical", "820 req/min esta por encima del p90 de su ventana");
  assert.match(entry.source, /banda habitual de sus 8 lecturas medidas/);
  assert.equal(limitText(entry), "óptimo ≤ 800, tope 810 · banda de su propia ventana");
  // Y con lecturas de menos, el pie dice cuantas faltan en lugar de pintar verde.
  const tierno = gauge("dataVolume", 940);
  applyWindowLimits(tierno, [900, 910]);
  assert.equal(tierno.limits.kind, "pending");
  assert.equal(tierno.band, "informational");
  assert.equal(limitText(tierno), "sin banda habitual todavía: 2 de 8 lecturas medidas");
});

test("las magnitudes de uso real nacen como medidores de ventana", () => {
  for (const key of ["activityToday", "activeUsers", "activeSessions", "websocketClients", "gpsPings"]) {
    assert.equal(GAUGES[key].direction, "relative", `${key} se banda contra su propia ventana`);
    assert.equal(GAUGES[key].limitsFrom, "window");
    assert.equal(GAUGES[key].watch, "down", `${key} duele cuando cae, no cuando sube`);
    assert.equal(GAUGES[key].view, "modulos");
    assert.equal(GAUGES[key].resumen, false, `${key} es evidencia de la vista Módulos, no relleno del resumen`);
    assert.match(GAUGES[key].question, /^¿.*\?$/);
  }
  const gauges = gaugesFor({
    id: "local",
    activity: {
      source: "api",
      activity: {
        activity: { today: 4, period: 30, active_users: 7 },
        connections: { active_sessions: 12, websocket: { clients: 3 }, gps: { pings_period: 9 } }
      }
    }
  });
  const byKey = Object.fromEntries(gauges.map((entry) => [entry.key, entry]));
  assert.equal(byKey.activityToday.value, 4);
  assert.equal(byKey.activeUsers.value, 7);
  assert.equal(byKey.activeSessions.value, 12);
  assert.equal(byKey.websocketClients.value, 3);
  assert.equal(byKey.gpsPings.value, 9);
  for (const key of ["activityToday", "activeUsers", "activeSessions", "websocketClients", "gpsPings"]) {
    assert.equal(byKey[key].band, "informational", `${key} sin ventana medida sigue siendo contexto`);
  }
  // Una fuente sin payload no publica un cero comodo.
  const vacio = Object.fromEntries(gaugesFor({ id: "local" }).map((entry) => [entry.key, entry]));
  assert.equal(vacio.activityToday.value, null);
  assert.equal(vacio.activityToday.band, "unknown");
});
