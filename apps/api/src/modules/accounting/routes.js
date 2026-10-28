const tenancy = require("../../middleware/tenancy");
const { requirePermission } = require("../../middleware/rbac");
const service = require("./service");
const receivedInvoices = require("./received-invoices/routes");
const pygInteractive = require("./pyg-interactive");
const pygBudget = require("./pyg-budget");
const schema = require("./schema");

async function accountingRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", tenancy);

  fastify.post("/accounting/chart/init", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.initChartOfAccounts(request.user?.tenant_id, request.body.country || "CO"));

  fastify.post("/accounting/chart/tree/preview", {
    schema: schema.chartTreeSchema,
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.previewChartTree(request.user?.tenant_id, request.body.catalog));

  fastify.post("/accounting/chart/tree/apply", {
    schema: schema.chartTreeSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.applyChartTree(request.user?.tenant_id, request.body.catalog));

  fastify.post("/accounting/chart/preview", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => {
    const report = await service.previewDefaultChartTree(request.user?.tenant_id);
    return {
      ...report,
      existing_count: report.existing_count,
      catalog_count: report.total_catalog_entries,
      create_count: report.creates.length,
      link_count: report.repairs.length,
      conflict_count: report.conflicts.length
    };
  });

  fastify.post("/accounting/chart/apply", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.applyDefaultChartTree(request.user?.tenant_id, request.body || {}));

  fastify.get("/accounting/accounts", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listAccounts(request.user?.tenant_id, request.query));

  fastify.post("/accounting/accounts", {
    schema: schema.accountSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.createAccount(request.user?.tenant_id, request.body)));

  fastify.put("/accounting/accounts/:id", {
    schema: schema.accountSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.updateAccount(request.user?.tenant_id, request.params.id, request.body));

  fastify.delete("/accounting/accounts/:id", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.deleteAccount(request.user?.tenant_id, request.params.id));

  fastify.post("/accounting/journal", {
    schema: schema.journalEntrySchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.journalEntry(request.user?.tenant_id, request.body)));

  fastify.get("/accounting/ledger/:account_code", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getLedgerByAccount(request.user?.tenant_id, request.params.account_code, request.query));

  fastify.get("/accounting/balance-sheet", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getBalanceSheet(request.user?.tenant_id, request.query.period || null));

  fastify.get("/accounting/reports/balance-sheet", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getBalanceSheet(request.user?.tenant_id, request.query.period || null));

  fastify.get("/accounting/income-statement", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getIncomeStatement(request.user?.tenant_id, request.query.period));

  fastify.get("/accounting/reports/income-statement", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getIncomeStatement(request.user?.tenant_id, request.query.period));

  fastify.get("/accounting/reports/trial-balance", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getTrialBalance(request.user?.tenant_id, request.query.period || null));

  fastify.get("/accounting/reports/taxes", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getTaxReport(request.user?.tenant_id, request.query.period));

  fastify.get("/accounting/reports/receivables", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAgingReport(request.user?.tenant_id, "receivables"));

  fastify.get("/accounting/reports/payables", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAgingReport(request.user?.tenant_id, "payables"));

  fastify.get("/accounting/periods", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listPeriods(request.user?.tenant_id));

  fastify.patch("/accounting/periods/:period", {
    schema: schema.periodSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.updatePeriod(request.user?.tenant_id, request.user?.id, request.params.period, request.body));

  fastify.get("/accounting/organization-tree", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getOrganizationTree(request.user?.tenant_id));

  fastify.post("/accounting/organization-tree", {
    schema: schema.organizationUnitSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveOrganizationUnit(request.user?.tenant_id, request.body)));

  fastify.delete("/accounting/organization-tree/:type/:code", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.deleteOrganizationUnit(request.user?.tenant_id, request.params.type, request.params.code));

  fastify.get("/accounting/document-masters", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAccountingDocumentMasters(request.user?.tenant_id));

  fastify.post("/accounting/document-masters/types", {
    schema: schema.accountingDocumentTypeSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveAccountingDocumentType(request.user?.tenant_id, request.body)));

  fastify.post("/accounting/document-masters/numbering", {
    schema: schema.accountingNumberingSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveAccountingNumbering(request.user?.tenant_id, request.body)));

  fastify.get("/accounting/vat-masters", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getVatMasters(request.user?.tenant_id, request.query?.scope));

  fastify.post("/accounting/vat-masters", {
    schema: schema.vatMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveVatMaster(request.user?.tenant_id, request.body)));

  fastify.delete("/accounting/vat-masters/:code", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.deleteVatMaster(request.user?.tenant_id, request.params.code, request.query?.scope));

  fastify.get("/accounting/retention-masters", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getRetentionMasters(request.user?.tenant_id, request.query?.scope));

  fastify.post("/accounting/retention-masters", {
    schema: schema.retentionMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveRetentionMaster(
    request.user?.tenant_id,
    request.body
  )));

  fastify.put("/accounting/retention-masters/:id", {
    schema: schema.retentionMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.saveRetentionMaster(request.user?.tenant_id, request.body, request.params.id));

  fastify.delete("/accounting/retention-masters/:code", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.deleteRetentionMaster(request.user?.tenant_id, request.params.code, request.query?.scope));

  fastify.get("/accounting/suppliers/:supplier_id/retentions", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getSupplierRetentions(request.user?.tenant_id, request.params.supplier_id));

  fastify.put("/accounting/suppliers/:supplier_id/retentions", {
    schema: schema.supplierRetentionsSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.saveSupplierRetentions(
    request.user?.tenant_id,
    request.params.supplier_id,
    request.body
  ));

  fastify.get("/accounting/payable-accounts", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listPayableAccounts(request.user?.tenant_id, request.query));

  fastify.get("/accounting/documents", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listAccountingDocuments(request.user?.tenant_id, request.query));

  fastify.get("/accounting/documents/:id", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getAccountingDocument(request.user?.tenant_id, request.params.id));

  fastify.post("/accounting/documents", {
    schema: schema.accountingDocumentSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.createAccountingDocument(request.user?.tenant_id, request.user?.id, request.body)));

  fastify.get("/accounting/payables/documents", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listPayableDocuments(request.user?.tenant_id, request.query));

  fastify.get("/accounting/payables/open-invoices", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listOpenPayableInvoices(request.user?.tenant_id, request.query));

  fastify.get("/accounting/payables/suppliers/:supplier_id/documents", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listSupplierPayableDocuments(request.user?.tenant_id, request.params.supplier_id, request.query));

  fastify.post("/accounting/payables/documents/simulate", {
    schema: schema.payableDocumentSchema,
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.simulatePayableDocument(request.user?.tenant_id, request.body));

  fastify.post("/accounting/payables/documents", {
    schema: schema.payableDocumentSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.createPayableDocument(request.user?.tenant_id, request.user?.id, request.body)));

  fastify.post("/accounting/payables/applications", {
    schema: schema.payableApplicationSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.applyPayableCreditNote(request.user?.tenant_id, request.user?.id, request.body)));

  fastify.get("/accounting/third-party-masters", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.getThirdPartyMasters(request.user?.tenant_id));

  fastify.post("/accounting/third-party-masters/document-types", {
    schema: schema.documentTypeMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveDocumentTypeMaster(request.user?.tenant_id, request.body)));

  fastify.post("/accounting/third-party-masters/locations", {
    schema: schema.daneLocationMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveDaneLocationMaster(request.user?.tenant_id, request.body)));

  fastify.post("/accounting/third-party-masters/supplier-categories", {
    schema: schema.namedMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveSupplierCategoryMaster(request.user?.tenant_id, request.body)));

  fastify.post("/accounting/third-party-masters/payment-terms", {
    schema: schema.namedMasterSchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.savePaymentTermMaster(request.user?.tenant_id, request.body)));

  fastify.get("/accounting/opening-balances/template", {
    preHandler: requirePermission("accounting", "read")
  }, async (request, reply) => {
    const buffer = await service.createOpeningBalancesTemplate();
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="plantilla-saldos-iniciales.xlsx"').send(buffer);
  });

  fastify.post("/accounting/opening-balances/validate", {
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ code: "OPENING_BALANCES_FILE_REQUIRED", message: "Seleccione la plantilla .xlsx" });
    if (!String(file.filename || "").toLowerCase().endsWith(".xlsx")) return reply.code(415).send({ code: "INVALID_OPENING_BALANCES_FORMAT", message: "Solo se admite la plantilla .xlsx" });
    return service.validateOpeningBalancesWorkbook(request.user?.tenant_id, await file.toBuffer());
  });

  fastify.post("/accounting/opening-balances", {
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ code: "OPENING_BALANCES_FILE_REQUIRED", message: "Seleccione la plantilla .xlsx" });
    if (!String(file.filename || "").toLowerCase().endsWith(".xlsx")) return reply.code(415).send({ code: "INVALID_OPENING_BALANCES_FORMAT", message: "Solo se admite la plantilla .xlsx" });
    return reply.code(201).send(await service.postOpeningBalancesWorkbook(request.user?.tenant_id, request.user?.id, await file.toBuffer()));
  });

  fastify.get("/accounting/third-parties", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => service.listThirdParties(request.user?.tenant_id, request.query));

  fastify.post("/accounting/third-parties", {
    schema: schema.thirdPartySchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request, reply) => reply.code(201).send(await service.saveThirdParty(request.user?.tenant_id, request.body)));

  fastify.put("/accounting/third-parties/:id", {
    schema: schema.thirdPartySchema,
    preHandler: requirePermission("accounting", "write")
  }, async (request) => service.saveThirdParty(request.user?.tenant_id, request.body, request.params.id));

  fastify.get("/accounting/reports/pyg-interactive", {
    preHandler: requirePermission("accounting", "read")
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return pygInteractive.getInteractivePyg(request.user?.tenant_id, request.query);
  });

  fastify.get("/accounting/reports/pyg-interactive/budgets", {
    preHandler: requirePermission("accounting", "read")
  }, async (request) => pygBudget.getPygBudgets(request.user?.tenant_id, request.query));

  fastify.put("/accounting/reports/pyg-interactive/budgets", {
    preHandler: requirePermission("accounting", "write")
  }, async (request) => pygBudget.savePygBudgets(request.user?.tenant_id, request.user?.id, request.body));

  await receivedInvoices(fastify);
}

module.exports = accountingRoutes;
