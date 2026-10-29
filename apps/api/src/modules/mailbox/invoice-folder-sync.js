const fs = require("fs");
const path = require("path");
const { extractInvoiceData, extractFromZip } = require("./invoice-xml");

const DOCUMENT_TYPE_LABELS = {
  invoice: "Factura electrónica de venta",
  credit_note: "Nota crédito electrónica",
  debit_note: "Nota débito electrónica"
};
const SCAN_EXTENSIONS = new Set([".zip", ".xml"]);
const DEFAULT_PRISMA = () => require("../../core/prisma");

function syncError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readSyncConfig(env = process.env) {
  const tenantId = (env.MAILBOX_INVOICE_SYNC_TENANT_ID || env.MAILBOX_INGEST_TENANT_ID || "").trim();
  if (!tenantId) throw syncError("Falta MAILBOX_INVOICE_SYNC_TENANT_ID (o MAILBOX_INGEST_TENANT_ID).", "SYNC_TENANT_REQUERIDO");
  const folder = (env.MAILBOX_INVOICE_SYNC_DIR || "").trim();
  if (!folder) throw syncError("Falta MAILBOX_INVOICE_SYNC_DIR: carpeta con zips/XML de facturas.", "SYNC_CARPETA_REQUERIDA");
  const absolute = path.resolve(folder);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw syncError(`La carpeta "${absolute}" no existe o no es un directorio.`, "SYNC_CARPETA_INVALIDA");
  }
  return { tenantId, folder: absolute };
}

function scanFolder(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanFolder(full, acc);
    else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) acc.push(full);
  }
  return acc;
}

function numberPrefix(invoiceNumber) {
  const match = String(invoiceNumber || "").trim().match(/^([A-Za-z][A-Za-z0-9]*?)[-_ ]?(\d+)$/);
  return match ? match[1] : null;
}

function buildDedupeKey(data) {
  const cufe = String(data.cufe || "").trim().toLowerCase();
  if (cufe) return `cufe:${cufe}`;
  const issuer = (data.issuer_tax_id_raw || data.issuer_tax_id || "sin-nit").toLowerCase();
  const prefix = String(numberPrefix(data.invoice_number) || "").toLowerCase();
  const number = String(data.invoice_number || "").toLowerCase();
  const total = Number(data.total_payable || 0).toFixed(2);
  return `doc:${issuer}|${prefix}|${number}|${total}`;
}

function invoiceRow(data, { tenantId, sourceFile, now }) {
  const iva = data.has_iva ? data.iva_amount || 0 : 0;
  const taxTotal = iva + (data.other_tax_amount || 0);
  const cufeOk = data.cufe_validation && data.cufe_validation.valid;
  const reviewReasons = [];
  if (!data.cufe) reviewReasons.push("CUFE_NO_IDENTIFICADO");
  else if (!cufeOk) reviewReasons.push("CUFE_INVALIDO");
  const needsReview = reviewReasons.length > 0;
  return {
    tenant_id: tenantId,
    document_type: data.document_type,
    document_type_label: DOCUMENT_TYPE_LABELS[data.document_type] || "Documento electrónico",
    cufe: data.cufe,
    prefix: numberPrefix(data.invoice_number),
    invoice_number: String(data.invoice_number || "").trim(),
    full_number: String(data.invoice_number || "").trim(),
    issue_date: data.issue_date ? new Date(`${data.issue_date}T12:00:00.000Z`) : null,
    reception_date: now,
    issuer_tax_id: data.issuer_tax_id,
    issuer_name: data.issuer_name,
    receiver_tax_id: data.receiver_tax_id,
    receiver_name: data.receiver_name,
    subtotal: data.subtotal ?? 0,
    iva,
    ica: 0,
    inc: 0,
    tax_total: taxTotal,
    total: data.total_payable ?? 0,
    currency: data.currency,
    extraction_source: "xml",
    extraction_metadata: {
      sync: "mailbox-folder",
      source_file: sourceFile,
      has_iva: data.has_iva,
      iva_percents: data.iva_percents,
      cufe_format: data.cufe_validation ? data.cufe_validation.format : null
    },
    processing_status: needsReview ? "review" : "pending_assignment",
    assignment_status: "unassigned",
    invoice_status: needsReview ? "En revisión" : "Pendiente de asignación",
    needs_review: needsReview,
    review_reasons: reviewReasons,
    validation_issues: [],
    xml_available: true,
    source_archive: path.basename(sourceFile),
    dedupe_key: buildDedupeKey(data)
  };
}

async function processFile(file, { tenantId, prisma, now }) {
  const extension = path.extname(file).toLowerCase();
  const buffer = fs.readFileSync(file);
  if (extension === ".zip") {
    return extractFromZip(buffer, { fileName: path.basename(file) });
  }
  return [{ file: path.basename(file), ok: true, data: extractInvoiceData(buffer) }];
}

async function syncFolder({ config, prisma = DEFAULT_PRISMA(), log = () => {}, now = new Date() } = {}) {
  if (!config) config = readSyncConfig();
  const files = scanFolder(config.folder);
  const summary = {
    folder: config.folder,
    tenant_id: config.tenantId,
    scanned: files.length,
    inserted: 0,
    duplicates: 0,
    failed: []
  };

  await prisma.runWithTenant(config.tenantId, async () => {
    for (const file of files) {
      let results;
      try {
        results = await processFile(file, { tenantId: config.tenantId, prisma, now });
      } catch (error) {
        summary.failed.push({ file: path.basename(file), error: error.message });
        log("[invoice-sync] archivo fallido", { file, error: error.message });
        continue;
      }
      for (const result of results) {
        if (!result.ok) {
          summary.failed.push({ file: `${path.basename(file)}:${result.file}`, error: result.error });
          continue;
        }
        const row = invoiceRow(result.data, { tenantId: config.tenantId, sourceFile: `${path.basename(file)}:${result.file}`, now });
        const existing = await prisma.receivedInvoice.findFirst({
          where: { tenant_id: config.tenantId, dedupe_key: row.dedupe_key }
        });
        if (existing) {
          summary.duplicates += 1;
          continue;
        }
        await prisma.receivedInvoice.create({ data: row });
        summary.inserted += 1;
        log("[invoice-sync] factura insertada", {
          number: row.invoice_number,
          issuer: row.issuer_tax_id,
          total: row.total,
          dedupe_key: row.dedupe_key
        });
      }
    }
  });

  return summary;
}

module.exports = { readSyncConfig, scanFolder, buildDedupeKey, invoiceRow, syncFolder };
