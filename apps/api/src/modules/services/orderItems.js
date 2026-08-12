const ITEM_STATUSES = new Set(["pendiente", "en_curso", "inspeccion", "ejecucion", "completada", "no_ejecutada", "bloqueada"]);
const FINAL_ITEM_STATUSES = new Set(["completada", "no_ejecutada"]);

function normalizeItem(input = {}, index = 0) {
  return {
    reference_id: Number(input.reference_id),
    service_type: String(input.service_type || "").trim(),
    quantity: Number(input.quantity ?? 1),
    description: String(input.description || "").trim(),
    observation: String(input.observation || "").trim(),
    display_order: index,
    idempotency_key: input.idempotency_key ? String(input.idempotency_key).trim() : null
  };
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return "La orden debe contener entre 1 y 20 solicitudes.";
  for (const [index, raw] of items.entries()) {
    const item = normalizeItem(raw, index);
    if (!Number.isInteger(item.reference_id) || item.reference_id <= 0) return `La solicitud ${index + 1} requiere una referencia valida.`;
    if (!item.service_type) return `La solicitud ${index + 1} requiere un tipo de servicio.`;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return `La solicitud ${index + 1} requiere una cantidad mayor que cero.`;
  }
  return "";
}

function aggregateItemProgress(items = []) {
  const counts = { total: items.length, pending: 0, active: 0, completed: 0, blocked: 0 };
  for (const item of items) {
    if (FINAL_ITEM_STATUSES.has(item.status)) counts.completed += 1;
    else if (item.status === "bloqueada") counts.blocked += 1;
    else if (item.status === "pendiente") counts.pending += 1;
    else counts.active += 1;
  }
  const allCompleted = counts.total > 0 && counts.completed === counts.total;
  const partial = counts.completed > 0 && !allCompleted;
  let orderStatus = "pendiente";
  if (counts.active || partial || counts.blocked) orderStatus = "ejecucion";
  return { ...counts, all_completed: allCompleted, partial, order_status: orderStatus };
}

function legacyItem(order) {
  if (!order || !order.reference_id) return [];
  return [{
    id: `legacy-${order.id}`,
    legacy: true,
    order_id: order.id,
    reference_id: order.reference_id,
    reference: order.reference || null,
    service_type: order.service_type,
    quantity: 1,
    description: order.notes || "",
    observation: "",
    status: order.status,
    version: order.version || 1,
    photos: order.photos || [],
    incidents: order.incidents || []
  }];
}

module.exports = { ITEM_STATUSES, FINAL_ITEM_STATUSES, normalizeItem, validateItems, aggregateItemProgress, legacyItem };
