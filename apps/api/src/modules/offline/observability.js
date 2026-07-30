const { recordPlatformLog } = require("../../fabric/platformLogs");

function metric(name, factory) {
  const { promClient } = require("../../fabric/metrics");
  return promClient.register.getSingleMetric(name) || factory();
}

let metrics;

function offlineMetrics() {
  if (metrics) return metrics;
  const { promClient } = require("../../fabric/metrics");
  const bootstrapCounter = metric(
    "apex_offline_bootstrap_total",
    () =>
      new promClient.Counter({
        name: "apex_offline_bootstrap_total",
        help: "Solicitudes de bootstrap offline por resultado",
        labelNames: ["result"]
      })
  );
  const bootstrapDuration = metric(
    "apex_offline_bootstrap_duration_ms",
    () =>
      new promClient.Histogram({
        name: "apex_offline_bootstrap_duration_ms",
        help: "Duracion de bootstrap offline en milisegundos",
        buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
      })
  );
  metrics = { bootstrapCounter, bootstrapDuration };
  return metrics;
}

async function record(event) {
  const { bootstrapCounter, bootstrapDuration } = offlineMetrics();
  const result = event.event === "offline_bootstrap_authorized" ? "authorized" : "rejected";
  bootstrapCounter.labels(result).inc();
  bootstrapDuration.observe(Number(event.durationMs || 0));
  await recordPlatformLog({
    tenant_id: event.tenantId,
    user_id: event.userId,
    source: "api",
    module: "offline",
    route: "/api/v1/offline/bootstrap",
    method: "GET",
    status_code: result === "authorized" ? 200 : Number(event.statusCode || 403),
    code: event.code || event.event,
    message: result === "authorized" ? "Bootstrap offline generado" : "Bootstrap offline rechazado",
    metadata: {
      duration_ms: Number(Number(event.durationMs || 0).toFixed(2)),
      order_count: Number(event.orderCount || 0),
      response_bytes: Number(event.bytes || 0),
      query_count: Number(event.queryCount || 0)
    }
  });
}

module.exports = { record };
