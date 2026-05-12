const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");

async function adminRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/admin/export", {
    preHandler: requirePermission("admin", "export")
  }, async (request) => service.exportTenantData(request.user?.tenant_id));
}

module.exports = adminRoutes;

