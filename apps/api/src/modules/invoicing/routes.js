const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function invoicingRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/invoicing/invoices", {
    preHandler: requirePermission("invoicing", "read")
  }, async (request) => service.listInvoices(request.user?.tenant_id, request.query));

  fastify.post("/invoicing/sales-orders/:id/invoice", {
    schema: schema.invoiceSchema,
    preHandler: requirePermission("invoicing", "write")
  }, async (request, reply) => reply.code(201).send(await service.invoiceSaleOrder(
    request.user?.tenant_id,
    request.user.id,
    Number(request.params.id),
    request.body
  )));

  fastify.post("/invoicing/invoice", {
    preHandler: requirePermission("invoicing", "write")
  }, async (request, reply) => {
    const soId = Number(request.body.sale_order_id);
    if (!Number.isFinite(soId) || soId <= 0) {
      return reply.code(400).send({ error: "sale_order_id es obligatorio", code: "VALIDACION" });
    }
    const { sale_order_id, ...payload } = request.body || {};
    return reply.code(201).send(await service.invoiceSaleOrder(
      request.user?.tenant_id,
      request.user.id,
      soId,
      payload
    ));
  });
}

module.exports = invoicingRoutes;
