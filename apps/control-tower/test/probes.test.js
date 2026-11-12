"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const http = require("node:http");
const { redisPing, probeApexControl, runProbes, localCloudCards } = require("../lib/probes");
const { recommendationsFor } = require("../lib/recommendations");

function closedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

test("redisPing devuelve ok cuando el servidor responde PONG", async () => {
  const server = net.createServer((socket) => {
    socket.once("data", () => socket.write("+PONG\r\n"));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  try {
    const result = await redisPing("127.0.0.1", port, 1000);
    assert.equal(result.ok, true);
    assert.match(result.detail, /PONG/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("redisPing falla cuando el puerto no acepta conexiones", async () => {
  const port = await closedPort();
  const result = await redisPing("127.0.0.1", port, 500);
  assert.equal(result.ok, false);
  assert.ok(result.detail);
});

test("probeApexControl normaliza componentes en arreglo y lee snake_case", async (t) => {
  let authorization = null;
  const server = http.createServer((req, res) => {
    authorization = req.headers.authorization || null;
    if (req.url === "/api/v1/apex-control/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        overall: "degraded",
        components: [
          { key: "queues", status: "ok", details: { waiting: 0 }, latency_ms: 12 },
          { key: "crons", status: "down", details: "scheduler caido" },
          { key: "mail", status: "degraded" },
          { key: "websocket", status: "ok", latency_ms: null, score: null }
        ]
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();

  const checks = await probeApexControl({
    apiBaseUrl: `http://127.0.0.1:${port}`,
    apexToken: "jwt-demo",
    infra: { timeoutMs: 1000 }
  });
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
  assert.equal(authorization, "Bearer jwt-demo");
  assert.equal(byId["apex-control"].status, "degraded");
  assert.deepEqual(byId["apex-control"].detail, { overall: "degraded", components: 4 });
  assert.equal(byId.queues.status, "ok");
  assert.deepEqual(byId.queues.detail, { waiting: 0 });
  assert.equal(byId.queues.latencyMs, 12);
  assert.equal(byId.crons.status, "down");
  assert.equal(byId.mail.status, "degraded");
  // null publicado = no medido. Number(null) vale 0, y un 0 ms se leeria como
  // componente optimo en la vista API.
  assert.equal(byId.websocket.latencyMs, null);
  const porClave = Object.fromEntries(byId["apex-control"].components.map((component) => [component.key, component]));
  assert.equal(porClave.websocket.latencyMs, null);
  assert.equal(porClave.websocket.score, null);
});

// El presupuesto de 2,5 s de la infraestructura local era mas estrecho que el del
// ambiente (6 s) para el MISMO endpoint: /apex-control/status barre ~30 modulos y
// un segundo y pico es su costo normal, asi que la torre declaraba caido un API
// sano y la vista API se quedaba sin componentes que pintar.
test("la lectura de apex-control usa el presupuesto del ambiente, no el de la infraestructura", async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/v1/apex-control/status") {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ overall: "ok", components: [{ key: "db", status: "ok", latency_ms: 1500 }] }));
      }, 700);
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "OK" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  const checks = (await runProbes({
    simulation: false,
    apiBaseUrl: origin,
    webBaseUrl: origin,
    apexToken: "jwt-demo",
    environmentTimeoutMs: 4000,
    infra: {
      timeoutMs: 200,
      brainUrl: origin,
      minioUrl: origin,
      dockerEnabled: false,
      postgres: { host: "127.0.0.1", port: 1 },
      redis: { host: "127.0.0.1", port: 1 }
    },
    environments: { local: { id: "local", short: "LOCAL", apiBaseUrl: origin, apexToken: "jwt-demo" } }
  })).checks;
  const apex = checks.find((check) => check.id === "apex-control");
  assert.ok(apex.durationMs >= 700, `la lectura tardo ${apex.durationMs} ms`);
  assert.equal(apex.status, "ok");
  assert.equal(checks.find((check) => check.id === "db").status, "down");
});

test("el ambiente local declara la nube como no aplicable, no como pendiente de token", () => {
  const cloud = localCloudCards();
  assert.deepEqual(Object.keys(cloud), ["railway", "vercel", "supabase"]);
  for (const card of Object.values(cloud)) {
    assert.equal(card.applies, false);
    assert.equal(card.configured, false);
    assert.equal(card.status, "not_applicable");
    assert.equal(card.latencyMs, null, "sin llamada no hay viaje que inventar");
    assert.match(card.detail, /no aplica al ambiente local/);
  }
  const items = recommendationsFor({ id: "local", short: "LOCAL", enabled: true, cloud, modules: { reason: null, modules: [] } }, {});
  assert.ok(!items.some((item) => String(item.code).startsWith("CLOUD")), "la vista Nube del local no pide credenciales");
});
