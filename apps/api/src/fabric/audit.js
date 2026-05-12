const { auditQueue } = require("./queues");

function registerAuditHook(fastify) {
  fastify.addHook("onResponse", async (request, reply) => {
    const method = request.method;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
    const tenantId = request.user?.tenant_id || request.body.tenant_id;
    if (!tenantId) return;

    await auditQueue.add("audit-log", {
      tenant_id: tenantId,
      user_id: request.user.id,
      action: method,
      module: request.routeOptions.url.split("/")[3] || "unknown",
      entity: request.routeOptions.url || request.url,
      entity_id: request.params.id ? String(request.params.id) : undefined,
      new_value: request.body || null,
      ip: request.ip,
      user_agent: request.headers["user-agent"],
      status_code: reply.statusCode
    });
  });
}

module.exports = { registerAuditHook };

