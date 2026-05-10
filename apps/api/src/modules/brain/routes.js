const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function brainRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/brain/events", {
    preHandler: requirePermission("brain", "read")
  }, async (request) => service.listEvents(request.user.tenant_id, request.query));

  fastify.post("/brain/feedback", {
    schema: schemas.feedbackSchema,
    preHandler: requirePermission("brain", "write")
  }, async (request) => service.feedback(request.user.tenant_id, request.body));
}

module.exports = brainRoutes;

