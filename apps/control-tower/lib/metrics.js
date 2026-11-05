"use strict";

// Fuente unica de umbrales de la torre. Ningun numero de banda vive en el
// navegador: el servidor publica el valor medido, su banda y los limites que la
// produjeron, y el panel solo pinta. Los cortes salen del presupuesto versionado
// de rendimiento (docs/PERFORMANCE_ENGINEERING_STANDARD.md y
// scripts/performance/performance-budget-check.js), no de estimaciones del UI.
const BUDGET_API_P95_MS = Number(process.env.PERF_API_P95_MS || 1000);

// La sonda de la torre mide el viaje completo desde el puesto: DNS + TCP + TLS +
// servidor + cuerpo. Ese número NO es la latencia del API, y exigirle el
// presupuesto del servidor pinta de rojo un ambiente sano solo por distancia.
// Cada presupuesto es el de la sonda de ESE ambiente y se puede ajustar por
// variable de entorno; el presupuesto del API sigue siendo PERF_API_P95_MS.
const PROBE_BUDGET_MS = Object.freeze({
  local: Number(process.env.PERF_PROBE_P95_LOCAL_MS || 400),
  develop: Number(process.env.PERF_PROBE_P95_DEVELOP_MS || 900),
  main: Number(process.env.PERF_PROBE_P95_MAIN_MS || 1400)
});

// Veredicto de la serie de latencia. Una muestra aislada por encima del tope es
// un evento; una franja continua o una quinta parte de la ventana son un problema
// que atender. El panel no decide esto: lo decide el servidor sobre lo medido.
const VERDICT_WINDOW = 30;
const VERDICT_BREACH_RATIO = 0.2;
const VERDICT_RUN_LENGTH = 3;

// `direction: lower` castiga los valores altos (latencia, errores, memoria).
// `higher` premia los altos (porcentaje de empresas con actividad).
// `informational` no tiene banda: es contexto, no diagnostico.
// Cada medidor declara ADEMAS la pregunta operativa que responde y la vista donde
// vive su evidencia, para que el panel se ordene por pregunta y no por metrica.
const GAUGES = Object.freeze({
  p95: {
    key: "p95",
    label: "p95 de la sonda al API",
    question: "¿Cómo está la latencia?",
    view: "latencia",
    unit: "ms",
    direction: "lower",
    optimal: Math.round(BUDGET_API_P95_MS * 0.6),
    risk: BUDGET_API_P95_MS,
    source: `presupuesto PERF_API_P95_MS=${BUDGET_API_P95_MS}`
  },
  errorRate: {
    key: "errorRate",
    label: "Sondas fallidas",
    question: "¿El API responde bien?",
    view: "api",
    unit: "%",
    direction: "lower",
    optimal: 1,
    risk: 5,
    source: "serie de sondas /health de la torre"
  },
  memoryRss: {
    key: "memoryRss",
    label: "Memoria del API",
    question: "¿El API aguanta la carga que tiene?",
    view: "api",
    unit: "MB",
    direction: "lower",
    optimal: 512,
    risk: 1024,
    source: "memory_mb.rss publicado por /health"
  },
  slowQueries: {
    key: "slowQueries",
    label: "Consultas lentas",
    question: "¿La base de datos está rápida?",
    view: "datos",
    unit: "",
    direction: "lower",
    optimal: 0,
    risk: 5,
    source: "usage.slow_queries_total publicado por /health"
  },
  dataCoverage: {
    key: "dataCoverage",
    label: "Empresas con actividad",
    question: "¿Los datos que llegan son reales?",
    view: "datos",
    unit: "%",
    direction: "higher",
    optimal: 20,
    risk: 5,
    source: "tenants.summary.with_activity sobre active"
  },
  freshness: {
    key: "freshness",
    label: "Frescura de datos",
    question: "¿Los módulos están al día?",
    view: "modulos",
    unit: "x",
    direction: "lower",
    optimal: 1,
    risk: 3,
    source: "peor ratio age_minutes/expected_minutes entre modulos"
  },
  uptime: {
    key: "uptime",
    label: "Uptime del proceso",
    question: "¿El API aguanta la carga que tiene?",
    view: "api",
    unit: "s",
    direction: "informational",
    optimal: null,
    risk: null,
    source: "uptime_seconds publicado por /health"
  },
  requests: {
    key: "requests",
    label: "Peticiones atendidas",
    question: "¿El API aguanta la carga que tiene?",
    view: "api",
    unit: "",
    direction: "informational",
    optimal: null,
    risk: null,
    source: "usage.requests_total publicado por /health"
  },
  dbLatency: {
    key: "dbLatency",
    label: "Latencia de la base",
    question: "¿La base de datos está rápida?",
    view: "datos",
    unit: "ms",
    direction: "lower",
    // 100 ms es el tope que puso el propietario; 300 ms es lo que el propio API
    // ya considera consulta lenta (apex_slow_queries_total >300ms).
    optimal: 100,
    risk: 300,
    source: "componente db de /apex-control/status (viaje medida por el API)"
  },
  dataVolume: {
    key: "dataVolume",
    label: "Registros medidos",
    question: "¿Cuántos datos hay en la base?",
    view: "datos",
    unit: "",
    direction: "informational",
    optimal: null,
    risk: null,
    source: "suma de records por modulo en /apex-control/modules"
  }
});

