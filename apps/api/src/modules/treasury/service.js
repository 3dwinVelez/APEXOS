const prisma = require("../../core/prisma");
const accounting = require("../accounting/service");
const { partyRoleWhere } = require("../parties/roles");

const TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function normalize(value) { return String(value || "").trim().toUpperCase(); }
function directionConfig(direction) {
  if (direction === "receipt") return { role: "customer", sourceType: "cxc", model: "cxcCabdoc", docType: "CI", partyField: "customer_id", balanceField: "receivable_balance" };
  if (direction === "disbursement") return { role: "supplier", sourceType: "cxp", model: "cxpCabdoc", docType: "CE", partyField: "supplier_id", balanceField: "payable_balance" };
  throw appError(400, "INVALID_PAYMENT_DIRECTION", "Selecciona recaudo de cliente o pago a proveedor");
}

function prepareApplications(sources, requested) {
  return sources.map((source) => {
    const amount = round(requested.get(source.id));
    if (amount <= 0) throw appError(400, "INVALID_APPLICATION", "Cada partida debe tener importe mayor a cero");
    if (amount - Number(source.balance) > 0.001) throw appError(422, "PAYMENT_EXCEEDS_INVOICE_BALANCE", `El pago de ${source.number} supera su saldo actual`);
    return { source, amount, after: round(source.balance - amount) };
  });
}

async function listBanks(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, () => prisma.treasuryBank.findMany({
    where: String(query.include_inactive) === "true" ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }]
  }));
}

async function saveBank(tenantId, userId, data, id = null) {
  const code = normalize(data.code);
  const name = String(data.name || "").trim();
  if (!code || !name) throw appError(400, "REQUIRED_BANK_FIELDS", "Codigo y nombre del banco son obligatorios");
  return prisma.runWithTenant(tenantId, async () => {
    const account = await prisma.account.findFirst({ where: { id: Number(data.account_id), active: true, allows_tx: true, type: "asset", code: { startsWith: "11" } } });
    if (!account) throw appError(422, "BANK_ACCOUNT_NOT_FOUND", "La cuenta contable no existe, esta inactiva o no permite movimientos");
    const duplicate = await prisma.treasuryBank.findFirst({ where: { code, ...(id ? { id: { not: Number(id) } } : {}) } });
    if (duplicate) throw appError(409, "BANK_CODE_EXISTS", `Ya existe el banco ${code}`);
    const payload = { code, name, account_id: account.id, account_code: account.code, active: data.active !== false };
    if (id) {
      const current = await prisma.treasuryBank.findFirst({ where: { id: Number(id) } });
      if (!current) throw appError(404, "BANK_NOT_FOUND", "Banco no encontrado");
      return prisma.treasuryBank.update({ where: { id: current.id }, data: payload });
    }
    return prisma.treasuryBank.create({ data: { ...payload, created_by: userId || null } });
  });
}

async function listOpenItems(tenantId, query = {}) {
  const config = directionConfig(String(query.direction));
  const partyId = Number(query.party_id);
  if (!partyId) throw appError(400, "REQUIRED_PARTY", "Selecciona cliente o proveedor");
  return prisma.runWithTenant(tenantId, async () => {
    const party = await prisma.party.findFirst({ where: { id: partyId, active: true, AND: [partyRoleWhere(config.role)] } });
    if (!party) throw appError(404, "PARTY_NOT_FOUND", "El tercero no existe, esta inactivo o no tiene el rol requerido");
    const rows = await prisma[config.model].findMany({
      where: { [config.partyField]: partyId, document_kind: "invoice", balance: { gt: 0.01 } },
      orderBy: [{ due_date: "asc" }, { id: "asc" }],
      take: 500
    });
    return { party: { id: party.id, name: party.legal_name || party.name, tax_id: party.tax_id }, items: rows };
  });
}

function numberingFromConfig(config, documentType) {
  const rows = Array.isArray(config?.accounting?.accounting_numbering) ? config.accounting.accounting_numbering : [];
  const row = rows.find((item) => normalize(item.document_type) === documentType && item.active !== false);
  return { row, number: Number(row?.next_number || 1), prefix: normalize(row?.prefix || documentType) };
}

