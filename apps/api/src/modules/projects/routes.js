const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function projectsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/projects/operational-center", { preHandler: requirePermission("projects", "read") }, (request) => service.getOperationalCenter(request.user?.tenant_id, request.query));
  fastify.get("/projects", { preHandler: requirePermission("projects", "read") }, (request) => service.listProjects(request.user?.tenant_id, request.query));
  fastify.get("/projects/:id", { preHandler: requirePermission("projects", "read") }, (request) => service.getProject(request.user?.tenant_id, request.params.id));
  fastify.post("/projects", { schema: schemas.projectSchema, preHandler: requirePermission("projects", "write") }, (request) => service.createProject(request.user?.tenant_id, request.user, request.body));

  fastify.post("/projects/:id/commitments", { schema: schemas.commitmentSchema, preHandler: requirePermission("projects", "write") }, (request) => service.createCommitment(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/projects/:id/deliverables", { schema: schemas.deliverableSchema, preHandler: requirePermission("projects", "write") }, (request) => service.createDeliverable(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/projects/:id/risks", { schema: schemas.riskSchema, preHandler: requirePermission("projects", "write") }, (request) => service.createRisk(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/projects/:id/resources", { schema: schemas.resourceSchema, preHandler: requirePermission("projects", "write") }, (request) => service.createResource(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/projects/:id/follow-ups", { schema: schemas.followUpSchema, preHandler: requirePermission("projects", "write") }, (request) => service.createFollowUp(request.user?.tenant_id, request.user, request.params.id, request.body));

  fastify.patch("/projects/commitments/:id/status", { schema: schemas.statusSchema, preHandler: requirePermission("projects", "write") }, (request) => service.updateCommitmentStatus(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/projects/deliverables/:id/status", { schema: schemas.statusSchema, preHandler: requirePermission("projects", "write") }, (request) => service.updateDeliverableStatus(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/projects/risks/:id/status", { schema: schemas.statusSchema, preHandler: requirePermission("projects", "write") }, (request) => service.updateRiskStatus(request.user?.tenant_id, request.user, request.params.id, request.body));
}

module.exports = projectsRoutes;