// Definicion del p95 segun el ambiente: la sonda viaja distancias distintas y un
// solo corte pintaria de rojo un API sano por culpa de la red.
function p95Definition(environmentId) {
  const cap = Number(PROBE_BUDGET_MS[environmentId]);
  if (!Number.isFinite(cap) || cap <= 0) return GAUGES.p95;
  return {
    ...GAUGES.p95,
    optimal: Math.round(cap * 0.6),
    risk: cap,
    source: `presupuesto de sonda ${cap} ms (viaje torre->${environmentId}, no latencia del API)`
  };
}

// Serie de sondas -> veredicto operativo. `sustained` = atender, `spikes` =
// vigilar el evento. Se calcula sobre muestras medidas, nunca sobre el agregado
// del ciclo, porque un p95 no dice si la franja fue continua.
function latencyVerdict(series, cap, options = {}) {
  const windowSize = Number(options.window || VERDICT_WINDOW);
  const ratio = Number(options.ratio || VERDICT_BREACH_RATIO);
  const runLimit = Number(options.run || VERDICT_RUN_LENGTH);
  const budget = number(cap);
  const values = (Array.isArray(series) ? series : [])
    .map((sample) => (sample && typeof sample === "object" ? sample.ms : sample))
    .map(number)
    .filter((value) => value != null);
  const window = values.slice(-windowSize);
  if (!window.length || budget == null || budget <= 0) {
    return { state: "unknown", label_text: BAND_LABEL.unknown, cap: budget, samples: window.length, over: 0, over_percent: null, longest_run: 0, rule: "" };
  }
  let over = 0;
  let run = 0;
  let longestRun = 0;
  for (const value of window) {
    if (value > budget) {
      over += 1;
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0;
    }
  }
  const overPercent = round((over / window.length) * 100, 1);
  const sustained = longestRun >= runLimit || over / window.length >= ratio;
  const state = over === 0 ? "optimal" : sustained ? "sustained" : "spikes";
  const label_text = state === "optimal"
    ? "Dentro del tope"
    : state === "sustained"
      ? "Fuera del tope: atender"
      : "Picos por evento: vigilar";
  return {
    state,
    label_text,
    cap: budget,
    samples: window.length,
    over,
    over_percent: overPercent,
    longest_run: longestRun,
    rule: `${over}/${window.length} muestras sobre ${budget} ms · racha máxima ${longestRun} · ventana ${windowSize}`
  };
}

const BAND_LABEL = Object.freeze({ optimal: "Óptimo", risk: "En riesgo", critical: "Crítico", unknown: "Sin dato", informational: "Informativo" });
const BAND_TONE = Object.freeze({ optimal: "ok", risk: "degraded", critical: "down", unknown: "unknown", informational: "unknown" });

// null/undefined/"" significa "no se midio", no "vale cero". Confundirlas daria
// medidor en verde a un ambiente que nunca responde.
function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// Un valor sin medición no es verde ni rojo: es `unknown`, y el panel lo pinta
// como tal en lugar de heredar el estado del ambiente anterior. Lo informativo
// tiene su propia banda: es contexto medido, no un indicador que falta.
function bandForValue(definition, value) {
  const measured = number(value);
  if (measured == null) return "unknown";
  if (definition.direction === "informational") return "informational";
  if (definition.direction === "higher") {
    if (measured >= definition.optimal) return "optimal";
    if (measured >= definition.risk) return "risk";
    return "critical";
  }
  if (measured <= definition.optimal) return "optimal";
  if (measured <= definition.risk) return "risk";
  return "critical";
}

function gauge(key, value, extra = {}, definition = null) {
  const base = GAUGES[key];
  if (!base) return null;
  const resolved = definition || base;
  const measured = number(value);
  const band = bandForValue(resolved, measured);
  return {
    key,
    label: resolved.label,
    question: resolved.question,
    view: resolved.view,
    unit: resolved.unit,
    direction: resolved.direction,
    value: measured,
    band,
    tone: BAND_TONE[band],
    label_text: BAND_LABEL[band],
    limits: { optimal: resolved.optimal, risk: resolved.risk },
    source: resolved.source,
    ...extra
  };
}

// Ratio de frescura de un modulo: cuanto del intervalo esperado ha pasado.
// 1 = al limite; 3 = tres veces vencido. Un modulo sin fecha medida no puntua.
function freshnessRatio(module) {
  const age = number(module && module.data ? module.data.age_minutes : null);
  const expected = number(module && module.data ? module.data.expected_minutes : null);
  if (age == null || !expected || expected <= 0) return null;
  return round(age / expected, 2);
}

