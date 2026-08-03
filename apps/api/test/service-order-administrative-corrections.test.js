const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  createService,
  hasPermission,
  validateReason,
  inspectChanges,
  transitionAllowed
} = require("../src/modules/services/administrativeCorrections");
const { requireExplicitPermission } = require("../src/middleware/rbac");

const tenantId = "tenant-a";
const admin = { id: 10, role: { name: "Administrador de empresa", permissions: [] } };
const requester = {
  id: 11,
  role: {
    name: "Supervisor",
    permissions: [{ module: "services.orders", action: "edit_any_state" }]
  }
};
const approver = { id: 12, role: { name: "Auditor", permissions: [{ module: "services.orders", action: "approve_correction" }] } };

function order(overrides = {}) {
  return {
    id: 7,
    tenant_id: tenantId,
    version: 3,
    status: "cerrada",
    notes: "Original",
    invoice_number: "",
    billing_status: "UNBILLED",
    metadata: {},
    photos: [],
    incidents: [],
    ...overrides
  };
}

function correction(overrides = {}) {
  return {
    id: "correction-1",
    tenant_id: tenantId,
    order_id: 7,
    status: "DRAFT",
    reason_code: "DATA_ENTRY_ERROR",
    description: "Correccion suficientemente explicita",
    expected_version: 3,
    sensitive: false,
    requested_by: requester.id,
    metadata: { proposed_changes: [{ type: "FIELD_UPDATED", field: "notes", value: "Corregida" }] },
    ...overrides
  };
}

function createDb({ currentOrder = order(), currentCorrection = correction(), authorization = null } = {}) {
  const calls = { tenant: [], updateMany: [], changes: [], audits: [], photos: [], createdPhotos: [], incidents: [] };
  const tx = {
    serviceOrder: {
      findFirst: async ({ where }) => where.tenant_id === tenantId && Number(where.id) === currentOrder.id ? currentOrder : null,
      updateMany: async ({ where, data }) => {
        calls.updateMany.push({ where, data });
        return { count: where.version === currentOrder.version ? 1 : 0 };
      }
    },
    serviceOrderCorrection: {
      findFirst: async ({ where }) => where.id === currentCorrection.id ? currentCorrection : null,
      findMany: async () => [currentCorrection],
      create: async ({ data }) => ({ id: "created-1", ...data, changes: [] }),
      update: async ({ data }) => Object.assign(currentCorrection, data),
      updateMany: async ({ where, data }) => {
        if (where.status && currentCorrection.status !== where.status) return { count: 0 };
        Object.assign(currentCorrection, data);
        return { count: 1 };
      },
    },
    serviceOrderCorrectionChange: {
      createMany: async ({ data }) => { calls.changes.push(...data); return { count: data.length }; },
      create: async ({ data }) => { calls.changes.push(data); return data; }
    },
    servicePhoto: {
      findFirst: async ({ where }) => currentOrder.photos.find((photo) => photo.id === where.id && photo.active !== false) || null,
      update: async ({ where, data }) => { calls.photos.push({ where, data }); return { id: where.id, ...data }; },
      create: async ({ data }) => { calls.createdPhotos.push(data); return { id: 99, ...data }; }
    },
    serviceIncident: { create: async ({ data }) => { calls.incidents.push(data); return data; } },
    evidenceUploadAuthorization: { findFirst: async () => authorization },
    auditLog: { create: async ({ data }) => { calls.audits.push(data); return data; } }
  };
  const db = {
    ...tx,
    runWithTenant: async (id, callback) => { calls.tenant.push(id); return callback(); },
    $transaction: async (callback) => callback(tx)
  };
  return { db, calls };
}

test("la edicion especial usa un unico permiso explicito y no se hereda por nombre de rol", () => {
  assert.equal(hasPermission(requester), true);
  assert.equal(hasPermission({ role: { name: "Operador", permissions: [{ module: "services", action: "write" }] } }), false);
  assert.equal(hasPermission(admin), false);
  assert.equal(hasPermission({ role: { name: "APEX_ADMIN", permissions: [{ module: "*", action: "*" }] } }), true);
});

test("el middleware explicito responde 403 incluso para un rol administrativo sin el permiso", async () => {
  let response;
  const reply = { code(status) { response = { status }; return this; }, send(body) { response.body = body; return body; } };
  await requireExplicitPermission("services.orders", "edit_any_state")({
    user: admin,
    tenant: { active_modules: ["M-26"] }, params: {}, query: {}, body: {}
  }, reply);
  assert.equal(response.status, 403);
  assert.equal(response.body.details.action, "edit_any_state");
});

test("motivo, descripcion, confirmacion y version son obligatorios", () => {
  assert.throws(() => validateReason({ reason_code: "OTHER", description: "muy corto", confirmed: true, expected_version: 3 }), (error) => error.statusCode === 400);
  assert.throws(() => validateReason({ reason_code: "DATA_ENTRY_ERROR", description: "Descripcion correcta", confirmed: false, expected_version: 3 }), (error) => error.code === "SERVICE_CORRECTION_CONFIRMATION_REQUIRED");
  assert.equal(validateReason({ reason_code: "DATA_ENTRY_ERROR", description: "Descripcion correcta", confirmed: true, expected_version: 3 }).expectedVersion, 3);
});

