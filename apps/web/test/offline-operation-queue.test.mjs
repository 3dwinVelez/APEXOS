import "fake-indexeddb/auto";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { contextDatabaseName } from "../lib/offline/context.ts";
import { ApexOfflineDatabase, OFFLINE_SCHEMA_V2 } from "../lib/offline/database.ts";
import { OfflineStorageError } from "../lib/offline/errors.ts";
import {
  DexieOfflineOperationQueueRepository,
  OFFLINE_QUEUE_LIMITS
} from "../lib/offline/operationQueue.ts";
import { pendingLogoutDecision } from "../lib/offline/pendingLogoutPolicy.ts";
import { clearAllOfflineData } from "../lib/offline/storageAdapter.ts";
import { loadOfflineOperationQueueRepository } from "../lib/offline/storageAdapter.ts";

const contextA = Object.freeze({
  environmentId: "test",
  companyId: "company-a",
  tenantId: "company-a",
  userId: "technician-a"
});
const contextB = Object.freeze({ ...contextA, userId: "technician-b" });
let operationNumber = 1;

function input(overrides = {}) {
  const suffix = String(operationNumber++).padStart(12, "0");
  return {
    operationId: `10000000-0000-4000-8000-${suffix}`,
    idempotencyKey: `test:${suffix}`,
    installationId: "installation-test",
    entityType: "test_fixture",
    entityId: `entity-${suffix}`,
    operationType: "TEST_OPERATION",
    payload: { fixture: true, value: operationNumber },
    baseVersion: 1,
    createdAtDevice: "2026-07-27T12:00:00.000Z",
    ...overrides
  };
}

function queue(context = contextA, options = {}) {
  return new DexieOfflineOperationQueueRepository(context, {
    allowedOperationTypes: ["TEST_OPERATION"],
    ...options
  });
}

afterEach(async () => {
  await clearAllOfflineData();
});

test("crea, consulta y persiste una operacion sintetica", async () => {
  assert.equal(
    (await loadOfflineOperationQueueRepository()).DexieOfflineOperationQueueRepository,
    DexieOfflineOperationQueueRepository
  );
  const repository = queue();
  await repository.open();
  const created = await repository.enqueue(input());
  assert.equal((await repository.getById(created.operationId))?.operationId, created.operationId);
  assert.equal(
    (await repository.getByIdempotencyKey(created.idempotencyKey))?.operationId,
    created.operationId
  );
  await repository.close();
  const reopened = queue();
  await reopened.open();
  assert.equal((await reopened.listPending()).length, 1);
  await reopened.close();
});

test("asigna secuencia monotona y devuelve la siguiente operacion ejecutable", async () => {
  const repository = queue();
  await repository.open();
  const first = await repository.enqueue(input());
  const second = await repository.enqueue(input({ dependsOn: [first.operationId] }));
  assert.deepEqual([first.sequence, second.sequence], [1, 2]);
  assert.equal((await repository.getNextExecutable())?.operationId, first.operationId);
  await repository.markProcessing(first.operationId);
  await repository.markConfirmed(first.operationId);
  assert.equal((await repository.getNextExecutable())?.operationId, second.operationId);
  await repository.close();
});

test("evita duplicados por operationId, idempotencia, doble clic y concurrencia", async () => {
  const repository = queue();
  await repository.open();
  const original = input();
  const byId = await repository.enqueue(original);
  assert.equal((await repository.enqueue(original)).operationId, byId.operationId);
  const duplicateKey = input({ idempotencyKey: original.idempotencyKey });
  assert.equal((await repository.enqueue(duplicateKey)).operationId, byId.operationId);
  const concurrent = input();
  const attempts = await Promise.all([
    repository.enqueue(concurrent),
    repository.enqueue({ ...concurrent, operationId: input().operationId })
  ]);
  assert.equal(attempts[0].operationId, attempts[1].operationId);
  assert.equal((await repository.listPending()).length, 2);
  await repository.close();
});

