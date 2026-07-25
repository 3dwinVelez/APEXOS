const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function accountsReceivableRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  // Documents
  fastify.get("/accounts-receivable/documents", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listDocuments(request.user?.tenant_id, request.query));

  fastify.get("/accounts-receivable/documents/:id", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getDocument(request.user?.tenant_id, Number(request.params.id)));

  // Customer statement & balance
  fastify.get("/accounts-receivable/customers/:id/statement", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getCustomerStatement(request.user?.tenant_id, Number(request.params.id)));

  fastify.get("/accounts-receivable/customers/:id/balance", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getCustomerBalance(request.user?.tenant_id, Number(request.params.id)));

  // Payments
  fastify.post("/accounts-receivable/payments", {
    schema: schema.paymentSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.registerPayment(
    request.user?.tenant_id,
    request.user.id,
    request.body
  )));

  // Reports
  fastify.get("/accounts-receivable/reports/aging", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAgingReport(request.user?.tenant_id, request.query));

  // Retention Masters
  fastify.get("/accounts-receivable/retentions", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listRetentions(request.user?.tenant_id));

  fastify.post("/accounts-receivable/retentions/init", {
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.initializeRetentions(request.user?.tenant_id)));

  fastify.post("/accounts-receivable/retentions", {
    schema: schema.retentionSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.createRetention(request.user?.tenant_id, request.body)));

  fastify.put("/accounts-receivable/retentions/:id", {
    schema: schema.retentionSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.updateRetention(request.user?.tenant_id, Number(request.params.id), request.body));
}

module.exports = accountsReceivableRoutes;
