process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");
const Fastify = require("fastify");

// El servicio real de admin arrastra Prisma, bcrypt y Supabase. De esta ruta publica solo interesa el
// contrato del cuerpo y el buzon del despliegue, asi que se espia el export antes de requerir las rutas.
const servicePath = require.resolve("../src/modules/admin/service");
const calls = [];

function stubService() {
  calls.length = 0;
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    children: [],
    paths: [],
    exports: {
      async createClientPlatformLog(tenantId, user, input, requestMeta) {
        calls.push({ tenantId, user, input, requestMeta });
        return { ok: true };
      }
    }
  };
}

stubService();
const routes = require("../src/modules/admin/public-routes");

function resetCalls() {
  calls.length = 0;
}

const INBOX_TENANT = "00000000-0000-4000-8000-0000000000inbox";

async function build() {
  const app = Fastify();
  // Decorador que estallaria 401 si la ingesta publica heredara la autenticacion del scope de admin.
  app.decorate("authenticate", async () => {
    const error = new Error("sesion requerida");
    error.statusCode = 401;
    throw error;
  });
  await app.register(routes, { prefix: "/api/v1" });
  await app.ready();
  return app;
}

function post(app, body) {
  return app.inject({
    method: "POST",
    url: "/api/v1/public/telemetry/client-logs",
    headers: { "user-agent": "apexos-test/1.0" },
    payload: body
  });
}

test("sin buzon configurado responde honesto: no finge un ok y no escribe", async () => {
  resetCalls();
  delete process.env.APEXOS_TELEMETRY_TENANT_ID;
  const app = await build();
  const response = await post(app, { message: "La API no responde", route: "/hr/employees" });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), { recorded: false, reason: "BUZON_TELEMETRIA_NO_CONFIGURADO" });
  assert.equal(calls.length, 0);
});

test("con buzon el reporte anonimo cae en el tenant del despliegue y sin usuario", async () => {
  resetCalls();
  process.env.APEXOS_TELEMETRY_TENANT_ID = INBOX_TENANT;
  try {
    const app = await build();
    const response = await post(app, {
      module: "frontend",
      route: "/api/v1/hr/employees",
      method: "GET",
      status_code: 500,
      code: "ECONNABORTED",
      message: "La API no responde",
      detail: "TypeError: Failed to fetch",
      request_id: "req-1",
      metadata: { href: "/dashboard/talento-humano/empleados", provider: "local" }
    });
    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.json(), { recorded: true });
    // Sin sesion no hay request.user: el servicio tiene que recibir null, nunca un usuario inventado.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tenantId, INBOX_TENANT);
    assert.equal(calls[0].user, null);
    assert.equal(calls[0].input.message, "La API no responde");
    assert.equal(calls[0].input.metadata.provider, "local");
    assert.equal(calls[0].requestMeta.user_agent, "apexos-test/1.0");
  } finally {
    delete process.env.APEXOS_TELEMETRY_TENANT_ID;
  }
});

test("el cuerpo no elige tenant ni siembra PII: lo que no esta en el contrato se descarta", async () => {
  resetCalls();
  process.env.APEXOS_TELEMETRY_TENANT_ID = INBOX_TENANT;
  try {
    const app = await build();
    const response = await post(app, {
      message: "Tormenta de fallos tras caida de la API",
      tenant_id: "otro-tenant",
      user_email: "gerente@ajena.co",
      authorization: "Bearer secreto",
      metadata: { href: "/dashboard", user_email: "gerente@ajena.co", token: "jwt" }
    });
    assert.equal(response.statusCode, 202);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tenantId, INBOX_TENANT, "el tenant del body jamas manda");
    assert.equal(calls[0].input.tenant_id, undefined);
    assert.equal(calls[0].input.user_email, undefined);
    assert.equal(calls[0].input.authorization, undefined);
    assert.deepEqual(calls[0].input.metadata, { href: "/dashboard" });
  } finally {
    delete process.env.APEXOS_TELEMETRY_TENANT_ID;
  }
});

test("el mensaje es obligatorio y acotado: no es un vertedero de trazas", async () => {
  resetCalls();
  const app = await build();
  const vacio = await post(app, { route: "/hr/employees" });
  assert.equal(vacio.statusCode, 400);
  const corto = await post(app, { message: "x" });
  assert.equal(corto.statusCode, 400);
  const largo = await post(app, { message: "a".repeat(1001) });
  assert.equal(largo.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("el detalle y la metadata extra se limitan por contrato, no por bondad", async () => {
  resetCalls();
  const app = await build();
  const detalle = await post(app, { message: "fallo", detail: "a".repeat(2001) });
  assert.equal(detalle.statusCode, 400);
  const metadata = await post(app, { message: "fallo", metadata: { provider: "x".repeat(21) } });
  assert.equal(metadata.statusCode, 400);
});

test("la ingesta publica no hereda el limite de 25 MB de la API", async () => {
  resetCalls();
  const app = await build();
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/public/telemetry/client-logs",
    payload: { message: "a".repeat(40000) }
  });
  assert.equal(response.statusCode, 413);
});

test("el reporte anonimo conserva la causa clasificada y el codigo del rechazo", async () => {
  // Sin esta clave en el contrato, Fastify la REMUEVE en silencio (`removeAdditional`) y el buzon
  // perdia la unica clasificacion que hace el navegador sin sesion: request_rejected vs timeout vs
  // offline. Y sin `code`, los 4xx reportados quedaban indistinguibles entre si.
  resetCalls();
  process.env.APEXOS_TELEMETRY_TENANT_ID = INBOX_TENANT;
  try {
    const app = await build();
    const response = await post(app, {
      module: "talento-humano",
      route: "/api/v1/hr/self/time-punches",
      method: "POST",
      status_code: 409,
      code: "MARCACION_FUERA_DE_SECUENCIA",
      message: "El servidor rechazo la marcacion",
      detail: "No se pudo guardar: La siguiente marcacion permitida es fin_almuerzo.",
      metadata: { href: "/dashboard/talento-humano/marcacion", provider: "local", failure_cause: "request_rejected" }
    });
    assert.equal(response.statusCode, 202);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input.code, "MARCACION_FUERA_DE_SECUENCIA");
    assert.equal(calls[0].input.metadata.failure_cause, "request_rejected");
    assert.equal(calls[0].input.metadata.provider, "local");
  } finally {
    delete process.env.APEXOS_TELEMETRY_TENANT_ID;
  }
});
