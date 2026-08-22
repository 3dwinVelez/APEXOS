const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function salesInvoiceRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.post("/sales/invoices", {
    schema: schema.createInvoiceSchema,
    preHandler: requirePermission("sales", "write")
  }, async (request, reply) => reply.code(201).send(await service.createSalesInvoice(
    request.user?.tenant_id,
    request.user.id,
    request.body
  )));

  fastify.post("/sales/invoices/simulate", {
    schema: schema.simulateInvoiceSchema,
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.simulateSalesInvoice(
    request.user?.tenant_id,
    request.body
  ));

  fastify.get("/sales/invoices", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.listSalesInvoices(
    request.user?.tenant_id,
    request.query
  ));

  fastify.get("/sales/invoices/:id", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.getSalesInvoice(
    request.user?.tenant_id,
    Number(request.params.id)
  ));

  fastify.post("/sales/invoices/:id/cancel", {
    preHandler: requirePermission("sales", "approve")
  }, async (request) => service.cancelSalesInvoice(
    request.user?.tenant_id,
    request.user.id,
    Number(request.params.id)
  ));

  // Reports
  fastify.get("/sales/reports/by-customer", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.getSalesByCustomer(
    request.user?.tenant_id,
    request.query
  ));

  fastify.get("/sales/reports/by-item", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.getSalesByItem(
    request.user?.tenant_id,
    request.query
  ));

  fastify.get("/sales/reports/by-date", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.getSalesByDate(
    request.user?.tenant_id,
    request.query
  ));

  fastify.get("/sales/reports/detail", {
    preHandler: requirePermission("sales", "read")
  }, async (request) => service.getSalesDetail(
    request.user?.tenant_id,
    request.query
  ));
}

module.exports = salesInvoiceRoutes;
