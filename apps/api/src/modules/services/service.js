const prisma = require("../../core/prisma");
const { getTenantConfig, invalidateTenantCache } = require("../../core/tenantCache");
const { MAX_DOCUMENT_BYTES, MAX_EVIDENCE_BYTES, assertSafeFile, normalizeFileName, secureStoragePath } = require("../../security/policy");
const { ITEM_STATUSES, FINAL_ITEM_STATUSES, normalizeItem, validateItems, aggregateItemProgress, legacyItem } = require("./orderItems");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function nextNumber() {
  const last = await prisma.serviceOrder.findFirst({
    orderBy: { id: "desc" },
    select: { number: true }
  });
  const nextSeq = last ? (parseInt(last.number.replace("OS-", ""), 10) || 0) + 1 : 1;
  return `OS-${String(nextSeq).padStart(5, "0")}`;
}

function orderInclude() {
  return { reference: { include: { parts: true } }, items: { include: { reference: { include: { parts: true } }, incidents: true, photos: { where: { active: true } } }, orderBy: { display_order: "asc" } }, incidents: true, photos: { where: { active: true } } };
}

function orderListInclude() {
  return {
    reference: { include: { parts: true } },
    items: { include: { reference: true }, orderBy: { display_order: "asc" } },
    incidents: true,
    photos: { where: { active: true }, select: { id: true, type: true, created_at: true, metadata: true } }
  };
}

/** Include mínimo para transiciones de estado — solo lo que cambia */
function orderTransitionInclude() {
  return { reference: { select: { id: true, code: true, name: true } }, incidents: { select: { id: true } }, photos: { where: { active: true }, select: { id: true, type: true } } };
}

function photoLabel(type) {
  const labels = {
    fachada: "Fachada",
    pieza_averiada: "Pieza averiada/faltante",
    producto_abierto: "Producto abierto",
    producto_cerrado: "Producto cerrado",
    cliente: "Cliente recibe",
    firma_cliente: "Firma del cliente",
    no_ejecutada: "Evidencia no ejecutada"
  };
  return labels[type] || type;
}

function inspectionStatusMeta(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "ok") return { badge: "OK", label: "Sin novedad", fill: [0.9, 0.98, 0.94], stroke: [0.49, 0.78, 0.59], text: [0.05, 0.42, 0.2] };
  if (normalized.includes("aver")) return { badge: "!", label: "Averia", fill: [1, 0.96, 0.86], stroke: [0.93, 0.69, 0.28], text: [0.63, 0.32, 0.04] };
  return { badge: "X", label: "Dano/faltante", fill: [1, 0.92, 0.92], stroke: [0.9, 0.42, 0.42], text: [0.72, 0.08, 0.08] };
}

async function requireEvidence(orderId, requiredTypes) {
  const photos = await prisma.servicePhoto.findMany({ where: { order_id: Number(orderId), active: true }, select: { type: true } });
  const available = new Set(photos.map((photo) => photo.type));
  const missing = requiredTypes.filter((type) => !available.has(type));
  if (missing.length) {
    throw appError(422, "SERVICE_EVIDENCE_REQUIRED", `Faltan evidencias para cerrar: ${missing.map(photoLabel).join(", ")}`);
  }
}

async function requireSatisfactionSurvey(tenantId, input = {}, orderMetadata = {}) {
  // Buscar respuestas primero en el body del close, y como fallback en la metadata persistida de la orden
  // (la encuesta se recolecta durante inspeccion/ejecucion y se persiste en order.metadata)
  const answers = input.metadata?.satisfaction_survey?.answers
    || orderMetadata?.satisfaction_survey?.answers;
  const activeQuestions = (await configuredSatisfactionQuestions(tenantId)).filter((question) => question.active);
  const requiredQuestionIds = new Set(activeQuestions.map((question) => question.id));
  const validQuestionIds = new Set(Array.isArray(answers)
    ? answers
      .filter((answer) => requiredQuestionIds.has(String(answer?.question_id || "")) && Number.isInteger(answer?.rating) && answer.rating >= 1 && answer.rating <= 5)
      .map((answer) => answer.question_id)
    : []);
  if (validQuestionIds.size !== requiredQuestionIds.size) {
    throw appError(422, "SATISFACTION_SURVEY_REQUIRED", `Completa las ${requiredQuestionIds.size} preguntas de satisfaccion antes de cerrar el servicio`);
  }
}

function hasServiceValue(value) {
  return String(value ?? "").trim() !== "";
}

function missingOrderEditFields(order, data, nextMetadata) {
  const nextStatus = String(data.status ?? order.status ?? "").trim();
  const baseFields = [
    ["status", "estado", nextStatus],
    ["service_type", "tipo de servicio", data.service_type ?? order.service_type],
    ["customer_name", "nombre del cliente", data.customer_name ?? order.customer_name],
    ["customer_document", "cedula del cliente", nextMetadata.customer_document],
    ["customer_phone", "telefono", data.customer_phone ?? order.customer_phone],
    ["customer_address", "direccion", data.customer_address ?? order.customer_address],
    ["notes", "observaciones operativas", data.notes ?? order.notes]
  ];
  const pendingFields = nextStatus === "pendiente" ? [
    ["reference_id", "referencia", data.reference_id ?? order.reference_id],
    ["technician_id", "tecnico asignado", data.technician_id ?? order.technician_id],
    ["scheduled_date", "fecha programada del servicio", data.scheduled_date ?? order.scheduled_date]
  ] : [];
  return [...pendingFields, ...baseFields]
    .filter(([, , value]) => !hasServiceValue(value))
    .map(([, label]) => label);
}

function orderTimeline(order) {
  const events = [
    { label: "Orden creada", at: order.created_at },
    { label: "Servicio iniciado", at: order.started_at },
    { label: "Servicio cerrado", at: order.closed_at }
  ].filter((event) => event.at);
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function reportForOrder(order) {
  const inspection = order.metadata?.inspection || {};
  const satisfaction = order.metadata?.satisfaction_survey || {};
  return {
    order,
    timeline: orderTimeline(order),
    inspection_items: inspection.items || [],
    inspection_decision: inspection.decision || "",
    satisfaction_survey: satisfaction,
    evidence: order.photos.map((photo) => ({
      id: photo.id,
      type: photo.type,
      label: photoLabel(photo.type),
      file_url: photo.file_url,
      has_base64: Boolean(photo.base64_data),
      mime_type: photo.metadata?.mime_type || "",
      file_name: photo.metadata?.file_name || "",
      metadata: photo.metadata || {},
      created_at: photo.created_at
    })),
    incidents: order.incidents,
    totals: {
      evidence: order.photos.length,
      incidents: order.incidents.length,
      inspection_items: (inspection.items || []).length
    }
  };
}

function pdfEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sanitizePdfLine(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 96);
}

function formatReportDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizePdfLine(value);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function statusReportLabel(value) {
  const labels = {
    agendado: "Agendado",
    pendiente: "Pendiente",
    en_curso: "En curso",
    inspeccion: "Inspeccion",
    ejecucion: "Ejecucion",
    cerrada: "Cerrada",
    no_ejecutada: "No ejecutada"
  };
  return labels[value] || value || "Sin estado";
}

