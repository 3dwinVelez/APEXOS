const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");

async function adminRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/admin/export", {
    preHandler: requirePermission("admin", "export")
  }, async (request) => service.exportTenantData(request.user?.tenant_id));

  fastify.get("/admin/permissions/catalog", {
    preHandler: requirePermission("admin", "read")
  }, async (request) => service.getPermissionCatalog(request.user?.tenant_id));

  fastify.get("/admin/roles", {
    preHandler: requirePermission("admin", "read")
  }, async (request) => service.listRoles(request.user?.tenant_id, request.query));

  fastify.post("/admin/roles", {
    preHandler: requirePermission("admin", "write")
  }, async (request, reply) => reply.code(201).send(await service.createRole(request.user?.tenant_id, request.body, request.user?.id)));

  fastify.put("/admin/roles/:id", {
    preHandler: requirePermission("admin", "write")
  }, async (request) => service.updateRole(request.user?.tenant_id, request.params.id, request.body, request.user?.id));

  fastify.patch("/admin/roles/:id/status", {
    preHandler: requirePermission("admin", "write")
  }, async (request) => service.setRoleActive(request.user?.tenant_id, request.params.id, request.body?.active ?? request.query?.active, request.user?.id));

  fastify.get("/admin/users", {
    preHandler: requirePermission("admin", "read")
  }, async (request) => service.listUsers(request.user?.tenant_id, request.query));

  fastify.get("/admin/user-master-data", {
    preHandler: requirePermission("admin", "read")
  }, async (request) => service.getUserMasterData(request.user?.tenant_id));

  fastify.post("/admin/user-master-data/:catalog/items", {
    preHandler: requirePermission("admin", "write")
  }, async (request, reply) => reply.code(201).send(await service.addUserMasterDataItem(request.user?.tenant_id, request.params.catalog, request.body || {}, request.user?.id)));

  fastify.post("/admin/users", {
    preHandler: requirePermission("admin", "write")
  }, async (request, reply) => reply.code(201).send(await service.createUser(request.user?.tenant_id, request.body, request.user?.id)));

  fastify.put("/admin/users/:id", {
    preHandler: requirePermission("admin", "write")
  }, async (request) => service.updateUser(request.user?.tenant_id, request.params.id, request.body, request.user?.id));

  fastify.patch("/admin/users/:id/status", {
    preHandler: requirePermission("admin", "write")
  }, async (request) => service.setUserActive(request.user?.tenant_id, request.params.id, request.body?.active ?? request.query?.active, request.user?.id));

  fastify.patch("/admin/users/:id/access", {
    preHandler: requirePermission("admin", "write")
  }, async (request) => service.updateUserAccess(request.user?.tenant_id, request.params.id, request.body || {}, request.user?.id));

  fastify.post("/admin/users/:id/documents", {
    preHandler: requirePermission("admin", "write")
  }, async (request, reply) => reply.code(201).send(await service.addUserDocument(request.user?.tenant_id, request.params.id, request.body || {}, request.user?.id)));

  fastify.delete("/admin/users/:id/documents/:documentId", {
    preHandler: requirePermission("admin", "write")
  }, async (request) => service.removeUserDocument(request.user?.tenant_id, request.params.id, request.params.documentId, request.user?.id));
}

module.exports = adminRoutes;

