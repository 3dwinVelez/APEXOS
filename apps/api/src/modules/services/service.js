const prisma = require("../../core/prisma");

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

function referenceInclude() {
  return { parts: { orderBy: { display_order: "asc" } } };
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

async function createOrder(tenantId, user, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceOrder.create({
    data: {
      number: await nextNumber(),
      reference_item_id: input.reference_item_id,
      reference_id: input.reference_id,
      technician_id: input.technician_id,
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
        ...(query.active == null ? {} : { active: query.active === "true" || query.active === true })
      },
      include: referenceInclude(),
      orderBy: { code: "asc" }
    });
    return rows.map((row) => ({
      ...row,
      total_parts: row.parts.length,
      total_pieces: row.parts.reduce((sum, part) => sum + Number(part.quantity || 0), 0)
    }));
  });
}

async function getReference(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceReference.findFirstOrThrow({
    where: { id: Number(id) },
    include: referenceInclude()
  }));
}

async function createReference(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.serviceReference.create({
    data: {
      code: input.code.toUpperCase().trim(),
      name: input.name,
      category: input.category || "muebles",
      description: input.description || "",
      estimated_minutes: Number(input.estimated_minutes || 60),
      brand: input.brand || "",
      model: input.model || "",
      active: input.active !== false,
      metadata: input.metadata || {},
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
    },
    include: referenceInclude()
  }));
}

async function updateReference(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    await prisma.serviceReferencePart.deleteMany({ where: { reference_id: Number(id) } });
    return prisma.serviceReference.update({
      where: { id: Number(id) },
      data: {
        code: input.code.toUpperCase().trim(),
        name: input.name,
        category: input.category || "muebles",
        description: input.description || "",
        estimated_minutes: Number(input.estimated_minutes || 60),
        brand: input.brand || "",
        model: input.model || "",
        active: input.active !== false,
        metadata: input.metadata || {},
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
      },
      include: referenceInclude()
    });
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
  return prisma.runWithTenant(tenantId, async () => prisma.servicePhoto.create({
    data: {
      order_id: Number(orderId),
      type: input.type,
      file_url: input.file_url || "",
      base64_data: input.base64_data || "",
      size_bytes: input.size_bytes,
      metadata: {
        mime_type: input.mime_type || "",
        file_name: input.file_name || "",
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
  createOrder,
  listReferences,
  getReference,
  createReference,
  updateReference,
  startOrder,
  moveToInspection,
  moveToExecution,
  closeOrder,
  closeNotExecuted,
  addIncident,
  addPhoto,
  listPhotos
};
