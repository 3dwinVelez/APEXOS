const prisma = require("../../core/prisma");
const {
  round,
  periodFromDate,
  normalizeCode,
  mergeByCode,
  mergeNumbering,
  normalizeAccountingDocumentType,
  reserveAccountingDocumentNumber,
  DEFAULT_ACCOUNTING_DOCUMENT_TYPES,
  assertPeriodOpen,
  acquireAccountingLock,
  MANUAL_PROVENANCE,
  OPENING_BALANCE_PROVENANCE
} = require("./service");

const REVERSAL_TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 };
const REVERSAL_REASON_MAX = 500;
const AMOUNT_TOLERANCE = 0.01;

// Marca de origen que createAccountingDocument graba en AuditLog dentro de la misma
// transaccion del asiento. Esa fila, y no la cabecera enviada por el cliente, es la
// prueba de que el asiento nacio manual.
const PROVENANCE_ENTITY = "CntCabdoc";
const PROVENANCE_ACTION = "CREATE";
const PROVENANCE_MODULE = "accounting";
const KNOWN_PROVENANCE = new Set([MANUAL_PROVENANCE, OPENING_BALANCE_PROVENANCE]);

// Tablas de negocio que guardan accounting_document_id apuntando al CntCabdoc que
// su modulo emitio. Son la prueba de origen (provenance) mas fuerte: si existe una fila
// que referencia el asiento, ese asiento pertenece al modulo y solo puede anularse ahi.
// Los modelos fuera de TENANT_MODELS reciben filtro tenant_id explicito en las consultas.
const SOURCE_LINK_TABLES = [
  { model: "inventoryAdjustment", inTenantModels: false, module: "inventory", label: "Inventario (ajustes AE/AS)" },
  { model: "cxpCabdoc", inTenantModels: true, module: "purchases", label: "Compras / Cuentas por pagar (CP/NCP/RE/KG)" },
  { model: "salesInvoice", inTenantModels: true, module: "sales", label: "Ventas (FV/NCV)" },
  { model: "cxcCabdoc", inTenantModels: true, module: "sales", label: "Cuentas por cobrar / Transporte (FV/NCV/LT)" },
  { model: "cxcPayment", inTenantModels: true, module: "sales", label: "Cartera (recaudos CI)" },
  { model: "treasuryPayment", inTenantModels: false, module: "treasury", label: "Tesorería (pagos y recaudos CI/CE)" },
  { model: "treasuryAdvance", inTenantModels: false, module: "treasury", label: "Tesorería (anticipos AC/AP)" },
  { model: "treasuryAdvanceApplication", inTenantModels: false, module: "treasury", label: "Tesorería (cruces de anticipos AC/AP)" },
  { model: "pettyCashAdvance", inTenantModels: true, module: "petty_cash", label: "Caja menor (anticipos APC/LCM)" },
  { model: "pettyCashVoucher", inTenantModels: true, module: "petty_cash", label: "Caja menor (comprobantes GM/APC/LCM)" }
];

// Los modulos de tesoreria y caja menor guardan en reversal_accounting_document_id el
// asiento de anulacion que ellos mismos emitieron. Ese asiento ya nace con is_reversal,
// pero se consulta igual para que la clasificacion no dependa de un solo flag.
const REVERSAL_LINK_TABLES = [
  { model: "treasuryPayment", inTenantModels: false, module: "treasury", label: "Tesorería (anulación de pago)" },
  { model: "treasuryAdvance", inTenantModels: false, module: "treasury", label: "Tesorería (anulación de anticipo)" },
  { model: "pettyCashAdvance", inTenantModels: true, module: "petty_cash", label: "Caja menor (anulación de anticipo)" },
  { model: "pettyCashVoucher", inTenantModels: true, module: "petty_cash", label: "Caja menor (anulación de comprobante)" }
];

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

const OPENING_BALANCE_HEADER = "saldos_iniciales_historicos";
const INITIAL_LOAD_HEADER = "cargue_inicial_de_inventario";
// postOpeningBalancesWorkbook emite SI-<24 hex mayusculas del sha256 del archivo>.
const OPENING_BALANCE_REFERENCE = /^SI-[0-9A-F]{24}$/;

function eligible(origin, originLabel) {
  return { eligible: true, origin, origin_label: originLabel, reason_code: null, reason_message: null };
}

