// Gastos Menores / Cajas Menores - rutas HTTP (T2: maestros; T3: anticipos y comprobantes).
// El prefijo global es /api/v1 y el hook global de auditoria deriva el modulo del segmento 3 de la
// URL, por eso las rutas viven bajo /petty-cash/... y la auditoria registra "petty-cash".
// RBAC: se reutiliza el modulo de permisos "accounting" (mismo precedente que treasury). No se
// inventa un modulo "petty-cash" porque MODULE_CODES (middleware/rbac.js) no lo conoce y
// tenantHasModule devolveria false, bloqueando a todos los tenants existentes.
const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function pettyCashRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);
  const read = requirePermission("accounting", "read");
  const write = requirePermission("accounting", "write");
  // Liquidar y anular mueven el mayor general: exigen el mismo permiso que treasury usa para
  // anular pagos (accounting/approve), no basta con write.
  const approve = requirePermission("accounting", "approve");

  // Todo el cuerpo de la liquidacion es opcional (reintegro = saldo por defecto), pero el esquema
  // sigue cerrado. Sin este gancho Fastify responde 400 "body must be object" cuando el cliente
  // llama sin declarar JSON; con {} por defecto la UI puede omitir el cuerpo igual que en /cancel
  // y no aparece FST_ERR_CTP_EMPTY_JSON_BODY (mismo fallo que obligo a separar params de body en T2).
  const optionalBody = (request, reply, done) => {
    if (request.body === undefined || request.body === null) request.body = {};
    done();
  };

  // --- Maestro de conceptos de egreso ---
  fastify.get("/petty-cash/concepts", { preHandler: read }, (request) => service.listConcepts(request.user?.tenant_id, request.query));
  fastify.get("/petty-cash/concepts/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getConcept(request.user?.tenant_id, request.params.id));
  fastify.post("/petty-cash/concepts", { schema: schema.conceptCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createConcept(request.user?.tenant_id, request.user?.id, request.body)));
  fastify.put("/petty-cash/concepts/:id", { schema: schema.conceptUpdateSchema, preHandler: write }, (request) => service.updateConcept(request.user?.tenant_id, request.user?.id, request.params.id, request.body));
  fastify.post("/petty-cash/concepts/:id/activate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setConceptActive(request.user?.tenant_id, request.params.id, true));
  fastify.post("/petty-cash/concepts/:id/deactivate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setConceptActive(request.user?.tenant_id, request.params.id, false));

  // --- Maestro de cajas menores ---
  fastify.get("/petty-cash/boxes", { preHandler: read }, (request) => service.listBoxes(request.user?.tenant_id, request.query));
  fastify.get("/petty-cash/boxes/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getBox(request.user?.tenant_id, request.params.id));
  fastify.post("/petty-cash/boxes", { schema: schema.boxCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createBox(request.user?.tenant_id, request.user?.id, request.body)));
  fastify.put("/petty-cash/boxes/:id", { schema: schema.boxUpdateSchema, preHandler: write }, (request) => service.updateBox(request.user?.tenant_id, request.user?.id, request.params.id, request.body));
  fastify.post("/petty-cash/boxes/:id/activate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setBoxActive(request.user?.tenant_id, request.params.id, true));
  fastify.post("/petty-cash/boxes/:id/deactivate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setBoxActive(request.user?.tenant_id, request.params.id, false));

  // --- Anticipos de caja menor (documento APC) ---
  fastify.get("/petty-cash/advances", { preHandler: read }, (request) => service.listAdvances(request.user?.tenant_id, request.query));
  fastify.get("/petty-cash/advances/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getAdvance(request.user?.tenant_id, request.params.id));
  fastify.post("/petty-cash/advances", { schema: schema.advanceCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createAdvance(request.user?.tenant_id, request.user?.id, request.body)));
  // liquidate declara body cerrado pero opcional: se puede llamar sin cuerpo (reintegro = saldo).
  fastify.post("/petty-cash/advances/:id/liquidate", { schema: schema.liquidateSchema, preValidation: optionalBody, preHandler: approve }, (request) => service.liquidateAdvance(request.user?.tenant_id, request.user?.id, request.params.id, request.body));
  // cancel no declara body (accion sin cuerpo) para no provocar FST_ERR_CTP_EMPTY_JSON_BODY.
  fastify.post("/petty-cash/advances/:id/cancel", { schema: schema.idParamSchema, preHandler: approve }, (request) => service.cancelAdvance(request.user?.tenant_id, request.user?.id, request.params.id));

  // --- Comprobantes de gasto (documento GM, contabilizacion inmediata) ---
  fastify.get("/petty-cash/vouchers", { preHandler: read }, (request) => service.listVouchers(request.user?.tenant_id, request.query));
  fastify.get("/petty-cash/vouchers/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getVoucher(request.user?.tenant_id, request.params.id));
  fastify.post("/petty-cash/vouchers", { schema: schema.voucherCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createVoucher(request.user?.tenant_id, request.user?.id, request.body)));
  fastify.post("/petty-cash/vouchers/:id/cancel", { schema: schema.idParamSchema, preHandler: approve }, (request) => service.cancelVoucher(request.user?.tenant_id, request.user?.id, request.params.id));

  // --- Reservado T4: /petty-cash/reports ---
}

module.exports = pettyCashRoutes;
