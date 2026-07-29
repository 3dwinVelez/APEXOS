import test from "node:test";
import assert from "node:assert/strict";
import {
  OfflineSyncClient,
  OfflineSyncClientError
} from "../lib/offline/syncClient.ts";

const context = {
  environmentId: "development",
  companyId: "tenant-a",
  tenantId: "tenant-a",
  userId: "7"
};
const installationId = "22222222-2222-4222-8222-222222222222";
const operation = {
  operationId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "test-key",
  environmentId: context.environmentId,
  companyId: context.companyId,
  userId: context.userId,
  installationId,
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

function response(overrides = {}) {
  return {
    context: { ...context, installationId },
    results: [{
      operationId: operation.operationId,
      status: "APPLIED",
      code: "TEST_OPERATION_RECORDED",
      processedAt: "2026-07-29T12:01:00.000Z"
    }],
    ...overrides
  };
}

test("serializa solo el contrato permitido y valida el contexto", async () => {
  let request;
  const client = new OfflineSyncClient(1000, async (path, options) => {
    request = { path, options, body: JSON.parse(String(options.body)) };
    return response();
  });
  assert.equal((await client.push(context, installationId, [operation])).results[0].status, "APPLIED");
  assert.equal(request.path, "/api/v1/offline/sync/push");
  assert.deepEqual(Object.keys(request.body.operations[0]).sort(), [
    "baseVersion",
    "createdAtDevice",
    "idempotencyKey",
    "operationId",
    "operationType",
    "payload"
  ]);
  assert.equal("tenantId" in request.body, false);
  assert.equal("companyId" in request.body, false);
  assert.equal("userId" in request.body, false);
});

test("rechaza respuesta invalida y contexto manipulado", async () => {
  await assert.rejects(
    new OfflineSyncClient(1000, async () => ({ results: [] }))
      .push(context, installationId, [operation]),
    (error) => error instanceof OfflineSyncClientError && error.category === "VALIDATION"
  );
  await assert.rejects(
    new OfflineSyncClient(1000, async () =>
      response({ context: { ...context, companyId: "other", installationId } })
    ).push(context, installationId, [operation]),
    (error) => error instanceof OfflineSyncClientError && error.category === "AUTHORIZATION"
  );
});

for (const [status, category] of [
  [401, "AUTHENTICATION"],
  [403, "AUTHORIZATION"],
  [409, "CONFLICT"],
  [422, "VALIDATION"],
  [429, "RATE_LIMIT"],
  [500, "SERVER_TEMPORARY"]
]) {
  test(`clasifica HTTP ${status} como ${category}`, async () => {
    const client = new OfflineSyncClient(1000, async () => {
      throw Object.assign(new Error("request failed"), { status, code: `HTTP_${status}` });
    });
    await assert.rejects(
      client.push(context, installationId, [operation]),
      (error) =>
        error instanceof OfflineSyncClientError &&
        error.category === category &&
        error.code === `HTTP_${status}`
    );
  });
}

test("clasifica timeout y red sin exponer detalles internos", async () => {
  const timeout = new OfflineSyncClient(5, async (_path, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      );
    })
  );
  await assert.rejects(
    timeout.push(context, installationId, [operation]),
    (error) => error instanceof OfflineSyncClientError && error.category === "TIMEOUT"
  );
  await assert.rejects(
    new OfflineSyncClient(1000, async () => {
      throw new Error("sensitive network detail");
    }).push(context, installationId, [operation]),
    (error) =>
      error instanceof OfflineSyncClientError &&
      error.category === "NETWORK" &&
      error.code === "OFFLINE_SYNC_NETWORK_ERROR" &&
      !error.message.includes("sensitive")
  );
});