test("valida transiciones y mantiene confirmadas inmutables", async () => {
  const repository = queue();
  await repository.open();
  const operation = await repository.enqueue(input());
  await assert.rejects(
    repository.markConfirmed(operation.operationId),
    (error) => error instanceof OfflineStorageError && error.code === "OPERATION_TRANSITION_INVALID"
  );
  await repository.markProcessing(operation.operationId);
  await repository.markConfirmed(operation.operationId);
  await assert.rejects(
    repository.markProcessing(operation.operationId),
    (error) => error instanceof OfflineStorageError && error.code === "OPERATION_TRANSITION_INVALID"
  );
  assert.equal((await repository.countByStatus()).CONFIRMED, 1);
  await repository.close();
});

test("modela bloqueo, conflicto y descarte sin resolver conflictos reales", async () => {
  const repository = queue();
  await repository.open();
  const blocked = await repository.enqueue(input());
  await repository.markProcessing(blocked.operationId);
  assert.equal((await repository.markBlocked(blocked.operationId)).status, "BLOCKED");
  const conflict = await repository.enqueue(input());
  await repository.markProcessing(conflict.operationId);
  assert.equal((await repository.markConflict(conflict.operationId)).status, "CONFLICT");
  assert.equal((await repository.markDiscarded(conflict.operationId)).status, "DISCARDED");
  await assert.rejects(repository.markConfirmed(blocked.operationId));
  await repository.close();
});

test("clasifica reintentos, aplica backoff y bloquea al superar el maximo", async () => {
  let now = new Date("2026-07-27T12:00:00.000Z");
  const repository = queue(contextA, { now: () => now, limits: { maxRetries: 2 } });
  await repository.open();
  const operation = await repository.enqueue(input());
  await repository.markProcessing(operation.operationId);
  const retryable = await repository.markRetryable(operation.operationId, "NETWORK_DOWN", "NETWORK");
  assert.equal(retryable.retryCount, 1);
  assert.ok(Date.parse(retryable.nextRetryAt) > now.getTime());
  await assert.rejects(
    repository.markRetryable(operation.operationId, "BAD", "VALIDATION"),
    (error) => error.code === "OPERATION_TRANSITION_INVALID"
  );
  now = new Date(retryable.nextRetryAt);
  await repository.markProcessing(operation.operationId);
  assert.equal(
    (await repository.markRetryable(operation.operationId, "TIMEOUT", "TIMEOUT")).status,
    "BLOCKED"
  );
  await repository.close();
});

test("recupera PROCESSING interrumpido despues del timeout al reabrir", async () => {
  let now = new Date("2026-07-27T12:00:00.000Z");
  const first = queue(contextA, { now: () => now });
  await first.open();
  const operation = await first.enqueue(input());
  await first.markProcessing(operation.operationId);
  await first.close();
  now = new Date(now.getTime() + OFFLINE_QUEUE_LIMITS.processingTimeoutMs + 1);
  const reopened = queue(contextA, { now: () => now });
  await reopened.open();
  const recovered = await reopened.getById(operation.operationId);
  assert.equal(recovered.status, "RETRYABLE");
  assert.equal(recovered.lastErrorCode, "PROCESSING_INTERRUPTED");
  await reopened.close();
});

