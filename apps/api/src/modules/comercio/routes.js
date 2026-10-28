// Comercio (M-30) - rutas HTTP.
// Prefijo global /api/v1; las rutas viven bajo /comercio/... para que el hook global de
// auditoria derive el modulo "comercio" del segmento 3 de la URL (fabric/audit.js).
// RBAC: modulo de permisos propio "comercio" (alta en MODULE_CODES y en el catalogo del
// admin). El rol administrativo pasa por el bypass de requirePermission; los demas roles
// necesitan permisos comercio/read | write | approve explicitos.
// Aislamiento: el servicio jamas confia en tenant_id del body; todo sale de request.user.
const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const schema = require("./schema");
const storage = require("./storage");

async function comercioRoutes(fastify) {
  // NOTA: la vitrina publica NO vive aqui. Los preHandler de este scope se herdan incluso
  // por scopes hijos registrados antes del addHook, así que /public/... se registra en un
  // scope raiz aparte (src/modules/comercio/public-routes.js via server.js).
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);
  const read = requirePermission("comercio", "read");
  const write = requirePermission("comercio", "write");
  // Anular documentos mueve inventario y cartera: exige approve, no solo write.
  const approve = requirePermission("comercio", "approve");

  const tenantOf = (request) => request.user?.tenant_id;
  const userOf = (request) => request.user?.id;

  // --- Configuracion del comercio ---
  fastify.get("/comercio/settings", { preHandler: read }, (request) => service.getSettings(tenantOf(request)));
  fastify.put("/comercio/settings", { schema: schema.settingsSchema, preHandler: write }, (request) => service.updateSettings(tenantOf(request), request.body));
  // Quemar el link publico actual y asignar uno nuevo (sin body: leccion FST_ERR_CTP_EMPTY_JSON_BODY).
  fastify.post("/comercio/settings/catalog/regenerate", { preHandler: write }, (request) => service.regenerateCatalogCode(tenantOf(request)));

  // --- Promociones y campanas ---
  // Varias pueden convivir; el precio de vitrina y mostrador toma la mejor aplicable.
  fastify.get("/comercio/promotions", { preHandler: read }, (request) => service.listPromotions(tenantOf(request)));
  fastify.get("/comercio/promotions/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getPromotion(tenantOf(request), request.params.id));
  fastify.post("/comercio/promotions", { schema: schema.promotionCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createPromotion(tenantOf(request), userOf(request), request.body)));
  fastify.put("/comercio/promotions/:id", { schema: schema.promotionUpdateSchema, preHandler: write }, (request) => service.updatePromotion(tenantOf(request), request.params.id, request.body));
  fastify.post("/comercio/promotions/:id/status", { schema: schema.promotionStatusSchema, preHandler: write }, (request) => service.setPromotionStatus(tenantOf(request), request.params.id, request.body.status));
  fastify.delete("/comercio/promotions/:id", { schema: schema.idParamSchema, preHandler: write }, (request) => service.deletePromotion(tenantOf(request), request.params.id));
  fastify.get("/comercio/promotions/:id/audience", { schema: schema.promotionAudienceSchema, preHandler: read }, (request) => service.promotionAudience(tenantOf(request), request.params.id, request.query));
  fastify.post("/comercio/promotions/:id/sends", { schema: schema.promotionSendSchema, preHandler: write }, (request) => service.registerPromotionSends(tenantOf(request), userOf(request), request.params.id, request.body));

  // --- Maestros: productos ---
  fastify.get("/comercio/products", { preHandler: read }, (request) => service.listProducts(tenantOf(request), request.query));
  fastify.get("/comercio/products/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getProduct(tenantOf(request), request.params.id));
  fastify.post("/comercio/products", { schema: schema.productCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createProduct(tenantOf(request), userOf(request), request.body)));
  fastify.put("/comercio/products/:id", { schema: schema.productUpdateSchema, preHandler: write }, (request) => service.updateProduct(tenantOf(request), userOf(request), request.params.id, request.body));
  fastify.post("/comercio/products/:id/activate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setProductActive(tenantOf(request), request.params.id, true));
  fastify.post("/comercio/products/:id/deactivate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setProductActive(tenantOf(request), request.params.id, false));
  fastify.post("/comercio/products/:id/adjust-stock", { schema: schema.stockAdjustSchema, preHandler: write }, (request) => service.adjustStock(tenantOf(request), userOf(request), request.params.id, request.body));

  // --- Fotografias de producto (multipart, bucket comercio-assets) ---
  // Sin esquema de body declarado: Fastify no valida multipart con JSON Schema. Los
  // limites angostos van en request.file (el global de 50 MB es del servidor).
  fastify.post("/comercio/products/:id/photo", { schema: { params: schema.idParams }, preHandler: write }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: storage.MAX_BYTES, files: 1, fields: 0, parts: 1 } });
    if (!file) throw Object.assign(new Error("Adjunta una imagen PNG, JPEG o WEBP."), { statusCode: 400 });
    if (file.file.truncated) throw Object.assign(new Error(`La foto supera el limite de ${Math.round(storage.MAX_BYTES / (1024 * 1024))} MB.`), { statusCode: 413 });
    const bytes = await file.toBuffer();
    const saved = await service.attachProductPhoto(tenantOf(request), request.params.id, {
      bytes,
      mime: file.mimetype,
      declaredMime: file.mimetype
    });
    return reply.code(201).send(saved);
  });
  fastify.get("/comercio/products/:id/photo-url", { schema: schema.idParamSchema, preHandler: read }, (request) => service.productPhotoUrl(tenantOf(request), request.params.id));
  fastify.delete("/comercio/products/:id/photo", { schema: schema.idParamSchema, preHandler: write }, (request) => service.detachProductPhoto(tenantOf(request), request.params.id));

  // --- Maestros: clientes ---
  fastify.get("/comercio/customers", { preHandler: read }, (request) => service.listCustomers(tenantOf(request), request.query));
  fastify.post("/comercio/customers", { schema: schema.customerCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createCustomer(tenantOf(request), request.body)));
  fastify.put("/comercio/customers/:id", { schema: schema.customerUpdateSchema, preHandler: write }, (request) => service.updateCustomer(tenantOf(request), request.params.id, request.body));
  fastify.post("/comercio/customers/:id/activate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setCustomerActive(tenantOf(request), request.params.id, true));
  fastify.post("/comercio/customers/:id/deactivate", { schema: schema.idParamSchema, preHandler: write }, (request) => service.setCustomerActive(tenantOf(request), request.params.id, false));

  // --- Ventas ---
  fastify.get("/comercio/sales", { preHandler: read }, (request) => service.listSales(tenantOf(request), request.query));
  fastify.get("/comercio/sales/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getSale(tenantOf(request), request.params.id));
  fastify.post("/comercio/sales", { schema: schema.saleCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createSale(tenantOf(request), userOf(request), request.body)));
  fastify.post("/comercio/sales/:id/void", { schema: schema.voidSchema, preHandler: approve }, (request) => service.voidSale(tenantOf(request), userOf(request), request.params.id, request.body));

  // --- Cartera (creditos y abonos) ---
  fastify.get("/comercio/credits", { preHandler: read }, (request) => service.listCredits(tenantOf(request), request.query));
  fastify.get("/comercio/credits/:id", { schema: schema.idParamSchema, preHandler: read }, (request) => service.getCredit(tenantOf(request), request.params.id));
  fastify.post("/comercio/credits/:id/payments", { schema: schema.paymentSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.addCreditPayment(tenantOf(request), userOf(request), request.params.id, request.body)));

  // --- Compras de mercancia ---
  fastify.get("/comercio/purchases", { preHandler: read }, (request) => service.listPurchases(tenantOf(request), request.query));
  fastify.post("/comercio/purchases", { schema: schema.purchaseCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createPurchase(tenantOf(request), userOf(request), request.body)));

  // --- Gastos operativos ---
  fastify.get("/comercio/expenses", { preHandler: read }, (request) => service.listExpenses(tenantOf(request), request.query));
  fastify.post("/comercio/expenses", { schema: schema.expenseCreateSchema, preHandler: write }, async (request, reply) => reply.code(201).send(await service.createExpense(tenantOf(request), userOf(request), request.body)));
  fastify.put("/comercio/expenses/:id", { schema: schema.expenseUpdateSchema, preHandler: write }, (request) => service.updateExpense(tenantOf(request), request.params.id, request.body));
  fastify.post("/comercio/expenses/:id/void", { schema: schema.idParamSchema, preHandler: approve }, (request) => service.voidExpense(tenantOf(request), request.params.id));

  // --- Movimientos de inventario y reporteria ---
  fastify.get("/comercio/movements", { preHandler: read }, (request) => service.listMovements(tenantOf(request), request.query));
  fastify.get("/comercio/dashboard", { preHandler: read }, (request) => service.dashboard(tenantOf(request)));
  fastify.get("/comercio/reports/summary", { preHandler: read }, (request) => service.reportSummary(tenantOf(request), request.query));
}

module.exports = comercioRoutes;
