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
  },
  // Presión de heap: cuánto del heap que el proceso ya pidió está ocupado. Es la
  // señal de "la máquina aguanta" que el propietario pide, y un porcentaje dice
  // más que heap_used y heap_total sueltos. 60 % deja margen antes del GC
  // sostenido; 85 % es el punto donde el proceso ya vive recolectando.
  heapPressure: {
    key: "heapPressure",
    label: "Presión de heap",
    question: "¿El API aguanta la carga que tiene?",
    view: "api",
    unit: "%",
    direction: "lower",
    optimal: 60,
    risk: 85,
    source: "memory_mb.heap_used / memory_mb.heap_total publicado por /health"
  },
  // Porcentaje de peticiones que el propio servidor respondió con 5xx. A
  // diferencia de «sondas fallidas», que mide los sondeos de la torre, esto mide
  // a los usuarios reales. 0 % es el objetivo; 1 % ya es un incidente.
  serverErrors: {
    key: "serverErrors",
    label: "Errores del servidor",
    question: "¿El API responde bien?",
    view: "api",
    unit: "%",
    direction: "lower",
    optimal: 0,
    risk: 1,
    source: "usage.by_status.5xx sobre usage.requests_total de /health"
  },
  // La tasa se nombra por lo que es, no por "trafico actual": el dueno llamo a
  // esa etiqueta relleno, y un contador acumulado desde el arranque no dice nada.
  requestRate: {
    key: "requestRate",
    label: "Peticiones por minuto",
    question: "¿El API aguanta la carga que tiene?",
    view: "api",
    unit: "req/min",
    direction: "informational",
    optimal: null,
    risk: null,
    source: "usage.requests_total / uptime_seconds de /health (requiere >= 60 s de proceso)"
  },
  // Peor sonda a los servicios de la nube del ambiente. El viaje torre->SaaS
  // incluye DNS + TLS + el proveedor, por eso el corte es más ancho que el del
  // API local: 250 ms es una llamada sana y 800 ms ya es el proveedor tardando.
  cloudLatency: {
    key: "cloudLatency",
    label: "Latencia de la nube",
    question: "¿Los servicios de la nube están bien?",
    view: "nube",
    unit: "ms",
    direction: "lower",
    optimal: 250,
    risk: 800,
    source: "peor duración medida de las sondas a Railway/Vercel/Supabase"
  },
  // Vista Operación: qué tan cargada está la mesa del puesto. Una alerta abierta
  // ya merece atención; tres son una franja de incidente.
  openAlerts: {
    key: "openAlerts",
    label: "Alertas abiertas",
    question: "¿Qué pasa en el puesto?",
    view: "operacion",
    unit: "",
    direction: "lower",
    optimal: 0,
    risk: 2,
    source: "alertas abiertas (sin resolvedAt) del registro de la torre"
  },
  queuedJobs: {
    key: "queuedJobs",
    label: "Trabajos por aprobar",
    question: "¿Qué pasa en el puesto?",
    view: "operacion",
    unit: "",
    direction: "lower",
    optimal: 0,
    risk: 3,
    source: "jobs.stats().counts.awaiting_approval de la torre"
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

// Banda de un valor historico con el umbral ya publicado de un medidor. El anillo
// de monitor guarda numeros, no colores: si manana sube el tope, el historial se
// relee con la regla de hoy y la grafica no se queda con la regla vieja.
function bandFromEntry(entry, value) {
  if (!entry) return "unknown";
  // Informativo es banda propia, no ausencia de medida: si se evaluara por cortes
  // caería en "unknown" y el panel pintaría como sin-dato una cifra medida.
  if (entry.direction === "informational") return number(value) == null ? "unknown" : "informational";
  // El llamador puede traer la entrada publicada (con limits) o la del catalogo
  // (con optimal/risk crudos): son el mismo umbral en dos momentos del viaje.
  const limits = entry.limits || entry;
  if (limits.optimal == null && limits.risk == null) return "unknown";
  return bandForValue({
    direction: entry.direction,
    optimal: limits.optimal,
    risk: limits.risk
  }, value);
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
function gaugesFor(environment, options = {}) {
  if (!environment) return [];
  const performance = environment.performance || null;
  const deployed = environment.deployed || null;
  const modules = environment.modules && Array.isArray(environment.modules.modules)
    ? environment.modules.modules
    : [];
  const list = [
    gauge("p95", performance ? performance.p95 : null, {}, p95Definition(environment.id)),
    gauge("errorRate", performance ? performance.errorRate : null),
    gauge("serverErrors", serverErrorPercent(deployed)),
    gauge("memoryRss", deployed && deployed.memory ? deployed.memory.rss : null),
    gauge("heapPressure", heapPressurePercent(deployed)),
    gauge("requestRate", requestsPerMinute(deployed)),
    gauge("uptime", deployed ? deployed.uptimeSeconds : null),
    gauge("cloudLatency", worstCloudLatency(options.checks, environment.id)),
    gauge("freshness", worstFreshness(modules)),
    gauge("dbLatency", componentLatency(environment.components, "db")),
    gauge("slowQueries", deployed && deployed.usage ? deployed.usage.slowQueries : null),
    gauge("dataVolume", totalRecords(modules)),
    gauge("dataCoverage", coveragePercent(environment.activity))
  ];
  return list.filter(Boolean);
}

// Medidores de la vista Operación. No viven en un ambiente: miden la mesa de
// trabajo del puesto, así que el servidor los calcula al armar /api/status con
// las alertas y los trabajos que esa respuesta ya lleva. Una alerta esta abierta
// mientras no tenga resolvedAt; su campo `status` es el estado del componente, no
// el ciclo de vida, y confundirlos contaría recuperados como pendientes.
function operationGauges({ alerts = [], jobs = null } = {}) {
  const open = (Array.isArray(alerts) ? alerts : []).filter((alert) => alert && !alert.resolvedAt);
  const counts = jobs && jobs.counts ? jobs.counts : null;
  return [
    gauge("openAlerts", open.length),
    gauge("queuedJobs", counts ? number(counts.awaiting_approval) : null)
  ].filter(Boolean);
}

// Veredicto de una vista: la peor banda entre sus medidores, con la frase y la
// regla que la produjeron. Es el mismo modelo que firma la vista Latencia,
// aplicado a API, Módulos, Base de datos, Nube y Operación: el navegador pinta,
// no decide cortes.
const VIEW_BAND_ORDER = ["optimal", "risk", "critical"];

// La pregunta de cada vista-pregunta vive aqui, junto al umbral que la responde:
// la banda de veredicto pregunta siempre lo mismo, y el texto nombra al culpable.
// Si el encabezado del panel se desincroniza de esta lista, una prueba lo rompe.
const VIEW_QUESTIONS = Object.freeze({
  resumen: "¿Cómo está APEXOS ahora mismo?",
  latencia: "¿Cómo está la latencia?",
  api: "¿El API responde bien con la carga que tiene?",
  modulos: "¿Los módulos están óptimos y al día?",
  datos: "¿La base está rápida y con datos reales?",
  nube: "¿Los servicios de la nube están bien?",
  operacion: "¿Qué se está haciendo y qué falta?"
});

function viewVerdict(gauges, question = null, view = null) {
  const fallback = question || (view ? VIEW_QUESTIONS[view] : null) || "";
  const list = (Array.isArray(gauges) ? gauges : []).filter((entry) => entry && entry.band !== "informational");
  if (!list.length) {
    return { state: "unknown", tone: "unknown", text: "Sin medidores para esta pregunta.", rule: "", question: fallback };
  }
  const measured = list.filter((entry) => entry.band !== "unknown");
  if (!measured.length) {
    return {
      state: "unknown",
      tone: "unknown",
      text: `Ningún medidor de esta vista tiene lectura: ${list.map((entry) => entry.label).join(", ")} sin dato.`,
      rule: "lo no medido no es cero",
      question: fallback || list[0].question || ""
    };
  }
  const worst = measured.reduce((left, right) => {
    const rank = VIEW_BAND_ORDER.indexOf(right.band) > VIEW_BAND_ORDER.indexOf(left.band) ? right : left;
    return rank;
  }, measured[0]);
  const tone = BAND_TONE[worst.band];
  const state = worst.band === "optimal" ? "optimal" : worst.band === "risk" ? "risk" : "critical";
  const text = `${worst.label} ${formatGaugeValue(worst)} · ${BAND_LABEL[worst.band]}`;
  const rule = measured
    .filter((entry) => entry.key !== worst.key)
    .slice(0, 3)
    .map((entry) => `${entry.label} ${formatGaugeValue(entry)} (${limitText(entry)})`)
    .join(" · ");
  return {
    state,
    tone,
    text,
    rule: rule || `único medidor de la vista: ${limitText(worst)}`,
    question: fallback || worst.question || "",
    worst_key: worst.key
  };
}

function formatGaugeValue(entry) {
  if (!entry || entry.value == null) return "sin dato";
  const digits = Number.isInteger(entry.value) ? 0 : 1;
  const value = entry.value.toLocaleString("es-CO", { maximumFractionDigits: digits });
  return entry.unit ? `${value} ${entry.unit}` : value;
}

function limitText(entry) {
  if (!entry || !entry.limits) return "sin umbral publicado";
  const { optimal, risk } = entry.limits;
  if (optimal == null && risk == null) return "informativo, sin umbral";
  if (entry.direction === "higher") return `óptimo ≥ ${optimal}, en riesgo ≥ ${risk}`;
  return `óptimo ≤ ${optimal}, tope ${risk}`;
}

// Cuánto del heap ya pedido está ocupado. Sin heap total no hay razón: el
// porcentaje de una muestra que no existe es "sin dato", no 0 %.
function heapPressurePercent(deployed) {
  const used = number(deployed && deployed.memory ? deployed.memory.heapUsed : null);
  const total = number(deployed && deployed.memory ? deployed.memory.heapTotal : null);
  if (used == null || !total || total <= 0) return null;
  return round((used / total) * 100, 1);
}

// 5xx sobre el total de peticiones que el proceso atendió desde el arranque.
function serverErrorPercent(deployed) {
  const usage = deployed && deployed.usage ? deployed.usage : null;
  const total = number(usage ? usage.requestsTotal : null);
  const errors = number(usage && usage.byStatus ? usage.byStatus["5xx"] : null);
  if (!total || total <= 0 || errors == null) return null;
  return round((errors / total) * 100, 2);
}

// Tasa real de tráfico. Un proceso recién encendido no tiene minuto medido, y
// una tasa calculada sobre segundos inventaría carga que no existió.
function requestsPerMinute(deployed) {
  const total = number(deployed && deployed.usage ? deployed.usage.requestsTotal : null);
  const uptime = number(deployed ? deployed.uptimeSeconds : null);
  if (total == null || !uptime || uptime < 60) return null;
  return round(total / (uptime / 60), 1);
}

const CLOUD_SOURCES = Object.freeze(["railway", "vercel", "supabase"]);

// Peor sonda a la nube en este sondeo: se toma del inventario de checks, que es
// donde vive la duración medida de cada llamada al proveedor. Un check sin
// llamada real (proveedor sin token, ambiente desactivado) trae durationMs 0 y
// NO cuenta: cero no es una latencia rapida, es la ausencia de medición.
function worstCloudLatency(checks, environmentId) {
  const list = Array.isArray(checks) ? checks : [];
  const durations = list
    .filter((check) => check && CLOUD_SOURCES.includes(check.source))
    .filter((check) => !environmentId || String(check.environment || "local") === String(environmentId))
    .map((check) => number(check.durationMs))
    .filter((value) => value != null && value > 0);
  return durations.length ? Math.max(...durations) : null;
}

// Un veredicto por vista, derivado de los medidores que el propio servidor ya
// bandó. Cada medidor declara la vista donde vive su evidencia, así que el
// agrupamiento no es una lista nueva que se pueda desincronizar del catalogo.
function viewVerdicts(gauges) {
  const byView = new Map();
  for (const entry of gauges || []) {
    if (!entry || !entry.view) continue;
    if (!byView.has(entry.view)) byView.set(entry.view, []);
    byView.get(entry.view).push(entry);
  }
  const verdicts = {};
  for (const [view, list] of byView) verdicts[view] = viewVerdict(list, null, view);
  return verdicts;
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
  bandFromEntry,
  measuredValue: number,
  probeBand,
  gauge,
  gaugesFor,
  operationGauges,
  viewVerdict,
  viewVerdicts,
  VIEW_QUESTIONS,
  heapPressurePercent,
  serverErrorPercent,
  requestsPerMinute,
  worstCloudLatency,
  limitText,
  formatGaugeValue,
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
