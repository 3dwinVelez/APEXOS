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
function recordHttpRequest(method, route, status, durationMs) {
  httpRequestCounter.labels(method, route, String(status)).inc();
  httpRequestDuration.labels(method, route).observe(durationMs);
}

function recordAuthPhase(phase, durationMs) {
  authPhaseDuration.labels(phase).observe(durationMs);
}

function recordSlowQuery(model, action) {
  slowQueryCounter.labels(model, action).inc();
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
  updateQueueMetrics,
  metricsEndpoint,
  promClient
};
