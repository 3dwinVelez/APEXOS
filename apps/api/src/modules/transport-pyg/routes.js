const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");
const accountConfigService = require("./account-config-service");

async function transportPygRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  const view = requirePermission("accounting", "read");
  const manage = requirePermission("accounting", "write");

  fastify.get("/transport-pyg/source-concepts", { preHandler: view }, (request) => service.listSourceConcepts(request.user?.tenant_id));

  fastify.get("/transport-pyg/concepts", { preHandler: view }, (request) => service.listConcepts(request.user?.tenant_id));
  fastify.get("/transport-pyg/report", { preHandler: view }, (request) => service.getReport(request.user?.tenant_id, request.query));
  fastify.get("/transport-pyg/budgets", { preHandler: view }, (request) => service.getBudgets(request.user?.tenant_id, request.query));
  fastify.put("/transport-pyg/budgets", { schema: schemas.budgetsUpdateSchema, preHandler: manage }, (request) => service.saveBudgets(request.user?.tenant_id, request.user, request.body || {}));
  fastify.get("/transport-pyg/mapping", { preHandler: view }, (request) => service.getMapping(request.user?.tenant_id));
  fastify.put("/transport-pyg/mapping", { schema: schemas.mappingUpdateSchema, preHandler: manage }, (request) => service.saveMapping(request.user?.tenant_id, request.user, request.body || {}));
  fastify.get("/transport-pyg/config", { preHandler: view }, (request) => service.getConfig(request.user?.tenant_id));
  fastify.put("/transport-pyg/config", { schema: schemas.configUpdateSchema, preHandler: manage }, (request) => service.saveConfig(request.user?.tenant_id, request.user, request.body || {}));
  fastify.get("/transport-pyg/account-configuration", { preHandler: view }, (request) => accountConfigService.getAccountConfiguration(request.user?.tenant_id));
  fastify.put("/transport-pyg/account-configuration", { schema: schemas.accountConfigurationUpdateSchema, preHandler: manage }, (request) => accountConfigService.saveAccountConfiguration(request.user?.tenant_id, request.user, request.body || {}));
}

module.exports = transportPygRoutes;
