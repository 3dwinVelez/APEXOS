const schemas = require("./schema");
const service = require("./service");

async function authRoutes(fastify) {
  fastify.post("/auth/register", { schema: schemas.registerSchema }, async (request, reply) => {
    const result = await service.registerTenant(request.body, fastify);
    return reply.code(201).send(result);
  });

  fastify.post("/auth/login", {
    schema: schemas.loginSchema,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request) => {
    return service.login(request.body, fastify, request);
  });

  fastify.get("/auth/me", { preHandler: fastify.authenticate }, async (request) => {
    return service.me(request.user);
  });

  fastify.post("/auth/refresh", { schema: schemas.refreshSchema }, async (request) => {
    return service.refresh(request.body, fastify);
  });
}

module.exports = authRoutes;