function nextAccountingConfig(config, documentType, prefix, nextNumber, source) {
  const current = Array.isArray(config?.accounting?.accounting_numbering) ? config.accounting.accounting_numbering : [];
  const numbering = [...current.filter((item) => normalize(item.document_type) !== documentType), { document_type: documentType, prefix, next_number: nextNumber, active: true, source: source || "Sistema" }];
  return { ...config, accounting: { ...(config.accounting || {}), accounting_numbering: numbering } };
}

async function createPayment(tenantId, userId, data) {
  const config = directionConfig(data.direction);
  const postingDate = new Date(data.posting_date);
  if (Number.isNaN(postingDate.getTime())) throw appError(400, "INVALID_POSTING_DATE", "Fecha de contabilizacion invalida");
  await accounting.assertPeriodOpen(tenantId, postingDate);
  const requested = new Map();
  for (const row of data.applications || []) {
    const sourceId = Number(row.source_id);
    const amount = round(row.amount);
    if (!sourceId || amount <= 0) throw appError(400, "INVALID_APPLICATION", "Cada partida debe tener documento e importe mayor a cero");
    if (requested.has(sourceId)) throw appError(409, "DUPLICATE_APPLICATION", "No repitas una factura dentro del mismo pago");
    requested.set(sourceId, amount);
  }
  if (!requested.size) throw appError(400, "EMPTY_PAYMENT", "Selecciona al menos una factura");

  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const [party, bank, tenant, sources] = await Promise.all([
      tx.party.findFirst({ where: { id: Number(data.party_id), active: true, AND: [partyRoleWhere(config.role)] } }),
      tx.treasuryBank.findFirst({ where: { id: Number(data.bank_id), active: true } }),
      tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } }),
      tx[config.model].findMany({ where: { id: { in: [...requested.keys()] }, [config.partyField]: Number(data.party_id), document_kind: "invoice", balance: { gt: 0.01 } }, include: { lines: { orderBy: { line_no: "asc" } } } })
    ]);
    if (!party) throw appError(404, "PARTY_NOT_FOUND", "Cliente o proveedor no encontrado para el pago");
    if (!bank) throw appError(404, "BANK_NOT_FOUND", "Banco no encontrado o inactivo");
    if (sources.length !== requested.size) throw appError(409, "OPEN_ITEMS_CHANGED", "Una o mas facturas ya no tienen saldo o no pertenecen al tercero");
    const societies = [...new Set(sources.map((row) => row.society_code))];
    if (societies.length !== 1) throw appError(422, "MULTIPLE_SOCIETIES", "Un pago no puede mezclar facturas de sociedades diferentes");
    const bankAccount = await tx.account.findFirst({ where: { id: bank.account_id, code: bank.account_code, active: true, allows_tx: true } });
    if (!bankAccount) throw appError(422, "BANK_ACCOUNT_NOT_FOUND", "La cuenta contable del banco ya no esta disponible");

    const applications = prepareApplications(sources, requested);
    const total = round(applications.reduce((sum, row) => sum + row.amount, 0));
    const tenantConfig = tenant?.config || {};
    const numbering = numberingFromConfig(tenantConfig, config.docType);
    const fullNumber = `${numbering.prefix}-${String(numbering.number).padStart(6, "0")}`;
    const description = `${config.docType} ${fullNumber} - ${party.legal_name || party.name}`;

    const cnt = await tx.cntCabdoc.create({ data: {
      document_type: config.docType, document_number: numbering.number, full_number: fullNumber,
      posting_date: postingDate, reference: String(data.reference || "").trim() || null,
      header_text: description, society_code: societies[0], total_debit: total, total_credit: total, created_by: userId || null
    } });
    const payment = await tx.treasuryPayment.create({ data: {
      direction: data.direction, document_type: config.docType, document_number: numbering.number, number: fullNumber,
      posting_date: postingDate, party_id: party.id, party_tax_id: party.tax_id || null, bank_id: bank.id,
      society_code: societies[0], amount: total, reference: String(data.reference || "").trim() || null,
      notes: String(data.notes || "").trim() || null, accounting_document_id: cnt.id, created_by: userId || null
    } });

    const bankDebit = data.direction === "receipt" ? total : 0;
    const bankCredit = data.direction === "disbursement" ? total : 0;
    const firstLine = applications[0].source.lines[0];
    const bankLedger = await tx.ledgerEntry.create({ data: { account_id: bankAccount.id, transaction_id: null, date: postingDate, debit: bankDebit, credit: bankCredit, balance: 0, description, period: accounting.periodFromDate(postingDate) } });
    await tx.cntCuedoc.create({ data: { cabdoc_id: cnt.id, line_no: 1, account_id: bankAccount.id, account_code: bankAccount.code, branch_code: firstLine?.branch_code || societies[0], cost_center_code: firstLine?.cost_center_code || societies[0], party_id: party.id, party_tax_id: party.tax_id || null, movement: bankDebit ? "debit" : "credit", debit: bankDebit, credit: bankCredit, description, ledger_entry_id: bankLedger.id } });

    let lineNo = 2;
    for (const row of applications) {
      const sourceAccount = await tx.account.findFirst({ where: { id: row.source.associated_account_id, active: true, allows_tx: true } });
      if (!sourceAccount) throw appError(422, "ASSOCIATED_ACCOUNT_NOT_FOUND", `La cuenta asociada de ${row.source.number} no esta disponible`);
      const debit = data.direction === "disbursement" ? row.amount : 0;
      const credit = data.direction === "receipt" ? row.amount : 0;
      const sourceLine = row.source.lines[0];
      const ledger = await tx.ledgerEntry.create({ data: { account_id: sourceAccount.id, transaction_id: null, date: postingDate, debit, credit, balance: 0, description: `${description} / ${row.source.number}`, period: accounting.periodFromDate(postingDate) } });
      await tx.cntCuedoc.create({ data: { cabdoc_id: cnt.id, line_no: lineNo++, account_id: sourceAccount.id, account_code: sourceAccount.code, branch_code: sourceLine?.branch_code || societies[0], cost_center_code: sourceLine?.cost_center_code || societies[0], party_id: party.id, party_tax_id: party.tax_id || null, movement: debit ? "debit" : "credit", debit, credit, description: `${description} / ${row.source.number}`, ledger_entry_id: ledger.id } });
      const updated = await tx[config.model].updateMany({ where: { id: row.source.id, balance: row.source.balance }, data: { balance: { decrement: row.amount }, applied_total: { increment: row.amount }, status: row.after <= 0.01 ? "cleared" : "open" } });
      if (updated.count !== 1) throw appError(409, "INVOICE_BALANCE_CHANGED", `El saldo de ${row.source.number} cambio durante el pago`);
      await tx.treasuryPaymentApplication.create({ data: { payment_id: payment.id, source_type: config.sourceType, source_id: row.source.id, source_number: row.source.number, amount: row.amount, balance_before: row.source.balance, balance_after: row.after } });
    }
    const partyUpdated = await tx.party.updateMany({ where: { id: party.id, [config.balanceField]: { gte: total } }, data: { [config.balanceField]: { decrement: total } } });
    if (partyUpdated.count !== 1) throw appError(409, "PARTY_BALANCE_CHANGED", "El saldo global del tercero cambio; recarga las partidas antes de pagar");
    await tx.tenant.update({ where: { id: tenantId }, data: { config: nextAccountingConfig(tenantConfig, config.docType, numbering.prefix, numbering.number + 1, numbering.row?.source) } });
    return getPaymentTx(tx, payment.id);
  }, TX_OPTIONS));
}