test("valida dependencias inexistentes, propias, bloqueadas y orden causal", async () => {
  const repository = queue();
  await repository.open();
  await assert.rejects(
    repository.enqueue(input({ dependsOn: ["10000000-0000-4000-8000-999999999999"] })),
    (error) => error.code === "OPERATION_DEPENDENCY_INVALID"
  );
  const self = input();
  await assert.rejects(
    repository.enqueue({ ...self, dependsOn: [self.operationId] }),
    (error) => error.code === "OPERATION_DEPENDENCY_INVALID"
  );
  const circularParent = await repository.enqueue(input());
  const circularChild = input({ dependsOn: [circularParent.operationId] });
  await repository.db.offlineOperations.update(circularParent.operationId, {
    dependsOn: [circularChild.operationId]
  });
  await assert.rejects(
    repository.enqueue(circularChild),
    (error) => error.code === "OPERATION_DEPENDENCY_INVALID"
  );
  const foreign = await repository.enqueue(input());
  await repository.db.offlineOperations.update(foreign.operationId, {
    userId: contextB.userId
  });
  await assert.rejects(
    repository.enqueue(input({ dependsOn: [foreign.operationId] })),
    (error) => error.code === "CORRUPT_DATA"
  );
  await repository.db.offlineOperations.update(foreign.operationId, {
    userId: contextA.userId
  });
  await repository.markDiscarded(foreign.operationId);
  const parent = await repository.enqueue(input());
  const child = await repository.enqueue(input({ dependsOn: [parent.operationId] }));
  await repository.markProcessing(parent.operationId);
  await repository.markBlocked(parent.operationId);
  assert.equal(await repository.getNextExecutable(), null);
  assert.equal((await repository.getById(child.operationId)).status, "BLOCKED");
  await repository.close();
});

test("rechaza tipos productivos, payloads secretos, UUID y contexto invalidos", async () => {
  const repository = queue();
  await repository.open();
  await assert.rejects(repository.enqueue(input({ operationType: "SERVICE_STARTED" })));
  await assert.rejects(repository.enqueue(input({ payload: { token: "forbidden" } })));
  await assert.rejects(repository.enqueue(input({ operationId: "timestamp-123" })));
  await assert.rejects(
    repository.clearOperationsByContext(contextB),
    (error) => error.code === "CONTEXT_MISMATCH"
  );
  await repository.close();
});

test("aplica limites de cantidad, payload y total sin sobrescribir pendientes", async () => {
  const limited = queue(contextA, {
    limits: { maxPendingOperations: 1, maxPayloadBytes: 20, maxStructuredBytes: 30 }
  });
  await limited.open();
  await limited.enqueue(input({ payload: { ok: true } }));
  await assert.rejects(
    limited.enqueue(input({ payload: { ok: true } })),
    (error) => error.code === "OPERATION_LIMIT_EXCEEDED"
  );
  assert.equal((await limited.listPending()).length, 1);
  await assert.rejects(
    limited.enqueue(input({ payload: { value: "x".repeat(100) } })),
    (error) => error.code === "OPERATION_LIMIT_EXCEEDED"
  );
  await limited.close();
});

test("limpia confirmadas antiguas y conserva operaciones pendientes", async () => {
  let now = new Date("2026-07-27T12:00:00.000Z");
  const repository = queue(contextA, { now: () => now });
  await repository.open();
  const confirmed = await repository.enqueue(input());
  await repository.markProcessing(confirmed.operationId);
  await repository.markConfirmed(confirmed.operationId);
  await repository.enqueue(input());
  now = new Date("2026-07-28T12:00:00.000Z");
  assert.equal(await repository.deleteConfirmedBefore(now.toISOString()), 1);
  assert.equal((await repository.listPending()).length, 1);
  assert.ok((await repository.getMetadata()).lastCleanupAt);
  await repository.close();
});

test("una transaccion abortada no crea operacion ni consume secuencia", async () => {
  const failed = queue(contextA, {
    transactionFailure: () => {
      throw new DOMException("Injected abort", "AbortError");
    }
  });
  await failed.open();
  await assert.rejects(failed.enqueue(input()), (error) => error.code === "TRANSACTION_ABORTED");
  assert.equal((await failed.listPending()).length, 0);
  assert.equal((await failed.getMetadata()).nextSequence, 1);
  await failed.close();
});