function ineligible(origin, originLabel, reasonCode, statusCode, reasonMessage) {
  return { eligible: false, origin, origin_label: originLabel, reason_code: reasonCode, status_code: statusCode, reason_message: reasonMessage };
}

function openingBalanceSignature(document) {
  const lines = Array.isArray(document.lines) ? document.lines : [];
  return OPENING_BALANCE_REFERENCE.test(String(document.reference || "").trim())
    && normalizeHeader(document.header_text) === OPENING_BALANCE_HEADER
    && normalizeAccountingDocumentType(document.document_type) === "AJ"
    && lines.length > 0;
}

// Clasificador puro (sin base de datos): por defecto DENIEGA. Solo dos origenes se
// prueban: la marca de origen que el propio servidor grabo al crear el asiento manual
// (provenance.marker) o la firma exacta generada por el productor de saldos iniciales
// (referencia SI-<hash>, cabecera, tipo AJ y lineas). Un asiento heredado sin prueba
// positiva queda ORIGIN_UNVERIFIED aunque imite tipo, cabecera o referencia.
function classifyReversalEligibility(document, provenance = {}) {
  if (document.is_reversal) {
    return ineligible("reversal", "Reversión", "REVERSAL_DOCUMENT", 409,
      "Este documento ya es una anulación o reversión; las reversiones no se anulan desde este botón.");
  }
  if (document.is_cancelled || document.status === "cancelled") {
    return ineligible("cancelled", "Anulado", "ALREADY_REVERSED", 409,
      "Este documento ya fue anulado; no se puede anular dos veces.");
  }
  if (provenance.source) {
    return ineligible(provenance.source.module, provenance.source.label, "SOURCE_MODULE_DOCUMENT", 422,
      `Este asiento fue generado por el módulo ${provenance.source.label}. Anúlelo desde su módulo de origen para conservar la trazabilidad del negocio.`);
  }
  if (provenance.hasTransactionLinks) {
    return ineligible("purchases", "Compras (entradas de mercancía y costos)", "SOURCE_MODULE_DOCUMENT", 422,
      "Este asiento tiene líneas ligadas a una transacción de compras; anúlelo desde el módulo de compras.");
  }
  if (normalizeHeader(document.header_text) === INITIAL_LOAD_HEADER) {
    return ineligible("inventory", "Inventario (cargue inicial)", "SOURCE_MODULE_DOCUMENT", 422,
      "Este asiento corresponde al cargue inicial de inventario; se anula desde el módulo de inventario.");
  }
  if (provenance.marker === MANUAL_PROVENANCE) return eligible("manual", "Documento contable manual");
  if (provenance.marker === OPENING_BALANCE_PROVENANCE) return eligible("opening_balances", "Saldos iniciales históricos");
  if (!provenance.marker && openingBalanceSignature(document)) return eligible("opening_balances", "Saldos iniciales históricos");
  return ineligible("unverified", "Origen no verificable", "ORIGIN_UNVERIFIED", 422,
    "No se pudo comprobar que este asiento haya sido creado como asiento manual o como saldo inicial histórico. Por seguridad, no se anula desde contabilidad; revise su origen y anúlelo desde el módulo que lo generó.");
}

/* Validacion estructural previa a emitir el espejo. Rechaza asientos sin lineas, con
 * lineas sin valor, con totales de cabecera distintos a la suma de lineas, con debitos
 * distintos a creditos o con enlaces de libro inconsistentes: un espejo parcial o en
 * cero dejaria el original anulado sin contrapartida contable. */
