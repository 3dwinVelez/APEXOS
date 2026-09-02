const tenancy = require("../../middleware/tenancy");
const { requirePermission, requireAnyPermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function hrRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  const ownRead = requireAnyPermission([
    { module: "time_tracking", action: "read" },
    { module: "hr", action: "read" }
  ]);
  const ownWrite = requireAnyPermission([
    { module: "time_tracking", action: "write" },
    { module: "hr", action: "write" }
  ]);

  fastify.get("/hr/self", { preHandler: ownRead }, (request) => service.getCurrentEmployee(request.user?.tenant_id, request.user));
  fastify.get("/hr/self/routes", { preHandler: ownRead }, (request) => service.listOwnRoutes(request.user?.tenant_id, request.user, request.query));
  fastify.get("/hr/self/attendance", { preHandler: ownRead }, (request) => service.listOwnAttendance(request.user?.tenant_id, request.user, request.query));
  fastify.get("/hr/self/activity-types", { preHandler: ownRead }, (request) => service.listActivityTypes(request.user?.tenant_id, request.query));
  fastify.get("/hr/self/work-session", { preHandler: ownRead }, (request) => service.getOwnWorkSession(request.user?.tenant_id, request.user, request.query));
  fastify.get("/hr/self/preop/active", { preHandler: ownRead }, (request) => service.getOwnPreoperationalChecklist(request.user?.tenant_id, request.user, request.query));
  fastify.post("/hr/self/preop/:id/submit", { schema: schemas.preopSubmitSchema, preHandler: ownWrite }, (request) => service.submitOwnPreoperationalChecklist(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.post("/hr/self/gps/ping", { schema: schemas.gpsPingSchema, preHandler: ownWrite, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, (request) => service.createOwnGpsPing(request.user?.tenant_id, request.user, request.body));
  fastify.post("/hr/self/time-punches", { schema: schemas.punchSchema, preHandler: ownWrite, config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, (request) => service.createOwnPunch(request.user?.tenant_id, request.user, request.body));
  fastify.post("/hr/self/work-activities", { schema: schemas.workActivitySchema, preHandler: ownWrite }, (request) => service.createOwnWorkActivity(request.user?.tenant_id, request.user, request.body));

  fastify.get("/hr/schedules", { preHandler: requirePermission("hr", "read") }, (request) => service.listSchedules(request.user?.tenant_id, request.query));
  fastify.post("/hr/schedules", { schema: schemas.scheduleSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createSchedule(request.user?.tenant_id, request.body));
  fastify.patch("/hr/schedules/:id", { schema: schemas.scheduleSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateSchedule(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/hr/employees", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployees(request.user?.tenant_id, request.query));
  fastify.post("/hr/employees", { schema: schemas.employeeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployee(request.user?.tenant_id, request.body));

  fastify.get("/hr/routes", { preHandler: requirePermission("hr", "read") }, (request) => service.listRoutes(request.user?.tenant_id, request.query));
  fastify.get("/hr/routes/event-summaries", { preHandler: requirePermission("hr", "read") }, (request) => service.listRouteEventSummaries(request.user?.tenant_id));
  fastify.post("/hr/routes", { schema: schemas.routeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoute(request.user?.tenant_id, request.body));
  fastify.post("/hr/routes/bulk", { schema: schemas.routeBulkSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoutesBulk(request.user?.tenant_id, request.body));
  fastify.patch("/hr/routes/:id", { schema: schemas.routeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateRoute(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/hr/routes/preop/template", { preHandler: requirePermission("hr", "read") }, () => service.getPreoperationalTemplate());
  fastify.get("/hr/routes/preop/active", { preHandler: requirePermission("hr", "read") }, (request) => service.getActivePreoperationalChecklist(request.user?.tenant_id, request.user, request.query));
  fastify.get("/hr/routes/preop/metrics", { preHandler: requirePermission("hr", "read") }, (request) => service.getPreoperationalMetrics(request.user?.tenant_id, request.query));
  fastify.post("/hr/routes/preop/:id/submit", { schema: schemas.preopSubmitSchema, preHandler: requirePermission("hr", "write") }, (request) => service.submitPreoperationalChecklist(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.get("/hr/routes/:id/tracking", { preHandler: requirePermission("hr", "read") }, (request) => service.getRouteTracking(request.user?.tenant_id, request.params.id, request.query));
  fastify.get("/hr/operations-map", { preHandler: requirePermission("hr", "read") }, (request) => service.getOperationsMap(request.user?.tenant_id, request.query));
  fastify.get("/hr/monitor-evidence/:source/:id", { preHandler: requirePermission("hr", "read") }, (request) => service.getMonitorEvidence(request.user?.tenant_id, request.params.source, request.params.id));

  fastify.get("/hr/gps/active", { preHandler: requirePermission("hr", "read") }, (request) => service.listActiveGps(request.user?.tenant_id, request.query));
  fastify.get("/hr/gps/history", { preHandler: requirePermission("hr", "read") }, (request) => service.listGpsHistory(request.user?.tenant_id, request.query));
  fastify.post("/hr/gps/ping", { schema: schemas.gpsPingSchema, preHandler: requirePermission("hr", "write"), config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, (request) => service.createGpsPing(request.user?.tenant_id, request.body));

  fastify.get("/hr/activity-types", { preHandler: requirePermission("hr", "read") }, (request) => service.listActivityTypes(request.user?.tenant_id, request.query));
  fastify.post("/hr/activity-types", { schema: schemas.activityTypeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createActivityType(request.user?.tenant_id, request.body));
  fastify.patch("/hr/activity-types/:id", { schema: schemas.activityTypeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateActivityType(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/hr/work-sessions/current", { preHandler: requirePermission("hr", "read") }, (request) => service.getCurrentWorkSession(request.user?.tenant_id, request.user, request.query));
  fastify.get("/hr/work-activities", { preHandler: requirePermission("hr", "read") }, (request) => service.listWorkActivities(request.user?.tenant_id, request.query));
  fastify.post("/hr/work-activities", { schema: schemas.workActivitySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createWorkActivity(request.user?.tenant_id, request.user, request.body));

  fastify.get("/hr/attendance", { preHandler: requirePermission("hr", "read") }, (request) => service.listAttendance(request.user?.tenant_id, request.query));
  fastify.get("/hr/me", { preHandler: requirePermission("hr", "read") }, (request) => service.getCurrentEmployee(request.user?.tenant_id, request.user));
  fastify.post("/hr/time-punches", { schema: schemas.punchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createPunch(request.user?.tenant_id, request.body, request.user));
  fastify.post("/hr/workdays/process", { preHandler: requirePermission("hr", "write") }, (request) => service.processDay(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/workdays", { preHandler: requirePermission("hr", "read") }, (request) => service.listWorkdays(request.user?.tenant_id, request.query));

  fastify.get("/hr/payroll/config", { preHandler: requirePermission("payroll", "read") }, (request) => service.getPayrollConfig(request.user?.tenant_id));
  fastify.put("/hr/payroll/config", { preHandler: requirePermission("payroll", "write") }, (request) => service.savePayrollConfig(request.user?.tenant_id, request.body || {}));

  fastify.post("/hr/payroll/process", { preHandler: requirePermission("payroll", "write") }, (request) => service.processPayrollRange(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayroll(request.user?.tenant_id, request.query));
}

module.exports = hrRoutes;