test("clasifica cuota local excedida sin insertar trabajo parcial", async () => {
  const failed = queue(contextA, {
    transactionFailure: () => {
      throw new DOMException("Quota", "QuotaExceededError");
    }
  });
  await failed.open();
  await assert.rejects(failed.enqueue(input()), (error) => error.code === "QUOTA_EXCEEDED");
  assert.equal((await failed.listPending()).length, 0);
  await failed.close();
});

test("migrar una base v2 conserva el snapshot y agrega solo tablas de cola", async () => {
  const name = await contextDatabaseName(contextA);
  const legacy = new Dexie(name);
  legacy.version(2).stores(OFFLINE_SCHEMA_V2);
  await legacy.open();
  await legacy.table("offlineOrders").put({
    localKey: "order:legacy",
    serverId: "legacy",
    orderId: "legacy",
    environmentId: contextA.environmentId,
    companyId: contextA.companyId,
    userId: contextA.userId
  });
  await legacy.close();
  const repository = queue();
  await repository.open();
  await repository.close();
  const migrated = new ApexOfflineDatabase(name);
  await migrated.open();
  assert.equal(await migrated.offlineOrders.count(), 1);
  assert.equal(await migrated.offlineOperations.count(), 0);
  assert.deepEqual(
    [...migrated.tables.map((table) => table.name)].filter((name) => name.includes("Operation")).sort(),
    ["offlineOperationMetadata", "offlineOperations"]
  );
  migrated.close();
});

test("fallo de migracion conserva la base v2 y puede reintentarse", async () => {
  const name = await contextDatabaseName(contextA);
  const legacy = new Dexie(name);
  legacy.version(2).stores(OFFLINE_SCHEMA_V2);
  await legacy.open();
  await legacy.table("offlineOrders").put({ localKey: "order:legacy" });
  await legacy.close();
  const failed = queue(contextA, { migrationFailure: () => true });
  await assert.rejects(failed.open());
  const raw = new Dexie(name);
  raw.version(2).stores(OFFLINE_SCHEMA_V2);
  await raw.open();
  assert.equal(await raw.table("offlineOrders").count(), 1);
  raw.close();
  const recovered = queue();
  await recovered.open();
  assert.equal((await recovered.listPending()).length, 0);
  await recovered.close();
});

test("aisla colas por usuario y detecta registros o metadata manipulados", async () => {
  const first = queue(contextA);
  const second = queue(contextB);
  await first.open();
  await second.open();
  await first.enqueue(input());
  assert.equal((await second.listPending()).length, 0);
  const db = first.db;
  await db.offlineOperations.put({
    ...(await first.getById((await first.listPending())[0].operationId)),
    operationId: input().operationId,
    idempotencyKey: input().idempotencyKey,
    userId: contextB.userId
  });
  await assert.rejects(first.listPending(), (error) => error.code === "CORRUPT_DATA");
  await db.offlineOperationMetadata.put({
    ...(await first.getMetadata()),
    userId: contextB.userId
  });
  await assert.rejects(first.getMetadata(), (error) => error.code === "CORRUPT_DATA");
  await first.close();
  await second.close();
});

test("modela logout seguro sin cambiar el logout productivo", () => {
  assert.deepEqual(pendingLogoutDecision({ CONFIRMED: 2 }), {
    action: "CLEAR_LOCAL_DATA",
    pending: 0
  });
  assert.deepEqual(pendingLogoutDecision({ PENDING: 2, BLOCKED: 1 }), {
    action: "REQUIRE_EXPLICIT_DECISION",
    pending: 3,
    options: ["RETURN_TO_SYNC", "DISCARD_WITH_CONFIRMATION"]
  });
});

test("almacenamiento restringido degrada con error controlado", async () => {
  const repository = queue(contextA, {
    openFailure: () => {
      throw new DOMException("Restricted", "InvalidStateError");
    }
  });
  await assert.rejects(repository.open(), (error) => error.code === "STORAGE_UNAVAILABLE");
});
