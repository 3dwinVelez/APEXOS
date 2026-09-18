const tenancy = require("../../middleware/tenancy");
const { requirePermission, requireAdminCapability, requireAnyAdminCapability } = require("../../middleware/rbac");
const service = require("./service");

async function adminRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/admin/export", {
    preHandler: requirePermission("admin", "export")
  }, async (request) => service.exportTenantData(request.user?.tenant_id));

  fastify.get("/admin/platform-logs", {
    preHandler: requirePermission("admin", "read")
  }, async (request) => service.listPlatformLogs(request.user?.tenant_id, request.query || {}));

  fastify.post("/admin/platform-logs/client", {
    preHandler: requirePermission("admin", "read")
  }, async (request) => service.createClientPlatformLog(request.user?.tenant_id, request.user, request.body || {}, {
    ip: request.ip,
    user_agent: request.headers["user-agent"]
  }));

  fastify.get("/admin/permissions/catalog", {
    preHandler: requireAnyAdminCapability([
      { resource: "users", action: "read" },
      { resource: "roles", action: "read" }
    ])
  }, async (request) => service.getPermissionCatalog(request.user?.tenant_id));

  fastify.get("/admin/roles", {
    preHandler: requireAdminCapability("roles", "read")
  }, async (request) => service.listRoles(request.user?.tenant_id, request.query, request.user?.role?.name));

  fastify.post("/admin/roles", {
    preHandler: requireAdminCapability("roles", "create")
  }, async (request, reply) => reply.code(201).send(await service.createRole(request.user?.tenant_id, request.body, request.user?.id)));

  fastify.put("/admin/roles/:id", {
    preHandler: requireAdminCapability("roles", "edit")
  }, async (request) => service.updateRole(request.user?.tenant_id, request.params.id, request.body, request.user?.id, request.user?.role?.name));

  fastify.patch("/admin/roles/:id/status", {
    preHandler: requireAdminCapability("roles", "edit")
  }, async (request) => service.setRoleActive(request.user?.tenant_id, request.params.id, request.body?.active ?? request.query?.active, request.user?.id));

  fastify.delete("/admin/roles/:id", {
    preHandler: requireAdminCapability("roles", "delete")
  }, async (request) => service.deleteRole(request.user?.tenant_id, request.params.id, request.user?.id));

  fastify.get("/admin/users", {
    preHandler: requireAdminCapability("users", "read")
  }, async (request) => service.listUsers(request.user?.tenant_id, request.query));

  fastify.get("/admin/user-master-data", {
    preHandler: requireAdminCapability("master_data", "read")
  }, async (request) => service.getUserMasterData(request.user?.tenant_id));

  fastify.post("/admin/user-master-data/:catalog/items", {
    preHandler: requireAdminCapability("master_data", "edit")
  }, async (request, reply) => reply.code(201).send(await service.addUserMasterDataItem(request.user?.tenant_id, request.params.catalog, request.body || {}, request.user?.id)));

  fastify.put("/admin/user-master-data/:catalog/items/:code", {
    preHandler: requireAdminCapability("master_data", "edit")
  }, async (request) => service.updateUserMasterDataItem(request.user?.tenant_id, request.params.catalog, request.params.code, request.body || {}, request.user?.id));

  fastify.delete("/admin/user-master-data/:catalog/items/:code", {
    preHandler: requireAdminCapability("master_data", "edit")
  }, async (request) => service.deleteUserMasterDataItem(request.user?.tenant_id, request.params.catalog, request.params.code, request.user?.id));

  fastify.post("/admin/users", {
    preHandler: requireAdminCapability("users", "create")
  }, async (request, reply) => reply.code(201).send(await service.createUser(request.user?.tenant_id, request.body, request.user?.id)));

  fastify.put("/admin/users/:id", {
    preHandler: requireAdminCapability("users", "edit")
  }, async (request) => service.updateUser(request.user?.tenant_id, request.params.id, request.body, request.user?.id));

  fastify.patch("/admin/users/:id/status", {
    preHandler: requireAdminCapability("users", "edit")
  }, async (request) => service.setUserActive(request.user?.tenant_id, request.params.id, request.body?.active ?? request.query?.active, request.user?.id));

  fastify.patch("/admin/users/:id/access", {
    preHandler: requireAdminCapability("users", "edit")
  }, async (request) => service.updateUserAccess(request.user?.tenant_id, request.params.id, request.body || {}, request.user?.id));

  fastify.post("/admin/users/:id/documents", {
    preHandler: requireAdminCapability("users", "attach")
  }, async (request, reply) => reply.code(201).send(await service.addUserDocument(request.user?.tenant_id, request.params.id, request.body || {}, request.user?.id)));

  fastify.delete("/admin/users/:id/documents/:documentId", {
    preHandler: requireAdminCapability("users", "delete_physical_records")
  }, async (request) => service.removeUserDocument(request.user?.tenant_id, request.params.id, request.params.documentId, request.user?.id));
}

module.exports = adminRoutes;

