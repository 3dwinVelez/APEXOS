const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");
const tmsSchemas = require("./tms-schema");
const tms = require("./tms-service");

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

  fastify.get("/transport/control-tower", { preHandler: requirePermission("transport", "read") }, (request) => tms.getControlTower(request.user?.tenant_id));

  fastify.get("/transport/carriers", { preHandler: requirePermission("transport", "read") }, (request) => tms.listCarriers(request.user?.tenant_id, request.query));
  fastify.post("/transport/carriers", { schema: tmsSchemas.carrierSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.saveCarrier(request.user?.tenant_id, null, request.body)));
  fastify.put("/transport/carriers/:id", { schema: tmsSchemas.carrierSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.saveCarrier(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/transport/drivers", { preHandler: requirePermission("transport", "read") }, (request) => tms.listDrivers(request.user?.tenant_id, request.query));
  fastify.post("/transport/drivers", { schema: tmsSchemas.driverSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.saveDriver(request.user?.tenant_id, null, request.body)));
  fastify.put("/transport/drivers/:id", { schema: tmsSchemas.driverSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.saveDriver(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/transport/delivery-points", { preHandler: requirePermission("transport", "read") }, (request) => tms.listDeliveryPoints(request.user?.tenant_id, request.query));
  fastify.post("/transport/delivery-points", { schema: tmsSchemas.deliveryPointSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.saveDeliveryPoint(request.user?.tenant_id, null, request.body)));
  fastify.put("/transport/delivery-points/:id", { schema: tmsSchemas.deliveryPointSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.saveDeliveryPoint(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/transport/origins", { preHandler: requirePermission("transport", "read") }, (request) => tms.listOrigins(request.user?.tenant_id, request.query));
  fastify.post("/transport/origins", { schema: tmsSchemas.originSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.saveOrigin(request.user?.tenant_id, null, request.body)));
  fastify.put("/transport/origins/:id", { schema: tmsSchemas.originSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.saveOrigin(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/transport/rate-cards", { preHandler: requirePermission("transport", "read") }, (request) => tms.listRateCards(request.user?.tenant_id, request.query));
  fastify.post("/transport/rate-cards", { schema: tmsSchemas.rateCardSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.saveRateCard(request.user?.tenant_id, request.user, null, request.body)));
  fastify.put("/transport/rate-cards/:id", { schema: tmsSchemas.rateCardSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.saveRateCard(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/transport/rate-cards/:id/versions", { schema: tmsSchemas.rateCardSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.versionRateCard(request.user?.tenant_id, request.user, request.params.id, request.body)));
  fastify.post("/transport/rate-cards/:id/activate", { preHandler: requirePermission("transport", "write") }, (request) => tms.activateRateCard(request.user?.tenant_id, request.params.id));
  fastify.post("/transport/rate-cards/:id/deactivate", { preHandler: requirePermission("transport", "write") }, (request) => tms.deactivateRateCard(request.user?.tenant_id, request.params.id));

  fastify.get("/transport/planning/workbench", { preHandler: requirePermission("transport", "read") }, (request) => tms.getPlanningWorkbench(request.user?.tenant_id));
  fastify.post("/transport/planning/evaluate", { schema: tmsSchemas.planningSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.evaluatePlan(request.user?.tenant_id, request.body));
  fastify.post("/transport/planning/commit", { schema: tmsSchemas.commitPlanningSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.commitPlan(request.user?.tenant_id, request.user, request.body)));

  fastify.get("/transport/needs", { preHandler: requirePermission("transport", "read") }, (request) => tms.listNeeds(request.user?.tenant_id, request.query));
  fastify.post("/transport/needs", { schema: tmsSchemas.needSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.createNeed(request.user?.tenant_id, request.user, request.body)));

  fastify.get("/transport/trips", { preHandler: requirePermission("transport", "read") }, (request) => tms.listTrips(request.user?.tenant_id, request.query));
  fastify.get("/transport/trips/:id", { preHandler: requirePermission("transport", "read") }, (request) => tms.getTrip(request.user?.tenant_id, request.params.id));
  fastify.post("/transport/trips", { schema: tmsSchemas.tripSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.createTrip(request.user?.tenant_id, request.user, request.body)));
  fastify.post("/transport/trips/:id/assign", { schema: tmsSchemas.assignmentSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.assignTrip(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/transport/trips/:id/transition", { schema: tmsSchemas.transitionSchema, preHandler: requirePermission("transport", "write") }, (request) => tms.transitionTrip(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/transport/trips/:id/events", { schema: tmsSchemas.eventSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.recordTripEvent(request.user?.tenant_id, request.user, request.params.id, request.body)));
  fastify.post("/transport/trips/:tripId/stops/:stopId/attempts", { schema: tmsSchemas.attemptSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.registerDeliveryAttempt(request.user?.tenant_id, request.user, request.params.tripId, request.params.stopId, request.body)));
  fastify.post("/transport/trips/:id/settlements", { schema: tmsSchemas.settlementSchema, preHandler: requirePermission("transport", "write") }, async (request, reply) => reply.code(201).send(await tms.createSettlement(request.user?.tenant_id, request.user, request.params.id, request.body)));
  fastify.post("/transport/settlements/:id/approve", { preHandler: requirePermission("transport", "write") }, (request) => tms.approveSettlement(request.user?.tenant_id, request.user, request.params.id));
}

module.exports = transportRoutes;
