require("./src/core/loadEnv")();

const fastify = require("fastify")({
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
  "sales",
  "invoicing"
];

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
  }
}

async function build() {
  requireEnv(["DATABASE_URL", "JWT_SECRET"]);

  await fastify.register(require("@fastify/jwt"), {
    secret: process.env.JWT_SECRET,
    sign: { algorithm: "HS256" }
  });

  await fastify.register(require("@fastify/cors"), {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3001"],
    credentials: true
  });

  await fastify.register(require("@fastify/rate-limit"), {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.user?.tenant_id || req.ip
  });

  await fastify.register(require("@fastify/websocket"));
  await fastify.register(require("@fastify/multipart"), {
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  fastify.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Token inválido", code: "TOKEN_INVALIDO" });
    }
  });

  require("./src/fabric/audit").registerAuditHook(fastify);

  fastify.register(require("./src/modules/auth/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/onboarding/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/brain/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/admin/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/inventory/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/accounting/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/purchases/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/sales/routes"), { prefix: "/api/v1" });
  fastify.register(require("./src/modules/invoicing/routes"), { prefix: "/api/v1" });

  fastify.get("/brain/live", { websocket: true }, (connection, request) => {
    const tenantId = request.user?.tenant_id;
    if (!tenantId) {
      connection.socket.close();
      return;
    }
    const wsManager = require("./src/fabric/wsManager");
    wsManager.addClient(tenantId, connection.socket);
    connection.socket.on("close", () => wsManager.removeClient(tenantId, connection.socket));
  });

  require("./src/fabric/workers/auditWorker");
  require("./src/fabric/workers/brainWorker");
  require("./src/fabric/workers/stockSyncWorker");
  require("./src/fabric/workers/iotWorker");
  require("./src/fabric/workers/emailWorker");
  require("./src/fabric/crons").start();

  fastify.get("/health", async () => {
    const prisma = require("./src/core/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return { status: "OK", version: "2.0", modules: MODULES.length };
  });

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
  build()
    .then((app) => app.listen({ port: Number(process.env.PORT || 3000), host: "0.0.0.0" }))
    .then(() => fastify.log.info("API de APEX OS iniciada"))
    .catch((err) => {
      fastify.log.error(err);
      process.exit(1);
    });
}

module.exports = build;
