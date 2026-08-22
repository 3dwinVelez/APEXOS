const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");

async function purchasesRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/purchases/suppliers", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.listSuppliers(request.user?.tenant_id, request.query));

  fastify.get("/purchases/suppliers/:id", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.getSupplier(request.user?.tenant_id, Number(request.params.id)));

  fastify.patch("/purchases/suppliers/:id", {
    schema: schema.updateSupplierSchema,
    preHandler: requirePermission("purchases", "write")
  }, async (request) => service.updateSupplier(request.user?.tenant_id, Number(request.params.id), request.body));

  fastify.get("/purchases/orders", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.listPurchaseOrders(request.user?.tenant_id, request.query));

  fastify.get("/purchases/orders/open", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.listOpenPurchaseOrders(request.user?.tenant_id, request.query));

  fastify.get("/purchases/orders/:id", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.getPurchaseOrder(request.user?.tenant_id, Number(request.params.id)));

  fastify.post("/purchases/suppliers", {
    schema: schema.supplierSchema,
    preHandler: requirePermission("purchases", "write")
  }, async (request, reply) => reply.code(201).send(await service.createSupplier(request.user?.tenant_id, request.user.id, request.body)));

  fastify.post("/purchases/orders", {
    schema: schema.purchaseOrderSchema,
    preHandler: requirePermission("purchases", "write")
  }, async (request, reply) => reply.code(201).send(await service.createPurchaseOrder(request.user?.tenant_id, request.user.id, request.body)));

  fastify.post("/purchases/invoices", {
    schema: schema.purchaseInvoiceSchema,
    preHandler: requirePermission("purchases", "write")
  }, async (request, reply) => reply.code(201).send(await service.createPurchaseInvoice(request.user?.tenant_id, request.user.id, request.body)));

  fastify.post("/purchases/invoices/simulate", {
    schema: schema.purchaseInvoiceSchema,
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.simulatePurchaseInvoice(request.user?.tenant_id, request.body));

  fastify.post("/purchases/orders/:id/receive", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.receivePurchaseOrder(request.user?.tenant_id, request.user.id, Number(request.params.id), request.body));

  fastify.post("/purchases/orders/:id/approve", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.approvePurchaseOrder(request.user?.tenant_id, request.user.id, Number(request.params.id)));

  fastify.post("/purchases/orders/:id/cancel", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.cancelPurchaseOrder(request.user?.tenant_id, request.user.id, Number(request.params.id)));

  fastify.post("/purchases/orders/:id/duplicate", {
    preHandler: requirePermission("purchases", "write")
  }, async (request, reply) => reply.code(201).send(await service.duplicatePurchaseOrder(request.user?.tenant_id, request.user.id, Number(request.params.id))));

  fastify.post("/purchases/orders/:id/create-receipt", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.createReceiptFromPurchaseOrder(request.user?.tenant_id, request.user.id, Number(request.params.id)));

  fastify.get("/purchases/orders/:id/receipts", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.listPurchaseOrderReceipts(request.user?.tenant_id, Number(request.params.id)));

  fastify.patch("/purchases/orders/:id/status", {
    preHandler: requirePermission("purchases", "approve")
  }, async (request) => service.updatePOStatus(request.user?.tenant_id, request.user.id, Number(request.params.id), request.body.status));

  fastify.get("/purchases/vmi-alerts", {
    preHandler: requirePermission("purchases", "read")
  }, async (request) => service.checkVMIAlerts(request.user?.tenant_id));
}

module.exports = purchasesRoutes;
