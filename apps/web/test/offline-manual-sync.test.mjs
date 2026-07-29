import test from "node:test";
import assert from "node:assert/strict";
import { OfflineManualSyncService } from "../lib/offline/manualSyncService.ts";
import { OfflineSyncClientError } from "../lib/offline/syncClient.ts";

let sequence = 1;

function record(overrides = {}) {
  const suffix = String(sequence++).padStart(12, "0");
  const operationId = `11111111-1111-4111-8111-${suffix}`;
  return {
    operationId,
    idempotencyKey: `key-${suffix}`,
    environmentId: "development",
    companyId: "tenant-a",
    userId: "7",
    installationId: "22222222-2222-4222-8222-222222222222",
    entityType: "certification",
    entityId: "phase-5",
    operationType: "TEST_OPERATION",
    payload: { marker: "phase-5" },
    baseVersion: 0,
    sequence: Number(suffix),
    createdAtDevice: "2026-07-29T12:00:00.000Z",
    createdAtLocal: "2026-07-29T12:00:00.000Z",
    updatedAtLocal: "2026-07-29T12:00:00.000Z",
    status: "PENDING",
    retryCount: 0,
    nextRetryAt: null,
    lastAttemptAt: null,
    lastErrorCode: null,
    lastErrorCategory: null,
    dependsOn: [],
    schemaVersion: 1,
    ...overrides
  };
}

function queue(records) {
  const calls = [];
  const byId = new Map(records.map((item) => [item.operationId, item]));
  const update = (id, status, code, category) => {
    const current = byId.get(id);
    if (!current) throw new Error("missing operation");
    current.status = status;
    calls.push([status.toLowerCase(), id, code, category]);
    return current;
  };
  return {
    calls,
    records,
    async getNextExecutable() {
      return records.find((item) =>
        ["PENDING", "RETRYABLE"].includes(item.status) &&
        item.dependsOn.every((id) => byId.get(id)?.status === "CONFIRMED")
      ) || null;
    },
    async markProcessing(id) { return update(id, "PROCESSING"); },
    async markConfirmed(id) { return update(id, "CONFIRMED"); },
    async markBlocked(id, code) { return update(id, "BLOCKED", code); },
    async markConflict(id, code) { return update(id, "CONFLICT", code); },
    async markRetryable(id, code, category) {
      return update(id, "RETRYABLE", code, category);
    }
  };
}

function result(operation, status = "APPLIED", code = "TEST_OPERATION_RECORDED") {
  return {
    operationId: operation.operationId,
    status,
    code,
    processedAt: "2026-07-29T12:01:00.000Z"
  };
}

function client(handler) {
  const calls = [];
  return {
    calls,
    async push(context, installationId, operations) {
      calls.push({ context, installationId, operations });
      return handler(context, installationId, operations);
    }
  };
}

const context = {
  environmentId: "development",
  companyId: "tenant-a",
  tenantId: "tenant-a",
  userId: "7"
};

test("cola vacia no realiza transporte", async () => {
  const repository = queue([]);
  const transport = client(() => assert.fail("transporte inesperado"));
  const summary = await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.equal(summary.attempted, 0);
  assert.equal(transport.calls.length, 0);
});

test("APPLIED y ALREADY_APPLIED confirman sin eliminar operaciones", async () => {
  const first = record();
  const second = record();
  const repository = queue([first, second]);
  const transport = client((_context, installationId, operations) => ({
    context: { ...context, installationId },
    results: [
      result(operations[0], "APPLIED"),
      result(operations[1], "ALREADY_APPLIED")
    ]
  }));
  const summary = await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.deepEqual(summary, {
    attempted: 2,
    confirmed: 2,
    retryable: 0,
    blocked: 0,
    conflicts: 0
  });
  assert.deepEqual(repository.records.map((item) => item.status), ["CONFIRMED", "CONFIRMED"]);
  assert.equal(repository.records.length, 2);
  await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.equal(transport.calls.length, 1);
});

test("respuesta parcial conserva cada resultado fallido en su estado correcto", async () => {
  const operations = [record(), record(), record(), record(), record()];
  const repository = queue(operations);
  const transport = client((_context, installationId) => ({
    context: { ...context, installationId },
    results: [
      result(operations[0], "APPLIED"),
      result(operations[1], "RETRYABLE_ERROR", "TEMPORARY"),
      result(operations[2], "BLOCKED", "DENIED"),
      result(operations[3], "CONFLICT", "CONFLICT"),
      result(operations[4], "REJECTED", "INVALID")
    ]
  }));
  const summary = await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.deepEqual(summary, {
    attempted: 5,
    confirmed: 1,
    retryable: 1,
    blocked: 2,
    conflicts: 1
  });
  assert.deepEqual(
    repository.records.map((item) => item.status),
    ["CONFIRMED", "RETRYABLE", "BLOCKED", "CONFLICT", "BLOCKED"]
  );
});

test("resultado ausente vuelve solo esa operacion reintentable", async () => {
  const first = record();
  const second = record();
  const repository = queue([first, second]);
  const transport = client((_context, installationId) => ({
    context: { ...context, installationId },
    results: [result(first)]
  }));
  const summary = await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.retryable, 1);
  assert.deepEqual(repository.records.map((item) => item.status), ["CONFIRMED", "RETRYABLE"]);
});

test("dependencia pendiente no se envia hasta confirmar su padre", async () => {
  const parent = record();
  const child = record({ dependsOn: [parent.operationId] });
  const repository = queue([parent, child]);
  const transport = client((_context, installationId, operations) => ({
    context: { ...context, installationId },
    results: operations.map((item) => result(item))
  }));
  await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.deepEqual(transport.calls[0].operations.map((item) => item.operationId), [parent.operationId]);
  assert.equal(child.status, "PENDING");
  await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.deepEqual(transport.calls[1].operations.map((item) => item.operationId), [child.operationId]);
});

for (const [category, expectedStatus, expectedCategory] of [
  ["AUTHENTICATION", "BLOCKED", undefined],
  ["AUTHORIZATION", "BLOCKED", undefined],
  ["VALIDATION", "BLOCKED", undefined],
  ["CONFLICT", "CONFLICT", undefined],
  ["RATE_LIMIT", "RETRYABLE", "SERVER_TEMPORARY"],
  ["SERVER_TEMPORARY", "RETRYABLE", "SERVER_TEMPORARY"],
  ["TIMEOUT", "RETRYABLE", "TIMEOUT"],
  ["NETWORK", "RETRYABLE", "NETWORK"]
]) {
  test(`error ${category} conserva una transicion controlada`, async () => {
    const operation = record();
    const repository = queue([operation]);
    const transport = client(() => {
      throw new OfflineSyncClientError(`ERROR_${category}`, category);
    });
    await new OfflineManualSyncService(context, repository, transport).syncPending();
    assert.equal(operation.status, expectedStatus);
    if (expectedCategory) assert.equal(repository.calls.at(-1)[3], expectedCategory);
  });
}

test("una adquisicion perdida entre dos pestanas no duplica el envio", async () => {
  const operation = record();
  const repository = queue([operation]);
  const originalMark = repository.markProcessing;
  let firstAttempt = true;
  repository.markProcessing = async (id) => {
    if (firstAttempt) {
      firstAttempt = false;
      operation.status = "PROCESSING";
      throw new Error("claimed by another tab");
    }
    return originalMark(id);
  };
  const transport = client(() => assert.fail("envio duplicado"));
  const summary = await new OfflineManualSyncService(context, repository, transport).syncPending();
  assert.equal(summary.attempted, 0);
  assert.equal(transport.calls.length, 0);
});
