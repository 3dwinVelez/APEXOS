"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { loadConfig, safeConfig } = require("../lib/config");
const { diagnoseCheck, baseComponent } = require("../lib/diagnostics");
const { PerformanceTracker, percentile } = require("../lib/performance");
const { runEnvironmentProbes, computeOverall, computeSummary } = require("../lib/probes");

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function remoteConfig(base) {
  return loadConfig({
    simulation: false,
    environmentTimeoutMs: 2000,
    infra: { timeoutMs: 2000 },
    environments: {
      develop: {
        enabled: true,
        apiBaseUrl: base,
        webBaseUrl: base,
        supabaseUrl: base,
        supabaseRef: "",
        supabaseAnonKey: ""
      }
    },
    cloud: {
      railway: { token: "" },
      vercel: { token: "" },
      supabase: { accessToken: "" }
    }
  });
}

test("config expone tres ambientes con su rama y defaults seguros", () => {
  const config = loadConfig();
  assert.equal(config.environments.local.branch, "desarrollo");
  assert.equal(config.environments.develop.branch, "develop");
  assert.equal(config.environments.main.branch, "main");
  assert.equal(config.environments.local.id, "local");
  assert.equal(typeof config.environments.local.enabled, "boolean");
  assert.equal(typeof config.environmentTimeoutMs, "number");

  const safe = safeConfig(config);
  assert.equal(safe.environments.develop.branch, "develop");
  assert.equal(typeof safe.cloud.railwayConfigured, "boolean");
  assert.equal(safe.environments.develop.supabaseAnonKey, undefined, "la config publica no expone llaves");
});

test("safeConfig no filtra tokens ni llaves", () => {
  const config = loadConfig({
    uiToken: "ui-secret-value",
    apexToken: "apex-secret-value",
    telegram: { token: "tg-secret-value", mode: "off" },
    bridge: { token: "bridge-secret-value" },
    cloud: {
      railway: { token: "railway-secret-value" },
      vercel: { token: "vercel-secret-value" },
      supabase: { accessToken: "supabase-secret-value" }
    },
    environments: { develop: { supabaseAnonKey: "anon-secret-value" } }
  });
  const serialized = JSON.stringify(safeConfig(config));
  for (const secret of ["ui-secret-value", "apex-secret-value", "tg-secret-value", "bridge-secret-value", "railway-secret-value", "vercel-secret-value", "supabase-secret-value", "anon-secret-value"]) {
    assert.equal(serialized.includes(secret), false, `no debe exponer ${secret}`);
  }
  assert.equal(safeConfig(config).cloud.railwayConfigured, true);
});

test("diagnostico agrega impacto funcional y detalle tecnico por ambiente", () => {
  const check = diagnoseCheck({
    id: "main.api",
    label: "API PROD",
    environment: "main",
    status: "down",
    severity: "critical",
    critical: true,
    optional: false,
    durationMs: 123,
    source: "tower",
    checkedAt: "2026-11-02T12:00:00.000Z",
    detail: "HTTP 502",
    technical: { endpoint: "https://api.example/health", httpStatus: 502 }
  });
  assert.equal(baseComponent(check.id), "api");
  assert.match(check.functional, /iniciar sesión/i);
  assert.match(check.action, /despliegue de la API/i);
  assert.equal(check.technical.environment, "main");
  assert.equal(check.technical.source, "tower");
  assert.equal(check.technical.latencyMs, 123);
  assert.equal(check.technical.detail, "HTTP 502");
  assert.equal(check.technical.endpoint, "https://api.example/health");
  assert.equal(check.technical.httpStatus, 502);
});

test("performance calcula percentiles, tasa de error y persiste", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([10, 20, 30], 95), 30);

  const tracker = new PerformanceTracker({ maxSamples: 10 });
  for (const ms of [100, 200, 300, 400, 500]) {
    tracker.record("main", { ms, ok: true, endpoint: "/health", at: "2026-11-02T12:00:00.000Z" });
  }
  tracker.record("develop", { ms: 900, ok: false, endpoint: "/health", at: "2026-11-02T12:00:00.000Z" });

  const main = tracker.summary("main");
  assert.equal(main.samples, 5);
  assert.equal(main.p50, 300);
  assert.equal(main.p95, 500);
  assert.equal(main.errorRate, 0);
  assert.deepEqual(main.series.map((sample) => sample.ms), [100, 200, 300, 400, 500]);

  const develop = tracker.summary("develop");
  assert.equal(develop.failures, 1);
  assert.equal(develop.errorRate, 100);

  const capped = new PerformanceTracker({ maxSamples: 10 });
  for (let value = 1; value <= 12; value += 1) capped.record("local", { ms: value });
  assert.equal(capped.summary("local").samples, 10);
  assert.equal(capped.summary("local").series[0].ms, 3);
  assert.equal(capped.summary("local").series[9].ms, 12);

  const restored = new PerformanceTracker({ persisted: JSON.parse(JSON.stringify(tracker.toJSON())) });
  assert.equal(restored.summary("main").samples, 5);
  assert.equal(restored.summary("develop").failures, 1);
});