async function getPaymentTx(tx, id) {
  const payment = await tx.treasuryPayment.findFirst({ where: { id: Number(id) }, include: { bank: true, applications: { orderBy: { id: "asc" } } } });
  if (!payment) throw appError(404, "PAYMENT_NOT_FOUND", "Pago no encontrado");
  const [party, accountingDocument, reversalDocument, users] = await Promise.all([
    tx.party.findFirst({ where: { id: payment.party_id }, select: { id: true, name: true, legal_name: true, tax_id: true } }),
    tx.cntCabdoc.findFirst({ where: { id: payment.accounting_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } }),
    payment.reversal_accounting_document_id ? tx.cntCabdoc.findFirst({ where: { id: payment.reversal_accounting_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } }) : null,
    tx.user.findMany({ where: { id: { in: [payment.created_by, payment.cancelled_by].filter(Boolean) } }, select: { id: true, name: true, email: true } })
  ]);
  return { ...payment, party, accounting_document: accountingDocument, reversal_accounting_document: reversalDocument, created_by_user: users.find((row) => row.id === payment.created_by) || null, cancelled_by_user: users.find((row) => row.id === payment.cancelled_by) || null };
}

async function getPayment(tenantId, id) { return prisma.runWithTenant(tenantId, () => getPaymentTx(prisma, id)); }

