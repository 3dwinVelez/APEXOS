const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");

async function apexHeartRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);
  const view = requirePermission("apex-heart", "reports");
  const manage = requirePermission("apex-heart", "configure");

  fastify.get("/apex-heart/dashboard", { preHandler: view }, (request) => service.buildDashboard(request.user?.tenant_id, request.query));
  fastify.patch("/apex-heart/config", { preHandler: manage }, (request) => service.updateConfig(request.user?.tenant_id, request.body || {}));
  fastify.post("/apex-heart/alert-rules", { preHandler: manage }, async (request, reply) => reply.code(201).send(await service.saveRule(request.user?.tenant_id, request.user?.id, request.body || {})));
  fastify.put("/apex-heart/alert-rules/:id", { preHandler: manage }, (request) => service.saveRule(request.user?.tenant_id, request.user?.id, request.body || {}, request.params.id));
  fastify.post("/apex-heart/alerts/evaluate", { preHandler: view }, (request) => service.evaluateAndPersistAlerts(request.user?.tenant_id, request.body || {}));
  fastify.post("/apex-heart/alerts/:id/acknowledge", { preHandler: view }, (request) => service.acknowledgeAlert(request.user?.tenant_id, request.user?.id, request.params.id));
  fastify.get("/apex-heart/report-schedules", { preHandler: view }, (request) => service.listReportSchedules(request.user?.tenant_id));
  fastify.post("/apex-heart/report-schedules", { preHandler: manage }, async (request, reply) => reply.code(201).send(await service.saveReportSchedule(request.user?.tenant_id, request.user?.id, request.body || {})));
  fastify.put("/apex-heart/report-schedules/:id", { preHandler: manage }, (request) => service.saveReportSchedule(request.user?.tenant_id, request.user?.id, request.body || {}, request.params.id));
  fastify.delete("/apex-heart/report-schedules/:id", { preHandler: manage }, async (request, reply) => { await service.deleteReportSchedule(request.user?.tenant_id, request.params.id); return reply.code(204).send(); });
}

module.exports = apexHeartRoutes;
