const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function purchasesRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.post("/purchases/suppliers", {
    schema: schema.supplierSchema,
    preHandler: requirePermission("purchases", "write")
  }, async (request, reply) => reply.code(201).send(await service.createSupplier(request.user.tenant_id, request.user.id, request.body)));

  fastify.post("/purchases/orders", {
    schema: schema.purchaseOrderSchema,
    preHandler: requirePermission("purchases", "write")
  }, async (request, reply) => reply.code(201).send(await service.createPurchaseOrder(request.user.tenant_id, request.user.id, request.body)));

  fastify.post("/purchases/orders/:id/receive", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.receivePurchaseOrder(request.user.tenant_id, request.user.id, Number(request.params.id), request.body));

  fastify.patch("/purchases/orders/:id/status", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.updatePOStatus(request.user.tenant_id, request.user.id, Number(request.params.id), request.body?.status));

  fastify.get("/purchases/vmi-alerts", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.checkVMIAlerts(request.user.tenant_id));
}

module.exports = purchasesRoutes;

