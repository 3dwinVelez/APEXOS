const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const { createOfflineService } = require("./service");
const observer = require("./observability");

const emptyQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

async function offlineRoutes(fastify) {
  const service = createOfflineService({ observer });
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get(
    "/offline/capabilities",
    {
      schema: emptyQuerySchema,
      preHandler: requirePermission("services", "read"),
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
    },
    (request) => service.capabilities(request.user.tenant_id, request.user)
  );

  fastify.get(
    "/offline/bootstrap",
    {
      schema: emptyQuerySchema,
      preHandler: requirePermission("services", "read"),
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute",
          keyGenerator: (request) => `${request.user?.tenant_id || "none"}:${request.user?.id || request.ip}`
        }
      }
    },
    (request) => service.bootstrap(request.user.tenant_id, request.user)
  );
}

module.exports = offlineRoutes;

