const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function brainRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/brain/events", {
    preHandler: requirePermission("brain", "read")
  }, async (request) => service.listEvents(request.user?.tenant_id, request.query));

  fastify.get("/brain/ecosystem", {
    preHandler: requirePermission("brain", "read")
  }, async (request) => service.getEcosystem(request.user?.tenant_id, request.user));

  fastify.get("/brain/insights", {
    schema: schemas.insightQuerySchema,
    preHandler: requirePermission("brain", "read")
  }, async (request) => service.listInsights(request.user?.tenant_id, request.user, request.query));

  fastify.get("/brain/mentor", {
    schema: schemas.mentorQuerySchema,
    preHandler: requirePermission("brain", "read")
  }, async (request) => service.getMentor(request.user?.tenant_id, request.user, request.query));

  fastify.post("/brain/recommendations/run", {
    schema: schemas.insightQuerySchema,
    preHandler: requirePermission("brain", "write")
  }, async (request) => service.runRecommendations(request.user?.tenant_id, request.user, request.query));

  fastify.post("/brain/actions/preview", {
    schema: schemas.actionPreviewSchema,
    preHandler: requirePermission("brain", "read")
  }, async (request) => service.previewAction(request.user?.tenant_id, request.user, request.body));

  fastify.post("/brain/feedback", {
    schema: schemas.feedbackSchema,
    preHandler: requirePermission("brain", "write")
  }, async (request) => service.feedback(request.user?.tenant_id, request.body));
}

module.exports = brainRoutes;

