const { requirePermission } = require("../../../middleware/rbac");
const { appError } = require("./errors");
const service = require("./service");
const mailbox = require("./mailbox");
const schema = require("./schema");

const BASE = "/accounting/received-invoices";
const read = { preHandler: requirePermission("accounting", "read") };
const write = { preHandler: requirePermission("accounting", "write") };
const approve = { preHandler: requirePermission("accounting", "approve") };

async function receivedInvoiceRoutes(fastify) {
  fastify.get(BASE, { ...read, schema: { querystring: schema.listQuery } }, async (request) => (
    request.runWithTenant(() => service.listInvoices(request.query, request.user?.tenant_id))
  ));

  fastify.get(`${BASE}/summary`, { ...read, schema: { querystring: schema.listQuery } }, async (request) => (
    request.runWithTenant(() => service.summary(request.query))
  ));

  fastify.get(`${BASE}/responsibles`, { ...read, schema: { querystring: schema.responsiblesQuery } }, async (request) => (
    request.runWithTenant(() => service.listResponsibles(request.query))
  ));

  fastify.get(`${BASE}/emails`, { ...read, schema: { querystring: schema.emailsQuery } }, async (request) => (
    request.runWithTenant(() => service.listEmails(request.query))
  ));

  fastify.get(`${BASE}/errors`, { ...read, schema: { querystring: schema.errorsQuery } }, async (request) => (
    request.runWithTenant(() => service.listErrors(request.query))
  ));

  fastify.post(`${BASE}/errors/:id/resolve`, { ...write, schema: { params: schema.idParams, body: schema.errorResolveBody } }, async (request) => (
    request.runWithTenant(() => service.resolveError(request.params.id, request.user, request.body || {}))
  ));

  fastify.get(`${BASE}/history`, { ...read, schema: { querystring: schema.historyQuery } }, async (request) => (
    request.runWithTenant(() => service.recentHistory(request.query))
  ));

  fastify.get(`${BASE}/mail-config`, read, async (request) => request.runWithTenant(() => mailbox.getMailConfig()));

  fastify.put(`${BASE}/mail-config`, { ...write, schema: { body: schema.mailConfigBody } }, async (request) => {
    await request.runWithTenant(() => mailbox.saveMailConfig(request.body || {}));
    return request.runWithTenant(() => mailbox.getMailConfig());
  });

  fastify.post(`${BASE}/mail-config/test`, write, async (request) => {
    const config = await request.runWithTenant(() => mailbox.getMailConfig());
    if (!config.configured) throw appError("Guarda el buzon IMAP antes de probar la conexion.", "INVOICE_MAIL_NOT_CONFIGURED", 422);
    return mailbox.connectionStatus(config);
  });

  fastify.post(`${BASE}/mail-config/sync`, { ...write, schema: { body: schema.mailSyncBody } }, async (request) => (
    mailbox.syncMailbox({ tenantId: request.user?.tenant_id, limit: request.body?.limit || 20 })
  ));

  fastify.post(`${BASE}/upload`, write, async (request, reply) => {
    const file = await request.file();
    if (!file) throw appError("Selecciona un archivo ZIP con las facturas.", "ZIP_REQUIRED", 400);
    const name = String(file.filename || "facturas.zip");
    if (!name.toLowerCase().endsWith(".zip") && String(file.mimetype || "") !== "application/zip") {
      throw appError("El archivo debe ser un ZIP.", "ZIP_NO_ES_ZIP", 415);
    }
    const buffer = await file.toBuffer();
    const result = await request.runWithTenant(() => service.uploadArchive(request.user?.tenant_id, name, buffer));
    if (result.duplicate) return reply.code(200).send(result);
    return reply.code(201).send(result);
  });

  fastify.get(`${BASE}/:id`, { ...read, schema: { params: schema.idParams } }, async (request) => (
    request.runWithTenant(() => service.getInvoice(request.params.id))
  ));

  fastify.get(`${BASE}/:id/documents/:documentId/file`, { ...read, schema: { params: schema.documentParams } }, async (request, reply) => {
    const file = await request.runWithTenant(() => service.getDocumentFile(request.params.id, request.params.documentId));
    const safeName = String(file.document.file_name || "documento").replace(/["\\\r\n]/g, "_");
    return reply
      .type(file.mime_type)
      .header("Content-Disposition", `inline; filename="${safeName}"`)
      .header("Cache-Control", "private, no-store")
      .send(file.bytes);
  });

  fastify.patch(`${BASE}/:id`, { ...write, schema: { params: schema.idParams, body: schema.updateBody } }, async (request) => (
    request.runWithTenant(() => service.updateAdministrative(request.params.id, request.user, request.body || {}))
  ));

  fastify.post(`${BASE}/:id/assign`, { ...write, schema: { params: schema.idParams, body: schema.assignBody } }, async (request) => (
    request.runWithTenant(() => service.assignInvoice(request.params.id, request.user, request.body || {}))
  ));

  fastify.post(`${BASE}/:id/approve`, { ...approve, schema: { params: schema.idParams, body: schema.approveBody } }, async (request) => (
    request.runWithTenant(() => service.approveInvoice(request.params.id, request.user, request.body || {}))
  ));

  fastify.post(`${BASE}/:id/return`, { ...approve, schema: { params: schema.idParams, body: schema.returnBody } }, async (request) => (
    request.runWithTenant(() => service.returnInvoice(request.params.id, request.user, request.body || {}))
  ));

  fastify.post(`${BASE}/:id/review`, { ...write, schema: { params: schema.idParams, body: schema.reviewBody } }, async (request) => (
    request.runWithTenant(() => service.resolveReview(request.params.id, request.user, request.body || {}))
  ));

  fastify.post(`${BASE}/:id/reprocess`, { ...write, schema: { params: schema.idParams } }, async (request) => (
    request.runWithTenant(() => service.reprocessInvoice(request.params.id, request.user))
  ));
}

module.exports = receivedInvoiceRoutes;
