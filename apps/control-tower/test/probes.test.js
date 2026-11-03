"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const http = require("node:http");
const { redisPing, probeApexControl } = require("../lib/probes");

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
          { key: "websocket", status: "ok" }
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
});
