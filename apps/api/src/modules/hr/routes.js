const tenancy = require("../../middleware/tenancy");
const { requirePermission, requireAnyPermission, requirePhysicalDeleteGrant, hasPhysicalDeleteGrant, tenantHasModule } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

function requestContext(request) {
  return {
    session_id: request.user?.sid || null,
    ip: request.ip,
    user_agent: request.headers["user-agent"] || null,
    request_id: request.id
  };
}

// La vista previa informa si el rol puede ejecutar el borrado fisico, pero el DELETE
// vuelve a validar el permiso especial: la pista es de interfaz, nunca la autorizacion.
async function routeDeletionImpactForRequest(request) {
  const impact = await service.routeDeletionImpact(request.user?.tenant_id, request.params.id);
  return { ...impact, permissions: { can_physical_delete: hasPhysicalDeleteGrant(request.user?.role, "hr") } };
}

// Resolver primero el recurso dentro del tenant evita revelar su existencia a
// otro tenant mediante una diferencia 403/404 en el guard de borrado fisico.
async function requireOwnedRouteForDeletion(request) {
  await service.routeDeletionImpact(request.user?.tenant_id, request.params.id);
}

async function requireHrModuleEnabled(request, reply) {
  if (!tenantHasModule(request.tenant, "hr")) {
    return reply.code(403).send({
      error: "Modulo no habilitado para esta empresa",
      code: "MODULO_NO_HABILITADO",
      details: { module: "hr" },
    });
  }
}

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
  fastify.patch("/hr/employees/:id", { schema: schemas.employeePatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateEmployee(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/hr/employees/:id/salaries", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployeeSalaryHistory(request.user?.tenant_id, request.params.id, request.query));
  fastify.post("/hr/employees/:id/salaries", { schema: schemas.employeeSalarySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployeeSalaryHistory(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.get("/hr/employees/:id/affiliations", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployeeAffiliations(request.user?.tenant_id, request.params.id, request.query));
  fastify.post("/hr/employees/:id/affiliations", { schema: schemas.employeeAffiliationSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployeeAffiliation(request.user?.tenant_id, request.params.id, request.body));
  fastify.patch("/hr/affiliations/:id", { schema: schemas.employeeAffiliationPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateEmployeeAffiliation(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/hr/labor-entities", { preHandler: requirePermission("hr", "read") }, (request) => service.listLaborEntities(request.user?.tenant_id, request.query));
  fastify.get("/hr/labor-entities/party-candidates", { preHandler: requirePermission("hr", "read") }, (request) => service.listLaborEntityPartyCandidates(request.user?.tenant_id, request.query));
  fastify.post("/hr/labor-entities", { schema: schemas.laborEntitySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createLaborEntity(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/hr/labor-entities/:id", { schema: schemas.laborEntityPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateLaborEntity(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.post("/hr/labor-entities/:id/link-accounting-party", { schema: schemas.laborEntityLinkSchema, preHandler: requirePermission("hr", "write") }, (request) => service.linkLaborEntityAccountingParty(request.user?.tenant_id, request.params.id, request.body, request.user));

  fastify.get("/hr/routes", { preHandler: requirePermission("hr", "read") }, (request) => service.listRoutes(request.user?.tenant_id, request.query));
  fastify.get("/hr/routes/event-summaries", { preHandler: requirePermission("hr", "read") }, (request) => service.listRouteEventSummaries(request.user?.tenant_id));
  fastify.post("/hr/routes/prevalidate", { schema: schemas.routePrevalidateSchema, preHandler: requirePermission("hr", "write") }, (request) => service.prevalidateRoutes(request.user?.tenant_id, request.body));
  fastify.get("/hr/routes/assignments", { preHandler: requirePermission("hr", "read") }, (request) => service.listDateAssignments(request.user?.tenant_id, request.query));
  fastify.post("/hr/routes", { schema: schemas.routeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoute(request.user?.tenant_id, request.body));
  fastify.post("/hr/routes/bulk", { schema: schemas.routeBulkSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoutesBulk(request.user?.tenant_id, request.body));
  fastify.patch("/hr/routes/:id", { schema: schemas.routeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateRoute(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/hr/routes/:id/deletion-impact", { preHandler: requirePermission("hr", "read") }, routeDeletionImpactForRequest);
  fastify.delete("/hr/routes/:id", { schema: schemas.routeDeleteSchema, preHandler: [requireHrModuleEnabled, requireOwnedRouteForDeletion, requirePhysicalDeleteGrant("hr")] }, (request) => service.deleteRoute(request.user?.tenant_id, request.params.id, request.body || {}, { actor: request.user, ...requestContext(request) }));
  fastify.get("/hr/routes/preop/template", { preHandler: requirePermission("hr", "read") }, () => service.getPreoperationalTemplate());
  fastify.get("/hr/routes/preop/active", { preHandler: requirePermission("hr", "read") }, (request) => service.getActivePreoperationalChecklist(request.user?.tenant_id, request.user, request.query));
  fastify.get("/hr/routes/preop/metrics", { preHandler: requirePermission("hr", "read") }, (request) => service.getPreoperationalMetrics(request.user?.tenant_id, request.query));
  fastify.post("/hr/routes/preop/:id/submit", { schema: schemas.preopSubmitSchema, preHandler: requirePermission("hr", "write") }, (request) => service.submitPreoperationalChecklist(request.user?.tenant_id, request.user, request.params.id, request.body));
  fastify.get("/hr/routes/:id/tracking", { preHandler: requirePermission("hr", "read") }, (request) => service.getRouteTracking(request.user?.tenant_id, request.params.id, request.query));
  fastify.get("/hr/operations-map", { preHandler: requirePermission("hr", "read") }, (request) => service.getOperationsMap(request.user?.tenant_id, request.query));
  fastify.get("/hr/monitor-evidence/route/:routeId", { preHandler: requirePermission("hr", "read") }, (request) => service.getMonitorEvidenceBatch(request.user?.tenant_id, request.params.routeId));
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
  fastify.get("/hr/novelty-types", { preHandler: requirePermission("hr", "read") }, (request) => service.listNoveltyTypes(request.user?.tenant_id, request.query));
  fastify.get("/hr/novelties", { preHandler: requirePermission("hr", "read") }, (request) => service.listWorkdayNovelties(request.user?.tenant_id, request.query));
  fastify.get("/hr/labor-configuration", { preHandler: requirePermission("hr", "read") }, (request) => service.getLaborConfiguration(request.user?.tenant_id, request.query));
  fastify.post("/hr/labor-configuration/parameters", { schema: schemas.laborParameterSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createLaborParameter(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/hr/labor-configuration/parameters/:id", { schema: schemas.laborParameterPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateLaborParameter(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/hr/labor-configuration/deductions", { schema: schemas.laborParameterSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createLaborDeduction(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/hr/labor-configuration/deductions/:id", { schema: schemas.laborParameterPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateLaborDeduction(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/hr/labor-configuration/concepts", { schema: schemas.surchargeConceptSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createSurchargeConcept(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/hr/labor-configuration/concepts/:id", { schema: schemas.surchargeConceptPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateSurchargeConcept(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/hr/labor-configuration/payroll-concepts", { schema: schemas.payrollConceptSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createPayrollConcept(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/hr/labor-configuration/payroll-concepts/:id", { schema: schemas.payrollConceptPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updatePayrollConcept(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/hr/labor-configuration/calendar-days", { schema: schemas.calendarDaySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createCalendarDay(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/hr/labor-configuration/calendar-days/:id", { schema: schemas.calendarDayPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateCalendarDay(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/talento-humano/empleados", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployees(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/empleados/organization-options", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployeeOrganizationOptions(request.user?.tenant_id));
  fastify.post("/talento-humano/empleados", { schema: schemas.employeeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployee(request.user?.tenant_id, request.body));
  fastify.patch("/talento-humano/empleados/:id", { schema: schemas.employeePatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateEmployee(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/talento-humano/empleados/:id/contratos", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployeeContracts(request.user?.tenant_id, request.params.id, request.query));
  fastify.post("/talento-humano/empleados/:id/contratos/otrosi", { schema: schemas.employeeContractAddendumSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployeeContractAddendum(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.post("/talento-humano/empleados/:id/recontratar", { schema: schemas.employeeRehireSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployeeRehire(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.get("/talento-humano/empleados/:id/salarios", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployeeSalaryHistory(request.user?.tenant_id, request.params.id, request.query));
  fastify.post("/talento-humano/empleados/:id/salarios", { schema: schemas.employeeSalarySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployeeSalaryHistory(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.get("/talento-humano/empleados/:id/afiliaciones", { preHandler: requirePermission("hr", "read") }, (request) => service.listEmployeeAffiliations(request.user?.tenant_id, request.params.id, request.query));
  fastify.post("/talento-humano/empleados/:id/afiliaciones", { schema: schemas.employeeAffiliationSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createEmployeeAffiliation(request.user?.tenant_id, request.params.id, request.body));
  fastify.patch("/talento-humano/afiliaciones/:id", { schema: schemas.employeeAffiliationPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateEmployeeAffiliation(request.user?.tenant_id, request.params.id, request.body));
  fastify.get("/talento-humano/entidades", { preHandler: requirePermission("hr", "read") }, (request) => service.listLaborEntities(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/entidades/terceros", { preHandler: requirePermission("hr", "read") }, (request) => service.listLaborEntityPartyCandidates(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/entidades", { schema: schemas.laborEntitySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createLaborEntity(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/talento-humano/entidades/:id", { schema: schemas.laborEntityPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateLaborEntity(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.post("/talento-humano/entidades/:id/vincular-tercero", { schema: schemas.laborEntityLinkSchema, preHandler: requirePermission("hr", "write") }, (request) => service.linkLaborEntityAccountingParty(request.user?.tenant_id, request.params.id, request.body, request.user));
  fastify.get("/talento-humano/mallas", { preHandler: requirePermission("hr", "read") }, (request) => service.listRoutes(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/mallas/prevalidar", { schema: schemas.routePrevalidateSchema, preHandler: requirePermission("hr", "write") }, (request) => service.prevalidateRoutes(request.user?.tenant_id, request.body));
  fastify.get("/talento-humano/mallas/asignaciones", { preHandler: requirePermission("hr", "read") }, (request) => service.listDateAssignments(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/mallas", { schema: schemas.routeSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoute(request.user?.tenant_id, request.body));
  fastify.post("/talento-humano/mallas/crear-lote", { schema: schemas.routeBulkSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createRoutesBulk(request.user?.tenant_id, request.body));
  fastify.get("/talento-humano/mallas/:id/deletion-impact", { preHandler: requirePermission("hr", "read") }, routeDeletionImpactForRequest);
  fastify.delete("/talento-humano/mallas/:id", { schema: schemas.routeDeleteSchema, preHandler: [requireHrModuleEnabled, requireOwnedRouteForDeletion, requirePhysicalDeleteGrant("hr")] }, (request) => service.deleteRoute(request.user?.tenant_id, request.params.id, request.body || {}, { actor: request.user, ...requestContext(request) }));
  fastify.get("/talento-humano/novedades/tipos", { preHandler: requirePermission("hr", "read") }, (request) => service.listNoveltyTypes(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/novedades", { preHandler: requirePermission("hr", "read") }, (request) => service.listWorkdayNovelties(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/configuracion-laboral", { preHandler: requirePermission("hr", "read") }, (request) => service.getLaborConfiguration(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/configuracion-laboral/parametros", { schema: schemas.laborParameterSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createLaborParameter(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/talento-humano/configuracion-laboral/parametros/:id", { schema: schemas.laborParameterPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateLaborParameter(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/talento-humano/configuracion-laboral/deducciones", { schema: schemas.laborParameterSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createLaborDeduction(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/talento-humano/configuracion-laboral/deducciones/:id", { schema: schemas.laborParameterPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateLaborDeduction(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/talento-humano/configuracion-laboral/conceptos", { schema: schemas.surchargeConceptSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createSurchargeConcept(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/talento-humano/configuracion-laboral/conceptos/:id", { schema: schemas.surchargeConceptPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateSurchargeConcept(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/talento-humano/configuracion-laboral/conceptos-nomina", { schema: schemas.payrollConceptSchema, preHandler: requirePermission("hr", "write") }, (request) => service.createPayrollConcept(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/talento-humano/configuracion-laboral/conceptos-nomina/:id", { schema: schemas.payrollConceptPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updatePayrollConcept(request.user?.tenant_id, request.params.id, request.body));
  fastify.post("/talento-humano/configuracion-laboral/calendario", { schema: schemas.calendarDaySchema, preHandler: requirePermission("hr", "write") }, (request) => service.createCalendarDay(request.user?.tenant_id, request.body, request.user));
  fastify.patch("/talento-humano/configuracion-laboral/calendario/:id", { schema: schemas.calendarDayPatchSchema, preHandler: requirePermission("hr", "write") }, (request) => service.updateCalendarDay(request.user?.tenant_id, request.params.id, request.body));

  fastify.get("/hr/payroll/config", { preHandler: requirePermission("payroll", "read") }, (request) => service.getPayrollConfig(request.user?.tenant_id));
  fastify.put("/hr/payroll/config", { preHandler: requirePermission("payroll", "write") }, (request) => service.savePayrollConfig(request.user?.tenant_id, request.body || {}));
  fastify.get("/talento-humano/configuracion-laboral/nomina", { preHandler: requirePermission("payroll", "read") }, (request) => service.getPayrollConfig(request.user?.tenant_id));
  fastify.put("/talento-humano/configuracion-laboral/nomina", { preHandler: requirePermission("payroll", "write") }, (request) => service.savePayrollConfig(request.user?.tenant_id, request.body || {}));

  const sendPayrollPdf = async (request, reply) => {
    const pdf = await service.getPayrollDocumentPdf(request.user?.tenant_id, request.params.id);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="comprobante-nomina-${request.params.id}.pdf"`)
      .send(pdf);
  };
  const sendTerminationPdf = async (request, reply) => {
    const pdf = await service.getEmployeeTerminationLiquidationPdf(request.user?.tenant_id, request.params.id);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="liquidacion-trabajador-${request.params.id}.pdf"`)
      .send(pdf);
  };

  fastify.post("/hr/payroll/validate", { schema: schemas.payrollLiquidationSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.validatePayrollPeriod(request.user?.tenant_id, request.body || {}));
  fastify.post("/hr/payroll/preview", { schema: schemas.payrollLiquidationSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewPayrollLiquidation(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll/liquidations", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayrollDocuments(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/liquidations", { schema: schemas.payrollLiquidationSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runPayrollLiquidation(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/hr/payroll/liquidations", { schema: schemas.payrollLiquidationDeleteSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.deletePayrollLiquidation(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll/liquidations/:id/pdf", { preHandler: requirePermission("payroll", "read") }, sendPayrollPdf);
  fastify.get("/hr/payroll/adjustments", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayrollAdjustments(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/adjustments", { schema: schemas.payrollAdjustmentSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.createPayrollAdjustment(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/hr/payroll/external-workdays/import", { schema: schemas.payrollExternalWorkdaysImportSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.importExternalWorkdays(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/hr/payroll/external-workdays", { schema: schemas.payrollExternalWorkdaysDeleteSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.deleteExternalWorkdays(request.user?.tenant_id, request.body || {}));
  fastify.delete("/hr/payroll/adjustments/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deletePayrollAdjustment(request.user?.tenant_id, request.params.id));
  fastify.get("/hr/payroll/libranza-concepts", { preHandler: requirePermission("payroll", "read") }, (request) => service.listLibranzaConcepts(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/libranza-concepts", { schema: schemas.libranzaConceptSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.createLibranzaConcept(request.user?.tenant_id, request.body || {}, request.user));
  fastify.patch("/hr/payroll/libranza-concepts/:id", { schema: schemas.libranzaConceptPatchSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.updateLibranzaConcept(request.user?.tenant_id, request.params.id, request.body || {}));
  fastify.delete("/hr/payroll/libranza-concepts/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteLibranzaConcept(request.user?.tenant_id, request.params.id));
  fastify.get("/hr/payroll/employee-libranzas", { preHandler: requirePermission("payroll", "read") }, (request) => service.listEmployeeLibranzas(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/employee-libranzas", { schema: schemas.employeeLibranzaSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.createEmployeeLibranza(request.user?.tenant_id, request.body || {}, request.user));
  fastify.patch("/hr/payroll/employee-libranzas/:id", { schema: schemas.employeeLibranzaPatchSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.updateEmployeeLibranza(request.user?.tenant_id, request.params.id, request.body || {}));
  fastify.get("/hr/payroll/benefit-balances", { preHandler: requirePermission("payroll", "read") }, (request) => service.listEmployeeBenefitBalances(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/terminations/preview", { schema: schemas.employeeTerminationLiquidationSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewEmployeeTerminationLiquidation(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll/terminations", { preHandler: requirePermission("payroll", "read") }, (request) => service.listEmployeeTerminationLiquidations(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/terminations", { schema: schemas.employeeTerminationLiquidationSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runEmployeeTerminationLiquidation(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/hr/payroll/terminations/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteEmployeeTerminationLiquidation(request.user?.tenant_id, request.params.id));
  fastify.get("/hr/payroll/terminations/:id/pdf", { preHandler: requirePermission("payroll", "read") }, sendTerminationPdf);
  fastify.post("/hr/payroll/social-contributions/preview", { schema: schemas.socialContributionSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewSocialContributions(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll/social-contributions", { preHandler: requirePermission("payroll", "read") }, (request) => service.listSocialContributionDocuments(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/social-contributions", { schema: schemas.socialContributionSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runSocialContributions(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/hr/payroll/social-contributions/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteSocialContributionDocument(request.user?.tenant_id, request.params.id));
  fastify.get("/hr/payroll/social-contributions/:id/lines", { preHandler: requirePermission("payroll", "read") }, (request) => service.listSocialContributionLines(request.user?.tenant_id, { ...request.query, document_id: request.params.id }));
  fastify.get("/hr/payroll/period-closures", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayrollPeriodClosures(request.user?.tenant_id, request.query));
  fastify.post("/hr/payroll/period-closures/validate", { schema: schemas.payrollPeriodClosureSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.validatePayrollPeriodClosure(request.user?.tenant_id, request.body || {}));
  fastify.post("/hr/payroll/period-closures/close", { schema: schemas.payrollPeriodClosureSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.closePayrollPeriod(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/hr/payroll/period-closures/reopen", { schema: schemas.payrollPeriodReopenSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.reopenPayrollPeriod(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/hr/payroll/period-closures/recalculate", { schema: schemas.payrollPeriodClosureSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.recalculatePayrollPeriodClosure(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/hr/payroll/social-benefit-provisions/preview", { schema: schemas.socialBenefitProvisionSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewSocialBenefitProvisions(request.user?.tenant_id, request.body || {}));
  fastify.post("/hr/payroll/social-benefit-provisions", { schema: schemas.socialBenefitProvisionSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runSocialBenefitProvisions(request.user?.tenant_id, request.body || {}, request.user));

  fastify.post("/talento-humano/nomina/validar", { schema: schemas.payrollLiquidationSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.validatePayrollPeriod(request.user?.tenant_id, request.body || {}));
  fastify.post("/talento-humano/nomina/preview", { schema: schemas.payrollLiquidationSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewPayrollLiquidation(request.user?.tenant_id, request.body || {}));
  fastify.get("/talento-humano/nomina/reportes/conceptos", { preHandler: requirePermission("payroll", "read") }, (request) => service.payrollConceptReport(request.user?.tenant_id, request.query));
  fastify.get("/hr/payroll/reports/concepts", { preHandler: requirePermission("payroll", "read") }, (request) => service.payrollConceptReport(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/nomina/reportes/prestaciones", { preHandler: requirePermission("payroll", "read") }, (request) => service.benefitBalanceReport(request.user?.tenant_id, request.query));
  fastify.get("/hr/payroll/reports/benefit-balances", { preHandler: requirePermission("payroll", "read") }, (request) => service.benefitBalanceReport(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/nomina/reportes/auxiliar", { preHandler: requirePermission("payroll", "read") }, (request) => service.payrollAuxiliaryReport(request.user?.tenant_id, request.query));
  fastify.get("/hr/payroll/reports/auxiliary", { preHandler: requirePermission("payroll", "read") }, (request) => service.payrollAuxiliaryReport(request.user?.tenant_id, request.query));
  fastify.get("/talento-humano/nomina/liquidaciones", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayrollDocuments(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/nomina/liquidaciones", { schema: schemas.payrollLiquidationSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runPayrollLiquidation(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/talento-humano/nomina/liquidaciones", { schema: schemas.payrollLiquidationDeleteSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.deletePayrollLiquidation(request.user?.tenant_id, request.body || {}));
  fastify.get("/talento-humano/nomina/liquidaciones/:id/pdf", { preHandler: requirePermission("payroll", "read") }, sendPayrollPdf);
  fastify.get("/talento-humano/nomina/ajustes", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayrollAdjustments(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/nomina/ajustes", { schema: schemas.payrollAdjustmentSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.createPayrollAdjustment(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/talento-humano/nomina/jornadas-externas/importar", { schema: schemas.payrollExternalWorkdaysImportSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.importExternalWorkdays(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/talento-humano/nomina/jornadas-externas", { schema: schemas.payrollExternalWorkdaysDeleteSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.deleteExternalWorkdays(request.user?.tenant_id, request.body || {}));
  fastify.delete("/talento-humano/nomina/ajustes/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deletePayrollAdjustment(request.user?.tenant_id, request.params.id));
  fastify.get("/talento-humano/libranzas/conceptos", { preHandler: requirePermission("payroll", "read") }, (request) => service.listLibranzaConcepts(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/libranzas/conceptos", { schema: schemas.libranzaConceptSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.createLibranzaConcept(request.user?.tenant_id, request.body || {}, request.user));
  fastify.patch("/talento-humano/libranzas/conceptos/:id", { schema: schemas.libranzaConceptPatchSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.updateLibranzaConcept(request.user?.tenant_id, request.params.id, request.body || {}));
  fastify.delete("/talento-humano/libranzas/conceptos/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteLibranzaConcept(request.user?.tenant_id, request.params.id));
  fastify.get("/talento-humano/libranzas/empleados", { preHandler: requirePermission("payroll", "read") }, (request) => service.listEmployeeLibranzas(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/libranzas/empleados", { schema: schemas.employeeLibranzaSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.createEmployeeLibranza(request.user?.tenant_id, request.body || {}, request.user));
  fastify.patch("/talento-humano/libranzas/empleados/:id", { schema: schemas.employeeLibranzaPatchSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.updateEmployeeLibranza(request.user?.tenant_id, request.params.id, request.body || {}));
  fastify.get("/talento-humano/liquidacion-trabajador/saldos", { preHandler: requirePermission("payroll", "read") }, (request) => service.listEmployeeBenefitBalances(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/liquidacion-trabajador/preview", { schema: schemas.employeeTerminationLiquidationSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewEmployeeTerminationLiquidation(request.user?.tenant_id, request.body || {}));
  fastify.get("/talento-humano/liquidacion-trabajador/documentos", { preHandler: requirePermission("payroll", "read") }, (request) => service.listEmployeeTerminationLiquidations(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/liquidacion-trabajador/documentos", { schema: schemas.employeeTerminationLiquidationSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runEmployeeTerminationLiquidation(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/talento-humano/liquidacion-trabajador/documentos/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteEmployeeTerminationLiquidation(request.user?.tenant_id, request.params.id));
  fastify.get("/talento-humano/liquidacion-trabajador/documentos/:id/pdf", { preHandler: requirePermission("payroll", "read") }, sendTerminationPdf);
  fastify.post("/talento-humano/aportes-sociales/preview", { schema: schemas.socialContributionSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewSocialContributions(request.user?.tenant_id, request.body || {}));
  fastify.get("/talento-humano/aportes-sociales/documentos", { preHandler: requirePermission("payroll", "read") }, (request) => service.listSocialContributionDocuments(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/aportes-sociales/documentos", { schema: schemas.socialContributionSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runSocialContributions(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/talento-humano/aportes-sociales/documentos/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteSocialContributionDocument(request.user?.tenant_id, request.params.id));
  fastify.get("/talento-humano/aportes-sociales/documentos/:id/lineas", { preHandler: requirePermission("payroll", "read") }, (request) => service.listSocialContributionLines(request.user?.tenant_id, { ...request.query, document_id: request.params.id }));
  fastify.get("/talento-humano/nomina/cierres", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayrollPeriodClosures(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/nomina/cierres/validar", { schema: schemas.payrollPeriodClosureSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.validatePayrollPeriodClosure(request.user?.tenant_id, request.body || {}));
  fastify.post("/talento-humano/nomina/cierres/cerrar", { schema: schemas.payrollPeriodClosureSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.closePayrollPeriod(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/talento-humano/nomina/cierres/reabrir", { schema: schemas.payrollPeriodReopenSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.reopenPayrollPeriod(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/talento-humano/nomina/cierres/recalcular", { schema: schemas.payrollPeriodClosureSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.recalculatePayrollPeriodClosure(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/talento-humano/provisiones/prestaciones-sociales/preview", { schema: schemas.socialBenefitProvisionSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewSocialBenefitProvisions(request.user?.tenant_id, request.body || {}));
  fastify.post("/talento-humano/provisiones/prestaciones-sociales/documentos", { schema: schemas.socialBenefitProvisionSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runSocialBenefitProvisions(request.user?.tenant_id, request.body || {}, request.user));
  fastify.post("/talento-humano/prestaciones/pagos/preview", { schema: schemas.socialBenefitPaymentSchema, preHandler: requirePermission("payroll", "read") }, (request) => service.previewSocialBenefitPayments(request.user?.tenant_id, request.body || {}));
  fastify.get("/talento-humano/prestaciones/pagos/documentos", { preHandler: requirePermission("payroll", "read") }, (request) => service.listSocialBenefitPaymentDocuments(request.user?.tenant_id, request.query));
  fastify.post("/talento-humano/prestaciones/pagos/documentos", { schema: schemas.socialBenefitPaymentSchema, preHandler: requirePermission("payroll", "write") }, (request) => service.runSocialBenefitPayments(request.user?.tenant_id, request.body || {}, request.user));
  fastify.delete("/talento-humano/prestaciones/pagos/documentos/:id", { preHandler: requirePermission("payroll", "write") }, (request) => service.deleteSocialBenefitPaymentDocument(request.user?.tenant_id, request.params.id));

  fastify.post("/hr/payroll/process", { preHandler: requirePermission("payroll", "write") }, (request) => service.processPayrollRange(request.user?.tenant_id, request.body || {}));
  fastify.get("/hr/payroll", { preHandler: requirePermission("payroll", "read") }, (request) => service.listPayroll(request.user?.tenant_id, request.query));
}

module.exports = hrRoutes;
