const PROCESSING = Object.freeze({
  RECEIVED: "received",
  PROCESSING: "processing",
  PENDING_ASSIGNMENT: "pending_assignment",
  ASSIGNED: "assigned",
  PROCESSED: "processed",
  REVIEW: "review",
  ERROR: "error"
});

const ASSIGNMENT = Object.freeze({
  UNASSIGNED: "unassigned",
  ASSIGNED: "assigned",
  RETURNED: "returned"
});

const LEADER = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  RETURNED: "returned"
});

const EMAIL_STATUS = Object.freeze({
  RECEIVED: "received",
  PROCESSING: "processing",
  PROCESSED: "processed",
  PROCESSED_WITH_ERRORS: "processed_with_errors",
  ERROR: "error",
  DUPLICATE: "duplicate"
});

const DOCUMENT_TYPES = Object.freeze({
  invoice: "Factura electrónica de venta",
  credit_note: "Nota crédito electrónica",
  debit_note: "Nota débito electrónica",
  support_document: "Documento soporte electrónico",
  payroll: "Nómina electrónica",
  unknown: "Documento electrónico"
});

const PROCESSING_LABELS = Object.freeze({
  received: "Recibida",
  processing: "Procesando",
  pending_assignment: "Pendiente de asignación",
  assigned: "Asignada",
  processed: "Procesada",
  review: "En revisión",
  error: "Con error"
});

const ASSIGNMENT_LABELS = Object.freeze({
  unassigned: "Sin asignar",
  assigned: "Asignada",
  returned: "Devuelta"
});

const LEADER_LABELS = Object.freeze({
  pending: "Pendiente del líder",
  approved: "Aprobada por el líder",
  returned: "Devuelta por el líder"
});

const SEGMENTS = Object.freeze([
  "Operativo",
  "Administrativo",
  "Financiero",
  "Contable",
  "Comercial",
  "Talento humano",
  "Transporte",
  "Servicios",
  "Proyectos",
  "Compras",
  "Otro"
]);

const LIMITS = Object.freeze({
  MAX_ARCHIVE_BYTES: 50 * 1024 * 1024,
  MAX_ENTRY_BYTES: 25 * 1024 * 1024,
  MAX_TOTAL_UNCOMPRESSED_BYTES: 120 * 1024 * 1024,
  MAX_ENTRIES: 300,
  MAX_COMPRESSION_RATIO: 200,
  MAX_XML_BYTES: 10 * 1024 * 1024,
  MAX_PDF_BYTES: 25 * 1024 * 1024
});

module.exports = {
  PROCESSING,
  ASSIGNMENT,
  LEADER,
  EMAIL_STATUS,
  DOCUMENT_TYPES,
  PROCESSING_LABELS,
  ASSIGNMENT_LABELS,
  LEADER_LABELS,
  SEGMENTS,
  LIMITS
};
