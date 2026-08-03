const prisma = require("../../core/prisma");

const REASON_CODES = new Set([
  "INCOMPLETE_INFORMATION",
  "DATA_ENTRY_ERROR",
  "MISSING_EVIDENCE",
  "INCORRECT_EVIDENCE",
  "INCORRECT_STATUS",
  "INCOMPLETE_CLOSURE",
  "CUSTOMER_REQUEST",
  "BILLING_CORRECTION",
  "OTHER"
]);

const CHANGE_TYPES = new Set([
  "FIELD_UPDATED",
  "EVIDENCE_ADDED",
  "EVIDENCE_REMOVED",
  "STATUS_CHANGED",
  "ORDER_REOPENED",
  "ORDER_FORCE_CLOSED",
  "OBSERVATION_ADDED"
]);

const SERVICE_ORDER_OVERRIDE_PERMISSION = "edit_any_state";
const ADMINISTRATIVE_STATUSES = Object.freeze([
  "agendado",
  "pendiente",
  "en_curso",
  "inspeccion",
  "ejecucion",
  "cerrada",
  "no_ejecutada",
  "cancelada",
  "revision",
  "reabierta",
  "lista_facturacion"
]);
const ADMINISTRATIVE_STATUS_SET = new Set(ADMINISTRATIVE_STATUSES);

const CORRECTABLE_FIELDS = new Map([
  ["notes", {}],
  ["customer_name", {}],
  ["customer_address", {}],
  ["customer_phone", {}],
  ["service_type", {}],
  ["reference_id", { numeric: true }],
  ["technician_id", { numeric: true }],
  ["scheduled_date", { date: true, sensitive: true }],
  ["invoice_number", { sensitive: true, financial: true }],
  ["metadata.inspection", { sensitive: true }],
  ["metadata.customer_document", {}]
]);

const ADMINISTRATIVE_TRANSITIONS = Object.freeze(Object.fromEntries(
  ADMINISTRATIVE_STATUSES.map((from) => [from, ADMINISTRATIVE_STATUSES.filter((to) => to !== from)])
));

function appError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function hasPermission(user) {
  return (user?.role?.permissions || []).some((permission) => {
    const moduleAllowed = permission.module === "*" || permission.module === "services.orders";
    const actionAllowed = permission.action === "*" || permission.action === SERVICE_ORDER_OVERRIDE_PERMISSION;
    return moduleAllowed && actionAllowed;
  });
}

function assertPermission(user) {
  if (!hasPermission(user)) {
    throw appError(403, "SERVICE_CORRECTION_PERMISSION_DENIED", "No tienes permiso para editar ordenes en cualquier estado", { permission: `services.orders.${SERVICE_ORDER_OVERRIDE_PERMISSION}` });
  }
}

function validateReason(input = {}) {
  const reasonCode = String(input.reason_code || "").trim().toUpperCase();
  const description = String(input.description || "").trim();
  if (!REASON_CODES.has(reasonCode)) throw appError(400, "SERVICE_CORRECTION_REASON_INVALID", "Selecciona un motivo de correccion valido");
  if (description.length < 12) throw appError(400, "SERVICE_CORRECTION_DESCRIPTION_REQUIRED", "Describe la correccion con al menos 12 caracteres");
  if (reasonCode === "OTHER" && description.length < 24) {
    throw appError(400, "SERVICE_CORRECTION_OTHER_DESCRIPTION_REQUIRED", "El motivo Otro requiere una descripcion explicita de al menos 24 caracteres");
  }
  if (input.confirmed !== true) throw appError(400, "SERVICE_CORRECTION_CONFIRMATION_REQUIRED", "Confirma que la correccion quedara auditada");
  const expectedVersion = Number(input.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw appError(400, "SERVICE_CORRECTION_VERSION_REQUIRED", "La version esperada de la orden es obligatoria");
  return { reasonCode, description, expectedVersion };
}

function normalizedChanges(input = {}) {
  if (!Array.isArray(input.changes) || !input.changes.length) throw appError(400, "SERVICE_CORRECTION_CHANGES_REQUIRED", "Registra al menos un cambio controlado");
  return input.changes.map((change) => {
    const type = String(change?.type || "").trim().toUpperCase();
    if (!CHANGE_TYPES.has(type)) throw appError(400, "SERVICE_CORRECTION_CHANGE_INVALID", `Tipo de cambio no permitido: ${type || "vacio"}`);
    return { ...change, type };
  });
}

function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function setPath(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] = { ...(cursor[key] || {}) };
  cursor[keys.at(-1)] = value;
}

function jsonValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return JSON.parse(JSON.stringify(value));
}

function financialStage(order) {
  const metadata = order?.metadata && typeof order.metadata === "object" ? order.metadata : {};
  const raw = String(metadata.payment_status || metadata.billing_status || order.billing_status || "").toUpperCase();
  if (["PAID", "PAGADA", "PAGADO"].includes(raw)) return "PAID";
  if (order.invoice_number || ["INVOICED", "FACTURADA", "POSTED"].includes(raw)) return "INVOICED";
  if (["READY_FOR_BILLING", "LISTA_FACTURACION"].includes(raw) || order.status === "lista_facturacion") return "READY_FOR_BILLING";
  return "UNBILLED";
}

function transitionAllowed(from, to) {
  const current = String(from || "").toLowerCase();
  const next = String(to || "").toLowerCase();
  return Boolean(current) && current !== next && ADMINISTRATIVE_STATUS_SET.has(next);
}

function inspectChanges(order, changes, user) {
  assertPermission(user);
  let sensitive = false;
  let financialImpact = false;
  for (const change of changes) {
    if (change.type === "FIELD_UPDATED") {
      const field = String(change.field || "");
      const policy = CORRECTABLE_FIELDS.get(field);
      if (!policy) throw appError(400, "SERVICE_CORRECTION_FIELD_INVALID", `El campo ${field || "vacio"} no admite correccion administrativa`);
      sensitive ||= Boolean(policy.sensitive);
      financialImpact ||= Boolean(policy.financial);
    } else if (change.type === "OBSERVATION_ADDED") {
      if (String(change.value || "").trim().length < 4) throw appError(400, "SERVICE_CORRECTION_OBSERVATION_REQUIRED", "La novedad no puede estar vacia");
    } else if (["STATUS_CHANGED", "ORDER_REOPENED"].includes(change.type)) {
      sensitive = true;
      const nextStatus = change.type === "ORDER_REOPENED" ? "reabierta" : String(change.value || "").toLowerCase();
      if (!transitionAllowed(order.status, nextStatus)) throw appError(409, "SERVICE_ORDER_TRANSITION_INVALID", `Transicion administrativa no permitida: ${order.status} -> ${nextStatus}`);
    } else if (change.type === "ORDER_FORCE_CLOSED") {
      sensitive = true;
      if (!transitionAllowed(order.status, "cerrada")) throw appError(409, "SERVICE_ORDER_FORCE_CLOSE_INVALID", "La orden ya se encuentra cerrada");
    } else if (["EVIDENCE_ADDED", "EVIDENCE_REMOVED"].includes(change.type)) {
      sensitive ||= change.type === "EVIDENCE_REMOVED";
    }
  }
  const stage = financialStage(order);
  return { sensitive, financialImpact, stage };
}

function actorMetadata(context = {}) {
  return {
    session_id: context.session_id || null,
    ip: context.ip || null,
    user_agent: context.user_agent || null,
    request_id: context.request_id || null
  };
}

function includeCorrection() {
  return { changes: { orderBy: { created_at: "asc" } }, added_evidence: true, withdrawn_evidence: true };
}

