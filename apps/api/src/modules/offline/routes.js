const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const { createOfflineService } = require("./service");
const observer = require("./observability");
const { createOfflineSyncService } = require("./syncService");
const { pushSchema } = require("./syncContract");

const emptyQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

async function offlineRoutes(fastify) {
  const service = createOfflineService({ observer });
  const syncService = createOfflineSyncService();
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

  fastify.post(
    "/offline/sync/push",
    {
      schema: pushSchema,
      preHandler: requirePermission("services", "read"),
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute",
          keyGenerator: (request) => `${request.user?.tenant_id || "none"}:${request.user?.id || request.ip}`
        }
      }
    },
    (request) => syncService.push(request.user.tenant_id, request.user, request.body)
  );
}

module.exports = offlineRoutes;

