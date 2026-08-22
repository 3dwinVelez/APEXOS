const prisma = require("../../core/prisma");
const accountingService = require("../accounting/service");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function listDocuments(tenantId, query = {}) {
  return accountingService.listReceivableDocuments(tenantId, query);
}

async function getDocument(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const doc = await prisma.cxcCabdoc.findFirst({
      where: { id: Number(id), tenant_id: tenantId },
      include: {
        lines: { orderBy: { line_no: "asc" } },
        payments: { orderBy: { date: "desc" } }
      }
    });
    if (!doc) throw appError(404, "CXC_NOT_FOUND", "Documento CxC no encontrado");
    return doc;
  });
}

async function getCustomerStatement(tenantId, customerId) {
  return accountingService.getCustomerStatement(tenantId, Number(customerId));
}

async function getCustomerBalance(tenantId, customerId) {
  return prisma.runWithTenant(tenantId, async () => {
    const customer = await prisma.party.findFirst({ where: { id: Number(customerId), type: "customer" } });
    if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");

    const invoices = await prisma.cxcCabdoc.findMany({
      where: { customer_id: customer.id, document_kind: "invoice", balance: { gt: 0.01 } },
      orderBy: [{ due_date: "asc" }, { id: "asc" }]
    });

    const totalBalance = round(invoices.reduce((s, i) => s + i.balance, 0));
    const overdueInvoices = invoices.filter((i) => new Date(i.due_date) < new Date());
    const overdueBalance = round(overdueInvoices.reduce((s, i) => s + i.balance, 0));

    return {
      customer: { id: customer.id, name: customer.legal_name || customer.name, tax_id: customer.tax_id },
      balance: customer.balance,
      total_open: totalBalance,
      overdue_balance: overdueBalance,
      overdue_count: overdueInvoices.length,
      open_count: invoices.length,
      credit_limit: customer.credit_limit,
      available_credit: round((customer.credit_limit || 0) - customer.balance)
    };
  });
}

async function registerPayment(tenantId, userId, data) {
  const { customer_id, cabdoc_ids = [], amount, method, date, reference, notes, account_id } = data;
  if (!customer_id) throw appError(400, "REQUIRED_CUSTOMER", "El cliente es obligatorio");

  const customer = await prisma.party.findFirst({ where: { id: Number(customer_id), type: "customer" } });
  if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");

  return accountingService.registerPaymentReceivable(tenantId, userId, {
    customer_id: Number(customer_id),
    cabdoc_ids,
    amount: Number(amount),
    method: String(method),
    date: date ? new Date(date) : new Date(),
    reference: String(reference || ""),
    notes: String(notes || ""),
    account_id: account_id ? Number(account_id) : null
  });
}

async function getAgingReport(tenantId, query = {}) {
  return accountingService.getAgingReceivablesReport(tenantId, query);
}

// Retention Master CRUD
async function listRetentions(tenantId) {
  return accountingService.getRetentionMasters(tenantId);
}

async function createRetention(tenantId, data) {
  return accountingService.saveRetentionMaster(tenantId, data);
}

async function updateRetention(tenantId, id, data) {
  return accountingService.saveRetentionMaster(tenantId, data, id);
}

async function initializeRetentions(tenantId) {
  return accountingService.initializeRetentionMasters(tenantId);
}

module.exports = {
  listDocuments,
  getDocument,
  getCustomerStatement,
  getCustomerBalance,
  registerPayment,
  getAgingReport,
  listRetentions,
  createRetention,
  updateRetention,
  initializeRetentions
};
