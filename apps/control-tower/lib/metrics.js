"use strict";

// Fuente unica de umbrales de la torre. Ningun numero de banda vive en el
// navegador: el servidor publica el valor medido, su banda y los limites que la
// produjeron, y el panel solo pinta. Los cortes salen del presupuesto versionado
// de rendimiento (docs/PERFORMANCE_ENGINEERING_STANDARD.md y
// scripts/performance/performance-budget-check.js), no de estimaciones del UI.
const BUDGET_API_P95_MS = Number(process.env.PERF_API_P95_MS || 1000);

// `direction: lower` castiga los valores altos (latencia, errores, memoria).
// `higher` premia los altos (porcentaje de empresas con actividad).
// `informational` no tiene banda: es contexto, no diagnostico.
const GAUGES = Object.freeze({
  p95: {
    key: "p95",
    label: "p95 del API",
    unit: "ms",
    direction: "lower",
    optimal: Math.round(BUDGET_API_P95_MS * 0.6),
    risk: BUDGET_API_P95_MS,
    source: `presupuesto PERF_API_P95_MS=${BUDGET_API_P95_MS}`
  },
  errorRate: {
    key: "errorRate",
    label: "Sondas fallidas",
    unit: "%",
    direction: "lower",
    optimal: 1,
    risk: 5,
    source: "serie de sondas /health de la torre"
  },
  memoryRss: {
    key: "memoryRss",
    label: "Memoria del API",
    unit: "MB",
    direction: "lower",
    optimal: 512,
    risk: 1024,
    source: "memory_mb.rss publicado por /health"
  },
  slowQueries: {
    key: "slowQueries",
    label: "Consultas lentas",
    unit: "",
    direction: "lower",
    optimal: 0,
    risk: 5,
    source: "usage.slow_queries_total publicado por /health"
  },
  dataCoverage: {
    key: "dataCoverage",
    label: "Empresas con actividad",
    unit: "%",
    direction: "higher",
    optimal: 20,
    risk: 5,
    source: "tenants.summary.with_activity sobre active"
  },
  freshness: {
    key: "freshness",
    label: "Frescura de datos",
    unit: "x",
    direction: "lower",
    optimal: 1,
    risk: 3,
    source: "peor ratio age_minutes/expected_minutes entre modulos"
  },
  uptime: {
    key: "uptime",
    label: "Uptime del proceso",
    unit: "s",
    direction: "informational",
    optimal: null,
    risk: null,
    source: "uptime_seconds publicado por /health"
  },
  requests: {
    key: "requests",
    label: "Peticiones atendidas",
    unit: "",
    direction: "informational",
    optimal: null,
    risk: null,
    source: "usage.requests_total publicado por /health"
  }
});

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

function gauge(key, value, extra = {}) {
  const definition = GAUGES[key];
  if (!definition) return null;
  const measured = number(value);
  const band = bandForValue(definition, measured);
  return {
    key,
    label: definition.label,
    unit: definition.unit,
    direction: definition.direction,
    value: measured,
    band,
    tone: BAND_TONE[band],
    label_text: BAND_LABEL[band],
    limits: { optimal: definition.optimal, risk: definition.risk },
    source: definition.source,
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
// modulo caido no se recupera por tener datos recientes.
function moduleBand(module) {
  const status = module && module.status;
  if (status === "down") return "critical";
  if (status === "unknown" || !status) return "unknown";
  const ratio = freshnessRatio(module);
  if (ratio == null) return status === "degraded" ? "risk" : "optimal";
  if (status === "degraded") return "risk";
  if (ratio > GAUGES.freshness.risk) return "critical";
  if (ratio > GAUGES.freshness.optimal) return "risk";
  return "optimal";
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
function gaugesFor(environment) {
  if (!environment) return [];
  const performance = environment.performance || null;
  const deployed = environment.deployed || null;
  const modules = environment.modules && Array.isArray(environment.modules.modules)
    ? environment.modules.modules
    : [];
  const list = [
    gauge("p95", performance ? performance.p95 : null),
    gauge("errorRate", performance ? performance.errorRate : null),
    gauge("memoryRss", deployed && deployed.memory ? deployed.memory.rss : null),
    gauge("slowQueries", deployed && deployed.usage ? deployed.usage.slowQueries : null),
    gauge("dataCoverage", coveragePercent(environment.activity)),
    gauge("freshness", worstFreshness(modules)),
    gauge("uptime", deployed ? deployed.uptimeSeconds : null),
    gauge("requests", deployed && deployed.usage ? deployed.usage.requestsTotal : null)
  ];
  return list.filter(Boolean);
}

// Una sonda /health individual se compara contra el mismo presupuesto que el p95
// porque mide el mismo endpoint; el mapa lo etiqueta como sonda, no como percentil.
function probeBand(ms, ok) {
  if (ok === false) return "critical";
  return bandForValue(GAUGES.p95, ms);
}

// Un tick por modulo y por sondeo: solo lo que se midio en ese momento. La lectura
// de la API viaja dentro del mismo tick para que el mapa alinee ambas series sin
// emparejar marcas de tiempo que el sondeo genera en instantes distintos.
function moduleTicks(modules, at, api = null) {
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
  return { at, ticks, api: { ms, ok, band: probeBand(ms, ok) } };
}

module.exports = {
  GAUGES,
  BAND_LABEL,
  BAND_TONE,
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
};