test("permite cualquier destino reconocido y rechaza estados inexistentes", () => {
  assert.equal(transitionAllowed("cerrada", "reabierta"), true);
  assert.equal(transitionAllowed("cerrada", "pendiente"), true);
  assert.equal(transitionAllowed("cerrada", "cerrada"), false);
  assert.equal(transitionAllowed("cerrada", "estado_inexistente"), false);
  assert.doesNotThrow(() => inspectChanges(order(), [{ type: "STATUS_CHANGED", value: "pendiente" }], requester));
  assert.throws(() => inspectChanges(order(), [{ type: "STATUS_CHANGED", value: "estado_inexistente" }], requester), (error) => error.code === "SERVICE_ORDER_TRANSITION_INVALID");
});

test("una orden facturada permite informacion y soportes con el permiso especial", () => {
  const invoiced = order({ invoice_number: "FV-100", billing_status: "INVOICED" });
  assert.doesNotThrow(() => inspectChanges(invoiced, [{ type: "FIELD_UPDATED", field: "invoice_number", value: "FV-101" }], requester));
  assert.doesNotThrow(() => inspectChanges(invoiced, [{ type: "EVIDENCE_REMOVED", evidence_id: 1 }], requester));
});

test("una orden pagada permite editar, reabrir y anexar novedades", () => {
  const paid = order({ billing_status: "PAID", metadata: { payment_status: "PAID" } });
  assert.doesNotThrow(() => inspectChanges(paid, [{ type: "OBSERVATION_ADDED", value: "Aclaracion posterior" }], requester));
  assert.doesNotThrow(() => inspectChanges(paid, [{ type: "ORDER_REOPENED" }], requester));
  assert.doesNotThrow(() => inspectChanges(paid, [{ type: "FIELD_UPDATED", field: "customer_phone", value: "3001234567" }], requester));
});

test("valida la pieza faltante como una novedad estructurada", () => {
  const piece = { type: "PIECE_ISSUE_ADDED", value: { part_id: 21, name: "Bisagra izquierda", quantity: 2, unit: "und", status: "faltante", comment: "No fue entregada", action: "solicitar_repuesto" } };
  assert.doesNotThrow(() => inspectChanges(order(), [piece], requester));
  assert.throws(() => inspectChanges(order(), [{ ...piece, value: { ...piece.value, comment: "" } }], requester), (error) => error.code === "SERVICE_CORRECTION_PIECE_COMMENT_REQUIRED");
  assert.throws(() => inspectChanges(order(), [{ ...piece, value: { ...piece.value, status: "ok" } }], requester), (error) => error.code === "SERVICE_CORRECTION_PIECE_STATUS_INVALID");
});

test("crear correccion aplica aislamiento por tenant, version e idempotencia", async () => {
  const { db, calls } = createDb();
  const service = createService(db);
  const result = await service.createCorrection(tenantId, requester, 7, {
    reason_code: "DATA_ENTRY_ERROR", description: "Se corrige la observacion registrada", confirmed: true, expected_version: 3,
    idempotency_key: "request-unique-001", changes: [{ type: "FIELD_UPDATED", field: "notes", value: "Corregida" }]
  });
  assert.equal(result.status, "DRAFT");
  assert.deepEqual(calls.tenant, [tenantId]);
  await assert.rejects(() => service.createCorrection("tenant-b", requester, 7, { reason_code: "DATA_ENTRY_ERROR", description: "Se corrige la observacion registrada", confirmed: true, expected_version: 3, changes: [{ type: "FIELD_UPDATED", field: "notes", value: "X" }] }), (error) => error.statusCode === 404);
});

test("aplicar registra antes/despues, auditoria y version en una sola transaccion", async () => {
  const { db, calls } = createDb();
  const result = await createService(db).apply(tenantId, requester, 7, "correction-1", { session_id: "session-1", ip: "127.0.0.1" });
  assert.equal(result.status, "APPLIED");
  assert.equal(calls.updateMany.length, 1);
  assert.equal(calls.updateMany[0].where.version, 3);
  assert.deepEqual(calls.updateMany[0].data.version, { increment: 1 });
  assert.equal(calls.changes[0].old_value, "Original");
  assert.equal(calls.changes[0].new_value, "Corregida");
  assert.equal(calls.audits[0].session_id, "session-1");
});

