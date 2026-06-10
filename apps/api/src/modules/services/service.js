const prisma = require("../../core/prisma");
const { MAX_DOCUMENT_BYTES, MAX_EVIDENCE_BYTES, assertSafeFile, normalizeFileName, secureStoragePath } = require("../../security/policy");

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
  const count = await prisma.serviceOrder.count();
  return `OS-${String(count + 1).padStart(5, "0")}`;
}

function orderInclude() {
  return { reference: { include: { parts: true } }, incidents: true, photos: true };
}

function orderListInclude() {
  return {
    reference: { include: { parts: true } },
    incidents: true,
    photos: { select: { id: true, type: true, created_at: true } }
  };
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

async function requireEvidence(orderId, requiredTypes) {
  const photos = await prisma.servicePhoto.findMany({ where: { order_id: Number(orderId) }, select: { type: true } });
  const available = new Set(photos.map((photo) => photo.type));
  const missing = requiredTypes.filter((type) => !available.has(type));
  if (missing.length) {
    throw appError(422, "SERVICE_EVIDENCE_REQUIRED", `Faltan evidencias para cerrar: ${missing.map(photoLabel).join(", ")}`);
  }
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
  return {
    order,
    timeline: orderTimeline(order),
    inspection_items: inspection.items || [],
    inspection_decision: inspection.decision || "",
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
  paragraph(`GPS inicio: ${order.start_latitude || "N/A"}, ${order.start_longitude || "N/A"} | GPS cierre: ${order.close_latitude || "N/A"}, ${order.close_longitude || "N/A"}`);
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
    tableHeader([{ label: "Pieza", x: 10 }, { label: "Estado", x: 230 }, { label: "Observacion / accion", x: 320 }]);
    report.inspection_items.slice(0, 40).forEach((item) => tableRow([
      { key: "part", x: 10, chars: 36, bold: true },
      { key: "status", x: 230, chars: 16 },
      { key: "comment", x: 320, chars: 42, lines: 3 }
    ], {
      part: `${item.name || "Pieza"} (${item.quantity || 1} ${item.unit || "und"})`,
      status: item.status || "N/A",
      comment: [item.comment, item.action].filter(Boolean).join(" / ") || "Sin observacion"
    }, 40));
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

async function listOrders(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.status) where.status = query.status;
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
    const kpis = {
      pending: data.filter((order) => order.status === "pendiente").length,
      in_progress: data.filter((order) => ["en_curso", "inspeccion", "ejecucion"].includes(order.status)).length,
      closed: data.filter((order) => order.status === "cerrada").length,
      not_executed: data.filter((order) => order.status === "no_ejecutada").length,
      total: data.length
    };
    return { data, kpis };
  });
}

async function getOrder(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceOrder.findFirstOrThrow({
    where: { id: Number(id) },
    include: orderInclude()
  }));
}

async function getOrderReport(tenantId, id) {
  const order = await getOrder(tenantId, id);
  return reportForOrder(order);
}

async function getOrderReportPdf(tenantId, id) {
  const report = await getOrderReport(tenantId, id);
  const order = report.order;
  return { fileName: `${order.number || `servicio-${id}`}.pdf`, buffer: buildReportPdf(report) };
}

function canAssignAnyTechnician(user) {
  const roleName = user?.role?.name || "";
  return ["APEX_ADMIN", "Coordinador", "Admin", "Administrador"].includes(roleName);
}

async function currentEmployeeId(tenantId, user) {
  if (!user?.id) return null;
  const employee = await prisma.employee.findFirst({ where: { tenant_id: tenantId, user_id: user.id }, select: { id: true } });
  return employee?.id || null;
}

