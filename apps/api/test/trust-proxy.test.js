const assert = require("node:assert/strict");
const test = require("node:test");
const Fastify = require("fastify");
const { resolveTrustProxy } = require("../src/security/trustProxy");

// C-07: `trustProxy: true` hacia que request.ip saliera de X-Forwarded-For sin
// verificar quien lo firmo, y el bloqueo de login por intentos se eludia con una
// cabecera. Aqui se prueba el resolutor y el efecto real sobre request.ip.

test("sin declaracion no se confia en la cabecera", () => {
  for (const value of [undefined, null, "", "false", "   ", "0", "true", "banana", "1.2.3.999", "10.0.0.0/99"]) {
    assert.equal(resolveTrustProxy(value), false, `TRUST_PROXY=${JSON.stringify(value)} no debe abrir la confianza`);
  }
});

test("acepta proxies y saltos declarados", () => {
  assert.equal(resolveTrustProxy("loopback"), "loopback");
  assert.equal(resolveTrustProxy("2"), "2");
  assert.equal(resolveTrustProxy("10.0.0.0/8"), "10.0.0.0/8");
  assert.deepEqual(resolveTrustProxy("10.0.0.0/8, 192.168.0.0/16"), ["10.0.0.0/8", "192.168.0.0/16"]);
});

async function ipSeen(trustProxy, forwardedFor) {
  const app = Fastify({ trustProxy });
  app.get("/quien", async (request) => ({ ip: request.ip }));
  const response = await app.inject({ method: "GET", url: "/quien", headers: { "x-forwarded-for": forwardedFor } });
  await app.close();
  return JSON.parse(response.body).ip;
}

test("un X-Forwarded-For falsificado no cambia la IP cuando no hay proxy declarado", async () => {
  assert.equal(await ipSeen(resolveTrustProxy(""), "1.2.3.4"), "127.0.0.1");
});

test("con el proxy declarado la cabecera si se honra", async () => {
  assert.equal(await ipSeen(resolveTrustProxy("127.0.0.1"), "1.2.3.4"), "1.2.3.4");
});
