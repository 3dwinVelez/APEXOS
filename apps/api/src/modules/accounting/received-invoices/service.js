const crypto = require("node:crypto");
const prisma = require("../../../core/prisma");
const {
  PROCESSING,
  ASSIGNMENT,
  LEADER,
  SEGMENTS,
  PROCESSING_LABELS,
  ASSIGNMENT_LABELS,
  LEADER_LABELS
} = require("./constants");
const { readDocument } = require("./storage");
const { ingestArchive } = require("./ingest");
const { appError } = require("./errors");

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function positiveId(value, label = "identificador") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw appError(`${label} invalido.`, "INVOICE_ID_INVALID", 400);
  }
  return parsed;
}

function pagination(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.page_size) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw appError(`${label} no es una fecha valida.`, "INVOICE_DATE_INVALID", 400);
  return date;
}

function normalizeEmails(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw appError("Los correos de notificacion deben ser una lista.", "INVOICE_EMAIL_INVALID", 400);
  const emails = [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  for (const email of emails) {
    if (!EMAIL_PATTERN.test(email)) throw appError(`El correo ${email} no es valido.`, "INVOICE_EMAIL_INVALID", 400);
  }
  return emails.slice(0, 20);
}

function cleanText(value, max = 500) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function userIdOf(user) {
  const id = Number(user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function recordUploadFailure({ tenantId, messageKey, fileName, buffer, error }) {
  await prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.invoiceProcessedEmail.findFirst({ where: { message_key: messageKey } });
    const data = {
      source: "manual",
      message_key: messageKey,
      subject: String(fileName || "Carga manual de facturas").slice(0, 160),
      received_at: new Date(),
      attachment_count: 1,
      processed_attachment_count: 0,
      invoice_count: 0,
      status: "error",
      error_message: String(error?.message || "No fue posible procesar el ZIP.").slice(0, 500),
      zip_file_name: String(fileName || "facturas.zip").slice(0, 160),
      raw_size_bytes: buffer?.length || 0,
      processed_at: new Date()
    };
    const email = existing
      ? await prisma.invoiceProcessedEmail.update({ where: { id: existing.id }, data })
      : await prisma.invoiceProcessedEmail.create({ data });
    await prisma.invoiceProcessingError.create({
      data: {
        email_id: email.id,
        code: String(error?.code || "INVOICE_UPLOAD_FAILED").toUpperCase().slice(0, 60),
        message: String(error?.message || "No fue posible procesar el ZIP.").slice(0, 500),
        detail: { file_name: fileName || null }
      }
    });
  });
}

async function uploadArchive(tenantId, fileName, buffer) {
  if (!tenantId) throw appError("Falta la empresa activa para cargar el ZIP.", "INVOICE_TENANT_INVALID", 400);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const messageKey = `manual:${checksum}`;
  let result;
  try {
    result = await ingestArchive({
      tenantId,
      source: "manual",
      messageKey,
      subject: String(fileName || "Carga manual de facturas").slice(0, 160),
      fromAddress: null,
      receivedAt: new Date(),
      archiveBuffer: buffer,
      archiveName: fileName,
      attachmentCount: 1
    });
  } catch (error) {
    await recordUploadFailure({ tenantId, messageKey, fileName, buffer, error }).catch(() => {});
    throw error;
  }
  return {
    duplicate: result.duplicate,
    email_id: result.email_id,
    status: result.status,
    invoices: result.invoices,
    errors: result.errors,
    rejected: result.rejected,
    summary: result.summary
  };
}

async function findInvoice(id) {
  const invoice = await prisma.receivedInvoice.findFirst({
    where: { id: positiveId(id, "Factura") },
    include: {
      supplier: true,
      recipient: true,
      email: true,
      documents: { orderBy: { id: "asc" } },
      assignments: { orderBy: { created_at: "desc" }, take: 20 },
      change_logs: { orderBy: { created_at: "desc" }, take: 50 }
    }
  });
  if (!invoice) throw appError("La factura no existe o no pertenece a la empresa activa.", "INVOICE_NOT_FOUND", 404);
  return invoice;
}

async function summary(query = {}) {
  const from = parseDate(query.from, "Fecha inicial");
  const to = parseDate(query.to, "Fecha final");
  const range = from || to ? { reception_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const [received, pending, assigned, processed, review, errors, totals, unresolvedErrors] = await Promise.all([
    prisma.receivedInvoice.count({ where: range }),
    prisma.receivedInvoice.count({ where: { ...range, assignment_status: ASSIGNMENT.UNASSIGNED, processing_status: { in: [PROCESSING.RECEIVED, PROCESSING.PENDING_ASSIGNMENT] } } }),
    prisma.receivedInvoice.count({ where: { ...range, processing_status: PROCESSING.ASSIGNED } }),
    prisma.receivedInvoice.count({ where: { ...range, processing_status: PROCESSING.PROCESSED } }),
    prisma.receivedInvoice.count({ where: { ...range, processing_status: PROCESSING.REVIEW } }),
    prisma.receivedInvoice.count({ where: { ...range, processing_status: PROCESSING.ERROR } }),
    prisma.receivedInvoice.aggregate({ where: range, _sum: { total: true } }),
    prisma.invoiceProcessingError.count({ where: { resolved: false } })
  ]);

  return {
    received,
    pending_assignment: pending,
    assigned,
    processed,
    review,
    errors,
    unresolved_errors: unresolvedErrors,
    total_amount: totals._sum.total || 0
  };
}

async function listInvoices(query = {}) {
  const { page, pageSize, skip, take } = pagination(query);
  const where = {};
  const from = parseDate(query.from, "Fecha inicial");
  const to = parseDate(query.to, "Fecha final");
  if (from || to) where.reception_date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (query.issue_from || query.issue_to) {
    const issueFrom = parseDate(query.issue_from, "Emision desde");
    const issueTo = parseDate(query.issue_to, "Emision hasta");
    where.issue_date = { ...(issueFrom ? { gte: issueFrom } : {}), ...(issueTo ? { lte: issueTo } : {}) };
  }
  if (query.processing_status) where.processing_status = String(query.processing_status);
  if (query.assignment_status) where.assignment_status = String(query.assignment_status);
  if (query.supplier_id) where.supplier_id = positiveId(query.supplier_id, "Proveedor");
  if (query.responsible_user_id) where.responsible_user_id = positiveId(query.responsible_user_id, "Responsable");
  if (query.nit) where.issuer_tax_id = { contains: String(query.nit).replace(/[^0-9A-Za-z]/g, ""), mode: "insensitive" };
  if (query.number) where.full_number = { contains: String(query.number).trim(), mode: "insensitive" };
  if (query.supplier) where.issuer_name = { contains: String(query.supplier).trim(), mode: "insensitive" };
  if (query.segment) where.segment = String(query.segment);
  if (query.needs_review === "true") where.needs_review = true;
  if (query.q) {
    const term = String(query.q).trim();
    where.OR = [
      { full_number: { contains: term, mode: "insensitive" } },
      { issuer_name: { contains: term, mode: "insensitive" } },
      { issuer_tax_id: { contains: term, mode: "insensitive" } },
      { cufe: { contains: term, mode: "insensitive" } }
    ];
  }

  const orderBy = query.sort === "issue_date"
    ? [{ issue_date: "desc" }, { id: "desc" }]
    : query.sort === "total"
      ? [{ total: "desc" }, { id: "desc" }]
      : query.sort === "supplier"
        ? [{ issuer_name: "asc" }, { id: "desc" }]
        : [{ created_at: "desc" }, { id: "desc" }];

  const [total, data] = await Promise.all([
    prisma.receivedInvoice.count({ where }),
    prisma.receivedInvoice.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        full_number: true,
        invoice_number: true,
        prefix: true,
        document_type: true,
        document_type_label: true,
        cufe: true,
        issuer_name: true,
        issuer_tax_id: true,
        receiver_name: true,
        receiver_tax_id: true,
        issue_date: true,
        reception_date: true,
        subtotal: true,
        iva: true,
        tax_total: true,
        total: true,
        currency: true,
        processing_status: true,
        assignment_status: true,
        leader_assignment_status: true,
        invoice_status: true,
        responsible_user_id: true,
        responsible_name: true,
        group_name: true,
        cost_center: true,
        segment: true,
        needs_review: true,
        review_reasons: true,
        validation_issues: true,
        extraction_metadata: true,
        pdf_available: true,
        xml_available: true,
        extraction_source: true,
        dian_validation_status: true,
        supplier: { select: { id: true, name: true, tax_id: true } },
        email: { select: { id: true, subject: true, from_address: true, zip_file_name: true, received_at: true } }
      }
    })
  ]);

  return {
    data: data.map((invoice) => ({
      ...invoice,
      processing_label: PROCESSING_LABELS[invoice.processing_status] || invoice.processing_status,
      assignment_label: ASSIGNMENT_LABELS[invoice.assignment_status] || invoice.assignment_status,
      leader_label: LEADER_LABELS[invoice.leader_assignment_status] || invoice.leader_assignment_status
    })),
    meta: {
      page,
      page_size: pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

async function getInvoice(id) {
  const invoice = await findInvoice(id);
  const unresolvedErrors = await prisma.invoiceProcessingError.findMany({
    where: { invoice_id: invoice.id, resolved: false },
    orderBy: { created_at: "desc" }
  });
  return {
    ...invoice,
    processing_label: PROCESSING_LABELS[invoice.processing_status] || invoice.processing_status,
    assignment_label: ASSIGNMENT_LABELS[invoice.assignment_status] || invoice.assignment_status,
    leader_label: LEADER_LABELS[invoice.leader_assignment_status] || invoice.leader_assignment_status,
    segments: SEGMENTS,
    errors: unresolvedErrors
  };
}

async function getDocumentFile(id, documentId) {
  const invoice = await findInvoice(id);
  const document = invoice.documents.find((item) => item.id === positiveId(documentId, "Documento"));
  if (!document) throw appError("El documento no pertenece a la factura.", "INVOICE_DOCUMENT_NOT_FOUND", 404);
  const file = await readDocument(invoice.tenant_id, document.storage_reference);
  return { ...file, document };
}

async function findResponsible(responsibleUserId) {
  if (!responsibleUserId) return null;
  const user = await prisma.user.findFirst({
    where: { id: positiveId(responsibleUserId, "Responsable"), active: true },
    select: { id: true, name: true, email: true, role: { select: { name: true } } }
  });
  if (!user) throw appError("El responsable seleccionado no existe o esta inactivo.", "INVOICE_RESPONSIBLE_INVALID", 422);
  return user;
}

function assertNotFinalized(invoice) {
  if (invoice.processing_status === PROCESSING.PROCESSED) {
    throw appError("La factura ya fue aprobada por el lider y no admite cambios.", "INVOICE_FINALIZED", 409);
  }
}

function assignmentUpdate(invoice, payload, user) {
  const emailList = normalizeEmails(payload.notification_emails);
  return {
    group_name: cleanText(payload.group_name, 160) ?? invoice.group_name,
    cost_center: cleanText(payload.cost_center, 120) ?? invoice.cost_center,
    segment: cleanText(payload.segment, 80) ?? invoice.segment,
    assignment_detail: cleanText(payload.assignment_detail, 600) ?? invoice.assignment_detail,
    observations: cleanText(payload.observations, 1000) ?? invoice.observations,
    notification_emails: emailList ?? invoice.notification_emails,
    last_action_by: userIdOf(user),
    last_action_at: new Date()
  };
}

async function changeLog(invoiceId, user, action, changes, note = null) {
  return prisma.receivedInvoiceChangeLog.create({
    data: {
      invoice_id: invoiceId,
      user_id: userIdOf(user),
      action,
      changes: changes || {},
      note
    }
  });
}

async function assignInvoice(id, user, payload = {}) {
  const invoice = await findInvoice(id);
  assertNotFinalized(invoice);
  const responsible = await findResponsible(payload.responsible_user_id);
  const responsibleName = responsible?.name || cleanText(payload.responsible_name, 160);
  if (!responsibleName) throw appError("Selecciona un responsable para la factura.", "INVOICE_RESPONSIBLE_REQUIRED", 422);
  if (payload.segment && !SEGMENTS.includes(String(payload.segment))) {
    throw appError("El segmento indicado no es valido.", "INVOICE_SEGMENT_INVALID", 422);
  }
  const data = assignmentUpdate(invoice, payload, user);
  const updated = await prisma.receivedInvoice.update({
    where: { id: invoice.id },
    data: {
      ...data,
      responsible_user_id: responsible?.id || null,
      responsible_name: responsibleName,
      leader_assignment_status: LEADER.PENDING,
      assignment_status: ASSIGNMENT.ASSIGNED,
      processing_status: PROCESSING.ASSIGNED,
      invoice_status: "Asignada",
      assigned_by: userIdOf(user),
      assigned_at: new Date()
    }
  });
  await prisma.receivedInvoiceAssignment.create({
    data: {
      invoice_id: invoice.id,
      responsible_user_id: responsible?.id || null,
      responsible_name: responsibleName,
      segment: updated.segment,
      leader_assignment_status: LEADER.PENDING,
      assignment_status: ASSIGNMENT.ASSIGNED,
      detail: updated.assignment_detail,
      observations: updated.observations,
      assigned_by: userIdOf(user)
    }
  });
  await changeLog(invoice.id, user, "assigned", {
    responsible_user_id: responsible?.id || null,
    responsible_name: responsibleName,
    segment: updated.segment,
    group_name: updated.group_name,
    cost_center: updated.cost_center,
    assignment_detail: updated.assignment_detail,
    notification_emails: updated.notification_emails
  }, "Factura asignada a un responsable.");
  return getInvoice(invoice.id);
}

async function approveInvoice(id, user, payload = {}) {
  const invoice = await findInvoice(id);
  if (invoice.processing_status === PROCESSING.PROCESSED) {
    throw appError("La factura ya fue aprobada.", "INVOICE_ALREADY_APPROVED", 409);
  }
  if (invoice.assignment_status !== ASSIGNMENT.ASSIGNED || !invoice.responsible_name) {
    throw appError("Asigna la factura a un responsable antes de aprobarla.", "INVOICE_NOT_ASSIGNED", 422);
  }
  const updated = await prisma.receivedInvoice.update({
    where: { id: invoice.id },
    data: {
      leader_assignment_status: LEADER.APPROVED,
      processing_status: PROCESSING.PROCESSED,
      invoice_status: "Aprobada",
      observations: cleanText(payload.observations, 1000) ?? invoice.observations,
      approved_by: userIdOf(user),
      approved_at: new Date(),
      last_action_by: userIdOf(user),
      last_action_at: new Date()
    }
  });
  await prisma.receivedInvoiceAssignment.create({
    data: {
      invoice_id: invoice.id,
      responsible_user_id: updated.responsible_user_id,
      responsible_name: updated.responsible_name,
      segment: updated.segment,
      leader_assignment_status: LEADER.APPROVED,
      assignment_status: ASSIGNMENT.ASSIGNED,
      detail: updated.assignment_detail,
      observations: updated.observations,
      assigned_by: userIdOf(user)
    }
  });
  await changeLog(invoice.id, user, "approved", {
    leader_assignment_status: LEADER.APPROVED,
    observations: updated.observations
  }, "Asignacion aprobada por el lider.");
  return getInvoice(invoice.id);
}

async function returnInvoice(id, user, payload = {}) {
  const invoice = await findInvoice(id);
  assertNotFinalized(invoice);
  if (invoice.assignment_status !== ASSIGNMENT.ASSIGNED) {
    throw appError("Solo se puede devolver una factura asignada.", "INVOICE_NOT_ASSIGNED", 422);
  }
  const reason = cleanText(payload.reason, 600);
  if (!reason) throw appError("Indica el motivo de la devolucion.", "INVOICE_RETURN_REASON_REQUIRED", 422);
  const updated = await prisma.receivedInvoice.update({
    where: { id: invoice.id },
    data: {
      assignment_status: ASSIGNMENT.RETURNED,
      leader_assignment_status: LEADER.RETURNED,
      processing_status: PROCESSING.PENDING_ASSIGNMENT,
      invoice_status: "Devuelta",
      observations: reason,
      last_action_by: userIdOf(user),
      last_action_at: new Date()
    }
  });
  await prisma.receivedInvoiceAssignment.create({
    data: {
      invoice_id: invoice.id,
      responsible_user_id: updated.responsible_user_id,
      responsible_name: updated.responsible_name,
      segment: updated.segment,
      leader_assignment_status: LEADER.RETURNED,
      assignment_status: ASSIGNMENT.RETURNED,
      detail: updated.assignment_detail,
      observations: reason,
      assigned_by: userIdOf(user)
    }
  });
  await changeLog(invoice.id, user, "returned", {
    reason,
    assignment_status: ASSIGNMENT.RETURNED
  }, "Factura devuelta por el lider.");
  return getInvoice(invoice.id);
}

async function updateAdministrative(id, user, payload = {}) {
  const invoice = await findInvoice(id);
  assertNotFinalized(invoice);
  const data = assignmentUpdate(invoice, payload, user);
  const changes = {};
  for (const field of ["group_name", "cost_center", "segment", "assignment_detail", "observations"]) {
    if (payload[field] !== undefined && data[field] !== invoice[field]) {
      changes[field] = { before: invoice[field], after: data[field] };
    }
  }
  if (payload.notification_emails !== undefined) {
    changes.notification_emails = { before: invoice.notification_emails, after: data.notification_emails };
  }
  const updated = await prisma.receivedInvoice.update({ where: { id: invoice.id }, data });
  if (Object.keys(changes).length) {
    await changeLog(invoice.id, user, "updated", changes, "Actualizacion de datos administrativos.");
  }
  return { ...updated, changes, segments: SEGMENTS };
}

async function resolveReview(id, user, payload = {}) {
  const invoice = await findInvoice(id);
  if (!invoice.needs_review) throw appError("La factura no tiene observaciones pendientes.", "INVOICE_NO_REVIEW", 409);
  const decision = String(payload.decision || "");
  if (!["accept", "reject"].includes(decision)) {
    throw appError("La decision debe ser aceptar o rechazar.", "INVOICE_REVIEW_DECISION_INVALID", 422);
  }
  const note = cleanText(payload.observations, 1000);
  const updated = await prisma.receivedInvoice.update({
    where: { id: invoice.id },
    data: decision === "accept"
      ? {
        needs_review: false,
        review_reasons: [],
        invoice_status: invoice.assignment_status === ASSIGNMENT.ASSIGNED ? "Asignada" : "Pendiente de asignación",
        processing_status: invoice.assignment_status === ASSIGNMENT.ASSIGNED ? PROCESSING.ASSIGNED : PROCESSING.PENDING_ASSIGNMENT,
        observations: note ?? invoice.observations,
        last_action_by: userIdOf(user),
        last_action_at: new Date()
      }
      : {
        needs_review: true,
        invoice_status: "Rechazada",
        processing_status: PROCESSING.REVIEW,
        observations: note ?? invoice.observations,
        last_action_by: userIdOf(user),
        last_action_at: new Date()
      }
  });
  await changeLog(invoice.id, user, decision === "accept" ? "review_accepted" : "review_rejected", {
    decision,
    observations: note,
    issues: invoice.validation_issues
  }, decision === "accept" ? "Revision aceptada por el usuario." : "Revision rechazada por el usuario.");
  return updated;
}

async function reprocessInvoice(id, user) {
  const invoice = await findInvoice(id);
  if (!invoice.source_archive) {
    throw appError("La factura no conserva el ZIP original; no es posible reprocesarla.", "INVOICE_ARCHIVE_MISSING", 422);
  }
  const archive = await readDocument(invoice.tenant_id, invoice.source_archive);
  const result = await ingestArchive({
    tenantId: invoice.tenant_id,
    source: invoice.email?.source || "manual",
    messageKey: invoice.email?.message_key || `reprocess:${invoice.id}`,
    mailbox: invoice.email?.mailbox || null,
    subject: invoice.email?.subject || null,
    fromAddress: invoice.email?.from_address || null,
    receivedAt: invoice.email?.received_at || new Date(),
    archiveBuffer: archive.bytes,
    archiveName: invoice.email?.zip_file_name || invoice.source_archive,
    reprocess: true
  });
  await changeLog(invoice.id, user, "reprocessed", {
    email_id: result.email_id,
    created: result.summary.created,
    duplicates: result.summary.duplicates,
    failed: result.summary.failed
  }, "Reprocesamiento del ZIP original solicitado por el usuario.");
  return result;
}

async function listDocumentsForInvoice(invoiceId) {
  const invoice = await findInvoice(invoiceId);
  return invoice.documents;
}

async function listResponsibles(query = {}) {
  const term = String(query.q || "").trim();
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(term
        ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } }
          ]
        }
        : {})
    },
    orderBy: { name: "asc" },
    take: 50,
    select: { id: true, name: true, email: true, role: { select: { name: true } } }
  });
  return users.map((user) => ({ ...user, role_name: user.role?.name || null }));
}

