const crypto = require("node:crypto");
const prisma = require("../../../core/prisma");
const { inspectZip } = require("./zip-archive");
const { parseInvoiceXml, buildDedupeKey } = require("./parser");
const { extractPdfText, extractPdfInvoice, comparePdfWithDraft } = require("./pdf-text");
const { putDocument } = require("./storage");
const { PROCESSING, ASSIGNMENT, EMAIL_STATUS } = require("./constants");

const PAIR_STOPWORDS = new Set(["factura", "facturas", "fv", "fe", "dian", "pdf", "xml", "electronica", "electronic"]);

function archiveTitle(fileName) {
  return String(fileName || "documentos.zip")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .slice(0, 160) || "documentos.zip";
}

function baseTokens(name) {
  return String(name || "")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedBase(name) {
  return baseTokens(name).filter((token) => !PAIR_STOPWORDS.has(token)).join(" ");
}

function similarity(left, right) {
  const a = normalizedBase(left);
  const b = normalizedBase(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return Math.min(a.length, b.length) >= 4 ? 0.9 : 0;
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = [...setA].filter((token) => setB.has(token)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

// Empareja cada XML con su PDF por nombre. El XML manda: define la factura.
// Un PDF huerfano solo se asocia a la unica factura del archivo si no hay
// ambiguedad; si hay varias facturas se evalua como documento independiente.
function pairDocuments(files) {
  const xmls = files.filter((file) => file.kind === "xml");
  const pdfs = files.filter((file) => file.kind === "pdf");
  const groups = xmls.map((xml) => ({ xml, pdfs: [] }));
  const leftovers = [];

  for (const pdf of pdfs) {
    let best = null;
    let bestScore = 0;
    for (const group of groups) {
      const score = similarity(group.xml.file_name, pdf.file_name);
      if (score > bestScore) {
        best = group;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0.6) best.pdfs.push(pdf);
    else leftovers.push(pdf);
  }

  if (leftovers.length && groups.length === 1) {
    groups[0].pdfs.push(...leftovers);
    leftovers.length = 0;
  }

  for (const pdf of leftovers) groups.push({ xml: null, pdfs: [pdf] });
  return groups;
}

async function pdfForGroupTexts(group) {
  const items = [];
  for (const file of group.pdfs) {
    try {
      items.push({ file, ...(await extractPdfText(file.bytes)) });
    } catch (error) {
      items.push({ file, error });
    }
  }
  return items;
}

function attachComparison(draft, comparison) {
  const issues = [...(draft.validation_issues || []), ...((comparison && comparison.issues) || [])];
  return {
    ...draft,
    validation_issues: issues,
    needs_review: draft.extraction_source === "pdf" || issues.some((item) => item.severity === "critical"),
    pdf_comparison: comparison || null
  };
}

function draftFromXml(xmlFile, pdfTexts) {
  const parsed = parseInvoiceXml(xmlFile.bytes.toString("utf8"), { fileName: xmlFile.file_name });
  if (!parsed?.draft) {
    throw Object.assign(
      new Error(parsed?.kind === "application_response"
        ? "El XML es una respuesta de la DIAN y no contiene los datos de la factura."
        : "El XML no contiene campos de factura reconocibles."),
      { code: parsed?.kind === "application_response" ? "XML_RESPUESTA_DIAN" : "XML_SIN_DATOS", statusCode: 422 }
    );
  }
  const draft = parsed.draft;
  let comparison = null;
  for (const pdf of pdfTexts) {
    if (pdf.error || !pdf.has_text) continue;
    comparison = { file_name: pdf.file.file_name, page_count: pdf.page_count, ...comparePdfWithDraft(pdf.text, draft) };
    break;
  }
  return attachComparison(draft, comparison);
}

function draftFromPdf(pdfTexts) {
  for (const pdf of pdfTexts) {
    if (pdf.error) continue;
    if (!pdf.has_text) continue;
    const parsed = extractPdfInvoice(pdf.text, { file_name: pdf.file.file_name });
    if (parsed) {
      parsed.extraction_source = "pdf";
      return attachComparison(parsed, { file_name: pdf.file.file_name, page_count: pdf.page_count, issues: [] });
    }
  }
  return null;
}

function invoiceNumberFor(draft) {
  return draft.invoice_number || draft.full_number || "(sin número)";
}

function dedupeKeyFor(draft, primaryFile) {
  const complete = Boolean(draft.invoice_number && Number(draft.total) > 0);
  if (complete) return buildDedupeKey(draft);
  return `file:${primaryFile.checksum_sha256}`;
}

async function ensureEmail({ tenantId, source, messageKey, mailbox, subject, fromAddress, receivedAt, internetMessageId, attachmentCount, reprocess }) {
  const existing = await prisma.invoiceProcessedEmail.findFirst({ where: { message_key: messageKey } });
  if (existing) {
    if (!reprocess) return { email: existing, duplicate: true };
    const updated = await prisma.invoiceProcessedEmail.update({
      where: { id: existing.id },
      data: { status: EMAIL_STATUS.PROCESSING, error_message: null, processed_at: null }
    });
    return { email: updated, duplicate: false };
  }
  const email = await prisma.invoiceProcessedEmail.create({
    data: {
      source,
      message_key: messageKey,
      mailbox: mailbox || null,
      subject: subject || null,
      from_address: fromAddress || null,
      internet_message_id: internetMessageId || null,
      received_at: receivedAt ? new Date(receivedAt) : new Date(),
      attachment_count: Number(attachmentCount || 0),
      status: EMAIL_STATUS.PROCESSING
    }
  });
  return { email, duplicate: false };
}

async function upsertSupplier(draft) {
  if (!draft.issuer_tax_id) return null;
  const name = draft.issuer_name || draft.issuer_tax_id;
  return prisma.invoiceSupplier.upsert({
    where: { tenant_id_tax_id: { tenant_id: prisma.currentTenantId(), tax_id: draft.issuer_tax_id } },
    update: draft.issuer_name ? { name, active: true } : { active: true },
    create: { tenant_id: prisma.currentTenantId(), tax_id: draft.issuer_tax_id, name }
  });
}

async function upsertRecipient(draft) {
  if (!draft.receiver_tax_id) return null;
  const name = draft.receiver_name || draft.receiver_tax_id;
  return prisma.invoiceRecipient.upsert({
    where: { tenant_id_tax_id: { tenant_id: prisma.currentTenantId(), tax_id: draft.receiver_tax_id } },
    update: draft.receiver_name ? { name, active: true } : { active: true },
    create: { tenant_id: prisma.currentTenantId(), tax_id: draft.receiver_tax_id, name }
  });
}

async function storeDocuments({ invoiceId, storedFiles, extractionSource }) {
  const stored = [];
  const primaryFile = extractionSource === "xml"
    ? storedFiles.find((item) => item.file.kind === "xml")
    : storedFiles.find((item) => item.file.kind === "pdf");
  for (const item of storedFiles) {
    const document = await prisma.receivedInvoiceDocument.create({
      data: {
        invoice_id: invoiceId,
        document_type: item.file.kind,
        file_name: item.file.file_name,
        mime_type: item.saved.mime_type,
        storage_reference: item.saved.storage_reference,
        size_bytes: item.saved.size_bytes,
        checksum_sha256: item.saved.checksum_sha256,
        is_primary: item === primaryFile
      }
    });
    stored.push(document);
  }
  return stored;
}

async function createInvoice({ tenantId, emailId, draft, files, sourceArchive }) {
  const primary = files.find((file) => file.kind === "xml") || files[0];
  const dedupeKey = dedupeKeyFor(draft, primary);
  const existing = await prisma.receivedInvoice.findFirst({ where: { dedupe_key: dedupeKey } });
  if (existing) return { status: "duplicate", invoice: existing, dedupe_key: dedupeKey };

  const supplier = await upsertSupplier(draft);
  const recipient = await upsertRecipient(draft);
  const needsReview = Boolean(draft.needs_review);
  const reviewReasons = draft.validation_issues
    .filter((item) => item.severity === "critical" || item.code === "DATOS_DESDE_PDF")
    .map((item) => item.code);

  // Los archivos se guardan antes de crear la factura para que nunca exista una
  // factura visible sin sus documentos.
  const storedFiles = [];
  for (const file of files) {
    storedFiles.push({ file, saved: await putDocument({ tenantId, fileName: file.file_name, bytes: file.bytes, kind: file.kind }) });
  }

  const invoice = await prisma.receivedInvoice.create({
    data: {
      email_id: emailId || null,
      supplier_id: supplier?.id || null,
      recipient_id: recipient?.id || null,
      document_type: draft.document_type,
      document_type_label: draft.document_type_label,
      cufe: draft.cufe,
      prefix: draft.prefix,
      invoice_number: invoiceNumberFor(draft),
      full_number: draft.full_number || invoiceNumberFor(draft),
      issue_date: draft.issue_date,
      reception_date: new Date(),
      issuer_tax_id: draft.issuer_tax_id,
      issuer_name: draft.issuer_name,
      receiver_tax_id: draft.receiver_tax_id,
      receiver_name: draft.receiver_name,
      subtotal: draft.subtotal ?? 0,
      iva: draft.iva ?? 0,
      ica: draft.ica ?? 0,
      inc: draft.inc ?? 0,
      tax_total: draft.tax_total ?? 0,
      total: draft.total ?? 0,
      currency: draft.currency,
      dian_validation_status: draft.dian_validation_status,
      extraction_source: draft.extraction_source,
      extraction_metadata: {
        archive: sourceArchive || null,
        line_count: draft.line_count || 0,
        missing_fields: draft.missing_fields,
        pdf_comparison: draft.pdf_comparison || null,
        documents: files.map((file) => file.file_name)
      },
      processing_status: needsReview ? PROCESSING.REVIEW : PROCESSING.PENDING_ASSIGNMENT,
      assignment_status: ASSIGNMENT.UNASSIGNED,
      invoice_status: needsReview ? "En revisión" : "Pendiente de asignación",
      needs_review: needsReview,
      review_reasons: reviewReasons,
      validation_issues: draft.validation_issues,
      pdf_available: files.some((file) => file.kind === "pdf"),
      xml_available: files.some((file) => file.kind === "xml"),
      source_archive: sourceArchive || null,
      dedupe_key: dedupeKey
    }
  });

  const documents = await storeDocuments({ invoiceId: invoice.id, storedFiles, extractionSource: draft.extraction_source });
  await prisma.receivedInvoiceChangeLog.create({
    data: {
      invoice_id: invoice.id,
      action: "received",
      changes: {
        extraction_source: draft.extraction_source,
        archive: sourceArchive || null,
        documents: documents.map((document) => ({ id: document.id, file_name: document.file_name, document_type: document.document_type })),
        issues: draft.validation_issues
      },
      note: needsReview ? "Factura recibida con campos por revisar." : "Factura recibida y lista para asignacion."
    }
  });

  return { status: "created", invoice, dedupe_key: dedupeKey, documents };
}

async function recordError({ emailId, invoiceId, code, message, detail }) {
  return prisma.invoiceProcessingError.create({
    data: {
      email_id: emailId || null,
      invoice_id: invoiceId || null,
      code,
      message: String(message || "").slice(0, 500),
      detail: detail || {}
    }
  });
}

// Orquesta el ciclo completo: validar ZIP, registrar el correo (dedupe),
// emparejar XML/PDF, extraer datos, persistir y dejar trazabilidad.
async function ingestArchive(options) {
  const {
    tenantId,
    source = "manual",
    messageKey,
    mailbox = null,
    subject = null,
    fromAddress = null,
    receivedAt = null,
    internetMessageId = null,
    archiveBuffer,
    archiveName = "documentos.zip",
    attachmentCount = 0,
    reprocess = false,
    storageArchive = true
  } = options;

  if (!tenantId) throw Object.assign(new Error("Falta el tenant para procesar el ZIP."), { code: "INVOICE_TENANT_INVALID", statusCode: 400 });
  if (!messageKey) throw Object.assign(new Error("Falta la clave del mensaje para controlar duplicados."), { code: "INVOICE_MESSAGE_KEY_REQUIRED", statusCode: 400 });

  const inspected = await inspectZip(archiveBuffer, { fileName: archiveTitle(archiveName) });

  return prisma.runWithTenant(tenantId, async () => {
    const emailResult = await ensureEmail({
      tenantId,
      source,
      messageKey,
      mailbox,
      subject,
      fromAddress,
      receivedAt,
      internetMessageId,
      attachmentCount,
      reprocess
    });
    if (emailResult.duplicate) {
      return {
        status: "duplicate_email",
        duplicate: true,
        email_id: emailResult.email.id,
        invoices: [],
        errors: [],
        rejected: [],
        summary: { created: 0, duplicates: 0, failed: 0 }
      };
    }
    const email = emailResult.email;

    const archiveReference = storageArchive
      ? (await putDocument({ tenantId, fileName: archiveTitle(archiveName), bytes: archiveBuffer, kind: "zip" })).storage_reference
      : null;

    const summary = { created: 0, duplicates: 0, failed: 0 };
    const invoices = [];
    const errors = [];
    const groups = pairDocuments(inspected.files);

    for (const entry of inspected.rejected) {
      await recordError({
        emailId: email.id,
        code: String(entry.reason || "ARCHIVO_OMITIDO").toUpperCase(),
        message: `El archivo ${entry.file_name} fue omitido: ${entry.reason}.`,
        detail: entry
      });
      errors.push({ code: entry.reason, message: `Archivo omitido: ${entry.file_name}`, severity: "warning" });
    }

    for (const group of groups) {
      const pdfTexts = await pdfForGroupTexts(group);
      const files = [...(group.xml ? [group.xml] : []), ...group.pdfs];
      let draft = null;
      let failure = null;

      if (group.xml) {
        try {
          draft = draftFromXml(group.xml, pdfTexts);
        } catch (error) {
          failure = error;
        }
      }
      if (!draft) {
        const fromPdf = draftFromPdf(pdfTexts);
        if (fromPdf) {
          draft = fromPdf;
          if (failure) {
            await recordError({
              emailId: email.id,
              code: String(failure.code || "XML_INVALIDO"),
              message: `No se pudo leer ${group.xml.file_name}: ${failure.message}. Se usaron los datos del PDF.`,
              detail: { file_name: group.xml.file_name }
            });
          }
        }
      }
      if (!draft) {
        summary.failed += 1;
        const code = failure?.code || (pdfTexts.some((pdf) => pdf.error) ? "PDF_DANADO" : "DOCUMENTO_SIN_DATOS");
        const message = failure?.message
          || "No fue posible extraer número y total del documento; se requiere revisión manual.";
        await recordError({
          emailId: email.id,
          code,
          message,
          detail: { files: files.map((file) => file.file_name) }
        });
        errors.push({ code, message: `${files.map((file) => file.file_name).join(", ")}: ${message}` });
        continue;
      }

      try {
        const result = await createInvoice({ tenantId, emailId: email.id, draft, files, sourceArchive: archiveReference });
        if (result.status === "duplicate") {
          summary.duplicates += 1;
          invoices.push({ id: result.invoice.id, status: "duplicate", full_number: result.invoice.full_number });
        } else {
          summary.created += 1;
          invoices.push({
            id: result.invoice.id,
            status: "created",
            full_number: result.invoice.full_number,
            total: result.invoice.total,
            needs_review: result.invoice.needs_review
          });
        }
      } catch (error) {
        summary.failed += 1;
        await recordError({
          emailId: email.id,
          code: String(error.code || "INGESTA_FALLIDA").toUpperCase(),
          message: error.message,
          detail: { files: files.map((file) => file.file_name) }
        });
        errors.push({ code: error.code || "INGESTA_FALLIDA", message: error.message });
      }
    }

    const hasErrors = summary.failed > 0 || errors.length > 0;
    const status = summary.created === 0 && summary.duplicates === 0 && hasErrors
      ? EMAIL_STATUS.ERROR
      : hasErrors
        ? EMAIL_STATUS.PROCESSED_WITH_ERRORS
        : EMAIL_STATUS.PROCESSED;

    await prisma.invoiceProcessedEmail.update({
      where: { id: email.id },
      data: {
        status,
        attachment_count: inspected.entry_count,
        processed_attachment_count: inspected.extracted_count,
        invoice_count: summary.created,
        error_message: errors.length ? String(errors[0].message).slice(0, 500) : null,
        raw_size_bytes: archiveBuffer.length,
        zip_file_name: archiveTitle(archiveName),
        processed_at: new Date()
      }
    });

    return {
      status,
      duplicate: false,
      email_id: email.id,
      archive_reference: archiveReference,
      invoices,
      errors,
      rejected: inspected.rejected,
      summary
    };
  });
}

module.exports = {
  ingestArchive,
  pairDocuments,
  normalizedBase,
  similarity,
  dedupeKeyFor,
  archiveTitle
};