function createService(db = prisma) {
  async function withinTenant(tenantId, callback) {
    return typeof db.runWithTenant === "function" ? db.runWithTenant(tenantId, callback) : callback();
  }

  async function orderForTenant(client, tenantId, orderId) {
    const order = await client.serviceOrder.findFirst({ where: { id: Number(orderId), tenant_id: tenantId }, include: { photos: true, incidents: true } });
    if (!order) throw appError(404, "SERVICE_ORDER_NOT_AVAILABLE", "La orden no existe en esta empresa");
    return order;
  }

  async function createCorrection(tenantId, user, orderId, input = {}, context = {}) {
    assertPermission(user, "administrative_correction");
    const { reasonCode, description, expectedVersion } = validateReason(input);
    const changes = normalizedChanges(input);
    return withinTenant(tenantId, async () => {
      const order = await orderForTenant(db, tenantId, orderId);
      if (order.version !== expectedVersion) throw appError(409, "SERVICE_ORDER_VERSION_CONFLICT", "La orden cambio mientras preparabas la correccion", { expected_version: expectedVersion, current_version: order.version });
      const assessment = inspectChanges(order, changes, user);
      const idempotencyKey = String(input.idempotency_key || "").trim() || null;
      if (idempotencyKey) {
        const existing = await db.serviceOrderCorrection.findFirst({ where: { tenant_id: tenantId, order_id: order.id, idempotency_key: idempotencyKey }, include: includeCorrection() });
        if (existing) return existing;
      }
      return db.serviceOrderCorrection.create({
        data: {
          order_id: order.id,
          status: "DRAFT",
          reason_code: reasonCode,
          description,
          expected_version: expectedVersion,
          sensitive: assessment.sensitive,
          financial_impact: assessment.financialImpact,
          idempotency_key: idempotencyKey,
          requested_by: user.id,
          metadata: { proposed_changes: changes, financial_stage: assessment.stage, actor: actorMetadata(context) }
        },
        include: includeCorrection()
      });
    });
  }

  async function listHistory(tenantId, user, orderId) {
    assertPermission(user, "view_correction_history");
    return withinTenant(tenantId, async () => {
      await orderForTenant(db, tenantId, orderId);
      return db.serviceOrderCorrection.findMany({ where: { tenant_id: tenantId, order_id: Number(orderId) }, include: includeCorrection(), orderBy: { created_at: "desc" }, take: 100 });
    });
  }

  async function getCorrection(tenantId, user, orderId, correctionId) {
    assertPermission(user, "view_correction_history");
    return withinTenant(tenantId, async () => {
      const correction = await db.serviceOrderCorrection.findFirst({ where: { id: correctionId, tenant_id: tenantId, order_id: Number(orderId) }, include: includeCorrection() });
      if (!correction) throw appError(404, "SERVICE_CORRECTION_NOT_FOUND", "Correccion no encontrada");
      return correction;
    });
  }

  async function approve(tenantId, user, orderId, correctionId) {
    assertPermission(user, "approve_correction");
    return withinTenant(tenantId, async () => {
      const correction = await db.serviceOrderCorrection.findFirst({ where: { id: correctionId, tenant_id: tenantId, order_id: Number(orderId) } });
      if (!correction) throw appError(404, "SERVICE_CORRECTION_NOT_FOUND", "Correccion no encontrada");
      if (correction.status !== "PENDING_APPROVAL") throw appError(409, "SERVICE_CORRECTION_NOT_PENDING", "La correccion no esta pendiente de aprobacion");
      if (Number(correction.requested_by) === Number(user.id)) throw appError(403, "SERVICE_CORRECTION_SELF_APPROVAL_FORBIDDEN", "El solicitante no puede aprobar su propia correccion sensible");
      const approved = await db.serviceOrderCorrection.updateMany({
        where: { id: correction.id, tenant_id: tenantId, order_id: Number(orderId), status: "PENDING_APPROVAL" },
        data: { status: "APPROVED", approved_by: user.id, approved_at: new Date() }
      });
      if (approved.count !== 1) throw appError(409, "SERVICE_CORRECTION_APPROVAL_CONFLICT", "La correccion ya fue procesada por otro usuario");
      return db.serviceOrderCorrection.findFirst({ where: { id: correction.id, tenant_id: tenantId, order_id: Number(orderId) }, include: includeCorrection() });
    });
  }

  async function reject(tenantId, user, orderId, correctionId, input = {}) {
    assertPermission(user, "approve_correction");
    const reason = String(input.rejection_reason || "").trim();
    if (reason.length < 8) throw appError(400, "SERVICE_CORRECTION_REJECTION_REASON_REQUIRED", "Explica el rechazo con al menos 8 caracteres");
    return withinTenant(tenantId, async () => {
      const correction = await db.serviceOrderCorrection.findFirst({ where: { id: correctionId, tenant_id: tenantId, order_id: Number(orderId) } });
      if (!correction) throw appError(404, "SERVICE_CORRECTION_NOT_FOUND", "Correccion no encontrada");
      if (correction.status !== "PENDING_APPROVAL") throw appError(409, "SERVICE_CORRECTION_NOT_PENDING", "La correccion no esta pendiente de aprobacion");
      const rejected = await db.serviceOrderCorrection.updateMany({
        where: { id: correction.id, tenant_id: tenantId, order_id: Number(orderId), status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", rejected_by: user.id, rejected_at: new Date(), rejection_reason: reason }
      });
      if (rejected.count !== 1) throw appError(409, "SERVICE_CORRECTION_REJECTION_CONFLICT", "La correccion ya fue procesada por otro usuario");
      return db.serviceOrderCorrection.findFirst({ where: { id: correction.id, tenant_id: tenantId, order_id: Number(orderId) }, include: includeCorrection() });
    });
  }

  function prepareMutation(order, changes, correction, user) {
    const data = { administratively_modified: true, version: { increment: 1 } };
    const metadata = { ...(order.metadata || {}) };
    const detail = [];
    let status = order.status;
    for (const change of changes) {
      if (change.type === "FIELD_UPDATED") {
        const policy = CORRECTABLE_FIELDS.get(change.field);
        let next = change.value;
        if (policy.numeric) next = Number(next);
        if (policy.date) next = new Date(next);
        const previous = getPath(order, change.field);
        if (change.field.startsWith("metadata.")) setPath(metadata, change.field.slice(9), next);
        else data[change.field] = next;
        detail.push({ change_type: "FIELD_UPDATED", field_name: change.field, old_value: jsonValue(previous), new_value: jsonValue(next) });
      } else if (change.type === "OBSERVATION_ADDED") {
        detail.push({ change_type: "OBSERVATION_ADDED", field_name: "observation", old_value: null, new_value: jsonValue(String(change.value).trim()) });
      } else if (["STATUS_CHANGED", "ORDER_REOPENED", "ORDER_FORCE_CLOSED"].includes(change.type)) {
        const nextStatus = change.type === "ORDER_REOPENED" ? "reabierta" : change.type === "ORDER_FORCE_CLOSED" ? "cerrada" : String(change.value).toLowerCase();
        detail.push({ change_type: change.type, field_name: "status", old_value: jsonValue(status), new_value: jsonValue(nextStatus), old_status: status, new_status: nextStatus });
        if (change.type === "ORDER_REOPENED") {
          metadata.previous_closure = { status, closed_at: order.closed_at, reopened_by: user.id, reopened_at: new Date().toISOString(), correction_id: correction.id };
          data.closed_at = null;
        }
        if (change.type === "ORDER_FORCE_CLOSED") {
          data.closed_at = new Date();
          metadata.administrative_close = { pending_requirements: change.pending_requirements || [], observation: String(change.observation || ""), closed_by: user.id, correction_id: correction.id };
        }
        if (["cerrada", "no_ejecutada"].includes(nextStatus) && !data.closed_at) data.closed_at = order.closed_at || new Date();
        if (!["cerrada", "no_ejecutada"].includes(nextStatus) && !["ORDER_FORCE_CLOSED"].includes(change.type)) data.closed_at = null;
        data.status = nextStatus;
        status = nextStatus;
      } else if (change.type === "EVIDENCE_REMOVED") {
        detail.push({ change_type: "EVIDENCE_REMOVED", field_name: "evidence", old_value: jsonValue(change.evidence_id), new_value: null, evidence_id: Number(change.evidence_id) });
      }
    }
    if (Object.keys(metadata).length) data.metadata = metadata;
    return { data, detail };
  }

  async function apply(tenantId, user, orderId, correctionId, context = {}) {
    assertPermission(user, "administrative_correction");
    return withinTenant(tenantId, async () => db.$transaction(async (tx) => {
      const correction = await tx.serviceOrderCorrection.findFirst({ where: { id: correctionId, tenant_id: tenantId, order_id: Number(orderId) } });
      if (!correction) throw appError(404, "SERVICE_CORRECTION_NOT_FOUND", "Correccion no encontrada");
      if (correction.status === "APPLIED") return tx.serviceOrderCorrection.findFirst({ where: { id: correction.id }, include: includeCorrection() });
      if (!["DRAFT", "APPROVED"].includes(correction.status)) throw appError(409, "SERVICE_CORRECTION_NOT_APPLICABLE", "La correccion no esta disponible para aplicar");
      const order = await orderForTenant(tx, tenantId, orderId);
      if (order.version !== correction.expected_version) throw appError(409, "SERVICE_ORDER_VERSION_CONFLICT", "La orden fue modificada por otro usuario; recarga y compara la version vigente", { expected_version: correction.expected_version, current_version: order.version });
      const changes = normalizedChanges({ changes: correction.metadata?.proposed_changes || [] });
      inspectChanges(order, changes, user);
      const { data, detail } = prepareMutation(order, changes, correction, user);

      for (const change of changes.filter((item) => item.type === "EVIDENCE_REMOVED")) {
        const evidence = await tx.servicePhoto.findFirst({ where: { id: Number(change.evidence_id), tenant_id: tenantId, order_id: order.id, active: true } });
        if (!evidence) throw appError(404, "SERVICE_EVIDENCE_NOT_AVAILABLE", "La evidencia no existe, pertenece a otra empresa o ya fue retirada");
        await tx.servicePhoto.update({ where: { id: evidence.id }, data: { active: false, withdrawn_at: new Date(), withdrawn_by: user.id, withdrawal_reason: correction.description, withdrawn_by_correction_id: correction.id } });
      }
      for (const change of changes.filter((item) => item.type === "OBSERVATION_ADDED")) {
        await tx.serviceIncident.create({ data: { order_id: order.id, type: "administrative_observation", description: String(change.value).trim(), action: "administrative_correction", metadata: { correction_id: correction.id, reason_code: correction.reason_code, added_by: user.id } } });
      }

      const updated = await tx.serviceOrder.updateMany({ where: { id: order.id, tenant_id: tenantId, version: correction.expected_version }, data });
      if (updated.count !== 1) throw appError(409, "SERVICE_ORDER_VERSION_CONFLICT", "La orden cambio durante la aplicacion de la correccion");
      if (detail.length) await tx.serviceOrderCorrectionChange.createMany({ data: detail.map((item) => ({ ...item, correction_id: correction.id })) });
      await tx.auditLog.create({ data: { user_id: user.id, session_id: context.session_id || null, action: "service_order.administrative_correction.applied", module: "services", entity: "ServiceOrder", entity_id: String(order.id), old_value: { version: order.version, status: order.status }, new_value: { version: order.version + 1, correction_id: correction.id, changes: detail.length }, ip: context.ip || null, user_agent: context.user_agent || null } });
      await tx.serviceOrderCorrection.update({ where: { id: correction.id }, data: { status: "APPLIED", applied_by: user.id, applied_at: new Date(), metadata: { ...(correction.metadata || {}), applied_actor: actorMetadata(context) } } });
      return tx.serviceOrderCorrection.findFirst({ where: { id: correction.id }, include: includeCorrection() });
    }, { maxWait: 5_000, timeout: 20_000 }));
  }

  async function createAction(tenantId, user, orderId, type, input, context) {
    return createCorrection(tenantId, user, orderId, { ...input, changes: [{ type, value: input.status, observation: input.observation, pending_requirements: input.pending_requirements }] }, context);
  }

  async function addEvidence(tenantId, user, orderId, correctionId, input = {}, context = {}) {
    assertPermission(user, "manage_evidence");
    const authorizationId = String(input.authorization_id || "").trim();
    const type = String(input.type || "").trim();
    if (!authorizationId || !type) throw appError(400, "SERVICE_EVIDENCE_AUTHORIZATION_REQUIRED", "La autorizacion validada y el tipo de evidencia son obligatorios");
    return withinTenant(tenantId, async () => db.$transaction(async (tx) => {
      const correction = await tx.serviceOrderCorrection.findFirst({ where: { id: correctionId, tenant_id: tenantId, order_id: Number(orderId) } });
      if (!correction) throw appError(404, "SERVICE_CORRECTION_NOT_FOUND", "Correccion no encontrada");
      if (!["DRAFT", "APPROVED"].includes(correction.status)) throw appError(409, "SERVICE_CORRECTION_NOT_APPLICABLE", "La correccion no esta disponible para agregar evidencia");
      const proposed = normalizedChanges({ changes: correction.metadata?.proposed_changes || [] });
      if (!proposed.some((change) => change.type === "EVIDENCE_ADDED")) throw appError(409, "SERVICE_EVIDENCE_CHANGE_NOT_DECLARED", "La correccion no declaro un alta de evidencia");
      const order = await orderForTenant(tx, tenantId, orderId);
      if (order.version !== correction.expected_version) throw appError(409, "SERVICE_ORDER_VERSION_CONFLICT", "La orden cambio antes de agregar la evidencia", { expected_version: correction.expected_version, current_version: order.version });
      const authorization = await tx.evidenceUploadAuthorization.findFirst({ where: { id: authorizationId, tenant_id: tenantId, order_key: String(order.id), user_id: user.id, status: "validated" } });
      if (!authorization?.final_path || !authorization.checksum_sha256) throw appError(409, "SERVICE_EVIDENCE_NOT_VALIDATED", "La evidencia no supero cuarentena y validacion binaria");
      const duplicate = await tx.servicePhoto.findFirst({ where: { tenant_id: tenantId, order_id: order.id, active: true, metadata: { path: ["checksum_sha256"], equals: authorization.checksum_sha256 } } });
      if (duplicate) throw appError(409, "SERVICE_EVIDENCE_DUPLICATE", "La misma evidencia ya esta activa en la orden");
      const photo = await tx.servicePhoto.create({ data: { order_id: order.id, type, storage_path: `service-images/${authorization.final_path}`, size_bytes: authorization.detected_size_bytes, active: true, administratively_added: true, added_by_correction_id: correction.id, metadata: { mime_type: authorization.detected_mime_type, checksum_sha256: authorization.checksum_sha256, authorization_id: authorization.id, administrative_reason: correction.description, added_by: user.id } } });
      const updated = await tx.serviceOrder.updateMany({ where: { id: order.id, tenant_id: tenantId, version: correction.expected_version }, data: { version: { increment: 1 }, administratively_modified: true } });
      if (updated.count !== 1) throw appError(409, "SERVICE_ORDER_VERSION_CONFLICT", "La orden cambio durante el alta de evidencia");
      await tx.serviceOrderCorrectionChange.create({ data: { correction_id: correction.id, change_type: "EVIDENCE_ADDED", field_name: "evidence", old_value: null, new_value: { type, authorization_id: authorization.id }, evidence_id: photo.id } });
      await tx.auditLog.create({ data: { user_id: user.id, session_id: context.session_id || null, action: "service_order.administrative_evidence.added", module: "services", entity: "ServiceOrder", entity_id: String(order.id), old_value: { version: order.version }, new_value: { version: order.version + 1, correction_id: correction.id, evidence_id: photo.id }, ip: context.ip || null, user_agent: context.user_agent || null } });
      await tx.serviceOrderCorrection.update({ where: { id: correction.id }, data: { status: "APPLIED", applied_by: user.id, applied_at: new Date() } });
      return { correction: await tx.serviceOrderCorrection.findFirst({ where: { id: correction.id }, include: includeCorrection() }), evidence: photo };
    }, { maxWait: 5_000, timeout: 20_000 }));
  }

  function forceClose(tenantId, user, orderId, input, context) {
    if (input?.evidence_reviewed !== true) throw appError(400, "SERVICE_FORCE_CLOSE_EVIDENCE_REVIEW_REQUIRED", "Confirma la revision de evidencias antes del cierre administrativo");
    return createAction(tenantId, user, orderId, "ORDER_FORCE_CLOSED", input, context);
  }

  return {
    createCorrection,
    listHistory,
    getCorrection,
    approve,
    reject,
    apply,
    reopen: (tenantId, user, orderId, input, context) => createAction(tenantId, user, orderId, "ORDER_REOPENED", input, context),
    forceClose,
    addEvidence
  };
}

module.exports = {
  ...createService(),
  createService,
  hasPermission,
  validateReason,
  normalizedChanges,
  inspectChanges,
  financialStage,
  transitionAllowed,
  ADMINISTRATIVE_TRANSITIONS,
  ADMINISTRATIVE_STATUSES,
  SERVICE_ORDER_OVERRIDE_PERMISSION,
  REASON_CODES
};
