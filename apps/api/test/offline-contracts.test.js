const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OFFLINE_OPERATION_TYPES,
  validateOfflineOperation,
  validateSyncOperationResult
} = require("../../../packages/types/offline");

function validOperation() {
  return {
    operationId: "0cb4dd6e-f0fd-43c0-81ac-c9af24a663e1",
    type: "SERVICE_STARTED",
    entityId: "order-10",
    tenantId: "tenant-qa",
    userId: "technician-1",
    deviceId: "device-1",
    baseVersion: 3,
    occurredAt: "2026-07-27T15:00:00.000Z",
    payload: { latitude: 4.7, longitude: -74.1 }
  };
}

test("los contratos offline se serializan y validan", () => {
  const serialized = JSON.stringify(validOperation());
  const result = validateOfflineOperation(JSON.parse(serialized));
  assert.equal(result.success, true);
  assert.deepEqual(result.data, validOperation());
});

test("rechaza cada tipo de operacion invalido", () => {
  const result = validateOfflineOperation({ ...validOperation(), type: "DELETE_ORDER" });
  assert.equal(result.success, false);
  assert.ok(result.error.issues.includes("type is invalid"));
  assert.ok(!OFFLINE_OPERATION_TYPES.includes("DELETE_ORDER"));
});

test("rechaza versiones, fechas y payloads invalidos", () => {
  const result = validateOfflineOperation({
    ...validOperation(),
    baseVersion: -1,
    occurredAt: "not-a-date",
    payload: []
  });
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 3);
});

test("valida resultados parciales por operacion", () => {
  const result = validateSyncOperationResult({
    operationId: validOperation().operationId,
    status: "CONFLICT",
    serverVersion: 4,
    processedAt: "2026-07-27T15:01:00.000Z",
    conflict: {
      entityType: "ServiceOrder",
      entityId: "order-10",
      baseVersion: 3,
      serverVersion: 4
    }
  });
  assert.equal(result.success, true);
});

test("importar fundamentos no inicializa almacenamiento, listeners ni Servicios", () => {
  const loadedModules = Object.keys(require.cache);
  assert.equal(loadedModules.some((path) => /dexie|indexeddb|react/i.test(path)), false);
  assert.equal(
    loadedModules.some((path) => path.endsWith("modules\\services\\service.js")),
    false
  );
  assert.equal(globalThis.__APEX_OFFLINE_STORAGE__, undefined);
  assert.equal(globalThis.__APEX_OFFLINE_LISTENERS__, undefined);
});

