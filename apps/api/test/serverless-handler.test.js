const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const Fastify = require("fastify");
const { createServerlessHandler } = require("../src/core/serverlessHandler");

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("concurrent Node HTTP requests initialize once and reach Fastify routes", async t => {
  let builds = 0;
  const app = Fastify();
  t.after(() => app.close());
  const handler = createServerlessHandler(async () => {
    builds++;
    await app.register(async instance => {
      instance.get("/health", async () => ({ status: "OK" }));
      instance.post("/echo", async request => request.body);
    });
    return app;
  });
  const base = await serve(t, handler);
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/health`)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "OK" });
  }
  const post = await fetch(`${base}/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"value":42}' });
  assert.equal(post.status, 200);
  assert.deepEqual(await post.json(), { value: 42 });
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal(builds, 1);
});

test("bootstrap failure returns bounded generic HTTP response without leaking secrets", async t => {
  const base = await serve(t, createServerlessHandler(async () => { throw new Error("private credential"); }));
  for (let index = 0; index < 2; index++) {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "API bootstrap failed", code: "BOOTSTRAP_FAILED" });
  }
});
