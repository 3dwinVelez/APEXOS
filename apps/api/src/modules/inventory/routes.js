const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const schemas = require("./schema");
const service = require("./service");

async function inventoryRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.get("/inventory/items", {
    preHandler: requirePermission("inventory", "read")
  }, async (request) => service.listItems(request.user?.tenant_id, request.query));

  fastify.get("/inventory/families", {
    preHandler: requirePermission("inventory", "read")
  }, async (request) => service.listFamilies(request.user?.tenant_id, request.query));

  fastify.get("/inventory/warehouses", {
    preHandler: requirePermission("inventory", "read")
  }, async (request) => service.listWarehouses(request.user?.tenant_id, request.query));

  fastify.get("/inventory/locations", {
    preHandler: requirePermission("inventory", "read")
  }, async (request) => service.listWarehouseLocations(request.user?.tenant_id));

  fastify.post("/inventory/families", {
    schema: schemas.familySchema,
    preHandler: requirePermission("inventory", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveFamily(request.user?.tenant_id, request.body)));

  fastify.post("/inventory/warehouses", {
    schema: schemas.warehouseSchema,
    preHandler: requirePermission("inventory", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveWarehouse(request.user?.tenant_id, request.body)));

  fastify.put("/inventory/warehouses/:id", {
    schema: schemas.warehouseSchema,
    preHandler: requirePermission("inventory", "write")
  }, async (request) => service.saveWarehouse(request.user?.tenant_id, request.body, Number(request.params.id)));

  fastify.delete("/inventory/warehouses/:id", {
    preHandler: requirePermission("inventory", "write")
  }, async (request) => service.deleteWarehouse(request.user?.tenant_id, Number(request.params.id)));

  fastify.post("/inventory/items", {
    schema: schemas.createItemSchema,
    preHandler: requirePermission("inventory", "write")
  }, async (request, reply) => {
    const item = await service.createItem(request.user?.tenant_id, request.user.id, request.body);
    return reply.code(201).send(item);
  });

  fastify.post("/inventory/movements", {
    schema: schemas.moveStockSchema,
    preHandler: requirePermission("inventory", "write")
  }, async (request, reply) => {
    const payload = {
      ...request.body,
      from_location_id: request.body.from_location,
      to_location_id: request.body.to_location
    };
    const result = await service.stockMove(request.user?.tenant_id, request.user.id, payload);
    return reply.code(201).send(result);
  });

  fastify.patch("/inventory/items/:id", {
    schema: schemas.updateItemSchema,
    preHandler: requirePermission("inventory", "write")
  }, async (request) => service.updateItem(request.user?.tenant_id, Number(request.params.id), request.body));

  fastify.post("/inventory/adjust", {
    schema: schemas.adjustStockSchema,
    preHandler: requirePermission("inventory", "approve")
  }, async (request) => service.adjustStock(request.user?.tenant_id, request.user.id, request.body));

  fastify.get("/inventory/costs", {
    preHandler: requirePermission("inventory", "read")
  }, async (request) => service.getInventoryCosts(request.user?.tenant_id, request.query));

  fastify.get("/inventory/kardex/:id", {
    preHandler: requirePermission("inventory", "read")
  }, async (request) => service.getKardex(request.user?.tenant_id, Number(request.params.id), request.query));

  fastify.post("/inventory/slotting/run", {
    preHandler: requirePermission("inventory", "approve")
  }, async (request) => service.runSlotting(request.user?.tenant_id, request.body.place_id || null));

  fastify.get("/inventory/transfers", { preHandler: requirePermission("inventory", "read") }, async (request) => service.listWarehouseTransfers(request.user?.tenant_id, request.query));
  fastify.get("/inventory/transfers/:id", { preHandler: requirePermission("inventory", "read") }, async (request) => service.getWarehouseTransfer(request.user?.tenant_id, Number(request.params.id)));
  fastify.post("/inventory/transfers", { schema: schemas.warehouseTransferSchema, preHandler: requirePermission("inventory", "write") }, async (request, reply) => reply.code(201).send(await service.createWarehouseTransfer(request.user?.tenant_id, request.user.id, request.body)));
  fastify.post("/inventory/transfers/:id/dispatch", { preHandler: requirePermission("inventory", "approve") }, async (request) => service.dispatchWarehouseTransfer(request.user?.tenant_id, request.user.id, Number(request.params.id)));
  fastify.post("/inventory/transfers/:id/receive", { preHandler: requirePermission("inventory", "approve") }, async (request) => service.receiveWarehouseTransfer(request.user?.tenant_id, request.user.id, Number(request.params.id)));
}

module.exports = inventoryRoutes;