async function listPayments(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {
      ...(query.direction ? { direction: String(query.direction) } : {}),
      ...(query.party_id ? { party_id: Number(query.party_id) } : {}),
      ...(query.bank_id ? { bank_id: Number(query.bank_id) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
      ...((query.date_from || query.date_to) ? { posting_date: { ...(query.date_from ? { gte: new Date(query.date_from) } : {}), ...(query.date_to ? { lte: new Date(`${query.date_to}T23:59:59.999`) } : {}) } } : {})
    };
    const rows = await prisma.treasuryPayment.findMany({ where, include: { bank: true, applications: true }, orderBy: [{ posting_date: "desc" }, { id: "desc" }], take: Math.min(Number(query.limit || 500), 1000) });
    const parties = await prisma.party.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.party_id))] } }, select: { id: true, name: true, legal_name: true, tax_id: true } });
    const partyById = new Map(parties.map((row) => [row.id, row]));
    return rows.map((row) => ({ ...row, party: partyById.get(row.party_id) || null }));
  });
}

async function cancelPayment(tenantId, userId, id) {
  const postingDate = new Date();
  await accounting.assertPeriodOpen(tenantId, postingDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const payment = await tx.treasuryPayment.findFirst({ where: { id: Number(id), status: "posted" }, include: { applications: true } });
    if (!payment) throw appError(404, "PAYMENT_NOT_FOUND", "Pago no encontrado o ya anulado");
    const config = directionConfig(payment.direction);
    const [original, tenant] = await Promise.all([
      tx.cntCabdoc.findFirst({ where: { id: payment.accounting_document_id, is_cancelled: false }, include: { lines: { orderBy: { line_no: "asc" } } } }),
      tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
    ]);
    if (!original) throw appError(422, "ACCOUNTING_TRACE_NOT_FOUND", "No se encontro el asiento original vigente");
    const tenantConfig = tenant?.config || {};
    const numbering = numberingFromConfig(tenantConfig, payment.document_type);
    const fullNumber = `${numbering.prefix}-${String(numbering.number).padStart(6, "0")}`;
    const reversal = await tx.cntCabdoc.create({ data: { document_type: payment.document_type, document_number: numbering.number, full_number: fullNumber, posting_date: postingDate, reference: payment.number, header_text: `Reversion ${payment.number}`, society_code: payment.society_code, total_debit: payment.amount, total_credit: payment.amount, referenced_document_id: original.id, is_reversal: true, created_by: userId || null } });
    let lineNo = 1;
    for (const line of original.lines) {
      const ledger = await tx.ledgerEntry.create({ data: { account_id: line.account_id, transaction_id: null, date: postingDate, debit: line.credit, credit: line.debit, balance: 0, description: `Reversion ${payment.number}`, period: accounting.periodFromDate(postingDate) } });
      await tx.cntCuedoc.create({ data: { cabdoc_id: reversal.id, line_no: lineNo++, account_id: line.account_id, account_code: line.account_code, branch_code: line.branch_code, cost_center_code: line.cost_center_code, party_id: line.party_id, party_tax_id: line.party_tax_id, movement: line.credit > 0 ? "debit" : "credit", debit: line.credit, credit: line.debit, description: `Reversion ${payment.number}`, ledger_entry_id: ledger.id } });
    }
    for (const application of payment.applications) {
      const reopened = await tx[config.model].updateMany({ where: {
        id: application.source_id,
        applied_total: { gte: application.amount },
        ...(config.sourceType === "cxc" ? { is_cancelled: false } : { status: { in: ["open", "cleared"] } })
      }, data: { balance: { increment: application.amount }, applied_total: { decrement: application.amount }, status: "open" } });
      if (reopened.count !== 1) throw appError(409, "SOURCE_DOCUMENT_CHANGED", `No se puede reabrir ${application.source_number}; el documento cambio despues del pago`);
    }
    await tx.party.update({ where: { id: payment.party_id }, data: { [config.balanceField]: { increment: payment.amount } } });
    await tx.cntCabdoc.update({ where: { id: original.id }, data: { is_cancelled: true, cancelled_by: userId || null, cancelled_at: postingDate } });
    await tx.treasuryPayment.update({ where: { id: payment.id }, data: { status: "cancelled", reversal_accounting_document_id: reversal.id, cancelled_by: userId || null, cancelled_at: postingDate } });
    await tx.tenant.update({ where: { id: tenantId }, data: { config: nextAccountingConfig(tenantConfig, payment.document_type, numbering.prefix, numbering.number + 1, numbering.row?.source) } });
    return getPaymentTx(tx, payment.id);
  }, TX_OPTIONS));
}

