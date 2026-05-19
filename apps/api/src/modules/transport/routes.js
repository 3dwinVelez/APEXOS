const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function transportRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/transport/vehicles", { preHandler: requirePermission("transport", "read") }, (request) => service.listVehicles(request.user?.tenant_id, request.query));
  fastify.get("/transport/vehicles/metrics/dashboard", { preHandler: requirePermission("transport", "read") }, (request) => service.getVehicleDashboardMetrics(request.user?.tenant_id));
  fastify.get("/transport/vehicles/planning/:plate", { preHandler: requirePermission("transport", "read") }, (request) => service.getPlanningVehicleStatus(request.user?.tenant_id, request.params.plate));
  fastify.get("/transport/vehicles/:id", { preHandler: requirePermission("transport", "read") }, (request) => service.getVehicle(request.user?.tenant_id, request.params.id));
  fastify.post("/transport/vehicles", { schema: schemas.vehicleSchema, preHandler: requirePermission("transport", "write") }, (request) => service.createVehicle(request.user?.tenant_id, request.user, request.body));
  fastify.put("/transport/vehicles/:id", { schema: schemas.vehicleSchema, preHandler: requirePermission("transport", "write") }, (request) => service.updateVehicle(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/transport/vehicles/:id/documents", { schema: schemas.vehicleDocumentSchema, preHandler: requirePermission("transport", "write") }, (request) => service.addVehicleDocument(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/transport/vehicles/:id/documents/:documentId", { schema: schemas.vehicleDocumentUpdateSchema, preHandler: requirePermission("transport", "write") }, (request) => service.updateVehicleDocument(request.user?.tenant_id, request.user, request.params.id, request.params.documentId, request.body));
}

module.exports = transportRoutes;
