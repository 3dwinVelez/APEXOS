console.log("Before loading environment");
require("./src/core/loadEnv")();
console.log("After loading environment");

console.log("Before require fastify");
const fastify = require("fastify")({
  bodyLimit: Number(process.env.API_BODY_LIMIT_BYTES || 25 * 1024 * 1024),
  logger: {
    level: process.env.NODE_ENV === "production" ? "warn" : "info",
    transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined
  },
  trustProxy: true
});
console.log("After require fastify");

const MODULES = [
  "auth",
  "onboarding",
  "brain",
  "admin",
  "inventory",
  "accounting",
  "purchases",
  "projects",
  "sales",
  "invoicing",
  "hr",
  "services",
  "offline",
  "transport",
  "sales-invoice",
  "accounts-receivable"
];
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3001", "http://127.0.0.1:3001"];

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
  }
}

function registerRoutes(name, routes, options) {
  bootLog(`Registering ${name} routes`);
  fastify.register(routes, options);
  bootLog(`Registered ${name} routes`);
}

function bootLog(message) {
  console.log(message);
  fastify.log.info(message);
}

async function build() {
  bootLog("Entering build()");
  bootLog("Starting APEX OS API bootstrap");
  requireEnv(["DATABASE_URL", "JWT_SECRET"]);
  const configuredOrigins = [
    process.env.ALLOWED_ORIGINS,
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? configuredOrigins
    : Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]));
  const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (process.env.NODE_ENV !== "production") {
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    }
    return false;
  };

  bootLog("Registering cors");
  await fastify.register(require("@fastify/cors"), {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  });
  bootLog("Registered cors");

  bootLog("Registering rate-limit");
  await fastify.register(require("@fastify/rate-limit"), {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.user?.tenant_id || req.ip
  });
  bootLog("Registered rate-limit");

  bootLog("Registering security headers");
  require("./src/security/headers").registerSecurityHeaders(fastify);
  bootLog("Registered security headers");

  bootLog("Registering websocket");
  await fastify.register(require("@fastify/websocket"));
  bootLog("Registered websocket");

  bootLog("Registering multipart");
  await fastify.register(require("@fastify/multipart"), {
    limits: { fileSize: 50 * 1024 * 1024 }
  });
  bootLog("Registered multipart");

  bootLog("Registering auth decorator");
  fastify.decorate("authenticate", async (request, reply) => {
    const { measurePhase } = require("./src/core/performanceContext");
    return measurePhase("authentication", async () => {
    const auth = request.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    try {
      request.user = require("./src/security/jwt").verify(token);
    } catch {
      try {
        request.user = await require("./src/security/supabaseAuth").authenticateSupabaseToken(
          token,
          request.headers["x-company-id"]
        );
      } catch {
        return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
      }
    }

    try {
      request.user = await require("./src/security/authorizationState").validateAuthorization(request.user);
    } catch (error) {
      return reply.code(error.statusCode || 401).send({ error: error.message, code: error.code || "SESION_REVOCADA" });
    }

    try {
      const tenantId = request.user?.tenant_id;
      if (tenantId) {
        const { getTenantFromCache } = require("./src/core/tenantCache");
        const tenant = await getTenantFromCache(tenantId);
        if (!tenant || !tenant.active) {
          return reply.code(403).send({ error: "Cuenta suspendida o no encontrada", code: "EMPRESA_INACTIVA" });
        }
        request.tenant = require("./src/security/supabaseAuth").tenantWithAuthorizationContext(tenant, request.user);
      }
    } catch {
      return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
    }
    });
  });
  bootLog("Registered auth decorator");

  bootLog("Registering audit hook");
  require("./src/fabric/audit").registerAuditHook(fastify);
  bootLog("Registered audit hook");

  bootLog("Registering platform technical log hooks");
  const { recordPlatformLog, routeModule } = require("./src/fabric/platformLogs");
  fastify.addHook("onError", async (request, reply, error) => {
    request.platformErrorLogged = true;
    await recordPlatformLog({
      tenant_id: request.user?.tenant_id,
      user_id: request.user?.id,
      source: "backend",
      module: routeModule(request.routeOptions?.url || request.url),
      route: request.routeOptions?.url || request.url,
      method: request.method,
      status_code: error.statusCode || reply.statusCode || 500,
      code: error.code || "",
      message: error.message,
      stack: error.stack,
      request_id: request.id,
      ip: request.ip,
      user_agent: request.headers["user-agent"]
    });
  });
  fastify.addHook("onResponse", async (request, reply) => {
    if (request.platformErrorLogged || reply.statusCode < 400) return;
    await recordPlatformLog({
      tenant_id: request.user?.tenant_id,
      user_id: request.user?.id,
      source: "api",
      module: routeModule(request.routeOptions?.url || request.url),
      route: request.routeOptions?.url || request.url,
      method: request.method,
      status_code: reply.statusCode,
      code: reply.statusCode >= 500 ? "HTTP_ERROR" : "REQUEST_REJECTED",
      message: reply.statusCode >= 500 ? "Respuesta de error del API" : "Solicitud rechazada por validacion o permisos",
      request_id: request.id,
      ip: request.ip,
      user_agent: request.headers["user-agent"]
    });
  });
  bootLog("Registered platform technical log hooks");

  bootLog("Registering performance logging");
  const { currentPerformanceContext, runPerformanceContext, setResponseSizeBytes } = require("./src/core/performanceContext");
  fastify.addHook("onRequest", (request, _reply, done) => {
    runPerformanceContext({ startedAt: process.hrtime.bigint() }, done);
  });
  fastify.addHook("onSend", (_request, reply, payload, done) => {
    const context = currentPerformanceContext();
    const durationMs = context?.startedAt
      ? Number(process.hrtime.bigint() - context.startedAt) / 1e6
      : Number(reply.elapsedTime || 0);
    const responseSizeBytes = Buffer.isBuffer(payload)
      ? payload.length
      : typeof payload === "string"
        ? Buffer.byteLength(payload)
        : 0;
    setResponseSizeBytes(responseSizeBytes);
    const queryTotalMs = context?.queryTotalMs || 0;
    const phases = context?.phases || {};
    reply.header("x-request-id", _request.id);
    reply.header("Server-Timing", [
      `app;dur=${durationMs.toFixed(1)}`,
      `auth;dur=${Number(phases.authentication || 0).toFixed(1)}`,
      `tenant;dur=${Number(phases.tenant || 0).toFixed(1)}`,
      `authorization;dur=${Number(phases.authorization || 0).toFixed(1)}`,
      `db;dur=${queryTotalMs.toFixed(1)}`
    ].join(", "));
    done(null, payload);
  });
  fastify.addHook("onResponse", (request, reply, done) => {
    const context = currentPerformanceContext();
    const durationMs = context?.startedAt
      ? Number(process.hrtime.bigint() - context.startedAt) / 1e6
      : Number(reply.elapsedTime || 0);
    if (process.env.PERFORMANCE_LOG_ENABLED === "true" || process.env.APP_ENV === "qa") {
      const simpleBudgetMs = Number(process.env.PERFORMANCE_SIMPLE_BUDGET_MS || 300);
      const criticalMs = Number(process.env.PERFORMANCE_CRITICAL_MS || 2000);
      const severity = durationMs >= criticalMs ? "critical" : durationMs >= simpleBudgetMs ? "warning" : "ok";
      const interactionId = context?.interactionId || request.id;
      reply.header("x-interaction-id", interactionId);
      fastify.log[severity === "critical" ? "error" : severity === "warning" ? "warn" : "info"]({
        event: "api_performance",
        endpoint: request.routeOptions?.url || request.url.split("?")[0],
        method: request.method,
        status: reply.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        response_size_bytes: context?.responseSizeBytes || 0,
        query_count: context?.queryCount || 0,
        query_total_ms: Number((context?.queryTotalMs || 0).toFixed(2)),
        query_max_ms: Number((context?.queryMaxMs || 0).toFixed(2)),
        slow_query_count: context?.slowQueries?.length || 0,
        slow_queries: (context?.slowQueries || []).slice(0, 10),
        phases_ms: context?.phases || {},
        serialization_ms: Number((context?.serializationMs || 0).toFixed(2)),
        db_pool_wait_ms: Number((context?.dbPoolWaitMs || 0).toFixed(2)),
        severity,
        interaction_id: interactionId,
        user_ref: request.user?.id ? require("node:crypto").createHash("sha256").update(String(request.user.id)).digest("hex").slice(0, 16) : null,
        company_id: request.user?.tenant_id || null
      });
    }
    done();
  });
  bootLog("Registered performance logging");

  bootLog("Registering API modules");
  registerRoutes("auth", require("./src/modules/auth/routes"), { prefix: "/api/v1" });
  registerRoutes("onboarding", require("./src/modules/onboarding/routes"), { prefix: "/api/v1" });
  registerRoutes("brain", require("./src/modules/brain/routes"), { prefix: "/api/v1" });
  registerRoutes("admin", require("./src/modules/admin/routes"), { prefix: "/api/v1" });
  registerRoutes("inventory", require("./src/modules/inventory/routes"), { prefix: "/api/v1" });
  registerRoutes("accounting", require("./src/modules/accounting/routes"), { prefix: "/api/v1" });
  registerRoutes("purchases", require("./src/modules/purchases/routes"), { prefix: "/api/v1" });
  registerRoutes("projects", require("./src/modules/projects/routes"), { prefix: "/api/v1" });
  registerRoutes("sales", require("./src/modules/sales/routes"), { prefix: "/api/v1" });
  registerRoutes("invoicing", require("./src/modules/invoicing/routes"), { prefix: "/api/v1" });
  registerRoutes("hr", require("./src/modules/hr/routes"), { prefix: "/api/v1" });
  registerRoutes("services", require("./src/modules/services/routes"), { prefix: "/api/v1" });
  registerRoutes("offline", require("./src/modules/offline/routes"), { prefix: "/api/v1" });
  registerRoutes("transport", require("./src/modules/transport/routes"), { prefix: "/api/v1" });
  registerRoutes("sales-invoice", require("./src/modules/sales-invoice/routes"), { prefix: "/api/v1" });
  registerRoutes("accounts-receivable", require("./src/modules/accounts-receivable/routes"), { prefix: "/api/v1" });
  bootLog("Registered API modules");

  bootLog("Registering brain websocket route");
  fastify.get("/brain/live", { websocket: true, preHandler: fastify.authenticate }, (connection, request) => {
    const tenantId = request.user?.tenant_id;
    if (!tenantId) {
      connection.socket.close();
      return;
    }
    const wsManager = require("./src/fabric/wsManager");
    wsManager.addClient(tenantId, connection.socket);
    connection.socket.on("close", () => wsManager.removeClient(tenantId, connection.socket));
  });
  bootLog("Registered brain websocket route");

  const { isRedisDisabled } = require("./src/fabric/redisConfig");
  bootLog("Starting background workers");
  if (isRedisDisabled()) {
    bootLog("Redis disabled: background workers and crons disabled");
  } else {
    bootLog("Registering audit worker");
    require("./src/fabric/workers/auditWorker");
    bootLog("Registered audit worker");
    bootLog("Registering brain worker");
    require("./src/fabric/workers/brainWorker");
    bootLog("Registered brain worker");
    bootLog("Registering stock sync worker");
    require("./src/fabric/workers/stockSyncWorker");
    bootLog("Registered stock sync worker");
    bootLog("Registering iot worker");
    require("./src/fabric/workers/iotWorker");
    bootLog("Registered iot worker");
    bootLog("Registering email worker");
    require("./src/fabric/workers/emailWorker");
    bootLog("Registered email worker");
    bootLog("Starting cron jobs");
    require("./src/fabric/crons").start();
    bootLog("Started cron jobs");
  }
  bootLog("Finished background workers");

  bootLog("Registering health route");
  fastify.get("/health", async () => {
    const prisma = require("./src/core/prisma");
    await prisma.$queryRaw`SELECT 1`;
    const commit = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown").slice(0, 12);
    return { status: "OK", version: "2.0", modules: MODULES.length, commit };
  });

  fastify.get("/metrics", {
    preHandler: require("./src/security/metricsAuth").requireMetricsToken,
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const { metricsEndpoint } = require("./src/fabric/metrics");
    const { auditQueue, brainQueue, stockQueue, emailQueue } = require("./src/fabric/queues");
    reply.header("Content-Type", "text/plain; charset=utf-8");
    return metricsEndpoint({ audit: auditQueue, brain: brainQueue, stock: stockQueue, email: emailQueue });
  });

  // Registrar métricas de HTTP en cada respuesta
  fastify.addHook("onResponse", async (request, reply) => {
    const { recordHttpRequest } = require("./src/fabric/metrics");
    const route = request.routeOptions?.url || request.url || "unknown";
    if (route === "/metrics" || route === "/health") return;
    recordHttpRequest(request.method, route, reply.statusCode, reply.elapsedTime || 0);
  });
  bootLog("Registered health route");

  fastify.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    reply.header("x-request-id", requestId);
    const code = error.code;
    if (code === "P2002") return reply.code(409).send({ error: "Registro duplicado", code: "DUPLICADO", request_id: requestId });
    if (code === "P2025") return reply.code(404).send({ error: "No encontrado", code: "NO_ENCONTRADO", request_id: requestId });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code || "VALIDACION", request_id: requestId });
    }
    if (error.statusCode === 400) return reply.code(400).send({ error: error.message, code: "VALIDACION", request_id: requestId });
    if (error.statusCode === 429) return reply.code(429).send({ error: "Demasiadas solicitudes", code: "LIMITE_SOLICITUDES", request_id: requestId });
    fastify.log.error({ err: error, requestId, url: request.url, method: request.method, userId: request.user?.id, tenantId: request.user?.tenant_id }, "Unhandled API error");
    return reply.code(500).send({ error: "Error interno", code: "ERROR_INTERNO", request_id: requestId });
  });

  return fastify;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  bootLog("Before build()");
  bootLog("Starting HTTP listen");
  build()
    .then((app) => {
      bootLog(`About to listen on port ${port}`);
      return app.listen({ port, host: "0.0.0.0" });
    })
    .then(() => {
      bootLog("HTTP server listening");
      bootLog("API de APEX OS iniciada");
    })
    .catch((err) => {
      fastify.log.error(err);
      process.exit(1);
    });
}

module.exports = build;
