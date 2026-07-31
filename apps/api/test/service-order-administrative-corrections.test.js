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
const { requirePermission } = require("../src/middleware/rbac");

const tenantId = "tenant-a";
const admin = { id: 10, role: { name: "Administrador de empresa", permissions: [] } };
const requester = {
  id: 11,
  role: {
    name: "Supervisor",
    permissions: [
      { module: "services.orders", action: "administrative_correction" },
      { module: "services.orders", action: "correct_information" },
      { module: "services.orders", action: "add_observation" },
      { module: "services.orders", action: "change_state" },
      { module: "services.orders", action: "manage_evidence" },
      { module: "services.orders", action: "force_close" },
      { module: "services.orders", action: "view_correction_history" }
    ]
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

function createDb({ currentOrder = order(), currentCorrection = correction() } = {}) {
  const calls = { tenant: [], updateMany: [], changes: [], audits: [], photos: [], incidents: [] };
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
      create: async ({ data }) => ({ id: 99, ...data })
    },
    serviceIncident: { create: async ({ data }) => { calls.incidents.push(data); return data; } },
    evidenceUploadAuthorization: { findFirst: async () => null },
    auditLog: { create: async ({ data }) => { calls.audits.push(data); return data; } }
  };
  const db = {
    ...tx,
    runWithTenant: async (id, callback) => { calls.tenant.push(id); return callback(); },
    $transaction: async (callback) => callback(tx)
  };
  return { db, calls };
}

test("los permisos de correccion son independientes y no se heredan de services:write", () => {
  assert.equal(hasPermission(requester, "correct_information"), true);
  assert.equal(hasPermission({ role: { name: "Operador", permissions: [{ module: "services", action: "write" }] } }, "correct_information"), false);
  assert.equal(hasPermission(admin, "force_close"), true);
});

test("el middleware backend responde 403 sin permiso granular", async () => {
  let response;
  const reply = { code(status) { response = { status }; return this; }, send(body) { response.body = body; return body; } };
  await requirePermission("services.orders", "administrative_correction")({
    user: { role: { name: "Tecnico", permissions: [{ module: "services", action: "write" }] } },
    tenant: { active_modules: ["M-26"] }, params: {}, query: {}, body: {}
  }, reply);
  assert.equal(response.status, 403);
  assert.equal(response.body.details.action, "administrative_correction");
});

test("motivo, descripcion, confirmacion y version son obligatorios", () => {
  assert.throws(() => validateReason({ reason_code: "OTHER", description: "muy corto", confirmed: true, expected_version: 3 }), (error) => error.statusCode === 400);
  assert.throws(() => validateReason({ reason_code: "DATA_ENTRY_ERROR", description: "Descripcion correcta", confirmed: false, expected_version: 3 }), (error) => error.code === "SERVICE_CORRECTION_CONFIRMATION_REQUIRED");
  assert.equal(validateReason({ reason_code: "DATA_ENTRY_ERROR", description: "Descripcion correcta", confirmed: true, expected_version: 3 }).expectedVersion, 3);
});

test("la matriz rechaza transiciones arbitrarias", () => {
  assert.equal(transitionAllowed("cerrada", "reabierta"), true);
  assert.equal(transitionAllowed("cerrada", "pendiente"), false);
  assert.throws(() => inspectChanges(order(), [{ type: "STATUS_CHANGED", value: "pendiente" }], requester), (error) => error.code === "SERVICE_ORDER_TRANSITION_INVALID");
});

test("una orden facturada bloquea cambios financieros y de soportes", () => {
  const invoiced = order({ invoice_number: "FV-100", billing_status: "INVOICED" });
  assert.throws(() => inspectChanges(invoiced, [{ type: "FIELD_UPDATED", field: "invoice_number", value: "FV-101" }], requester), (error) => error.code === "SERVICE_ORDER_INVOICED_LOCKED");
  assert.throws(() => inspectChanges(invoiced, [{ type: "EVIDENCE_REMOVED", evidence_id: 1 }], requester), (error) => error.code === "SERVICE_ORDER_INVOICED_LOCKED");
});

test("una orden pagada solo admite notas u observaciones no financieras", () => {
  const paid = order({ billing_status: "PAID", metadata: { payment_status: "PAID" } });
  assert.doesNotThrow(() => inspectChanges(paid, [{ type: "OBSERVATION_ADDED", value: "Aclaracion posterior" }], requester));
  assert.throws(() => inspectChanges(paid, [{ type: "ORDER_REOPENED" }], requester), (error) => error.code === "SERVICE_ORDER_PAID_LOCKED");
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

test("doble aprobacion impide autoaprobacion y permite aprobador independiente", async () => {
  const pending = correction({ status: "PENDING_APPROVAL", sensitive: true });
  const first = createService(createDb({ currentCorrection: pending }).db);
  await assert.rejects(() => first.approve(tenantId, { ...approver, id: requester.id }, 7, pending.id), (error) => error.code === "SERVICE_CORRECTION_SELF_APPROVAL_FORBIDDEN");
  const approved = await first.approve(tenantId, approver, 7, pending.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approved_by, approver.id);
});

test("aprobacion concurrente no sobrescribe una decision previa", async () => {
  const pending = correction({ status: "PENDING_APPROVAL", sensitive: true });
  const { db } = createDb({ currentCorrection: pending });
  db.serviceOrderCorrection.updateMany = async () => ({ count: 0 });
  await assert.rejects(
    () => createService(db).approve(tenantId, approver, 7, pending.id),
    (error) => error.statusCode === 409 && error.code === "SERVICE_CORRECTION_APPROVAL_CONFLICT"
  );
});

test("el aprobador sin permiso operativo no puede aplicar la correccion", async () => {
  const approved = correction({ status: "APPROVED", sensitive: true });
  const { db, calls } = createDb({ currentCorrection: approved });
  await assert.rejects(
    () => createService(db).apply(tenantId, approver, 7, approved.id),
    (error) => error.statusCode === 403 && error.code === "SERVICE_CORRECTION_PERMISSION_DENIED"
  );
  assert.equal(calls.updateMany.length, 0);
});

test("una correccion material devuelve la orden lista para facturar a revision", async () => {
  const ready = order({ status: "lista_facturacion", billing_status: "READY_FOR_BILLING" });
  const material = correction({
    metadata: { proposed_changes: [{ type: "FIELD_UPDATED", field: "notes", value: "Revisar soporte antes de facturar" }] }
  });
  const { db, calls } = createDb({ currentOrder: ready, currentCorrection: material });
  await createService(db).apply(tenantId, requester, 7, material.id);
  assert.equal(calls.updateMany[0].data.status, "revision");
  assert.equal(calls.updateMany[0].data.billing_status, "IN_REVIEW");
  assert.equal(calls.updateMany[0].data.billing_blocked, true);
});

test("la migracion conserva archivos e impide mutar el detalle historico", () => {
  const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260731110000_service_order_administrative_corrections/migration.sql"), "utf8");
  assert.match(migration, /ServiceOrderCorrectionChange_immutable/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true/);
  assert.doesNotMatch(migration, /DELETE FROM "ServicePhoto"/);
});
