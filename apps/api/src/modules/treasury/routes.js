const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function treasuryRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);
  const read = requirePermission("accounting", "read");
  const write = requirePermission("accounting", "write");
  const approve = requirePermission("accounting", "approve");

  fastify.get("/treasury/banks", { preHandler: read }, (request) => service.listBanks(request.user?.tenant_id, request.query));
  fastify.post("/treasury/banks", { schema: schema.bankSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.saveBank(request.user?.tenant_id, request.user.id, request.body)));
  fastify.patch("/treasury/banks/:id", { schema: schema.bankSchema, preHandler: write }, (request) => service.saveBank(request.user?.tenant_id, request.user.id, request.body, request.params.id));
  fastify.get("/treasury/open-items", { preHandler: read }, (request) => service.listOpenItems(request.user?.tenant_id, request.query));
  fastify.get("/treasury/payments", { preHandler: read }, (request) => service.listPayments(request.user?.tenant_id, request.query));
  fastify.get("/treasury/payments/:id", { preHandler: read }, (request) => service.getPayment(request.user?.tenant_id, request.params.id));
  fastify.post("/treasury/payments", { schema: schema.paymentSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createPayment(request.user?.tenant_id, request.user.id, request.body)));
  fastify.post("/treasury/payments/:id/cancel", { preHandler: approve }, (request) => service.cancelPayment(request.user?.tenant_id, request.user.id, request.params.id));
  fastify.get("/treasury/advances", { preHandler: read }, (request) => service.listAdvances(request.user?.tenant_id, request.query));
  fastify.post("/treasury/advances", { schema: schema.advanceSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createAdvance(request.user?.tenant_id, request.user.id, request.body)));
  fastify.post("/treasury/advances/:id/apply", { schema: schema.advanceApplicationSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.applyAdvance(request.user?.tenant_id, request.user.id, request.params.id, request.body)));
}

module.exports = treasuryRoutes;
