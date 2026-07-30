const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function servicesRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/services/orders", { preHandler: requirePermission("services", "read") }, (request) => service.listOrders(request.user?.tenant_id, request.user, request.query));
  fastify.get("/services/technicians", { preHandler: requirePermission("services", "read") }, (request) => service.listTechnicians(request.user?.tenant_id, request.user));
  fastify.get("/services/service-types", { preHandler: requirePermission("services", "read") }, (request) => service.listServiceTypes(request.user?.tenant_id));
  fastify.put("/services/service-types", { schema: schemas.serviceTypesSchema, preHandler: requirePermission("services", "write") }, (request) => service.saveServiceTypes(request.user?.tenant_id, request.user, request.body));
  fastify.get("/services/service-stores", { preHandler: requirePermission("services", "read") }, (request) => service.listServiceStores(request.user?.tenant_id));
  fastify.put("/services/service-stores", { schema: schemas.serviceStoresSchema, preHandler: requirePermission("services", "write") }, (request) => service.saveServiceStores(request.user?.tenant_id, request.user, request.body));
  fastify.get("/services/satisfaction-questions", { preHandler: requirePermission("services", "read") }, (request) => service.listSatisfactionQuestions(request.user?.tenant_id));
  fastify.put("/services/satisfaction-questions", { schema: schemas.satisfactionQuestionsSchema, preHandler: requirePermission("services", "write") }, (request) => service.saveSatisfactionQuestions(request.user?.tenant_id, request.user, request.body));
  fastify.get("/services/references", { preHandler: requirePermission("services", "read") }, (request) => service.listReferences(request.user?.tenant_id, request.query));
  fastify.get("/services/references/:id", { preHandler: requirePermission("services", "read") }, (request) => service.getReference(request.user?.tenant_id, request.params.id));
  fastify.post("/services/references", { schema: schemas.referenceSchema, preHandler: requirePermission("services", "write") }, (request) => service.createReference(request.user?.tenant_id, request.user, request.body));
  fastify.post("/services/references/import", { schema: schemas.referenceBulkImportSchema, preHandler: requirePermission("services", "write") }, (request) => service.bulkImportReferences(request.user?.tenant_id, request.user, request.body));
  fastify.put("/services/references/:id", { schema: schemas.referenceSchema, preHandler: requirePermission("services", "write") }, (request) => service.updateReference(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.get("/services/orders/:id", { preHandler: requirePermission("services", "read") }, (request) => service.getOrder(request.user?.tenant_id, request.user, request.params.id));
  fastify.get("/services/orders/:id/report", { preHandler: requirePermission("services", "read") }, (request) => service.getOrderReport(request.user?.tenant_id, request.user, request.params.id));
  fastify.get("/services/orders/:id/report-pdf", { preHandler: requirePermission("services", "read") }, async (request, reply) => {
    const pdf = await service.getOrderReportPdf(request.user?.tenant_id, request.user, request.params.id);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${pdf.fileName}"`)
      .send(pdf.buffer);
  });
  fastify.post("/services/orders", { schema: schemas.orderSchema, preHandler: requirePermission("services", "write") }, (request) => service.createOrder(request.user?.tenant_id, request.user, request.body));
  fastify.put("/services/orders/:id", { schema: schemas.orderUpdateSchema, preHandler: requirePermission("services", "write") }, (request) => service.updateOrder(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/services/orders/:id/start", { schema: schemas.startSchema, preHandler: requirePermission("services", "write") }, (request) => service.startOrder(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/services/orders/:id/inspection", { schema: schemas.inspectionSchema, preHandler: requirePermission("services", "write") }, (request) => service.moveToInspection(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/services/orders/:id/execution", { preHandler: requirePermission("services", "write") }, (request) => service.moveToExecution(request.user?.tenant_id, request.user, request.params.id));
  fastify.patch("/services/orders/:id/close", { schema: schemas.closeSchema, preHandler: requirePermission("services", "write") }, (request) => service.closeOrder(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.patch("/services/orders/:id/close-not-executed", { schema: schemas.closeSchema, preHandler: requirePermission("services", "write") }, (request) => service.closeNotExecuted(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/services/orders/:id/incidents", { schema: schemas.incidentSchema, preHandler: requirePermission("services", "write") }, (request) => service.addIncident(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.get("/services/orders/:id/photos", { preHandler: requirePermission("services", "read") }, (request) => service.listPhotos(request.user?.tenant_id, request.user, request.params.id));
  fastify.post("/services/orders/:id/photos", { schema: schemas.photoSchema, preHandler: requirePermission("services", "write") }, (request) => service.addPhoto(request.user?.tenant_id, request.user, request.params.id, request.body));
}

module.exports = servicesRoutes;
