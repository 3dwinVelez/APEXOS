const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function salesRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/sales/customers", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.listCustomers(request.user.tenant_id));

  fastify.get("/sales/orders", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.listSaleOrders(request.user.tenant_id));

  fastify.post("/sales/customers", {
    schema: schema.customerSchema,
    preHandler: requirePermission("sales", "write")
  }, async (request, reply) => reply.code(201).send(await service.createCustomer(request.user.tenant_id, request.user.id, request.body)));

  fastify.post("/sales/orders", {
    schema: schema.saleOrderSchema,
    preHandler: requirePermission("sales", "write")
  }, async (request, reply) => reply.code(201).send(await service.createSaleOrder(request.user.tenant_id, request.user.id, request.body)));
}

module.exports = salesRoutes;
