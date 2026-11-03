process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");

const { recordHttpRequest, recordSlowQuery, runtimeSnapshot } = require("../src/fabric/metrics");

test("runtimeSnapshot agrega peticiones por rango de estado sin exponer rutas", () => {
  const before = runtimeSnapshot({ memory: {}, uptimeSeconds: 0 });
  recordHttpRequest("GET", "/hr/routes", 200, 12);
  recordHttpRequest("POST", "/auth/login", 401, 8);
  recordHttpRequest("GET", "/hr/punches", 500, 40);
  recordSlowQuery("punch", "findMany");
  const after = runtimeSnapshot({ memory: {}, uptimeSeconds: 0 });

  assert.equal(after.usage.requests_total, before.usage.requests_total + 3);
  assert.equal(after.usage.by_status["2xx"] - before.usage.by_status["2xx"], 1);
  assert.equal(after.usage.by_status["4xx"] - before.usage.by_status["4xx"], 1);
  assert.equal(after.usage.by_status["5xx"] - before.usage.by_status["5xx"], 1);
  assert.equal(after.usage.slow_queries_total, before.usage.slow_queries_total + 1);
  assert.equal(JSON.stringify(after).includes("/hr/routes"), false, "no filtra rutas en la lectura publica");
  assert.equal(JSON.stringify(after).includes("punch"), false, "no filtra modelos en la lectura publica");
});

test("runtimeSnapshot convierte la memoria a megabytes y respeta el uptime", () => {
  const snapshot = runtimeSnapshot({
    uptimeSeconds: 125.7,
    memory: { rss: 209715200, heapUsed: 10485760, heapTotal: 20971520, external: 1048576 }
  });
  assert.equal(snapshot.uptime_seconds, 126);
  assert.deepEqual(snapshot.memory_mb, { rss: 200, heap_used: 10, heap_total: 20, external: 1 });

  const negative = runtimeSnapshot({ uptimeSeconds: -5, memory: {} });
  assert.equal(negative.uptime_seconds, 0);
  assert.equal(negative.memory_mb.rss, 0);
});

test("runtimeSnapshot lee el proceso actual cuando no se inyectan datos", () => {
  const snapshot = runtimeSnapshot();
  assert.ok(Number.isFinite(snapshot.uptime_seconds));
  assert.ok(snapshot.memory_mb.rss >= 0);
  assert.ok(snapshot.memory_mb.heap_used >= 0);
  assert.ok(snapshot.usage.requests_total >= 0);
});
