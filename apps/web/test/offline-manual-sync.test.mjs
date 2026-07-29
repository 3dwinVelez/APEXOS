import test from "node:test";
import assert from "node:assert/strict";
import { OfflineManualSyncService } from "../lib/offline/manualSyncService.ts";

function record(id = "11111111-1111-4111-8111-111111111111") {
  return {
    operationId: id,
    idempotencyKey: `key-${id}`,
    environmentId: "development",
    companyId: "tenant-a",
    userId: "7",
    installationId: "22222222-2222-4222-8222-222222222222",
    entityType: "certification",
    entityId: "phase-5",
    operationType: "TEST_OPERATION",
    payload: { marker: "phase-5" },
    baseVersion: 0,
    sequence: 1,
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
    schemaVersion: 1
  };
}

function queue(records) {
  const calls = [];
  return {
    calls,
    async listPending() { return records; },
    async markProcessing(id) { calls.push(["processing", id]); return record(id); },
    async markConfirmed(id) { calls.push(["confirmed", id]); return record(id); },
    async markBlocked(id, code) { calls.push(["blocked", id, code]); return record(id); },
    async markConflict(id, code) { calls.push(["conflict", id, code]); return record(id); },
    async markRetryable(id, code, category) {
      calls.push(["retryable", id, code, category]);
      return record(id);
    }
  };
}

const context = { environmentId: "development", companyId: "tenant-a", userId: "7" };

test("confirmacion aplicada transita PROCESSING a CONFIRMED", async () => {
  const item = record();
  const repository = queue([item]);
  const client = {
    async push() {
      return {
        context: { ...context, installationId: item.installationId },
        results: [{
          operationId: item.operationId,
          status: "APPLIED",
          code: "TEST_OPERATION_RECORDED",
          processedAt: "2026-07-29T12:01:00.000Z"
        }]
      };
    }
  };
  const summary = await new OfflineManualSyncService(context, repository, client).syncPending();
  assert.equal(summary.confirmed, 1);
  assert.deepEqual(repository.calls.map((call) => call[0]), ["processing", "confirmed"]);
});

test("fallo de red conserva la operacion como reintentable", async () => {
  const item = record();
  const repository = queue([item]);
  const client = { async push() { throw new Error("network"); } };
  const summary = await new OfflineManualSyncService(context, repository, client).syncPending();
  assert.equal(summary.retryable, 1);
  assert.deepEqual(repository.calls.map((call) => call[0]), ["processing", "retryable"]);
});