test("aplicar una pieza faltante actualiza inspeccion, reporte e incidente sin cambiar el estado", async () => {
  const pieceCorrection = correction({
    metadata: { proposed_changes: [{ type: "PIECE_ISSUE_ADDED", value: { part_id: 21, name: "Bisagra izquierda", quantity: 2, unit: "und", status: "faltante", comment: "No fue entregada", action: "solicitar_repuesto" } }] }
  });
  const { db, calls } = createDb({ currentCorrection: pieceCorrection });
  await createService(db).apply(tenantId, requester, 7, pieceCorrection.id);
  const inspection = calls.updateMany[0].data.metadata.inspection;
  assert.equal(inspection.items[0].name, "Bisagra izquierda");
  assert.equal(inspection.items[0].status, "faltante");
  assert.equal(inspection.problem_count, 1);
  assert.equal(calls.updateMany[0].data.status, undefined);
  assert.equal(calls.incidents[0].type, "pieza_faltante");
  assert.equal(calls.changes[0].change_type, "PIECE_ISSUE_ADDED");
});

test("pieza y foto se guardan atomicamente con una sola actualizacion de version", async () => {
  const piece = { type: "PIECE_ISSUE_ADDED", value: { part_id: 21, name: "Bisagra izquierda", quantity: 2, unit: "und", status: "faltante", comment: "No fue entregada", action: "solicitar_repuesto" } };
  const evidenceCorrection = correction({ metadata: { proposed_changes: [piece, { type: "EVIDENCE_ADDED", value: "pieza_averiada" }] } });
  const authorization = { id: "authorization-1", final_path: "tenant/order/piece.webp", checksum_sha256: "checksum-1", detected_size_bytes: 1024, detected_mime_type: "image/webp" };
  const { db, calls } = createDb({ currentCorrection: evidenceCorrection, authorization });
  await createService(db).addEvidence(tenantId, requester, 7, evidenceCorrection.id, { authorization_id: authorization.id, type: "pieza_averiada", metadata: { part_id: 21, part_name: "Bisagra izquierda" } });
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].data.version, { increment: 1 });
  assert.equal(calls.updateMany[0].data.metadata.inspection.items[0].status, "faltante");
  assert.equal(calls.createdPhotos[0].metadata.part_id, 21);
  assert.equal(calls.incidents[0].photo_url, "service-images/tenant/order/piece.webp");
  assert.deepEqual(calls.changes.map((item) => item.change_type), ["PIECE_ISSUE_ADDED", "EVIDENCE_ADDED"]);
});

test("un conflicto optimista responde 409 y no sobrescribe", async () => {
  const { db, calls } = createDb({ currentOrder: order({ version: 4 }) });
  await assert.rejects(() => createService(db).apply(tenantId, requester, 7, "correction-1"), (error) => error.statusCode === 409 && error.code === "SERVICE_ORDER_VERSION_CONFLICT");
  assert.equal(calls.updateMany.length, 0);
});

test("retirar evidencia es baja logica y conserva el registro", async () => {
  const evidenceCorrection = correction({ status: "APPROVED", sensitive: true, metadata: { proposed_changes: [{ type: "EVIDENCE_REMOVED", evidence_id: 55 }] } });
  const { db, calls } = createDb({ currentOrder: order({ photos: [{ id: 55, active: true, type: "producto_abierto" }] }), currentCorrection: evidenceCorrection });
  await createService(db).apply(tenantId, requester, 7, "correction-1");
  assert.equal(calls.photos.length, 1);
  assert.equal(calls.photos[0].data.active, false);
  assert.equal(calls.photos[0].data.withdrawn_by_correction_id, "correction-1");
  assert.equal(calls.changes[0].change_type, "EVIDENCE_REMOVED");
});

test("un usuario sin el permiso unico no puede aplicar la correccion", async () => {
  const approved = correction({ status: "APPROVED", sensitive: true });
  const { db, calls } = createDb({ currentCorrection: approved });
  await assert.rejects(
    () => createService(db).apply(tenantId, approver, 7, approved.id),
    (error) => error.statusCode === 403 && error.code === "SERVICE_CORRECTION_PERMISSION_DENIED"
  );
  assert.equal(calls.updateMany.length, 0);
});

test("una correccion no cambia estado ni banderas financieras implicitamente", async () => {
  const ready = order({ status: "lista_facturacion", billing_status: "READY_FOR_BILLING" });
  const material = correction({
    metadata: { proposed_changes: [{ type: "FIELD_UPDATED", field: "notes", value: "Revisar soporte antes de facturar" }] }
  });
  const { db, calls } = createDb({ currentOrder: ready, currentCorrection: material });
  await createService(db).apply(tenantId, requester, 7, material.id);
  assert.equal(calls.updateMany[0].data.status, undefined);
  assert.equal(calls.updateMany[0].data.billing_status, undefined);
  assert.equal(calls.updateMany[0].data.billing_blocked, undefined);
});

test("la migracion conserva archivos e impide mutar el detalle historico", () => {
  const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260731110000_service_order_administrative_corrections/migration.sql"), "utf8");
  assert.match(migration, /ServiceOrderCorrectionChange_immutable/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true/);
  assert.doesNotMatch(migration, /DELETE FROM "ServicePhoto"/);
});