// banda del modulo en un sondeo: el estado manda sobre la frescura, porque un
// modulo caido no se recupera por tener datos recientes. La frescura si puede
// EMPEORAR la banda: un modulo 40x vencido no se queda en "en riesgo" mientras
// el medidor del ambiente lo declara critico por el mismo numero.
function moduleBand(module) {
  const status = module && module.status;
  if (status === "down") return "critical";
  if (status === "unknown" || !status) return "unknown";
  const ratio = freshnessRatio(module);
  if (ratio != null) {
    if (ratio > GAUGES.freshness.risk) return "critical";
    if (ratio > GAUGES.freshness.optimal) return "risk";
  }
  return status === "degraded" ? "risk" : "optimal";
}

function totalRecords(modules) {
  const values = (modules || [])
    .map((module) => number(module && module.data ? module.data.records : null))
    .filter((value) => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

// Latencia del servidor medida por el propio API (componentes de apex-control).
// Es la unica lectura "de adentro" que existe hoy sin el histograma de /metrics.
function componentLatency(components, key) {
  const list = Array.isArray(components) ? components : [];
  const found = list.find((component) => component && component.key === key);
  if (!found) return null;
  return number(found.latencyMs ?? found.latency_ms);
}

// Cada componente ya llega del API con su propio estado (ok/degraded/down) y eso
// manda. Solo la base se rebanea ademas por umbral, porque es la unica latencia
// de componente para la que existe un tope versionado en la torre.
function componentBand(component) {
  const status = component && component.status;
  if (status === "down") return "critical";
  if (status === "unknown" || !status) return "unknown";
  if (component && component.key === "db") {
    const band = bandForValue(GAUGES.dbLatency, number(component.latencyMs));
    if (band === "critical" || band === "risk") return band;
  }
  return status === "degraded" ? "risk" : "optimal";
}

function componentBands(components) {
  const list = Array.isArray(components) ? components : [];
  return list.map((component) => ({
    ...component,
    band: componentBand(component),
    tone: BAND_TONE[componentBand(component)],
    label_text: BAND_LABEL[componentBand(component)]
  }));
}

function worstFreshness(modules) {
  const ratios = (modules || []).map(freshnessRatio).filter((ratio) => ratio != null);
  return ratios.length ? Math.max(...ratios) : null;
}

function coveragePercent(activity) {
  const summary = activity && activity.tenants ? activity.tenants.summary : null;
  const active = number(summary && summary.active);
  const withActivity = number(summary && summary.with_activity);
  if (!active || withActivity == null) return null;
  return round((withActivity / active) * 100, 1);
}

// Todo lo que el panel necesita para pintar un medidor, ya medido y ya bandado.
// El orden es el orden de las preguntas del panel: latencia, API, carga, módulos y
// base de datos. El navegador no reordena: pinta lo que el servidor publica.
function gaugesFor(environment) {
  if (!environment) return [];
  const performance = environment.performance || null;
  const deployed = environment.deployed || null;
  const modules = environment.modules && Array.isArray(environment.modules.modules)
    ? environment.modules.modules
    : [];
  const list = [
    gauge("p95", performance ? performance.p95 : null, {}, p95Definition(environment.id)),
    gauge("errorRate", performance ? performance.errorRate : null),
    gauge("memoryRss", deployed && deployed.memory ? deployed.memory.rss : null),
    gauge("requests", deployed && deployed.usage ? deployed.usage.requestsTotal : null),
    gauge("uptime", deployed ? deployed.uptimeSeconds : null),
    gauge("freshness", worstFreshness(modules)),
    gauge("dbLatency", componentLatency(environment.components, "db")),
    gauge("slowQueries", deployed && deployed.usage ? deployed.usage.slowQueries : null),
    gauge("dataVolume", totalRecords(modules)),
    gauge("dataCoverage", coveragePercent(environment.activity))
  ];
  return list.filter(Boolean);
}

// Una sonda /health individual se compara contra el presupuesto de sonda del
// ambiente: mide el mismo viaje, no el tiempo de respuesta del API.
function probeBand(ms, ok, environmentId = null) {
  if (ok === false) return "critical";
  return bandForValue(environmentId ? p95Definition(environmentId) : GAUGES.p95, ms);
}

// Un tick por modulo y por sondeo: solo lo que se midio en ese momento. La lectura
// de la API viaja dentro del mismo tick para que el mapa alinee ambas series sin
// emparejar marcas de tiempo que el sondeo genera en instantes distintos.
function moduleTicks(modules, at, api = null, environmentId = null) {
  const ticks = {};
  for (const module of modules || []) {
    const ratio = freshnessRatio(module);
    ticks[module.key] = {
      band: moduleBand(module),
      ratio,
      records: number(module.data ? module.data.records : null)
    };
  }
  const ms = number(api ? api.ms : null);
  const ok = api ? api.ok !== false : true;
  return { at, ticks, api: { ms, ok, band: probeBand(ms, ok, environmentId) } };
}

module.exports = {
  GAUGES,
  BAND_LABEL,
  BAND_TONE,
  BUDGET_API_P95_MS,
  PROBE_BUDGET_MS,
  bandForValue,
  measuredValue: number,
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
};
