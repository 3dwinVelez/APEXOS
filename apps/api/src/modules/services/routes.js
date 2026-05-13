const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function servicesRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/services/orders", { preHandler: requirePermission("services", "read") }, (request) => service.listOrders(request.user?.tenant_id, request.query));
  fastify.get("/services/references", { preHandler: requirePermission("services", "read") }, (request) => service.listReferences(request.user?.tenant_id, request.query));
  fastify.get("/services/references/:id", { preHandler: requirePermission("services", "read") }, (request) => service.getReference(request.user?.tenant_id, request.params.id));
  fastify.post("/services/references", { schema: schemas.referenceSchema, preHandler: requirePermission("services", "write") }, (request) => service.createReference(request.user?.tenant_id, request.body));
  fastify.put("/services/references/:id", { schema: schemas.referenceSchema, preHandler: requirePermission("services", "write") }, (request) => service.updateReference(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/services/orders/:id", { preHandler: requirePermission("services", "read") }, (request) => service.getOrder(request.user?.tenant_id, request.params.id));
  fastify.post("/services/orders", { schema: schemas.orderSchema, preHandler: requirePermission("services", "write") }, (request) => service.createOrder(request.user?.tenant_id, request.user, request.body));
  fastify.patch("/services/orders/:id/start", { schema: schemas.startSchema, preHandler: requirePermission("services", "write") }, (request) => service.startOrder(request.user?.tenant_id, request.params.id, request.body));
  fastify.patch("/services/orders/:id/inspection", { schema: schemas.inspectionSchema, preHandler: requirePermission("services", "write") }, (request) => service.moveToInspection(request.user?.tenant_id, request.params.id, request.body));
  fastify.patch("/services/orders/:id/execution", { preHandler: requirePermission("services", "write") }, (request) => service.moveToExecution(request.user?.tenant_id, request.params.id));
  fastify.patch("/services/orders/:id/close", { schema: schemas.closeSchema, preHandler: requirePermission("services", "write") }, (request) => service.closeOrder(request.user?.tenant_id, request.params.id, request.body));
  fastify.patch("/services/orders/:id/close-not-executed", { schema: schemas.closeSchema, preHandler: requirePermission("services", "write") }, (request) => service.closeNotExecuted(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/services/orders/:id/incidents", { schema: schemas.incidentSchema, preHandler: requirePermission("services", "write") }, (request) => service.addIncident(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/services/orders/:id/photos", { preHandler: requirePermission("services", "read") }, (request) => service.listPhotos(request.user?.tenant_id, request.params.id));
  fastify.post("/services/orders/:id/photos", { schema: schemas.photoSchema, preHandler: requirePermission("services", "write") }, (request) => service.addPhoto(request.user?.tenant_id, request.params.id, request.body));
}

module.exports = servicesRoutes;