function wrapReportText(value, maxChars = 78) {
  const words = sanitizePdfLine(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buildReportPdf(report) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const streams = [];
  let commands = [];
  let y = pageHeight - margin;

  function color(rgb) {
    return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
  }

  function addPage() {
    if (commands.length) streams.push(commands.join("\n"));
    commands = [];
    y = pageHeight - margin;
  }

  function ensureSpace(height) {
    if (y - height < margin + 24) addPage();
  }

  function rect(x, yValue, width, height, fill = [1, 1, 1], stroke = null) {
    commands.push("q");
    commands.push(`${color(fill)} rg`);
    commands.push(`${x} ${yValue} ${width} ${height} re f`);
    if (stroke) {
      commands.push(`${color(stroke)} RG`);
      commands.push(`${x} ${yValue} ${width} ${height} re S`);
    }
    commands.push("Q");
  }

  function text(value, x, yValue, options = {}) {
    const font = options.bold ? "F2" : "F1";
    const size = options.size || 10;
    const fill = options.fill || [0.12, 0.14, 0.16];
    commands.push("BT");
    commands.push(`/${font} ${size} Tf`);
    commands.push(`${color(fill)} rg`);
    commands.push(`${x} ${yValue} Td`);
    commands.push(`(${pdfEscape(sanitizePdfLine(value))}) Tj`);
    commands.push("ET");
  }

  function title(value) {
    ensureSpace(34);
    text(value, margin, y, { bold: true, size: 14, fill: [0.03, 0.29, 0.25] });
    y -= 8;
    rect(margin, y, pageWidth - margin * 2, 1.3, [0.03, 0.29, 0.25]);
    y -= 20;
  }

  function paragraph(value, maxChars = 92) {
    for (const line of wrapReportText(value, maxChars)) {
      ensureSpace(16);
      text(line, margin, y, { size: 9.5, fill: [0.32, 0.35, 0.38] });
      y -= 14;
    }
  }

  function keyValue(label, value, x, yValue, width) {
    rect(x, yValue - 36, width, 46, [0.97, 0.98, 0.97], [0.86, 0.88, 0.86]);
    text(label, x + 10, yValue - 4, { size: 7.5, bold: true, fill: [0.42, 0.45, 0.46] });
    wrapReportText(value || "N/A", Math.max(18, Math.floor(width / 5.5))).slice(0, 2).forEach((line, index) => {
      text(line, x + 10, yValue - 20 - index * 12, { size: 9.5, bold: index === 0, fill: [0.08, 0.11, 0.13] });
    });
  }

  function tableHeader(columns) {
    ensureSpace(28);
    rect(margin, y - 20, pageWidth - margin * 2, 24, [0.08, 0.18, 0.16]);
    columns.forEach((column) => text(column.label, margin + column.x, y - 12, { size: 8, bold: true, fill: [1, 1, 1] }));
    y -= 28;
  }

  function tableRow(columns, values, height = 30) {
    ensureSpace(height + 8);
    rect(margin, y - height + 6, pageWidth - margin * 2, height, [0.99, 0.99, 0.98], [0.88, 0.89, 0.88]);
    columns.forEach((column) => {
      const lines = wrapReportText(values[column.key] || "", column.chars).slice(0, column.lines || 2);
      lines.forEach((line, index) => text(line, margin + column.x, y - 8 - index * 11, { size: 8.5, fill: [0.16, 0.18, 0.2], bold: column.bold && index === 0 }));
    });
    y -= height + 6;
  }

  function inspectionCard(item, x, top, width, height) {
    const status = inspectionStatusMeta(item.status);
    const hasIssue = String(item.status || "").toLowerCase() !== "ok";
    const bottom = top - height + 6;
    rect(x, bottom, width, height, hasIssue ? [1, 0.99, 0.97] : [0.99, 1, 0.99], [0.86, 0.89, 0.86]);
    rect(x + 8, top - 20, 26, 16, status.fill, status.stroke);
    text(status.badge, x + 15, top - 15, { size: 7.5, bold: true, fill: status.text });
    wrapReportText(`${item.name || "Pieza"} (${item.quantity || 1} ${item.unit || "und"})`, 30).slice(0, 2).forEach((line, index) => {
      text(line, x + 42, top - 8 - index * 10, { size: 8, bold: index === 0 });
    });
    text(status.label, x + width - 70, top - 9, { size: 7.5, bold: true, fill: status.text });
    if (hasIssue) {
      const detail = [item.comment, item.action, item.supplier_name ? `Proveedor: ${item.supplier_name}` : ""].filter(Boolean).join(" / ") || "Sin observacion";
      wrapReportText(detail, 38).slice(0, 2).forEach((line, index) => {
        text(line, x + 42, top - 29 - index * 9, { size: 7.2, fill: [0.35, 0.29, 0.22] });
      });
    }
  }

  function inspectionGrid(items) {
    const columnGap = 10;
    const columnWidth = (pageWidth - margin * 2 - columnGap) / 2;
    const rowHeight = 46;
    items.slice(0, 80).forEach((item, index) => {
      if (index % 2 === 0) ensureSpace(rowHeight + 8);
      const x = margin + (index % 2) * (columnWidth + columnGap);
      inspectionCard(item, x, y, columnWidth, rowHeight);
      if (index % 2 === 1 || index === Math.min(items.length, 80) - 1) y -= rowHeight + 7;
    });
    if (items.length > 80) paragraph(`Se muestran 80 de ${items.length} piezas inspeccionadas.`);
  }

  function header() {
    rect(0, pageHeight - 108, pageWidth, 108, [0.03, 0.18, 0.16]);
    rect(0, pageHeight - 112, pageWidth, 4, [0.05, 0.55, 0.47]);
    text("APEXOS", margin, pageHeight - 48, { bold: true, size: 22, fill: [1, 1, 1] });
    text("Reporte empresarial de servicio", margin, pageHeight - 70, { size: 11, fill: [0.78, 0.9, 0.86] });
    text(`Orden ${report.order.number || report.order.id}`, pageWidth - 214, pageHeight - 48, { bold: true, size: 15, fill: [1, 1, 1] });
    text(statusReportLabel(report.order.status), pageWidth - 214, pageHeight - 70, { size: 10, fill: [0.78, 0.9, 0.86] });
    y = pageHeight - 136;
  }

  const order = report.order;
  header();

  title("Resumen del servicio");
  keyValue("Cliente", order.customer_name, margin, y, 176);
  keyValue("Telefono", order.customer_phone || "N/A", margin + 188, y, 118);
  keyValue("Factura / pedido", order.invoice_number || "N/A", margin + 318, y, 126);
  keyValue("Estado", statusReportLabel(order.status), margin + 456, y, 72);
  y -= 64;
  keyValue("Direccion", order.customer_address, margin, y, 250);
  keyValue("Referencia", `${order.reference?.code || ""} ${order.reference?.name || ""}`.trim(), margin + 262, y, 184);
  keyValue("Tipo", order.service_type || "N/A", margin + 458, y, 70);
  y -= 64;

  title("Control operativo");
  keyValue("Inicio", formatReportDate(order.started_at), margin, y, 166);
  keyValue("Cierre", formatReportDate(order.closed_at), margin + 178, y, 166);
  keyValue("Duracion", order.duration_minutes == null ? "N/A" : `${order.duration_minutes} min`, margin + 356, y, 84);
  keyValue("Evidencias", String(report.totals.evidence), margin + 452, y, 76);
  y -= 64;
  if (order.no_execution_reason) paragraph(`Motivo no ejecucion: ${order.no_execution_reason}`);

  title("Linea de tiempo");
  if (report.timeline.length) {
    tableHeader([{ label: "Evento", x: 10 }, { label: "Fecha", x: 250 }]);
    report.timeline.forEach((event) => tableRow([
      { key: "event", x: 10, chars: 42, bold: true },
      { key: "date", x: 250, chars: 38 }
    ], { event: event.label, date: formatReportDate(event.at) }, 28));
  } else {
    paragraph("Sin eventos registrados.");
  }

  title("Inspeccion de referencia");
  if (report.inspection_items.length) {
    const issueCount = report.inspection_items.filter((item) => String(item.status || "").toLowerCase() !== "ok").length;
    paragraph(`${report.inspection_items.length} pieza(s) inspeccionada(s). ${issueCount ? `${issueCount} con alerta.` : "Todas sin novedad."}`);
    inspectionGrid(report.inspection_items);
  } else {
    paragraph("Sin inspeccion registrada.");
  }

  title("Novedades");
  if (report.incidents.length) {
    tableHeader([{ label: "Tipo", x: 10 }, { label: "Descripcion", x: 130 }, { label: "Fecha", x: 410 }]);
    report.incidents.slice(0, 30).forEach((incident) => tableRow([
      { key: "type", x: 10, chars: 18, bold: true },
      { key: "description", x: 130, chars: 48, lines: 3 },
      { key: "date", x: 410, chars: 22 }
    ], { type: incident.type || "Novedad", description: incident.description || "", date: formatReportDate(incident.created_at) }, 42));
  } else {
    paragraph("Sin novedades registradas.");
  }

  title("Encuesta de satisfaccion");
  if (Array.isArray(report.satisfaction_survey?.answers) && report.satisfaction_survey.answers.length) {
    tableHeader([{ label: "Pregunta", x: 10 }, { label: "Calificacion", x: 440 }]);
    report.satisfaction_survey.answers.slice(0, 10).forEach((answer) => tableRow([
      { key: "question", x: 10, chars: 72, bold: true },
      { key: "rating", x: 440, chars: 16 }
    ], { question: answer.question || answer.question_id, rating: `${answer.rating}/5` }, 30));
    paragraph(`Promedio: ${Number(report.satisfaction_survey.average || 0).toFixed(1)}/5`);
  } else {
    paragraph("Sin encuesta de satisfaccion registrada.");
  }

  title("Evidencias fotograficas y soportes");
  if (report.evidence.length) {
    tableHeader([{ label: "Tipo", x: 10 }, { label: "Archivo / detalle", x: 160 }, { label: "Fecha", x: 410 }]);
    report.evidence.slice(0, 50).forEach((item) => tableRow([
      { key: "type", x: 10, chars: 24, bold: true },
      { key: "file", x: 160, chars: 46, lines: 2 },
      { key: "date", x: 410, chars: 22 }
    ], {
      type: item.label,
      file: item.file_name || item.metadata?.part_name || (item.has_base64 ? "Captura almacenada" : "Soporte adjunto"),
      date: formatReportDate(item.created_at)
    }, 36));
  } else {
    paragraph("Sin evidencias cargadas.");
  }

  ensureSpace(38);
  rect(margin, y - 18, pageWidth - margin * 2, 28, [0.95, 0.98, 0.97], [0.78, 0.86, 0.82]);
  text("Documento generado por APEXOS. Validar evidencias originales en la plataforma.", margin + 10, y - 7, { size: 8.5, fill: [0.22, 0.34, 0.3] });

  if (commands.length) streams.push(commands.join("\n"));
  const pages = streams.map((stream, index) => ({ stream, pageObj: 5 + index * 2, contentObj: 6 + index * 2 }));
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((page) => `${page.pageObj} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  pages.forEach((page) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${page.contentObj} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(page.stream)} >>\nstream\n${page.stream}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function referenceInclude() {
  return { parts: { orderBy: { display_order: "asc" } } };
}

const DEFAULT_SERVICE_TYPES = [
  { code: "montaje", label: "Montaje", active: true },
  { code: "desmontaje", label: "Desmontaje", active: true },
  { code: "ambos", label: "Montaje y desmontaje", active: true }
];

const DEFAULT_SERVICE_STORES = [
  { code: "hogar_y_moda_1", label: "Hogar y Moda 1", active: true },
  { code: "hogar_y_moda_2", label: "Hogar y Moda 2", active: true }
];

const DEFAULT_SATISFACTION_QUESTIONS = [
  { id: "service_quality", label: "Como calificas la calidad del servicio realizado?", active: true },
  { id: "technician_attention", label: "Como calificas la atencion y claridad del tecnico?", active: true },
  { id: "final_result", label: "Que tan satisfecho quedaste con el resultado final?", active: true }
];

function serviceTypeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function satisfactionQuestionId(value) {
  return serviceTypeCode(value);
}

function normalizeServiceTypes(rows = []) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SERVICE_TYPES;
  const seen = new Set();
  return source
    .map((item) => {
      const code = serviceTypeCode(item.code || item.label);
      const label = String(item.label || item.code || "").trim();
      return { code, label, active: item.active !== false };
    })
    .filter((item) => item.code && item.label && !seen.has(item.code) && seen.add(item.code));
}

function normalizeServiceStores(rows = []) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SERVICE_STORES;
  const seen = new Set();
  return source
    .map((item) => {
      const code = serviceTypeCode(item.code || item.label);
      const label = String(item.label || item.code || "").trim();
      return { code, label, active: item.active !== false };
    })
    .filter((item) => item.code && item.label && !seen.has(item.code) && seen.add(item.code));
}

function normalizeSatisfactionQuestions(rows = []) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SATISFACTION_QUESTIONS;
  const seen = new Set();
  return source
    .map((item) => {
      const id = satisfactionQuestionId(item.id || item.label);
      const label = String(item.label || item.id || "").trim();
      return { id, label, active: item.active !== false };
    })
    .filter((item) => item.id && item.label && !seen.has(item.id) && seen.add(item.id));
}

async function configuredServiceTypes(tenantId) {
  const config = await getTenantConfig(tenantId);
  return normalizeServiceTypes(config?.services?.service_types);
}

async function configuredServiceStores(tenantId) {
  const config = await getTenantConfig(tenantId);
  return normalizeServiceStores(config?.services?.service_stores);
}

async function configuredSatisfactionQuestions(tenantId) {
  const config = await getTenantConfig(tenantId);
  return normalizeSatisfactionQuestions(config?.services?.satisfaction_questions);
}

async function assertValidServiceType(tenantId, value) {
  const code = serviceTypeCode(value);
  const active = (await configuredServiceTypes(tenantId)).filter((item) => item.active);
  if (!active.some((item) => item.code === code)) {
    throw appError(400, "INVALID_SERVICE_TYPE", "Selecciona un tipo de servicio activo");
  }
  return code;
}

async function listServiceTypes(tenantId) {
  return configuredServiceTypes(tenantId);
}

async function listServiceStores(tenantId) {
  return configuredServiceStores(tenantId);
}

async function saveServiceTypes(tenantId, user, input = {}) {
  assertAdministrativeServiceUser(user);
  const types = normalizeServiceTypes(input.types);
  if (!types.some((item) => item.active)) throw appError(400, "SERVICE_TYPES_REQUIRED", "Debe existir al menos un tipo de servicio activo");
  const config = await getTenantConfig(tenantId);
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      config: {
        ...config,
        services: {
          ...(config.services || {}),
          service_types: types,
          service_types_updated_at: new Date().toISOString(),
          service_types_updated_by: user?.id || null
        }
      }
    },
    select: { config: true }
  });
  invalidateTenantCache(tenantId).catch(() => undefined);
  return normalizeServiceTypes(updated.config?.services?.service_types);
}

async function saveServiceStores(tenantId, user, input = {}) {
  assertAdministrativeServiceUser(user);
  const stores = normalizeServiceStores(input.stores);
  if (!stores.some((item) => item.active)) throw appError(400, "SERVICE_STORES_REQUIRED", "Debe existir al menos un almacen activo");
  const config = await getTenantConfig(tenantId);
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      config: {
        ...config,
        services: {
          ...(config.services || {}),
          service_stores: stores,
          service_stores_updated_at: new Date().toISOString(),
          service_stores_updated_by: user?.id || null
        }
      }
    },
    select: { config: true }
  });
  invalidateTenantCache(tenantId).catch(() => undefined);
  return normalizeServiceStores(updated.config?.services?.service_stores);
}

async function listSatisfactionQuestions(tenantId) {
  return configuredSatisfactionQuestions(tenantId);
}

async function saveSatisfactionQuestions(tenantId, user, input = {}) {
  assertAdministrativeServiceUser(user);
  const questions = normalizeSatisfactionQuestions(input.questions);
  if (!questions.some((item) => item.active)) throw appError(400, "SATISFACTION_QUESTIONS_REQUIRED", "Debe existir al menos una pregunta de satisfaccion activa");
  const config = await getTenantConfig(tenantId);
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      config: {
        ...config,
        services: {
          ...(config.services || {}),
          satisfaction_questions: questions,
          satisfaction_questions_updated_at: new Date().toISOString(),
          satisfaction_questions_updated_by: user?.id || null
        }
      }
    },
    select: { config: true }
  });
  invalidateTenantCache(tenantId).catch(() => undefined);
  return normalizeSatisfactionQuestions(updated.config?.services?.satisfaction_questions);
}

function referenceManuals(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const rawManuals = Array.isArray(input.manuals) ? input.manuals : Array.isArray(metadata.manuals) ? metadata.manuals : [];
  return rawManuals
    .filter((manual) => manual && (manual.file_url || manual.base64_data || manual.title || manual.file_name))
    .slice(0, 12)
    .map((manual, index) => {
      if (manual.base64_data || manual.mime_type || manual.size_bytes) {
        assertSafeFile({ mime_type: manual.mime_type, size_bytes: manual.size_bytes }, { maxBytes: MAX_DOCUMENT_BYTES });
      }
      const fileName = normalizeFileName(manual.file_name || manual.title || `manual-${index + 1}`);
      return {
        id: manual.id || `${Date.now()}-${index}`,
        title: manual.title || fileName,
        file_name: fileName,
        mime_type: manual.mime_type || "",
        size_bytes: Number(manual.size_bytes || 0),
        file_url: manual.file_url || "",
        base64_data: manual.base64_data || "",
        notes: manual.notes || "",
        uploaded_at: manual.uploaded_at || new Date().toISOString()
      };
    });
}

function referenceMetadata(input = {}, current = {}) {
  const base = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return {
    ...(current || {}),
    ...base,
    manuals: referenceManuals({ ...input, metadata: { ...(current || {}), ...base } }),
    service_profile: {
      requires_manual_review: Boolean(input.requires_manual_review || base.service_profile?.requires_manual_review),
      ...(base.service_profile || {})
    }
  };
}

function referenceDto(row) {
  const metadata = row.metadata || {};
  return {
    ...row,
    metadata,
    manuals: Array.isArray(metadata.manuals) ? metadata.manuals : [],
    total_parts: row.parts.length,
    total_pieces: row.parts.reduce((sum, part) => sum + Number(part.quantity || 0), 0)
  };
}

function referenceData(tenantId, input, currentMetadata = {}) {
  const active = input.active === undefined ? true : !(input.active === false || String(input.active).toLowerCase() === "false");
  return {
    code: input.code.toUpperCase().trim(),
    name: input.name,
    category: input.category || "muebles",
    description: input.description || "",
    estimated_minutes: Number(input.estimated_minutes || 60),
    brand: input.brand || "",
    model: input.model || "",
    active,
    metadata: referenceMetadata(input, currentMetadata),
    parts: {
      create: (input.parts || []).map((part, index) => ({
        tenant_id: tenantId,
        name: part.name,
        quantity: Number(part.quantity || 1),
        unit: part.unit || "und",
        description: part.description || "",
        display_order: part.display_order ?? index
      }))
    }
  };
}

function isTechnician(user) {
  return String(user?.role?.name || "").toLowerCase() === "tecnico";
}

function assertAdministrativeServiceUser(user) {
  if (isTechnician(user)) throw appError(403, "TECHNICIAN_OPERATION_FORBIDDEN", "El tecnico solo puede ejecutar servicios asignados");
}

async function technicianEmployeeId(tenantId, user) {
  if (!user?.id) return null;
  const employee = await prisma.employee.findFirst({ where: { tenant_id: tenantId, user_id: user.id, active: true, user_type: "tecnico" }, select: { id: true } });
  return employee?.id || null;
}

async function technicianOrderScope(tenantId, user) {
  if (!isTechnician(user)) return {};
  const employeeId = await technicianEmployeeId(tenantId, user);
  if (!employeeId) throw appError(403, "TECHNICIAN_PROFILE_REQUIRED", "El usuario tecnico no tiene un perfil operativo activo");
  return { technician_id: employeeId, status: { in: ["pendiente", "en_curso", "inspeccion", "ejecucion"] } };
}

async function accessibleOrder(tenantId, user, id, include = orderInclude()) {
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw appError(404, "SERVICE_ORDER_EXTERNAL_NOT_SYNCED", "Esta solicitud externa aun no esta sincronizada como orden operativa local");
  }
  const scope = await technicianOrderScope(tenantId, user);
  const order = await prisma.serviceOrder.findFirst({ where: { id: orderId, ...scope }, include });
  if (!order) throw appError(404, "SERVICE_ORDER_NOT_AVAILABLE", "La orden no existe, no esta activa o no esta asignada a este tecnico");
  return order;
}

async function listTechnicians(tenantId, user) {
  assertAdministrativeServiceUser(user);
  return prisma.runWithTenant(tenantId, async () => prisma.employee.findMany({
    where: { active: true, user_type: "tecnico", user: { active: true, role: { name: "Tecnico" } } },
    select: { id: true, code: true, position: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { code: "asc" }
  }));
}

async function attachTechnicians(tenantId, orders) {
  const ids = [...new Set(orders.map((order) => order.technician_id).filter(Boolean))];
  if (!ids.length) return orders;
  const technicians = await prisma.employee.findMany({
    where: { tenant_id: tenantId, id: { in: ids } },
    select: { id: true, code: true, position: true, user: { select: { id: true, name: true, email: true } } }
  });
  const byId = new Map(technicians.map((technician) => [technician.id, technician]));
  return orders.map((order) => ({ ...order, technician: byId.get(order.technician_id) || null }));
}

async function listOrders(tenantId, user, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = await technicianOrderScope(tenantId, user);
    if (query.status && !isTechnician(user)) where.status = query.status;
    if (query.status && isTechnician(user) && ["pendiente", "en_curso", "inspeccion", "ejecucion"].includes(query.status)) {
      where.status = query.status;
    }
    if (query.date) {
      const day = startOfDay(query.date);
      where.scheduled_date = { gte: day, lt: new Date(day.getTime() + 86400000) };
    }
    const data = await prisma.serviceOrder.findMany({
      where,
      include: orderListInclude(),
      orderBy: { created_at: "desc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    const enriched = await attachTechnicians(tenantId, data);
    const kpis = {
      scheduled: data.filter((order) => order.status === "agendado").length,
      pending: data.filter((order) => order.status === "pendiente").length,
      in_progress: data.filter((order) => ["en_curso", "inspeccion", "ejecucion"].includes(order.status)).length,
      closed: data.filter((order) => order.status === "cerrada").length,
      not_executed: data.filter((order) => order.status === "no_ejecutada").length,
      total: data.length
    };
    return { data: enriched, kpis };
  });
}

async function getOrder(tenantId, user, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    const items = order.items?.length ? order.items : legacyItem(order);
    return { ...order, items, item_progress: aggregateItemProgress(items) };
  });
}

async function getOrderReport(tenantId, user, id) {
  assertAdministrativeServiceUser(user);
  const order = await getOrder(tenantId, user, id);
  return reportForOrder(order);
}

async function getOrderReportPdf(tenantId, user, id) {
  const report = await getOrderReport(tenantId, user, id);
  const order = report.order;
  return { fileName: `${order.number || `servicio-${id}`}.pdf`, buffer: buildReportPdf(report) };
}

async function createOrder(tenantId, user, input) {
  assertAdministrativeServiceUser(user);
  const requestedItems = Array.isArray(input.items) && input.items.length
    ? input.items
    : [{ reference_id: input.reference_id, service_type: input.service_type, quantity: 1, description: input.notes }];
  const itemError = validateItems(requestedItems);
  if (itemError) throw appError(400, "INVALID_SERVICE_ORDER_ITEMS", itemError);
  const requiredFields = [
    ["technician_id", "tecnico asignado"],
    ["service_type", "tipo de servicio"],
    ["customer_name", "nombre del cliente"],
    ["customer_document", "cedula del cliente"],
    ["customer_address", "direccion"],
    ["customer_phone", "telefono"],
    ["scheduled_date", "fecha programada del servicio"],
    ["notes", "observaciones operativas"]
  ];
  const missing = requiredFields
    .filter(([field]) => input[field] == null || String(input[field]).trim() === "")
    .map(([, label]) => label);
  if (missing.length) throw appError(400, "SERVICE_ORDER_REQUIRED_FIELDS", `Completa los campos obligatorios: ${missing.join(", ")}`);
  if (!/^\d+$/.test(String(input.customer_document))) throw appError(400, "INVALID_CUSTOMER_DOCUMENT", "La cedula del cliente debe contener solo numeros");
  if (Number.isNaN(new Date(input.scheduled_date).getTime())) {
    throw appError(400, "INVALID_SERVICE_DATES", "La fecha programada del servicio debe ser valida");
  }

  return prisma.runWithTenant(tenantId, async () => {
    const normalizedItems = requestedItems.map(normalizeItem);
    const referenceIds = [...new Set(normalizedItems.map((item) => item.reference_id))];
    const references = await prisma.serviceReference.findMany({ where: { id: { in: referenceIds }, active: true }, select: { id: true } });
    if (references.length !== referenceIds.length) throw appError(400, "INVALID_SERVICE_REFERENCE", "Todas las solicitudes deben usar referencias activas de la empresa.");
    for (const item of normalizedItems) item.service_type = await assertValidServiceType(tenantId, item.service_type);
    const firstItem = normalizedItems[0];
    const serviceType = firstItem.service_type;
    const requestedNumber = String(input.number || "").trim();
    if (requestedNumber) {
      const existing = await prisma.serviceOrder.findFirst({ where: { tenant_id: tenantId, number: requestedNumber }, select: { id: true } });
      if (existing) throw appError(409, "SERVICE_ORDER_NUMBER_EXISTS", "Ya existe una orden local con este consecutivo");
    }
    const technician = await prisma.employee.findFirst({
      where: { id: Number(input.technician_id), active: true, user_type: "tecnico", user: { active: true, role: { name: "Tecnico" } } },
      select: { id: true }
    });
    if (!technician) throw appError(400, "INVALID_SERVICE_TECHNICIAN", "Selecciona un tecnico operativo activo");
    return prisma.serviceOrder.create({
    data: {
      number: requestedNumber || await nextNumber(),
      reference_item_id: input.reference_item_id,
      reference_id: firstItem.reference_id,
      technician_id: technician.id,
      service_type: serviceType,
      customer_name: input.customer_name,
      customer_address: input.customer_address,
      customer_phone: input.customer_phone || "",
      invoice_number: input.invoice_number || "",
      scheduled_date: input.scheduled_date ? new Date(input.scheduled_date) : null,
      notes: input.notes || "",
      created_by: user.id,
      metadata: {
        ...(input.metadata || {}),
        customer_document: input.customer_document
      },
      items: { create: normalizedItems.map((item) => ({ ...item, tenant_id: tenantId })) }
    },
    include: orderInclude()
    });
  });
}

async function orderItem(tenantId, user, orderId, itemId) {
  const order = await accessibleOrder(tenantId, user, orderId, { items: true });
  const item = await prisma.serviceOrderItem.findFirst({ where: { id: Number(itemId), tenant_id: tenantId, order_id: order.id }, include: { reference: { include: { parts: true } }, photos: { where: { active: true } }, incidents: true } });
  if (!item) throw appError(404, "SERVICE_ORDER_ITEM_NOT_AVAILABLE", "La solicitud no pertenece a esta orden o empresa.");
  return { order, item };
}

async function syncOrderProgress(orderId) {
  const items = await prisma.serviceOrderItem.findMany({ where: { order_id: Number(orderId) }, select: { status: true } });
  const progress = aggregateItemProgress(items);
  if (!progress.all_completed) await prisma.serviceOrder.update({ where: { id: Number(orderId) }, data: { status: progress.order_status, version: { increment: 1 } } });
  return progress;
}

async function updateOrderItem(tenantId, user, orderId, itemId, input = {}) {
  assertAdministrativeServiceUser(user);
  return prisma.runWithTenant(tenantId, async () => {
    const { order, item } = await orderItem(tenantId, user, orderId, itemId);
    if (item.status !== "pendiente") throw appError(409, "SERVICE_ORDER_ITEM_ALREADY_STARTED", "La solicitud iniciada no puede editarse.");
    const data = {};
    if (input.reference_id != null) {
      const reference = await prisma.serviceReference.findFirst({ where: { id: Number(input.reference_id), active: true }, select: { id: true } });
      if (!reference) throw appError(400, "INVALID_SERVICE_REFERENCE", "Selecciona una referencia activa.");
      data.reference_id = reference.id;
    }
    if (input.service_type != null) data.service_type = await assertValidServiceType(tenantId, input.service_type);
    if (input.quantity != null) {
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw appError(400, "INVALID_SERVICE_ITEM_QUANTITY", "La cantidad debe ser mayor que cero.");
      data.quantity = quantity;
    }
    if (input.description != null) data.description = String(input.description).trim();
    if (input.observation != null) data.observation = String(input.observation).trim();
    const updated = await prisma.serviceOrderItem.update({ where: { id: item.id }, data: { ...data, version: { increment: 1 } }, include: { reference: true } });
    if (order.items[0]?.id === item.id) await prisma.serviceOrder.update({ where: { id: order.id }, data: { reference_id: updated.reference_id, service_type: updated.service_type } });
    await prisma.auditLog.create({ data: { user_id: user.id, action: "service_order.item.updated", module: "services", entity: "ServiceOrderItem", entity_id: String(item.id), old_value: item, new_value: updated } });
    return updated;
  });
}

async function deleteOrderItem(tenantId, user, orderId, itemId) {
  assertAdministrativeServiceUser(user);
  return prisma.runWithTenant(tenantId, async () => {
    const { order, item } = await orderItem(tenantId, user, orderId, itemId);
    if (order.items.length <= 1) throw appError(409, "SERVICE_ORDER_LAST_ITEM", "La orden debe conservar al menos una solicitud.");
    if (item.status !== "pendiente" || item.photos.length || item.incidents.length) throw appError(409, "SERVICE_ORDER_ITEM_ALREADY_STARTED", "No se puede eliminar una solicitud con ejecucion o trazabilidad.");
    await prisma.serviceOrderItem.delete({ where: { id: item.id } });
    await prisma.auditLog.create({ data: { user_id: user.id, action: "service_order.item.deleted", module: "services", entity: "ServiceOrderItem", entity_id: String(item.id), old_value: item, new_value: null } });
    return { ok: true };
  });
}

async function transitionOrderItem(tenantId, user, orderId, itemId, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const { item } = await orderItem(tenantId, user, orderId, itemId);
    const status = String(input.status || "").trim();
    if (!ITEM_STATUSES.has(status)) throw appError(400, "INVALID_SERVICE_ITEM_STATUS", "Estado de solicitud invalido.");
    const expectedVersion = Number(input.expected_version);
    if (!Number.isInteger(expectedVersion)) throw appError(400, "SERVICE_ITEM_VERSION_REQUIRED", "La version esperada es obligatoria.");
    if (status === "completada") {
      const evidence = await prisma.servicePhoto.findMany({ where: { tenant_id: tenantId, order_id: Number(orderId), item_id: item.id, active: true, type: { in: ["producto_abierto", "producto_cerrado"] } }, select: { type: true } });
      const types = new Set(evidence.map((photo) => photo.type));
      if (!types.has("producto_abierto") || !types.has("producto_cerrado")) throw appError(422, "SERVICE_ITEM_EVIDENCE_REQUIRED", "La solicitud requiere evidencia de producto abierto y cerrado.");
    }
    const result = await prisma.serviceOrderItem.updateMany({ where: { id: item.id, tenant_id: tenantId, order_id: Number(orderId), version: expectedVersion }, data: { status, version: { increment: 1 }, ...(status === "en_curso" && !item.started_at ? { started_at: new Date() } : {}), ...(FINAL_ITEM_STATUSES.has(status) ? { completed_at: new Date() } : {}) } });
    if (result.count !== 1) throw appError(409, "SERVICE_ITEM_VERSION_CONFLICT", "La solicitud fue modificada por otro usuario. Actualiza la orden.");
    const updated = await prisma.serviceOrderItem.findUnique({ where: { id: item.id }, include: { reference: true } });
    const progress = await syncOrderProgress(orderId);
    await prisma.auditLog.create({ data: { user_id: user.id, action: "service_order.item.status_changed", module: "services", entity: "ServiceOrderItem", entity_id: String(item.id), old_value: { status: item.status, version: item.version }, new_value: { status: updated.status, version: updated.version } } });
    return { item: updated, item_progress: progress };
  });
}

async function updateOrder(tenantId, user, id, input = {}) {
  assertAdministrativeServiceUser(user);
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    if (["cerrada", "no_ejecutada"].includes(order.status)) {
      throw appError(409, "SERVICE_ORDER_FINALIZED", "Las ordenes finalizadas no se pueden editar para proteger la trazabilidad");
    }

    const metadata = order.metadata || {};
    const data = {};
    const nextMetadata = { ...metadata, ...(input.metadata || {}) };

    if (Array.isArray(input.items)) {
      const itemError = validateItems(input.items);
      if (itemError) throw appError(400, "INVALID_SERVICE_ORDER_ITEMS", itemError);
      if (order.items.some((item) => item.status !== "pendiente" || item.photos.length || item.incidents.length)) {
        throw appError(409, "SERVICE_ORDER_ITEMS_ALREADY_STARTED", "Las solicitudes solo pueden reemplazarse antes de iniciar su ejecucion.");
      }
      const normalizedItems = input.items.map(normalizeItem);
      const referenceIds = [...new Set(normalizedItems.map((item) => item.reference_id))];
      const references = await prisma.serviceReference.findMany({ where: { id: { in: referenceIds }, active: true }, select: { id: true } });
      if (references.length !== referenceIds.length) throw appError(400, "INVALID_SERVICE_REFERENCE", "Todas las solicitudes deben usar referencias activas de la empresa.");
      for (const item of normalizedItems) item.service_type = await assertValidServiceType(tenantId, item.service_type);
      data.reference_id = normalizedItems[0].reference_id;
      data.service_type = normalizedItems[0].service_type;
      data.items = {
        deleteMany: {},
        create: normalizedItems.map((item) => ({ ...item, tenant_id: tenantId }))
      };
      nextMetadata.request_count = normalizedItems.length;
    }

    if (input.reference_id != null && String(input.reference_id).trim() !== "") {
      const reference = await prisma.serviceReference.findFirst({ where: { id: Number(input.reference_id), active: true }, select: { id: true } });
      if (!reference) throw appError(400, "INVALID_SERVICE_REFERENCE", "Selecciona una referencia activa");
      data.reference_id = reference.id;
    }
    if (input.technician_id != null && String(input.technician_id).trim() !== "") {
      const technician = await prisma.employee.findFirst({
        where: { id: Number(input.technician_id), active: true, user_type: "tecnico", user: { active: true, role: { name: "Tecnico" } } },
        select: { id: true }
      });
      if (!technician) throw appError(400, "INVALID_SERVICE_TECHNICIAN", "Selecciona un tecnico operativo activo");
      data.technician_id = technician.id;
      nextMetadata.reassigned_at = new Date().toISOString();
      nextMetadata.reassigned_by = user.id;
    }
    if (input.status != null) {
      const nextStatus = String(input.status || "").trim() || order.status;
      const allowedStatuses = new Set(["agendado", "pendiente", "cancelada"]);
      if (!allowedStatuses.has(nextStatus)) throw appError(400, "INVALID_SERVICE_STATUS", "Selecciona un estado valido para la orden");
      const technicianReady = Boolean(data.technician_id || order.technician_id);
      const referenceReady = Boolean(data.reference_id || order.reference_id);
      if (nextStatus === "pendiente" && !technicianReady) {
        throw appError(400, "SERVICE_TECHNICIAN_REQUIRED_FOR_PENDING", "Asigna un tecnico responsable antes de pasar la preorden a pendiente");
      }
      if (nextStatus === "pendiente" && !referenceReady) {
        throw appError(400, "SERVICE_REFERENCE_REQUIRED_FOR_PENDING", "Selecciona una referencia activa antes de pasar la preorden a pendiente");
      }
      data.status = nextStatus;
      nextMetadata.requires_admin_completion = nextStatus === "agendado";
      nextMetadata.preorder_status = nextStatus === "agendado" ? "agendado" : "";
      if (nextStatus === "pendiente" && order.status === "agendado") {
        nextMetadata.scheduled_from_public_request_at = new Date().toISOString();
      }
    }
    if (input.service_type != null) data.service_type = await assertValidServiceType(tenantId, input.service_type || "montaje");
    if (input.customer_name != null) data.customer_name = String(input.customer_name || "").trim();
    if (input.customer_address != null) data.customer_address = String(input.customer_address || "").trim();
    if (input.customer_phone != null) data.customer_phone = String(input.customer_phone || "").trim();
    if (input.invoice_number != null) data.invoice_number = String(input.invoice_number || "").trim();
    if (input.notes != null) data.notes = String(input.notes || "").trim();
    if (input.scheduled_date != null && String(input.scheduled_date).trim() !== "") {
      if (Number.isNaN(new Date(input.scheduled_date).getTime())) throw appError(400, "INVALID_SERVICE_DATES", "La fecha programada debe ser valida");
      data.scheduled_date = new Date(input.scheduled_date);
    }
    if (input.customer_document != null) {
      const customerDocument = String(input.customer_document || "").trim();
      if (customerDocument) {
        if (!/^\d+$/.test(customerDocument)) throw appError(400, "INVALID_CUSTOMER_DOCUMENT", "La cedula del cliente debe contener solo numeros");
        nextMetadata.customer_document = customerDocument;
      }
    }
    if (input.cedi_delivery_date != null && String(input.cedi_delivery_date).trim() !== "") {
      if (Number.isNaN(new Date(input.cedi_delivery_date).getTime())) throw appError(400, "INVALID_SERVICE_DATES", "La fecha de entrega CEDI debe ser valida");
      nextMetadata.cedi_delivery_date = String(input.cedi_delivery_date).slice(0, 10);
    }

    const missing = missingOrderEditFields(order, data, nextMetadata);
    if (missing.length) {
      throw appError(400, "SERVICE_ORDER_REQUIRED_FIELDS", `Completa los campos obligatorios: ${missing.join(", ")}`);
    }

    data.metadata = {
      ...nextMetadata,
      last_admin_edit_at: new Date().toISOString(),
      last_admin_edit_by: user.id
    };

    return prisma.serviceOrder.update({
      where: { id: order.id },
      data,
      include: orderInclude()
    });
  });
}

async function listReferences(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.serviceReference.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        ...(query.active == null ? {} : { active: query.active === "true" || query.active === true }),
        ...(query.search ? {
          OR: [
            { code: { contains: String(query.search), mode: "insensitive" } },
            { name: { contains: String(query.search), mode: "insensitive" } },
            { brand: { contains: String(query.search), mode: "insensitive" } },
            { model: { contains: String(query.search), mode: "insensitive" } }
          ]
        } : {})
      },
      include: referenceInclude(),
      orderBy: { code: "asc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    return rows.map(referenceDto);
  });
}

async function getReference(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => referenceDto(await prisma.serviceReference.findFirstOrThrow({
    where: { id: Number(id) },
    include: referenceInclude()
  })));
}

async function createReference(tenantId, user, input) {
  assertAdministrativeServiceUser(user);
  return prisma.runWithTenant(tenantId, async () => prisma.serviceReference.create({
    data: referenceData(tenantId, input),
    include: referenceInclude()
  }).then(referenceDto));
}

async function updateReference(tenantId, user, id, input) {
  assertAdministrativeServiceUser(user);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.serviceReference.findFirstOrThrow({ where: { id: Number(id) }, select: { metadata: true } });
    await prisma.serviceReferencePart.deleteMany({ where: { reference_id: Number(id) } });
    return referenceDto(await prisma.serviceReference.update({
      where: { id: Number(id) },
      data: referenceData(tenantId, input, current.metadata || {}),
      include: referenceInclude()
    }));
  });
}

function normalizeBulkRows(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const code = String(row.code || "").trim().toUpperCase();
    const name = String(row.name || "").trim();
    if (!code || !name) continue;
    const existing = grouped.get(code) || {
      code,
      name,
      category: row.category || "muebles",
      description: row.description || "",
      estimated_minutes: Number(row.estimated_minutes || 60),
      brand: row.brand || "",
      model: row.model || "",
      active: !(row.active === false || String(row.active).toLowerCase() === "false"),
      parts: [],
      manuals: []
    };
    if (row.part_name) {
      existing.parts.push({
        name: row.part_name,
        quantity: Number(row.part_quantity || 1),
        unit: row.part_unit || "und",
        description: row.part_description || ""
      });
    }
    if (row.manual_url || row.manual_title) {
      existing.manuals.push({
        title: row.manual_title || "Manual",
        file_name: row.manual_title || "manual",
        file_url: row.manual_url || "",
        notes: row.manual_notes || ""
      });
    }
    grouped.set(code, existing);
  }
  return Array.from(grouped.values()).map((row) => ({
    ...row,
    parts: row.parts.length ? row.parts : [{ name: "Validacion general", quantity: 1, unit: "und", description: "" }]
  }));
}

async function bulkImportReferences(tenantId, user, input) {
  assertAdministrativeServiceUser(user);
  const rows = normalizeBulkRows(input.rows || []);
  if (!rows.length) throw appError(400, "EMPTY_REFERENCE_IMPORT", "La plantilla no contiene referencias validas");
  return prisma.runWithTenant(tenantId, async () => {
    const result = { created: 0, updated: 0, skipped: 0, references: [] };
    for (const row of rows.slice(0, 500)) {
      const current = await prisma.serviceReference.findFirst({ where: { code: row.code }, select: { id: true, metadata: true } });
      try {
        if (current) {
          await prisma.serviceReferencePart.deleteMany({ where: { reference_id: current.id } });
          const updated = await prisma.serviceReference.update({
            where: { id: current.id },
            data: referenceData(tenantId, row, current.metadata || {}),
            include: referenceInclude()
          });
          result.updated += 1;
          result.references.push(referenceDto(updated));
        } else {
          const created = await prisma.serviceReference.create({
            data: referenceData(tenantId, row),
            include: referenceInclude()
          });
          result.created += 1;
          result.references.push(referenceDto(created));
        }
      } catch {
        result.skipped += 1;
      }
    }
    return result;
  });
}

async function startOrder(tenantId, user, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    return prisma.serviceOrder.update({
    where: { id: order.id },
    data: {
      status: "en_curso",
      started_at: new Date(),
      start_latitude: input.latitude,
      start_longitude: input.longitude,
      metadata: {
        ...(order.metadata || {}),
        ...(input.metadata || {}),
        start_accuracy_meters: input.accuracy_meters
      }
    },
    select: { id: true, status: true, started_at: true, number: true, reference: { select: { id: true, code: true, name: true } } }
    });
  });
}

async function moveToInspection(tenantId, user, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    const items = (input.items || []).map((item) => ({
      part_id: Number(item.part_id),
      name: item.name,
      quantity: Number(item.quantity || 1),
      unit: item.unit || "und",
      status: item.status || "ok",
      comment: item.comment || "",
      action: item.action || "ninguna",
      supplier_name: item.supplier_name || ""
    }));
    const problems = items.filter((item) => item.status !== "ok");
    const inspection = {
      items,
      decision: input.decision || "pendiente",
      problem_count: problems.length,
      inspected_at: new Date().toISOString(),
      ...(input.metadata || {})
    };
    if (input.item_id != null) {
      const { item } = await orderItem(tenantId, user, order.id, input.item_id);
      await prisma.serviceOrderItem.update({
        where: { id: item.id },
        data: {
          status: "inspeccion",
          version: { increment: 1 },
          metadata: { ...(item.metadata || {}), inspection }
        }
      });
      await syncOrderProgress(order.id);
      return getOrder(tenantId, user, order.id);
    }
    return prisma.serviceOrder.update({
      where: { id: Number(id) },
      data: {
        status: "inspeccion",
        metadata: {
          ...(order.metadata || {}),
          inspection
        }
      },
      select: { id: true, status: true, metadata: { select: { inspection: true } } }
    });
  });
}

async function moveToExecution(tenantId, user, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    if (input.item_id != null) {
      const { item } = await orderItem(tenantId, user, order.id, input.item_id);
      const inspection = (item.metadata || {}).inspection || {};
      await prisma.serviceOrderItem.update({
        where: { id: item.id },
        data: {
          status: "ejecucion",
          version: { increment: 1 },
          metadata: {
            ...(item.metadata || {}),
            inspection: { ...inspection, decision: "armable", moved_to_execution_at: new Date().toISOString() }
          }
        }
      });
      await syncOrderProgress(order.id);
      return getOrder(tenantId, user, order.id);
    }
    return prisma.serviceOrder.update({
      where: { id: Number(id) },
      data: {
        status: "ejecucion",
        metadata: {
          ...(order.metadata || {}),
          inspection: {
            ...((order.metadata || {}).inspection || {}),
            decision: "armable",
            moved_to_execution_at: new Date().toISOString()
          }
        }
      },
      select: { id: true, status: true }
    });
  });
}

async function closeOrder(tenantId, user, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    if (order.items?.length) {
      const progress = aggregateItemProgress(order.items);
      if (!progress.all_completed) throw appError(409, "SERVICE_ORDER_ITEMS_PENDING", "Finaliza todas las solicitudes antes de cerrar la orden.");
    }
    await requireSatisfactionSurvey(tenantId, input, order.metadata);
    await requireEvidence(id, ["producto_abierto", "producto_cerrado", "firma_cliente"]);
    const now = new Date();
    const duration = order.started_at ? Math.max(Math.round((now - order.started_at) / 60000), 0) : null;
    return prisma.serviceOrder.update({
      where: { id: Number(id) },
      data: {
        status: "cerrada",
        closed_at: now,
        close_latitude: input.latitude,
        close_longitude: input.longitude,
        duration_minutes: duration,
        metadata: { ...(order.metadata || {}), close_accuracy_meters: input.accuracy_meters, ...(input.metadata || {}) }
      },
      select: { id: true, status: true, closed_at: true, duration_minutes: true, number: true }
    });
  });
}

async function closeNotExecuted(tenantId, user, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, id);
    if (!String(input.no_execution_reason || "").trim()) {
      throw appError(400, "NO_EXECUTION_REASON_REQUIRED", "El motivo de no ejecucion es obligatorio");
    }
    await requireEvidence(id, ["no_ejecutada", "firma_cliente"]);
    const now = new Date();
    const reason = input.no_execution_reason || "No ejecutada";
    await prisma.serviceIncident.create({
      data: {
        order_id: Number(id),
        type: "no_ejecutada",
        description: reason,
        action: "cierre_no_ejecutado",
        metadata: input.metadata || {}
      }
    });
    return prisma.serviceOrder.update({
      where: { id: Number(id) },
      data: {
        status: "no_ejecutada",
        closed_at: now,
        close_latitude: input.latitude,
        close_longitude: input.longitude,
        no_execution_reason: reason,
        metadata: { ...(order.metadata || {}), close_accuracy_meters: input.accuracy_meters, ...(input.metadata || {}) }
      },
      select: { id: true, status: true, closed_at: true, number: true }
    });
  });
}

async function addIncident(tenantId, user, orderId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, orderId);
    const itemId = input.item_id == null ? null : Number(input.item_id);
    if (itemId != null) await orderItem(tenantId, user, order.id, itemId);
    return prisma.serviceIncident.create({
    data: {
      order_id: order.id,
      item_id: itemId,
      description: input.description,
      type: input.type || "averia",
      action: input.action || "",
      photo_url: input.photo_url || "",
      metadata: input.metadata || {}
    }
    });
  });
}

async function addPhoto(tenantId, user, orderId, input) {
  assertSafeFile(input, { maxBytes: MAX_EVIDENCE_BYTES });
  const fileName = normalizeFileName(input.file_name || `${input.type}-${orderId}`);
  const storagePath = input.storage_path || secureStoragePath({ tenantId, module: "services", entity: "orders", entityId: orderId, fileName });
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, orderId);
    const itemId = input.item_id == null ? null : Number(input.item_id);
    if (itemId != null) await orderItem(tenantId, user, order.id, itemId);
    const clientUploadId = input.metadata?.client_upload_id ? String(input.metadata.client_upload_id) : "";
    if (clientUploadId) {
      const retryMatch = await prisma.servicePhoto.findFirst({
        where: {
          order_id: order.id,
          item_id: itemId,
          metadata: { path: ["client_upload_id"], equals: clientUploadId }
        }
      });
      if (retryMatch) return retryMatch;
    }
    const partId = input.metadata?.part_id == null ? "" : String(input.metadata.part_id);
    const existing = await prisma.servicePhoto.findMany({
      where: { order_id: order.id, item_id: itemId, type: input.type, active: true },
      select: { id: true, metadata: true }
    });
    const duplicate = input.type === "pieza_averiada"
      ? existing.some((photo) => String(photo.metadata?.part_id ?? "") === partId)
      : existing.length > 0;
    if (duplicate) {
      throw appError(409, "SERVICE_EVIDENCE_ALREADY_CAPTURED", "Esta evidencia ya fue registrada y no puede repetirse");
    }
    return prisma.servicePhoto.create({
    data: {
      order_id: order.id,
      item_id: itemId,
      type: input.type,
      file_url: input.file_url || "",
      base64_data: input.base64_data || "",
      storage_path: input.storage_path || "",
      size_bytes: input.size_bytes,
      metadata: {
        mime_type: input.mime_type || "",
        file_name: fileName,
        storage_path: storagePath,
        ...(input.metadata || {})
      }
    }
    });
  });
}

async function listPhotos(tenantId, user, orderId) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await accessibleOrder(tenantId, user, orderId);
    return prisma.servicePhoto.findMany({
    where: { order_id: order.id, active: true },
    orderBy: { created_at: "asc" }
    });
  });
}

module.exports = {
  listOrders,
  listTechnicians,
  listServiceTypes,
  saveServiceTypes,
  listServiceStores,
  saveServiceStores,
  listSatisfactionQuestions,
  saveSatisfactionQuestions,
  getOrder,
  getOrderReport,
  getOrderReportPdf,
  createOrder,
  updateOrder,
  updateOrderItem,
  deleteOrderItem,
  transitionOrderItem,
  listReferences,
  getReference,
  createReference,
  updateReference,
  bulkImportReferences,
  startOrder,
  moveToInspection,
  moveToExecution,
  closeOrder,
  closeNotExecuted,
  addIncident,
  addPhoto,
  listPhotos
};
