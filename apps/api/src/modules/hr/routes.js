const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function hrRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/hr/schedules", { preHandler: requirePermission("hr", "read") }, (request) => service.listSchedules(request.user?.tenant_id, request.query));
  fastify.post("/hr/schedules", { schema: schemas.scheduleSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createSchedule(request.user?.tenant_id, request.body));
  fastify.patch("/hr/schedules/:id", { schema: schemas.scheduleSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateSchedule(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/hr/employees", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployees(request.user?.tenant_id, request.query));
  fastify.post("/hr/employees", { schema: schemas.employeeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployee(request.user?.tenant_id, request.body));

  fastify.get("/hr/routes", { preHandler: requirePermission("hr", "read") }, (request) => service.listRoutes(request.user?.tenant_id, request.query));
  fastify.post("/hr/routes", { schema: schemas.routeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoute(request.user?.tenant_id, request.body));
  fastify.get("/hr/routes/:id/tracking", { preHandler: requirePermission("hr", "read") }, (request) => service.getRouteTracking(request.user?.tenant_id, request.params.id, request.query));
  fastify.get("/hr/operations-map", { preHandler: requirePermission("hr", "read") }, (request) => service.getOperationsMap(request.user?.tenant_id, request.query));

  fastify.get("/hr/gps/active", { preHandler: requirePermission("hr", "read") }, (request) => service.listActiveGps(request.user?.tenant_id, request.query));
  fastify.get("/hr/gps/history", { preHandler: requirePermission("hr", "read") }, (request) => service.listGpsHistory(request.user?.tenant_id, request.query));
  fastify.post("/hr/gps/ping", { schema: schemas.gpsPingSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createGpsPing(request.user?.tenant_id, request.body));

  fastify.get("/hr/attendance", { preHandler: requirePermission("hr", "read") }, (request) => service.listAttendance(request.user?.tenant_id, request.query));
  fastify.get("/hr/me", { preHandler: requirePermission("hr", "read") }, (request) => service.getCurrentEmployee(request.user?.tenant_id, request.user));
  fastify.post("/hr/time-punches", { schema: schemas.punchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createPunch(request.user?.tenant_id, request.body, request.user));
  fastify.post("/hr/workdays/process", { preHandler: requirePermission("hr", "write") }, (request) => service.processDay(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/workdays", { preHandler: requirePermission("hr", "read") }, (request) => service.listWorkdays(request.user?.tenant_id, request.query));

  fastify.post("/hr/payroll/process", { preHandler: requirePermission("payroll", "write") }, (request) => service.processPayrollRange(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayroll(request.user?.tenant_id, request.query));
}

module.exports = hrRoutes;
