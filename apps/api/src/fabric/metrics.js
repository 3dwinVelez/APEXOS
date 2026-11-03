/**
 * Endpoint de métricas /metrics para Prometheus
 * Expone counters, histograms y gauges en formato Prometheus
 */

const promClient = require("prom-client");

// --- Recolector por defecto (CPU, memoria, event loop, GC) ---
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// --- Contadores por método y ruta ---
const httpRequestCounter = new promClient.Counter({
  name: "apex_http_requests_total",
  help: "Total de requests HTTP",
  labelNames: ["method", "route", "status"]
});

const httpRequestDuration = new promClient.Histogram({
  name: "apex_http_request_duration_ms",
  help: "Duración de requests HTTP en ms",
  labelNames: ["method", "route"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
});

// --- Contadores por fase de autenticación ---
const authPhaseDuration = new promClient.Histogram({
  name: "apex_auth_phase_duration_ms",
  help: "Duración de fases de autenticación en ms",
  labelNames: ["phase"],
  buckets: [5, 10, 25, 50, 100, 250, 500]
});

// --- Contadores de queries lentas ---
const slowQueryCounter = new promClient.Counter({
  name: "apex_slow_queries_total",
  help: "Total de queries lentas (>300ms)",
  labelNames: ["model", "action"]
});

// --- Gauges de colas (BullMQ) ---
let queueGauge = null;

function registerQueueGauge() {
  if (queueGauge) return queueGauge;
  queueGauge = new promClient.Gauge({
    name: "apex_queue_jobs",
    help: "Jobs en colas BullMQ",
    labelNames: ["queue", "status"]
  });
  return queueGauge;
}

// --- Helpers ---
const runtimeCounters = {
  total: 0,
  byStatus: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
  slowQueries: 0
};

function statusBucket(status) {
  const code = Number(status) || 0;
  if (code >= 500) return "5xx";
  if (code >= 400) return "4xx";
  if (code >= 300) return "3xx";
  return "2xx";
}

function megabytes(bytes) {
  return Math.round((Number(bytes) || 0) / 104857.6) / 10;
}

function recordHttpRequest(method, route, status, durationMs) {
  httpRequestCounter.labels(method, route, String(status)).inc();
  httpRequestDuration.labels(method, route).observe(durationMs);
  runtimeCounters.total += 1;
  runtimeCounters.byStatus[statusBucket(status)] += 1;
}

function recordAuthPhase(phase, durationMs) {
  authPhaseDuration.labels(phase).observe(durationMs);
}

function recordSlowQuery(model, action) {
  slowQueryCounter.labels(model, action).inc();
  runtimeCounters.slowQueries += 1;
}

/**
 * Lectura agregada del proceso para vigilancia externa (torre de control).
 * Solo totales y consumo del proceso: nunca rutas, tenants ni datos personales.
 */
function runtimeSnapshot(options = {}) {
  const memory = options.memory || process.memoryUsage();
  const uptime = options.uptimeSeconds != null
    ? Math.max(0, Math.round(Number(options.uptimeSeconds) || 0))
    : Math.max(0, Math.round(Number(process.uptime && process.uptime()) || 0));
  return {
    uptime_seconds: uptime,
    memory_mb: {
      rss: megabytes(memory.rss),
      heap_used: megabytes(memory.heapUsed),
      heap_total: megabytes(memory.heapTotal),
      external: megabytes(memory.external)
    },
    usage: {
      requests_total: runtimeCounters.total,
      by_status: { ...runtimeCounters.byStatus },
      slow_queries_total: runtimeCounters.slowQueries
    }
  };
}

async function updateQueueMetrics(queues) {
  if (!queues) return;
  const gauge = registerQueueGauge();
  for (const [name, queue] of Object.entries(queues)) {
    if (!queue?.getJobCounts) continue;
    try {
      const counts = await queue.getJobCounts();
      for (const [status, count] of Object.entries(counts)) {
        gauge.labels(name, status).set(count || 0);
      }
    } catch {
      // Queue metrics are best-effort
    }
  }
}

async function metricsEndpoint(queues) {
  if (queues) {
    await updateQueueMetrics(queues);
  }
  return promClient.register.metrics();
}

module.exports = {
  recordHttpRequest,
  recordAuthPhase,
  recordSlowQuery,
  runtimeSnapshot,
  updateQueueMetrics,
  metricsEndpoint,
  promClient
};