function advanceConfig(direction) {
  if (direction === "customer") return { role: "customer", docType: "AC", sourceType: "cxc", model: "cxcCabdoc", partyField: "customer_id", balanceField: "receivable_balance", accountType: "liability" };
  if (direction === "supplier") return { role: "supplier", docType: "AP", sourceType: "cxp", model: "cxpCabdoc", partyField: "supplier_id", balanceField: "payable_balance", accountType: "asset" };
  throw appError(400, "INVALID_ADVANCE_DIRECTION", "Selecciona anticipo de cliente o a proveedor");
}

async function createAdvance(tenantId, userId, data) {
  const cfg = advanceConfig(data.direction);
  const postingDate = new Date(data.posting_date);
  const amount = round(data.amount);
  if (Number.isNaN(postingDate.getTime()) || amount <= 0) throw appError(400, "INVALID_ADVANCE", "Fecha e importe del anticipo son obligatorios");
  await accounting.assertPeriodOpen(tenantId, postingDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const [party, bank, advanceAccount, tenant] = await Promise.all([
      tx.party.findFirst({ where: { id: Number(data.party_id), active: true, AND: [partyRoleWhere(cfg.role)] } }),
      tx.treasuryBank.findFirst({ where: { id: Number(data.bank_id), active: true } }),
      tx.account.findFirst({ where: { id: Number(data.account_id), active: true, allows_tx: true, type: cfg.accountType } }),
      tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
    ]);
    if (!party) throw appError(404, "PARTY_NOT_FOUND", "Tercero no encontrado para el anticipo");
    if (!bank) throw appError(404, "BANK_NOT_FOUND", "Banco no encontrado o inactivo");
    if (!advanceAccount) throw appError(422, "ADVANCE_ACCOUNT_NOT_FOUND", "La cuenta de anticipos no existe, esta inactiva o tiene naturaleza incorrecta");
    const bankAccount = await tx.account.findFirst({ where: { id: bank.account_id, active: true, allows_tx: true } });
    if (!bankAccount) throw appError(422, "BANK_ACCOUNT_NOT_FOUND", "Cuenta bancaria no disponible");
    const tenantConfig = tenant?.config || {};
    const numbering = numberingFromConfig(tenantConfig, cfg.docType);
    const number = `${numbering.prefix}-${String(numbering.number).padStart(6, "0")}`;
    const description = `${cfg.docType} ${number} - ${party.legal_name || party.name}`;
    const bankDebit = data.direction === "customer" ? amount : 0;
    const advanceDebit = data.direction === "supplier" ? amount : 0;
    const cnt = await tx.cntCabdoc.create({ data: { document_type: cfg.docType, document_number: numbering.number, full_number: number, posting_date: postingDate, reference: String(data.reference || "").trim() || null, header_text: description, society_code: normalize(data.society_code), total_debit: amount, total_credit: amount, created_by: userId || null } });
    for (const [index, line] of [{ account: bankAccount, debit: bankDebit, credit: amount - bankDebit }, { account: advanceAccount, debit: advanceDebit, credit: amount - advanceDebit }].entries()) {
      const ledger = await tx.ledgerEntry.create({ data: { account_id: line.account.id, transaction_id: null, date: postingDate, debit: line.debit, credit: line.credit, balance: 0, description, period: accounting.periodFromDate(postingDate) } });
      await tx.cntCuedoc.create({ data: { cabdoc_id: cnt.id, line_no: index + 1, account_id: line.account.id, account_code: line.account.code, branch_code: normalize(data.society_code), cost_center_code: normalize(data.society_code), party_id: party.id, party_tax_id: party.tax_id || null, movement: line.debit ? "debit" : "credit", debit: line.debit, credit: line.credit, description, ledger_entry_id: ledger.id } });
    }
    const advance = await tx.treasuryAdvance.create({ data: { direction: data.direction, document_type: cfg.docType, document_number: numbering.number, number, posting_date: postingDate, party_id: party.id, party_tax_id: party.tax_id || null, bank_id: bank.id, society_code: normalize(data.society_code), account_id: advanceAccount.id, account_code: advanceAccount.code, original_amount: amount, balance: amount, reference: String(data.reference || "").trim() || null, notes: String(data.notes || "").trim() || null, accounting_document_id: cnt.id, created_by: userId || null } });
    await tx.tenant.update({ where: { id: tenantId }, data: { config: nextAccountingConfig(tenantConfig, cfg.docType, numbering.prefix, numbering.number + 1, numbering.row?.source) } });
    return advance;
  }, TX_OPTIONS));
}