function assessReversalStructure(document, ledgerInfo = {}) {
  const lines = Array.isArray(document.lines) ? document.lines : [];
  const issues = (code, message) => ({ ok: false, code, message });
  if (!lines.length) return issues("REVERSAL_SOURCE_LINES_MISSING", "El asiento original no tiene líneas: no hay nada que anular");
  const ledgerIds = (ledgerInfo.ledgerIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
  const foundLedgerIds = new Set((ledgerInfo.foundLedgerIds || []).map(Number));
  // Un enlace de libro declarado por una linea debe existir; sin lineas enlazadas el
  // asiento heredado se valida solo con sus propias lineas.
  const expectedLedgerIds = new Set(ledgerIds);
  const reportedLedgerIds = new Set();
  let debit = 0;
  let credit = 0;
  let taxable = 0;
  let ledgerLinked = 0;
  for (const line of lines) {
    const lineDebit = round(line.debit);
    const lineCredit = round(line.credit);
    if (!Number.isFinite(lineDebit) || !Number.isFinite(lineCredit) || lineDebit < 0 || lineCredit < 0) {
      return issues("REVERSAL_SOURCE_INVALID_LINE", `La línea ${line.line_no} tiene valores inválidos`);
    }
    if (lineDebit > 0 && lineCredit > 0) return issues("REVERSAL_SOURCE_INVALID_LINE", `La línea ${line.line_no} registra débito y crédito a la vez`);
    if (!(lineDebit > 0) && !(lineCredit > 0)) return issues("REVERSAL_SOURCE_EMPTY_LINE", `La línea ${line.line_no} no tiene valor: el espejo quedaría incompleto`);
    debit = round(debit + lineDebit);
    credit = round(credit + lineCredit);
    if (round(line.tax_amount) !== 0 || round(line.tax_base) !== 0) taxable += 1;
    if (line.ledger_entry_id) {
      ledgerLinked += 1;
      reportedLedgerIds.add(Number(line.ledger_entry_id));
      if (!foundLedgerIds.has(Number(line.ledger_entry_id))) {
        return issues("REVERSAL_SOURCE_LEDGER_INCONSISTENT", `La línea ${line.line_no} referencia un asiento de libro inexistente`);
      }
    }
  }
  if ([...expectedLedgerIds].some((id) => !reportedLedgerIds.has(id))) {
    return issues("REVERSAL_SOURCE_LEDGER_INCONSISTENT", "El asiento original declara movimientos de libro que no están en sus líneas");
  }
  if (Math.abs(debit - credit) > AMOUNT_TOLERANCE) {
    return issues("REVERSAL_SOURCE_UNBALANCED", `El asiento original no cuadra: débito ${debit.toFixed(2)}, crédito ${credit.toFixed(2)}`);
  }
  if (Math.abs(round(document.total_debit) - debit) > AMOUNT_TOLERANCE || Math.abs(round(document.total_credit) - credit) > AMOUNT_TOLERANCE) {
    return issues("REVERSAL_SOURCE_TOTALS_MISMATCH", "Los totales de la cabecera no coinciden con la suma de las líneas");
  }
  return { ok: true, code: null, message: null, totals: { debit, credit }, ledger_linked: ledgerLinked, tax_lines: taxable };
}

function assertReversalStructure(document, ledgerInfo) {
  const assessment = assessReversalStructure(document, ledgerInfo);
  if (!assessment.ok) throw appError(422, assessment.code, assessment.message);
  return assessment;
}

/* Fecha exacta YYYY-MM-DD de calendario: no acepta rollover ("2026-02-31") ni zonas
 * horarias. Devuelve un Date en medianoche UTC para que el periodo no se desplace. */
function parseReversalDate(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw appError(400, "INVALID_REVERSAL_DATE", "La fecha de anulación debe usar el formato exacto AAAA-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw appError(400, "INVALID_REVERSAL_DATE", `La fecha ${text} no existe en el calendario`);
  }
  return date;
}

// Los importes fiscales (base/valor) se copian con el mismo sentido de la linea espejo:
// al invertir movimiento tambien se invierten base y valor del impuesto; la tasa no.
function reversalTaxFields(line) {
  const base = round(line.tax_base);
  const amount = round(line.tax_amount);
  const inverted = line.debit > 0;
  return {
    tax_type: line.tax_type || null,
    tax_code: line.tax_code || null,
    tax_base: inverted ? -base : base,
    tax_rate: Number(line.tax_rate) || 0,
    tax_amount: inverted ? -amount : amount
  };
}

function reversalStatusOf(document) {
  if (document.is_cancelled || document.status === "cancelled") return "cancelled";
  if (document.is_reversal) return "reversal";
  return "posted";
}

function scopedWhere(tenantId, table, extra) {
  return table.inTenantModels ? extra : { tenant_id: String(tenantId), ...extra };
}

// Inspeccion real de provenance: tablas de negocio que referencian el asiento y
// lineas de libro ligadas a transacciones de compra (transaction_id no nulo). El
// parametro client puede ser prisma o el tx de una transaccion.
function provenanceMarkersOf(rows) {
  const markers = new Map();
  for (const row of rows || []) {
    const marker = row?.new_value?.provenance;
    if (!KNOWN_PROVENANCE.has(marker) || markers.has(String(row.entity_id))) continue;
    markers.set(String(row.entity_id), marker);
  }
  return markers;
}

async function findDocumentProvenance(client, tenantId, document) {
  const id = Number(document.id);
  const ledgerIds = (document.lines || []).map((line) => line.ledger_entry_id).filter(Boolean);
  const [sourceLink, reversalLink, hasTransactionLinks, markerRows] = await Promise.all([
    (async () => {
      for (const table of SOURCE_LINK_TABLES) {
        const row = await client[table.model].findFirst({ where: scopedWhere(tenantId, table, { accounting_document_id: id }), select: { id: true } });
        if (row) return table;
      }
      return null;
    })(),
    (async () => {
      for (const table of REVERSAL_LINK_TABLES) {
        const row = await client[table.model].findFirst({ where: scopedWhere(tenantId, table, { reversal_accounting_document_id: id }), select: { id: true } });
        if (row) return table;
      }
      return null;
    })(),
    (async () => {
      if (!ledgerIds.length) return false;
      const linked = await client.ledgerEntry.findFirst({
        where: { tenant_id: String(tenantId), id: { in: ledgerIds }, transaction_id: { not: null } },
        select: { id: true }
      });
      return Boolean(linked);
    })(),
    client.auditLog.findMany({
      where: {
        tenant_id: String(tenantId),
        module: PROVENANCE_MODULE,
        entity: PROVENANCE_ENTITY,
        entity_id: String(id),
        action: PROVENANCE_ACTION,
        new_value: { path: ["provenance"], equals: MANUAL_PROVENANCE }
      },
      select: { entity_id: true, new_value: true },
      take: 1
    })
  ]);
  return { source: sourceLink || reversalLink, hasTransactionLinks, marker: provenanceMarkersOf(markerRows).get(String(id)) || null };
}

// Consulta por lotes para enriquecer listados sin disparar N consultas por documento.
async function collectDocumentsProvenance(client, tenantId, rows) {
  const ids = rows.map((row) => Number(row.id));
  const byDocId = new Map(ids.map((id) => [id, { source: null, hasTransactionLinks: false, marker: null }]));
  if (!ids.length) return byDocId;
  const linkResults = await Promise.all(SOURCE_LINK_TABLES.map((table) => client[table.model].findMany({
    where: scopedWhere(tenantId, table, { accounting_document_id: { in: ids } }),
    select: { accounting_document_id: true }
  })));
  const reversalResults = await Promise.all(REVERSAL_LINK_TABLES.map((table) => client[table.model].findMany({
    where: scopedWhere(tenantId, table, { reversal_accounting_document_id: { in: ids } }),
    select: { reversal_accounting_document_id: true }
  })));
  const ledgerIds = [...new Set(rows.flatMap((row) => (row.lines || []).map((line) => line.ledger_entry_id)).filter(Boolean))];
  const txLinkedLedgers = ledgerIds.length
    ? await client.ledgerEntry.findMany({ where: { tenant_id: String(tenantId), id: { in: ledgerIds }, transaction_id: { not: null } }, select: { id: true } })
    : [];
  const markerRows = await client.auditLog.findMany({
    where: {
      tenant_id: String(tenantId),
      module: PROVENANCE_MODULE,
      entity: PROVENANCE_ENTITY,
      entity_id: { in: ids.map(String) },
      action: PROVENANCE_ACTION,
      new_value: { path: ["provenance"], equals: MANUAL_PROVENANCE }
    },
    select: { entity_id: true, new_value: true }
  });
  const markers = provenanceMarkersOf(markerRows);
  SOURCE_LINK_TABLES.forEach((table, index) => {
    for (const row of linkResults[index] || []) {
      const entry = byDocId.get(row.accounting_document_id);
      if (entry && !entry.source) entry.source = table;
    }
  });
  REVERSAL_LINK_TABLES.forEach((table, index) => {
    for (const row of reversalResults[index] || []) {
      const entry = byDocId.get(row.reversal_accounting_document_id);
      if (entry && !entry.source) entry.source = table;
    }
  });
  const txLinked = new Set(txLinkedLedgers.map((row) => row.id));
  for (const row of rows) {
    const entry = byDocId.get(Number(row.id));
    if (!entry) continue;
    entry.marker = markers.get(String(row.id)) || null;
    for (const line of row.lines || []) {
      if (line.ledger_entry_id && txLinked.has(line.ledger_entry_id)) {
        entry.hasTransactionLinks = true;
        break;
      }
    }
  }
  return byDocId;
}

async function enrichDocumentsWithReversal(client, tenantId, rows) {
  const provenance = await collectDocumentsProvenance(client, tenantId, rows);
  const ids = rows.map((row) => Number(row.id));
  const reversalDocs = ids.length
    ? await client.cntCabdoc.findMany({
      where: { referenced_document_id: { in: ids }, is_reversal: true },
      select: { id: true, full_number: true, referenced_document_id: true, posting_date: true }
    })
    : [];
  const reversalByOriginal = new Map(reversalDocs.map((row) => [row.referenced_document_id, row]));
  return rows.map((row) => {
    const id = Number(row.id);
    const reversalDocument = reversalByOriginal.get(id) || null;
    return {
      ...row,
      reversal_status: reversalStatusOf(row),
      reversal_document: reversalDocument,
      reverses_document_id: row.is_reversal ? row.referenced_document_id : null,
      reversal_eligibility: classifyReversalEligibility(row, provenance.get(id) || {})
    };
  });
}

async function getReversalEligibility(tenantId, documentId) {
  return prisma.runWithTenant(tenantId, async () => {
    const document = await prisma.cntCabdoc.findFirst({
      where: { id: Number(documentId) },
      include: { lines: { orderBy: { line_no: "asc" } } }
    });
    if (!document) throw appError(404, "ACCOUNTING_DOCUMENT_NOT_FOUND", "Documento contable no encontrado");
    const provenance = await findDocumentProvenance(prisma, tenantId, document);
    const enriched = { reversal_status: reversalStatusOf(document), reversal_eligibility: classifyReversalEligibility(document, provenance) };
    return {
      document: {
        id: document.id,
        full_number: document.full_number,
        document_type: document.document_type,
        posting_date: document.posting_date,
        header_text: document.header_text,
        reference: document.reference,
        society_code: document.society_code,
        status: document.status,
        is_reversal: document.is_reversal,
        is_cancelled: document.is_cancelled
      },
      eligibility: enriched.reversal_eligibility,
      reversal_status: enriched.reversal_status,
      reversal_document: enriched.reversal_document,
      provenance
    };
  });
}

async function reverseAccountingDocument(tenantId, userId, documentId, data = {}) {
  const reason = String(data.reason || "").trim();
  if (reason.length < 3) throw appError(400, "REVERSAL_REASON_REQUIRED", "El motivo de anulación debe tener al menos 3 caracteres");
  if (reason.length > REVERSAL_REASON_MAX) throw appError(400, "REVERSAL_REASON_TOO_LONG", `El motivo de anulación no puede superar ${REVERSAL_REASON_MAX} caracteres`);
  const reversalDate = parseReversalDate(data.reversal_date);
  await assertPeriodOpen(tenantId, reversalDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    // Orden de adquisicion fijo: (1) candado del documento, (2) candado compartido de la
    // config contable. El segundo se toma ANTES de leer la config para que la numeracion
    // reservada y los presupuestos grabados por otros flujos no se sobreescriban con una
    // config obsoleta. Dos anulaciones del mismo asiento se serializan en (1); la segunda
    // re-lee el documento ya anulado y recibe 409.
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      `${tenantId}:accounting-reversal:${Number(documentId)}`
    );
    await acquireAccountingLock(tx, tenantId);
    const document = await tx.cntCabdoc.findFirst({
      where: { id: Number(documentId) },
      include: { lines: { orderBy: { line_no: "asc" } } }
    });
    if (!document) throw appError(404, "ACCOUNTING_DOCUMENT_NOT_FOUND", "Documento contable no encontrado");
    const provenance = await findDocumentProvenance(tx, tenantId, document);
    const eligibility = classifyReversalEligibility(document, provenance);
    if (!eligibility.eligible) throw appError(eligibility.status_code, eligibility.reason_code, eligibility.reason_message);

    const period = periodFromDate(reversalDate);
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    if (accounting.periods?.[period]?.status === "closed") {
      throw appError(423, "PERIOD_CLOSED", `El periodo contable ${period} está cerrado`);
    }

    const ledgerIds = (document.lines || []).map((line) => line.ledger_entry_id).filter(Boolean);
    const foundLedgers = ledgerIds.length
      ? await tx.ledgerEntry.findMany({ where: { tenant_id: String(tenantId), id: { in: ledgerIds } }, select: { id: true } })
      : [];
    assertReversalStructure(document, { ledgerIds, foundLedgerIds: foundLedgers.map((row) => row.id) });

    const documentTypes = mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code")
      .map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) }));
    const numbering = mergeNumbering(documentTypes, accounting.accounting_numbering)
      .find((row) => row.document_type === document.document_type && row.active !== false);
    if (!numbering) throw appError(400, "REVERSAL_NUMBERING_NOT_FOUND", `La clase ${document.document_type} no tiene numeración activa para emitir la anulación`);
    const documentNumber = await reserveAccountingDocumentNumber(tx, tenantId, document.document_type, numbering);
    const prefix = normalizeCode(numbering.prefix || document.document_type);
    const fullNumber = `${prefix}-${String(documentNumber).padStart(6, "0")}`;

    const reversal = await tx.cntCabdoc.create({
      data: {
        document_type: document.document_type,
        document_number: documentNumber,
        full_number: fullNumber,
        posting_date: reversalDate,
        reference: document.full_number,
        header_text: `Anulación ${document.full_number}: ${reason}`,
        society_code: document.society_code,
        status: "posted",
        referenced_document_id: document.id,
        is_reversal: true,
        total_debit: document.total_credit,
        total_credit: document.total_debit,
        created_by: userId || null
      }
    });

    let lineNo = 1;
    const reversedLines = [];
    for (const line of document.lines) {
      const debit = round(line.credit);
      const credit = round(line.debit);
      const ledger = await tx.ledgerEntry.create({
        data: {
          account_id: line.account_id,
          transaction_id: null,
          date: reversalDate,
          debit,
          credit,
          balance: 0,
          description: `Anulación ${line.description}: ${reason}`,
          period
        }
      });
      await tx.cntCuedoc.create({
        data: {
          cabdoc_id: reversal.id,
          line_no: lineNo++,
          account_id: line.account_id,
          account_code: line.account_code,
          branch_code: line.branch_code,
          cost_center_code: line.cost_center_code,
          party_id: line.party_id,
          party_tax_id: line.party_tax_id,
          movement: debit > 0 ? "debit" : "credit",
          debit,
          credit,
          description: `Anulación ${line.description}: ${reason}`,
          ledger_entry_id: ledger.id,
          ...reversalTaxFields(line)
        }
      });
      reversedLines.push({ account_code: line.account_code, account_id: line.account_id, debit, credit });
    }

    await tx.cntCabdoc.update({
      where: { id: document.id },
      data: { status: "cancelled", is_cancelled: true, cancelled_by: userId || null, cancelled_at: reversalDate }
    });
    const nextNumbering = [...(Array.isArray(accounting.accounting_numbering) ? accounting.accounting_numbering : [])
      .filter((row) => normalizeAccountingDocumentType(row.document_type) !== document.document_type), {
      ...numbering,
      document_type: document.document_type,
      prefix,
      next_number: documentNumber + 1,
      active: true
    }];
    await tx.tenant.update({ where: { id: tenantId }, data: { config: { ...config, accounting: { ...accounting, accounting_numbering: nextNumbering } } } });
    await tx.auditLog.create({
      data: {
        user_id: userId || null,
        action: "REVERSE",
        module: "accounting",
        entity: "CntCabdoc",
        entity_id: String(document.id),
        old_value: { status: document.status, full_number: document.full_number },
        new_value: { status: "cancelled", reason, reversal_date: reversalDate.toISOString(), reversal_document_id: reversal.id, reversal_number: fullNumber }
      }
    });
    return {
      reversed: true,
      reason,
      reversal_date: reversalDate,
      reversal_document_id: reversal.id,
      reversal_number: fullNumber,
      original_document: { id: document.id, full_number: document.full_number, status: "cancelled" },
      lines: reversedLines
    };
  }, REVERSAL_TX_OPTIONS));
}

module.exports = {
  SOURCE_LINK_TABLES,
  REVERSAL_LINK_TABLES,
  classifyReversalEligibility,
  assessReversalStructure,
  assertReversalStructure,
  parseReversalDate,
  reversalTaxFields,
  openingBalanceSignature,
  reversalStatusOf,
  findDocumentProvenance,
  collectDocumentsProvenance,
  enrichDocumentsWithReversal,
  getReversalEligibility,
  reverseAccountingDocument
};