test("overall distingue caido, degradado y sin dato", () => {
  assert.equal(computeOverall([]), "unknown");
  assert.equal(computeOverall([{ id: "a", status: "unknown", optional: false }]), "unknown");
  assert.equal(computeOverall([{ id: "a", status: "down", critical: true, optional: false }]), "down");
  assert.equal(computeOverall([{ id: "a", status: "down", critical: false, optional: true }]), "degraded");
  assert.equal(computeOverall([{ id: "a", status: "ok", optional: false }, { id: "b", status: "degraded", optional: false }]), "degraded");
  assert.deepEqual(computeSummary([{ status: "ok" }, { status: "down" }, { status: "down" }]), { ok: 1, degraded: 0, down: 2, unknown: 0, total: 3 });
});

test("sondas remotas consultan API, web y Supabase y dejan cloud sin credenciales", async (t) => {
  const server = await startServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        version: "2.0",
        commit: "a505e97f9622",
        modules: 18,
        uptime_seconds: 3600,
        memory_mb: { rss: 200, heap_used: 10, heap_total: 20, external: 1 },
        usage: { requests_total: 4200, by_status: { "2xx": 4100, "4xx": 80, "5xx": 20 }, slow_queries_total: 7 }
      }));
      return;
    }
    if (req.url === "/auth/v1/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>APEXOS</body></html>");
  });
  t.after(() => server.close());

  const config = remoteConfig(server.url);
  const result = await runEnvironmentProbes(config, config.environments.develop, { simulation: false });
  const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]));

  assert.equal(result.enabled, true);
  assert.equal(byId["develop.api"].status, "ok");
  assert.match(byId["develop.api"].technical.endpoint, /\/health$/);
  assert.equal(byId["develop.web"].status, "ok");
  assert.equal(byId["develop.supabase"].status, "ok");
  assert.equal(byId["develop.railway"].status, "unknown");
  assert.equal(byId["develop.vercel"].status, "unknown");
  assert.equal(result.cloud.railway.configured, false);
  assert.equal(result.cloud.vercel.configured, false);
  assert.equal(result.cloud.supabase.configured, false);
  assert.equal(result.metrics.length, 1);
  assert.equal(result.metrics[0].environment, "develop");
  assert.deepEqual(result.api, {
    status: "ok",
    version: "2.0",
    commit: "a505e97f9622",
    modules: 18,
    uptimeSeconds: 3600,
    memory: { rss: 200, heapUsed: 10, heapTotal: 20 },
    usage: { requestsTotal: 4200, byStatus: { "2xx": 4100, "4xx": 80, "5xx": 20 }, slowQueries: 7 }
  }, "expone el build, la memoria y el uso que reporta /health");
  assert.equal(computeOverall(result.checks), "ok");
});

test("una API remota con error degrada el ambiente", async (t) => {
  const server = await startServer((req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unavailable" }));
  });
  t.after(() => server.close());

  const config = remoteConfig(server.url);
  const result = await runEnvironmentProbes(config, config.environments.develop, { simulation: false });
  const api = result.checks.find((check) => check.id === "develop.api");
  assert.equal(api.status, "degraded");
  assert.equal(api.technical.httpStatus, 503);
  assert.equal(computeOverall(result.checks), "degraded");
});

test("simulacion no consulta red remota y marca sondas opcionales sin dato", async () => {
  const config = remoteConfig("https://example.invalid");
  const result = await runEnvironmentProbes(config, config.environments.develop, { simulation: true });
  assert.equal(result.checks.length, 3);
  assert.ok(result.checks.every((check) => check.status === "unknown" && check.optional));
  assert.ok(result.checks.every((check) => check.technical.simulated === true));
  assert.equal(result.cloud.railway.configured, false);
  assert.equal(result.metrics.length, 0);
});

test("ambiente desactivado reporta configuracion pendiente", async () => {
  const config = remoteConfig("https://example.invalid");
  const disabled = { ...config.environments.develop, enabled: false };
  const result = await runEnvironmentProbes(config, disabled, { simulation: true });
  assert.equal(result.enabled, false);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].id, "develop.config");
  assert.equal(result.checks[0].status, "unknown");
  assert.equal(result.cloud.railway.configured, false);
});