async function listAdvances(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = { ...(query.direction ? { direction: String(query.direction) } : {}), ...(query.party_id ? { party_id: Number(query.party_id) } : {}), ...(query.status ? { status: String(query.status) } : {}) };
    const rows = await prisma.treasuryAdvance.findMany({ where, include: { bank: true, applications: { orderBy: { id: "desc" } } }, orderBy: [{ posting_date: "desc" }, { id: "desc" }] });
    const parties = await prisma.party.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.party_id))] } }, select: { id: true, name: true, legal_name: true, tax_id: true } });
    const byId = new Map(parties.map((row) => [row.id, row]));
    return rows.map((row) => ({ ...row, party: byId.get(row.party_id) || null }));
  });
}

async function applyAdvance(tenantId, userId, id, data) {
  const postingDate = new Date(data.posting_date);
  const amount = round(data.amount);
  if (Number.isNaN(postingDate.getTime()) || amount <= 0) throw appError(400, "INVALID_ADVANCE_APPLICATION", "Fecha e importe son obligatorios");
  await accounting.assertPeriodOpen(tenantId, postingDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const advance = await tx.treasuryAdvance.findFirst({ where: { id: Number(id), status: { in: ["open", "partial"] }, balance: { gte: amount } } });
    if (!advance) throw appError(409, "ADVANCE_BALANCE_CHANGED", "El anticipo no existe o su saldo es insuficiente");
    const cfg = advanceConfig(advance.direction);
    const source = await tx[cfg.model].findFirst({ where: { id: Number(data.source_id), [cfg.partyField]: advance.party_id, society_code: advance.society_code, document_kind: "invoice", balance: { gte: amount } }, include: { lines: { orderBy: { line_no: "asc" } } } });
    if (!source) throw appError(409, "OPEN_ITEM_CHANGED", "La factura no pertenece al tercero/sociedad o su saldo es insuficiente");
    const [tenant, advanceAccount, sourceAccount] = await Promise.all([tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } }), tx.account.findFirst({ where: { id: advance.account_id, active: true, allows_tx: true } }), tx.account.findFirst({ where: { id: source.associated_account_id, active: true, allows_tx: true } })]);
    if (!advanceAccount || !sourceAccount) throw appError(422, "APPLICATION_ACCOUNT_NOT_FOUND", "Cuenta de anticipo o cuenta asociada no disponible");
    const numbering = numberingFromConfig(tenant?.config || {}, cfg.docType);
    const number = `${numbering.prefix}-${String(numbering.number).padStart(6, "0")}`;
    const description = `Cruce ${advance.number} / ${source.number}`;
    const cnt = await tx.cntCabdoc.create({ data: { document_type: cfg.docType, document_number: numbering.number, full_number: number, posting_date: postingDate, reference: advance.number, header_text: description, society_code: advance.society_code, total_debit: amount, total_credit: amount, created_by: userId || null } });
    const lines = advance.direction === "customer" ? [{ account: advanceAccount, debit: amount, credit: 0 }, { account: sourceAccount, debit: 0, credit: amount }] : [{ account: sourceAccount, debit: amount, credit: 0 }, { account: advanceAccount, debit: 0, credit: amount }];
    for (const [index, line] of lines.entries()) { const ledger = await tx.ledgerEntry.create({ data: { account_id: line.account.id, transaction_id: null, date: postingDate, debit: line.debit, credit: line.credit, balance: 0, description, period: accounting.periodFromDate(postingDate) } }); await tx.cntCuedoc.create({ data: { cabdoc_id: cnt.id, line_no: index + 1, account_id: line.account.id, account_code: line.account.code, branch_code: source.lines[0]?.branch_code || advance.society_code, cost_center_code: source.lines[0]?.cost_center_code || advance.society_code, party_id: advance.party_id, party_tax_id: advance.party_tax_id, movement: line.debit ? "debit" : "credit", debit: line.debit, credit: line.credit, description, ledger_entry_id: ledger.id } }); }
    const sourceAfter = round(source.balance - amount); const advanceAfter = round(advance.balance - amount);
    if ((await tx[cfg.model].updateMany({ where: { id: source.id, balance: source.balance }, data: { balance: { decrement: amount }, applied_total: { increment: amount }, status: sourceAfter <= 0.01 ? "cleared" : "open" } })).count !== 1) throw appError(409, "INVOICE_BALANCE_CHANGED", "El saldo de la factura cambio durante el cruce");
    if ((await tx.treasuryAdvance.updateMany({ where: { id: advance.id, balance: advance.balance }, data: { balance: { decrement: amount }, applied_amount: { increment: amount }, status: advanceAfter <= 0.01 ? "cleared" : "partial" } })).count !== 1) throw appError(409, "ADVANCE_BALANCE_CHANGED", "El saldo del anticipo cambio durante el cruce");
    const partyUpdated = await tx.party.updateMany({ where: { id: advance.party_id, [cfg.balanceField]: { gte: amount } }, data: { [cfg.balanceField]: { decrement: amount } } });
    if (partyUpdated.count !== 1) throw appError(409, "PARTY_BALANCE_CHANGED", "El saldo global del tercero cambio durante el cruce");
    const application = await tx.treasuryAdvanceApplication.create({ data: { advance_id: advance.id, source_type: cfg.sourceType, source_id: source.id, source_number: source.number, document_type: cfg.docType, document_number: numbering.number, number, posting_date: postingDate, amount, advance_balance_before: advance.balance, advance_balance_after: advanceAfter, source_balance_before: source.balance, source_balance_after: sourceAfter, accounting_document_id: cnt.id, created_by: userId || null } });
    await tx.tenant.update({ where: { id: tenantId }, data: { config: nextAccountingConfig(tenant?.config || {}, cfg.docType, numbering.prefix, numbering.number + 1, numbering.row?.source) } });
    return application;
  }, TX_OPTIONS));
}

module.exports = { directionConfig, prepareApplications, advanceConfig, listBanks, saveBank, listOpenItems, createPayment, listPayments, getPayment, cancelPayment, createAdvance, listAdvances, applyAdvance };
