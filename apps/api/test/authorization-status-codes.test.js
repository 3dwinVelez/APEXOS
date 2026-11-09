const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const tenancyMiddleware = require("../src/middleware/tenancy");
const { requireAnyAdminCapability, requirePhysicalDeleteGrant } = require("../src/middleware/rbac");
const { selectMembership } = require("../src/security/supabaseAuth");

function fakeReply() {
  const reply = { statusCode: 200, payload: null };
  reply.code = (code) => { reply.statusCode = code; return reply; };
  reply.send = (payload) => { reply.payload = payload; return reply; };
  return reply;
}

// El contrato que este archivo protege: 401 es "la credencial no sirve" y el cliente
// responde borrando la sesion y reenviando a /login. Todo lo que sea "la credencial sirve
// pero no hay empresa/rol" tiene que ser 403, o el usuario ve una sesion que no aguanta.

test("tenancy sin empresa en la sesion responde 403 y no 401", async () => {
  const reply = fakeReply();
  await tenancyMiddleware({ user: { id: 7 } }, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.code, "EMPRESA_REQUERIDA");
});

test("usuario autenticado sin rol responde 403 ROL_NO_DEFINIDO y no 401", async () => {
  const guard = requireAnyAdminCapability([{ resource: "users", action: "read" }]);
  const reply = fakeReply();
  await guard({ tenant: { active_modules: ["M-01"] }, user: {} }, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.code, "ROL_NO_DEFINIDO");

  const deleteReply = fakeReply();
  await requirePhysicalDeleteGrant("hr")({ tenant: { active_modules: ["M-17"] }, user: {} }, deleteReply);
  assert.equal(deleteReply.statusCode, 403);
  assert.equal(deleteReply.payload.code, "ROL_NO_DEFINIDO");
});

test("la empresa solicitada por fuera de las memberships es un rechazo de autorizacion", () => {
  const memberships = [{ company_id: "company-a", role: "admin", status: "active" }];
  assert.throws(() => selectMembership(memberships, "company-b"), (error) => {
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "EMPRESA_NO_AUTORIZADA");
    return true;
  });
});

// ---- cadena real de Supabase, con el borde simulado en localhost ----

function startSupabaseStub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res));
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function withSupabaseStub(handler, run) {
  const { server, port } = await startSupabaseStub(handler);
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_AUTH_CACHE_TTL_MS: process.env.SUPABASE_AUTH_CACHE_TTL_MS
  };
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_ANON_KEY = "stub-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
  process.env.SUPABASE_AUTH_CACHE_TTL_MS = "1000";
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

test("un usuario Supabase sin ninguna empresa activa se rechaza con 403, no con 401", async () => {
  await withSupabaseStub((req, res) => {
    if (req.url.startsWith("/auth/v1/user")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "11111111-2222-3333-4444-555555555555", email: "maestro@apex.local" }));
      return;
    }
    if (req.url.startsWith("/rest/v1/company_users")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
      return;
    }
    res.writeHead(404).end("{}");
  }, async () => {
    const { authenticateSupabaseToken } = require("../src/security/supabaseAuth");
    await assert.rejects(authenticateSupabaseToken("sin-empresa-token", ""), (error) => {
      assert.equal(error.statusCode, 403, "un 401 aqui borra una sesion valida y expulsa al usuario");
      assert.equal(error.code, "EMPRESA_NO_VINCULADA");
      return true;
    });
  });
});

test("un token que ni siquiera resuelve identidad sigue siendo 401", async () => {
  await withSupabaseStub((req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "invalid JWT" }));
  }, async () => {
    const { authenticateSupabaseToken } = require("../src/security/supabaseAuth");
    await assert.rejects(authenticateSupabaseToken("token-malo-token", ""), (error) => {
      assert.notEqual(error.statusCode, 403, "la credencial invalida no puede degradarse a 403");
      return true;
    });
  });
});

// ---- decorador real: la respuesta HTTP que ve el navegador ----

test("el decorador real responde 403 al usuario Supabase sin empresa y 401 al token basura", {
  skip: process.env.AUTH_STATUS_INTEGRATION !== "1"
}, async () => {
  process.env.NODE_ENV = "test";
  process.env.REDIS_DISABLED = "true";
  process.env.DISABLE_REDIS = "true";
  process.env.JWT_SECRET ||= "authorization-status-codes-secret-with-32-chars";
  await withSupabaseStub((req, res) => {
    const bearer = String(req.headers.authorization || "").replace(/^Bearer /, "");
    if (req.url.startsWith("/auth/v1/user")) {
      // El borde solo reconoce el token de la cuenta sin empresa; cualquier otro sigue siendo
      // credencial invalida y tiene que terminar en 401.
      if (bearer !== "usuario-sin-empresa") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "invalid JWT" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "11111111-2222-3333-4444-555555555555", email: "maestro@apex.local" }));
      return;
    }
    if (req.url.startsWith("/rest/v1/company_users")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
      return;
    }
    res.writeHead(404).end("{}");
  }, async () => {
    const build = require("../server");
    const app = await build();
    try {
      await app.ready();
      const sinEmpresa = await app.inject({
        method: "GET",
        url: "/api/v1/admin/roles",
        headers: { authorization: "Bearer usuario-sin-empresa" }
      });
      assert.equal(sinEmpresa.statusCode, 403, `la sesion valida no puede morir por falta de empresa (llego ${sinEmpresa.statusCode})`);
      assert.equal(sinEmpresa.json().code, "EMPRESA_NO_VINCULADA");

      const basura = await app.inject({
        method: "GET",
        url: "/api/v1/admin/roles",
        headers: { authorization: "Bearer token-que-no-es-nada" }
      });
      assert.equal(basura.statusCode, 401, `una credencial invalida no puede degradarse a 403 (llego ${basura.statusCode})`);
      assert.equal(basura.json().code, "TOKEN_INVALIDO");
    } finally {
      await app.close();
    }
  });
});
