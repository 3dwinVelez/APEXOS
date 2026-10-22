const { ensureVehicleCenterTx } = require("./vehicle-accounting");

function fail(code, message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  throw error;
}

function groupSettlementIncome(pkg) {
  if (pkg.currency !== "COP") fail("TMS_ACCOUNTING_CURRENCY", "La contabilizacion de liquidaciones admite COP; no se ha configurado conversion de moneda.");
  const groups = new Map();
  for (const item of pkg.items || []) {
    const customerId = item.metadata?.customer_id;
    const cents = Math.round(Number(item.approved_amount) * 100);
    if (!Number.isInteger(customerId) || customerId <= 0) fail("TMS_ACCOUNTING_CUSTOMER_REQUIRED", "Cada documento de la liquidacion debe identificar su cliente antes de aprobar.");
    if (!Number.isSafeInteger(cents) || cents < 0) fail("TMS_ACCOUNTING_AMOUNT_INVALID", "Los valores aprobados deben ser positivos y validos.");
    const group = groups.get(customerId) || { customer_id: customerId, cents: 0, items: [] };
    group.cents += cents;
    group.items.push(item.id);
    groups.set(customerId, group);
  }
  const total = Math.round(Number(pkg.approved_total) * 100);
  if (!Number.isSafeInteger(total) || total <= 0 || [...groups.values()].reduce((sum, group) => sum + group.cents, 0) !== total) {
    fail("TMS_ACCOUNTING_TOTAL_MISMATCH", "El total aprobado debe corresponder exactamente a los documentos por cliente; revise los ajustes de la liquidacion.");
  }
  return [...groups.values()].filter(group => group.cents > 0);
}

async function postSettlementIncomeTx(tx, tenantId, user, pkg, input, period) {
  const accounting = require("../accounting/service");
  const groups = groupSettlementIncome(pkg);
  const income = await tx.account.findFirst({ where: { tenant_id: String(tenantId), code: String(input.income_account_code || ""), active: true, allows_tx: true, type: "income" } });
  if (!income) fail("TMS_INCOME_ACCOUNT_REQUIRED", "Seleccione una cuenta de ingreso activa y transaccional de la empresa.");
  const receivable = await tx.account.findFirst({ where: { tenant_id: String(tenantId), code: String(input.receivable_account_code || ""), active: true, allows_tx: true } });
  if (!receivable || !accounting.isReceivableAccount(receivable)) fail("TMS_RECEIVABLE_ACCOUNT_REQUIRED", "Seleccione una cuenta por cobrar activa y transaccional de la empresa.");
  const vehicle = await tx.vehicle.findFirst({ where: { tenant_id: String(tenantId), id: Number(pkg.metadata?.vehicle_id || 0) } });
  if (!vehicle) fail("TMS_ACCOUNTING_VEHICLE_REQUIRED", "La liquidacion debe identificar un vehiculo de la empresa.");
  const center = await ensureVehicleCenterTx(tx, tenantId, vehicle, vehicle);
  const postingDate = String(input.posting_date || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate) || Number.isNaN(Date.parse(postingDate)) || postingDate.slice(0, 7) !== period) {
    fail("TMS_ACCOUNTING_DATE_PERIOD", "La fecha de contabilizacion debe pertenecer al periodo asignado a la liquidacion.");
  }
  const documents = [];
  for (const group of groups) {
    const document = await accounting.createReceivableDocumentTx(tx, tenantId, user?.id, {
      document_kind: "invoice", posting_date: postingDate, due_date: input.due_date || postingDate,
      customer_id: group.customer_id, customer_reference: pkg.code,
      header_text: `Liquidacion ${pkg.code} - vehiculo ${vehicle.plate}`,
      society_code: center.society_code, branch_code: center.branch_code, cost_center_code: center.code,
      associated_account_code: receivable.code, subtotal: group.cents / 100, total: group.cents / 100,
      ledger_lines: [{ account_id: income.id, account_code: income.code, debit: 0, credit: group.cents / 100, description: `Ingreso transporte ${pkg.code}` }]
    }, { transportSettlement: true });
    documents.push({ receivable_document_id: document.id, accounting_document_id: document.accounting_document_id, number: document.number, customer_id: group.customer_id, amount: group.cents / 100, item_ids: group.items });
  }
  return { documents, income_account_code: income.code, receivable_account_code: receivable.code, cost_center: center.code, branch_code: center.branch_code, society_code: center.society_code, posting_date: postingDate };
}

async function reverseSettlementIncomeTx(tx, tenantId, user, pkg, reason) {
  const accounting = require("../accounting/service");
  const postings = await tx.transportSettlementAccounting.findMany({ where: { tenant_id: String(tenantId), package_id: pkg.id } });
  const documents = postings.flatMap(row => row.payload?.documents || []);
  if (!documents.length) return []; // Historical packages only recorded an external accounting reference.
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", `${tenantId}:accounting-numbering`);
  const reversed = [];
  for (const link of documents) {
    const original = await tx.cxcCabdoc.findFirst({ where: { tenant_id: String(tenantId), id: link.receivable_document_id }, include: { lines: true } });
    if (!original || original.is_cancelled || Number(original.applied_total) !== 0 || Number(original.balance) !== Number(original.total)) fail("TMS_REVERSAL_RECEIVABLE_APPLIED", "La cartera de la liquidacion tiene aplicaciones o anulaciones. Revise y revierta sus cobros antes de reversar la liquidacion.");
    const postingDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
    const contra = original.lines.filter(line => line.account_id !== original.associated_account_id);
    const note = await accounting.createReceivableDocumentTx(tx, tenantId, user?.id, {
      document_kind: "credit_note", posting_date: postingDate, due_date: postingDate,
      customer_id: original.customer_id, customer_reference: pkg.code, header_text: `Reversion ${pkg.code}: ${reason}`,
      society_code: original.society_code, associated_account_code: original.associated_account_code,
      referenced_document_id: original.id, referenced_accounting_document_id: original.accounting_document_id,
      subtotal: original.total, total: original.total,
      ledger_lines: contra.map(line => ({ account_id: line.account_id, account_code: line.account_code, debit: line.movement === "credit" ? line.amount : 0, credit: line.movement === "debit" ? line.amount : 0, branch_code: line.branch_code, cost_center_code: line.cost_center_code, description: `Reversion ${original.number}` }))
    }, { freshAccounting: true });
    await tx.cxcCabdoc.update({ where: { id: original.id }, data: { is_cancelled: true, status: "cancelled", balance: 0, cancelled_by: user?.id || null, cancelled_at: new Date() } });
    await tx.cntCabdoc.update({ where: { id: original.accounting_document_id }, data: { is_cancelled: true, status: "cancelled", cancelled_by: user?.id || null, cancelled_at: new Date() } });
    reversed.push({ original_number: original.number, number: note.number, receivable_document_id: note.id, accounting_document_id: note.accounting_document_id });
  }
  return reversed;
}

module.exports = { groupSettlementIncome, postSettlementIncomeTx, reverseSettlementIncomeTx };
