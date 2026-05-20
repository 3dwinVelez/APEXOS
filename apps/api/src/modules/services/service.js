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

function buildSimplePdf(lines) {
  const content = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"];
  lines.slice(0, 48).forEach((line, index) => {
    if (index > 0) content.push("T*");
    content.push(`(${pdfEscape(sanitizePdfLine(line))}) Tj`);
  });
  content.push("ET");
  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
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
      include: orderInclude(),
      orderBy: { created_at: "desc" },
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
  const lines = [
    "APEXOS - Reporte de servicio",
    `Orden: ${order.number}`,
    `Estado: ${order.status}`,
    `Cliente: ${order.customer_name}`,
    `Direccion: ${order.customer_address}`,
    `Telefono: ${order.customer_phone || "N/A"}`,
    `Factura: ${order.invoice_number || "N/A"}`,
    `Referencia: ${order.reference?.code || ""} ${order.reference?.name || ""}`,
    `Tipo servicio: ${order.service_type}`,
    `Inicio GPS: ${order.start_latitude || ""}, ${order.start_longitude || ""}`,
    `Cierre GPS: ${order.close_latitude || ""}, ${order.close_longitude || ""}`,
    `Duracion min: ${order.duration_minutes ?? "N/A"}`,
    "",
    "Linea de tiempo:",
    ...report.timeline.map((event) => `${event.label}: ${new Date(event.at).toISOString()}`),
    "",
    "Inspeccion:",
    ...report.inspection_items.map((item) => `${item.name}: ${item.status} ${item.comment || ""}`),
    "",
    "Novedades:",
    ...(report.incidents.length ? report.incidents.map((item) => `${item.type}: ${item.description}`) : ["Sin novedades"]),
    "",
    "Evidencias:",
    ...(report.evidence.length ? report.evidence.map((item) => `${item.label}: ${item.file_name || "captura adjunta"}`) : ["Sin evidencias"])
  ];
  return { fileName: `${order.number || `servicio-${id}`}.pdf`, buffer: buildSimplePdf(lines) };
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
      orderBy: { code: "asc" }
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
