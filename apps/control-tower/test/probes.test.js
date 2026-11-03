"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { redisPing } = require("../lib/probes");

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
