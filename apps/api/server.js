require("./src/core/loadEnv")();

const fastify = require("fastify")({
  bodyLimit: Number(process.env.API_BODY_LIMIT_BYTES || 25 * 1024 * 1024),
  logger: {
    level: process.env.NODE_ENV === "production" ? "warn" : "info",
    transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined
  },
  trustProxy: true
});

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
  "transport"
];
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3001", "http://127.0.0.1:3001"];

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
  }
}

function registerRoutes(name, routes, options) {
  fastify.log.info(`Registering ${name} routes`);
  fastify.register(routes, options);
  fastify.log.info(`Registered ${name} routes`);
}

async function build() {
  fastify.log.info("Starting APEX OS API bootstrap");
  requireEnv(["DATABASE_URL", "JWT_SECRET"]);
  const configuredOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? configuredOrigins
    : Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]));

  fastify.log.info("Registering cors");
  await fastify.register(require("@fastify/cors"), {
    origin: allowedOrigins.length ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  });
  fastify.log.info("Registered cors");

  fastify.log.info("Registering rate-limit");
  await fastify.register(require("@fastify/rate-limit"), {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.user?.tenant_id || req.ip
  });
  fastify.log.info("Registered rate-limit");

  fastify.log.info("Registering security headers");
  require("./src/security/headers").registerSecurityHeaders(fastify);
  fastify.log.info("Registered security headers");

  fastify.log.info("Registering websocket");
  await fastify.register(require("@fastify/websocket"));
  fastify.log.info("Registered websocket");

  fastify.log.info("Registering multipart");
  await fastify.register(require("@fastify/multipart"), {
    limits: { fileSize: 50 * 1024 * 1024 }
  });
  fastify.log.info("Registered multipart");

  fastify.log.info("Registering auth decorator");
  fastify.decorate("authenticate", async (request, reply) => {
    try {
      const auth = request.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      request.user = require("./src/security/jwt").verify(token);
      const tenantId = request.user?.tenant_id;
      if (tenantId) {
        const { getTenantFromCache } = require("./src/core/tenantCache");
        const tenant = await getTenantFromCache(tenantId);
        if (!tenant || !tenant.active) {
          return reply.code(403).send({ error: "Cuenta suspendida o no encontrada", code: "EMPRESA_INACTIVA" });
        }
        request.tenant = tenant;
      }
    } catch {
      return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
    }
  });
  fastify.log.info("Registered auth decorator");

  fastify.log.info("Registering audit hook");
  require("./src/fabric/audit").registerAuditHook(fastify);
  fastify.log.info("Registered audit hook");

  fastify.log.info("Registering API modules");
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
  registerRoutes("transport", require("./src/modules/transport/routes"), { prefix: "/api/v1" });
  fastify.log.info("Registered API modules");

  fastify.log.info("Registering brain websocket route");
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
  fastify.log.info("Registered brain websocket route");

  const { isRedisDisabled } = require("./src/fabric/redisConfig");
  fastify.log.info("Starting background workers");
  if (isRedisDisabled()) {
    fastify.log.info("QA mode: background workers and crons disabled");
  } else {
    fastify.log.info("Registering audit worker");
    require("./src/fabric/workers/auditWorker");
    fastify.log.info("Registered audit worker");
    fastify.log.info("Registering brain worker");
    require("./src/fabric/workers/brainWorker");
    fastify.log.info("Registered brain worker");
    fastify.log.info("Registering stock sync worker");
    require("./src/fabric/workers/stockSyncWorker");
    fastify.log.info("Registered stock sync worker");
    fastify.log.info("Registering iot worker");
    require("./src/fabric/workers/iotWorker");
    fastify.log.info("Registered iot worker");
    fastify.log.info("Registering email worker");
    require("./src/fabric/workers/emailWorker");
    fastify.log.info("Registered email worker");
    fastify.log.info("Starting cron jobs");
    require("./src/fabric/crons").start();
    fastify.log.info("Started cron jobs");
  }
  fastify.log.info("Finished background workers");

  fastify.log.info("Registering health route");
  fastify.get("/health", async () => {
    const prisma = require("./src/core/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return { status: "OK", version: "2.0", modules: MODULES.length };
  });
  fastify.log.info("Registered health route");

  fastify.setErrorHandler((error, request, reply) => {
    const code = error.code;
    if (code === "P2002") return reply.code(409).send({ error: "Registro duplicado", code: "DUPLICADO" });
    if (code === "P2025") return reply.code(404).send({ error: "No encontrado", code: "NO_ENCONTRADO" });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code || "VALIDACION" });
    }
    if (error.statusCode === 400) return reply.code(400).send({ error: error.message, code: "VALIDACION" });
    if (error.statusCode === 429) return reply.code(429).send({ error: "Demasiadas solicitudes", code: "LIMITE_SOLICITUDES" });
    fastify.log.error(error);
    return reply.code(500).send({ error: "Error interno", code: "ERROR_INTERNO" });
  });

  return fastify;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  fastify.log.info("Starting HTTP listen");
  build()
    .then((app) => {
      fastify.log.info(`About to listen on port ${port}`);
      return app.listen({ port, host: "0.0.0.0" });
    })
    .then(() => {
      fastify.log.info("HTTP server listening");
      fastify.log.info("API de APEX OS iniciada");
    })
    .catch((err) => {
      fastify.log.error(err);
      process.exit(1);
    });
}

module.exports = build;
