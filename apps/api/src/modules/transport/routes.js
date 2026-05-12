const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function transportRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/transport/vehicles", { preHandler: requirePermission("transport", "read") }, (request) => service.listVehicles(request.user?.tenant_id, request.query));
  fastify.get("/transport/vehicles/:id", { preHandler: requirePermission("transport", "read") }, (request) => service.getVehicle(request.user?.tenant_id, request.params.id));
  fastify.post("/transport/vehicles", { schema: schemas.vehicleSchema, preHandler: requirePermission("transport", "write") }, (request) => service.createVehicle(request.user?.tenant_id, request.body));
  fastify.put("/transport/vehicles/:id", { schema: schemas.vehicleSchema, preHandler: requirePermission("transport", "write") }, (request) => service.updateVehicle(request.user?.tenant_id, request.params.id, request.body));
}

module.exports = transportRoutes;
