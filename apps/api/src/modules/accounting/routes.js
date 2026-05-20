const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function accountingRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.post("/accounting/chart/init", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.initChartOfAccounts(request.user?.tenant_id, request.body.country || "CO"));

  fastify.get("/accounting/accounts", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listAccounts(request.user?.tenant_id, request.query));

  fastify.post("/accounting/accounts", {
    schema: schema.accountSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.createAccount(request.user?.tenant_id, request.body)));

  fastify.put("/accounting/accounts/:id", {
    schema: schema.accountSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.updateAccount(request.user?.tenant_id, request.params.id, request.body));

  fastify.delete("/accounting/accounts/:id", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.deleteAccount(request.user?.tenant_id, request.params.id));

  fastify.post("/accounting/journal", {
    schema: schema.journalEntrySchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.journalEntry(request.user?.tenant_id, request.body)));

  fastify.get("/accounting/ledger/:account_code", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getLedgerByAccount(request.user?.tenant_id, request.params.account_code, request.query));

  fastify.get("/accounting/balance-sheet", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getBalanceSheet(request.user?.tenant_id, request.query.period || null));

  fastify.get("/accounting/reports/balance-sheet", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getBalanceSheet(request.user?.tenant_id, request.query.period || null));

  fastify.get("/accounting/income-statement", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getIncomeStatement(request.user?.tenant_id, request.query.period));

  fastify.get("/accounting/reports/income-statement", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getIncomeStatement(request.user?.tenant_id, request.query.period));

  fastify.get("/accounting/reports/trial-balance", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getTrialBalance(request.user?.tenant_id, request.query.period || null));

  fastify.get("/accounting/reports/taxes", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getTaxReport(request.user?.tenant_id, request.query.period));

  fastify.get("/accounting/reports/receivables", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAgingReport(request.user?.tenant_id, "receivables"));

  fastify.get("/accounting/reports/payables", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAgingReport(request.user?.tenant_id, "payables"));

  fastify.get("/accounting/periods", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listPeriods(request.user?.tenant_id));

  fastify.patch("/accounting/periods/:period", {
    schema: schema.periodSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.updatePeriod(request.user?.tenant_id, request.user?.id, request.params.period, request.body));

  fastify.get("/accounting/third-parties", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listThirdParties(request.user?.tenant_id, request.query));

  fastify.post("/accounting/third-parties", {
    schema: schema.thirdPartySchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveThirdParty(request.user?.tenant_id, request.body)));

  fastify.put("/accounting/third-parties/:id", {
    schema: schema.thirdPartySchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.saveThirdParty(request.user?.tenant_id, request.body, request.params.id));

  fastify.post("/accounting/payments", {
    schema: schema.paymentSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.registerPayment(request.user?.tenant_id, request.user.id, request.body)));
}

module.exports = accountingRoutes;