async function listEmails(query = {}) {
  const { page, pageSize, skip, take } = pagination(query);
  const where = {};
  if (query.status) where.status = String(query.status);
  if (query.source) where.source = String(query.source);
  if (query.q) {
    const term = String(query.q).trim();
    where.OR = [
      { subject: { contains: term, mode: "insensitive" } },
      { from_address: { contains: term, mode: "insensitive" } },
      { zip_file_name: { contains: term, mode: "insensitive" } }
    ];
  }
  const [total, data] = await Promise.all([
    prisma.invoiceProcessedEmail.count({ where }),
    prisma.invoiceProcessedEmail.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take,
      select: {
        id: true,
        source: true,
        mailbox: true,
        subject: true,
        from_address: true,
        received_at: true,
        attachment_count: true,
        processed_attachment_count: true,
        invoice_count: true,
        status: true,
        error_message: true,
        zip_file_name: true,
        raw_size_bytes: true,
        created_at: true,
        processed_at: true
      }
    })
  ]);
  return { data, meta: { page, page_size: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}

async function listErrors(query = {}) {
  const { page, pageSize, skip, take } = pagination(query);
  const where = {};
  if (query.resolved === "true") where.resolved = true;
  if (query.resolved === "false") where.resolved = false;
  const [total, data] = await Promise.all([
    prisma.invoiceProcessingError.count({ where }),
    prisma.invoiceProcessingError.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take
    })
  ]);
  return { data, meta: { page, page_size: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}

async function resolveError(id, user, payload = {}) {
  const error = await prisma.invoiceProcessingError.findFirst({ where: { id: positiveId(id, "Error") } });
  if (!error) throw appError("El error no existe.", "INVOICE_ERROR_NOT_FOUND", 404);
  return prisma.invoiceProcessingError.update({
    where: { id: error.id },
    data: {
      resolved: true,
      resolved_by: userIdOf(user),
      resolved_at: new Date(),
      detail: { ...(error.detail || {}), resolution: cleanText(payload.note, 500) }
    }
  });
}

async function recentHistory(query = {}) {
  const take = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const logs = await prisma.receivedInvoiceChangeLog.findMany({
    orderBy: { created_at: "desc" },
    take,
    include: { invoice: { select: { id: true, full_number: true, issuer_name: true } } }
  });
  return logs;
}

module.exports = {
  summary,
  listInvoices,
  getInvoice,
  getDocumentFile,
  uploadArchive,
  assignInvoice,
  approveInvoice,
  returnInvoice,
  updateAdministrative,
  resolveReview,
  reprocessInvoice,
  listDocumentsForInvoice,
  listResponsibles,
  listEmails,
  listErrors,
  resolveError,
  recentHistory,
  normalizeEmails,
  pagination,
  SEGMENTS
};
