const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function accountingRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.post("/accounting/chart/init", {
    preHandler: requirePermission("finance", "write")
  }, async (request) => service.initChartOfAccounts(request.user.tenant_id, request.body?.country || "CO"));

  fastify.post("/accounting/journal", {
    schema: schema.journalEntrySchema,
    preHandler: requirePermission("finance", "write")
  }, async (request, reply) => reply.code(201).send(await service.journalEntry(request.user.tenant_id, request.body)));

  fastify.get("/accounting/balance-sheet", {
    preHandler: requirePermission("finance", "read")
  }, async (request) => service.getBalanceSheet(request.user.tenant_id, request.query?.period || null));

  fastify.get("/accounting/reports/balance-sheet", {
    preHandler: requirePermission("finance", "read")
  }, async (request) => service.getBalanceSheet(request.user.tenant_id, request.query?.period || null));

  fastify.get("/accounting/income-statement", {
    preHandler: requirePermission("finance", "read")
  }, async (request) => service.getIncomeStatement(request.user.tenant_id, request.query?.period));

  fastify.get("/accounting/reports/income-statement", {
    preHandler: requirePermission("finance", "read")
  }, async (request) => service.getIncomeStatement(request.user.tenant_id, request.query?.period));

  fastify.post("/accounting/payments", {
    schema: schema.paymentSchema,
    preHandler: requirePermission("finance", "write")
  }, async (request, reply) => reply.code(201).send(await service.registerPayment(request.user.tenant_id, request.user.id, request.body)));
}

module.exports = accountingRoutes;