async function createOrder(tenantId, user, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceOrder.create({
    data: {
      number: await nextNumber(),
      reference_item_id: input.reference_item_id,
      reference_id: input.reference_id,
      technician_id: canAssignAnyTechnician(user) ? input.technician_id : await currentEmployeeId(tenantId, user),
      service_type: input.service_type || "montaje",
      customer_name: input.customer_name,
      customer_address: input.customer_address,
      customer_phone: input.customer_phone || "",
      invoice_number: input.invoice_number || "",
      scheduled_date: input.scheduled_date ? new Date(input.scheduled_date) : null,
      notes: input.notes || "",
      created_by: user.id,
      metadata: input.metadata || {}
    },
    include: orderInclude()
  }));
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

async function createReference(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceReference.create({
    data: referenceData(tenantId, input),
    include: referenceInclude()
  }).then(referenceDto));
}

async function updateReference(tenantId, id, input) {
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

async function bulkImportReferences(tenantId, input) {
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

async function startOrder(tenantId, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceOrder.update({
    where: { id: Number(id) },
    data: {
      status: "en_curso",
      started_at: new Date(),
      start_latitude: input.latitude,
      start_longitude: input.longitude,
      metadata: { ...(input.metadata || {}), start_accuracy_meters: input.accuracy_meters }
    },
    include: orderInclude()
  }));
}

async function moveToInspection(tenantId, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await prisma.serviceOrder.findFirstOrThrow({ where: { id: Number(id) } });
    const items = (input.items || []).map((item) => ({
      part_id: Number(item.part_id),
      name: item.name,
      quantity: Number(item.quantity || 1),
      unit: item.unit || "und",
      status: item.status || "ok",
      comment: item.comment || "",
      action: item.action || "ninguna"
    }));
    const problems = items.filter((item) => item.status !== "ok");
    return prisma.serviceOrder.update({
      where: { id: Number(id) },
      data: {
        status: "inspeccion",
        metadata: {
          ...(order.metadata || {}),
          inspection: {
            items,
            decision: input.decision || "pendiente",
            problem_count: problems.length,
            inspected_at: new Date().toISOString(),
            ...(input.metadata || {})
          }
        }
      },
      include: orderInclude()
    });
  });
}

async function moveToExecution(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await prisma.serviceOrder.findFirstOrThrow({ where: { id: Number(id) } });
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
      include: orderInclude()
    });
  });
}

async function closeOrder(tenantId, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await prisma.serviceOrder.findFirstOrThrow({ where: { id: Number(id) } });
    await requireEvidence(id, ["producto_abierto", "producto_cerrado", "cliente", "firma_cliente"]);
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
      include: orderInclude()
    });
  });
}

async function closeNotExecuted(tenantId, id, input = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const order = await prisma.serviceOrder.findFirstOrThrow({ where: { id: Number(id) } });
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
      include: orderInclude()
    });
  });
}

async function addIncident(tenantId, orderId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceIncident.create({
    data: {
      order_id: Number(orderId),
      description: input.description,
      type: input.type || "averia",
      action: input.action || "",
      photo_url: input.photo_url || "",
      metadata: input.metadata || {}
    }
  }));
}

async function addPhoto(tenantId, orderId, input) {
  assertSafeFile(input, { maxBytes: MAX_EVIDENCE_BYTES });
  const fileName = normalizeFileName(input.file_name || `${input.type}-${orderId}`);
  const storagePath = input.storage_path || secureStoragePath({ tenantId, module: "services", entity: "orders", entityId: orderId, fileName });
  return prisma.runWithTenant(tenantId, async () => prisma.servicePhoto.create({
    data: {
      order_id: Number(orderId),
      type: input.type,
      file_url: input.file_url || "",
      base64_data: input.base64_data || "",
      size_bytes: input.size_bytes,
      metadata: {
        mime_type: input.mime_type || "",
        file_name: fileName,
        storage_path: storagePath,
        ...(input.metadata || {})
      }
    }
  }));
}

async function listPhotos(tenantId, orderId) {
  return prisma.runWithTenant(tenantId, async () => prisma.servicePhoto.findMany({
    where: { order_id: Number(orderId) },
    orderBy: { created_at: "asc" }
  }));
}

module.exports = {
  listOrders,
  getOrder,
  getOrderReport,
  getOrderReportPdf,
  createOrder,
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
