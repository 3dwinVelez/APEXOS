const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyncProcessor } = require("../src/modules/offline/syncProcessor");
const {
  assertAuthorized,
  createOfflineSyncService
} = require("../src/modules/offline/syncService");
const { MAX_OPERATIONS, MAX_REQUEST_BYTES, SYNC_TIMEOUT_MS, pushSchema } =
  require("../src/modules/offline/syncContract");

function operation(overrides = {}) {
  return {
    operationId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "test-key-1",
    operationType: "TEST_OPERATION",
    payload: { marker: "phase-5" },
    baseVersion: 0,
    createdAtDevice: "2026-07-29T12:00:00.000Z",
    ...overrides
  };
}

function context() {
  return {
    environmentId: "development",
    tenantId: "tenant-a",
    companyId: "tenant-a",
    userId: 7,
    installationId: "22222222-2222-4222-8222-222222222222"
  };
}

function enabledEnv(overrides = {}) {
  return {
    APP_ENV: "development",
    OFFLINE_TECHNICIAN_ENABLED: "true",
    OFFLINE_SYNC_ENABLED: "true",
    OFFLINE_ALLOWED_ENVIRONMENTS: "development",
    OFFLINE_ALLOWED_TENANT_IDS: "tenant-a",
    OFFLINE_ALLOWED_USER_IDS: "7",
    ...overrides
  };
}

function repository() {
  const rows = [];
  const database = {
    rows,
    transactionCount: 0,
    async $transaction(work) {
      database.transactionCount += 1;
      return work(database);
    },
    offlineSyncReceipt: {
      async findFirst({ where }) {
        return rows.find((row) =>
          row.environment_id === where.environment_id &&
          row.tenant_id === where.tenant_id &&
          row.user_id === where.user_id &&
          (row.operation_id === where.OR[0].operation_id ||
            row.idempotency_key === where.OR[1].idempotency_key)
        ) || null;
      },
      async create({ data }) {
        const duplicate = rows.some((row) =>
          row.environment_id === data.environment_id &&
          row.tenant_id === data.tenant_id &&
          row.user_id === data.user_id &&
          (row.operation_id === data.operation_id || row.idempotency_key === data.idempotency_key)
        );
        if (duplicate) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { id: String(rows.length + 1), ...data };
        rows.push(row);
        return row;
      }
    }
  };
  return database;
}

test("registra TEST_OPERATION una sola vez y confirma el replay", async () => {
  const database = repository();
  const processor = createSyncProcessor({
    prisma: database,
    now: () => new Date("2026-07-29T12:01:00.000Z")
  });
  assert.equal((await processor.processOne(context(), operation())).status, "APPLIED");
  assert.equal((await processor.processOne(context(), operation())).status, "ALREADY_APPLIED");
  assert.equal(database.rows.length, 1);
  assert.equal(database.transactionCount, 2);
});

test("rechaza reutilizar idempotencyKey con otro payload", async () => {
  const database = repository();
  const processor = createSyncProcessor({ prisma: database });
  await processor.processOne(context(), operation());
  const replay = await processor.processOne(
    context(),
    operation({ payload: { marker: "changed" } })
  );
  assert.deepEqual([replay.status, replay.code], ["REJECTED", "IDEMPOTENCY_MISMATCH"]);
  assert.equal(database.rows.length, 1);
});

test("dos solicitudes concurrentes producen un recibo y una confirmacion idempotente", async () => {
  const database = repository();
  const processor = createSyncProcessor({ prisma: database });
  const results = await Promise.all([
    processor.processOne(context(), operation()),
    processor.processOne(context(), operation())
  ]);
  assert.deepEqual(results.map((item) => item.status).sort(), ["ALREADY_APPLIED", "APPLIED"]);
  assert.equal(database.rows.length, 1);
});

test("rechaza replay desde una instalacion diferente", async () => {
  const database = repository();
  const processor = createSyncProcessor({ prisma: database });
  await processor.processOne(context(), operation());
  const otherContext = {
    ...context(),
    installationId: "33333333-3333-4333-8333-333333333333"
  };
  const replay = await processor.processOne(otherContext, operation());
  assert.deepEqual([replay.status, replay.code], ["REJECTED", "IDEMPOTENCY_MISMATCH"]);
  assert.equal(database.rows.length, 1);
});

test("autorizacion deriva ambiente, tenant, usuario y rol del servidor", () => {
  const env = enabledEnv();
  assert.doesNotThrow(() =>
    assertAuthorized("tenant-a", { id: 7, role: { name: "tecnico" } }, env)
  );
  assert.throws(
    () => assertAuthorized("tenant-b", { id: 7, role: { name: "tecnico" } }, env),
    (error) => error.statusCode === 403 && error.code === "OFFLINE_SYNC_NOT_AUTHORIZED"
  );
});

test("flag apagada, allowlist y rol ajeno bloquean antes de procesar", () => {
  for (const [user, env] of [
    [{ id: 7, role: { name: "tecnico" } }, enabledEnv({ OFFLINE_SYNC_ENABLED: "false" })],
    [{ id: 8, role: { name: "tecnico" } }, enabledEnv()],
    [{ id: 7, role: { name: "supervisor" } }, enabledEnv()]
  ]) {
    assert.throws(
      () => assertAuthorized("tenant-a", user, env),
      (error) => error.statusCode === 403
    );
  }
});

test("servicio ignora contexto declarado por cliente y limita bytes", async () => {
  let received;
  const database = {
    runWithTenant(tenantId, work) {
      assert.equal(tenantId, "tenant-a");
      return work();
    }
  };
  const processor = {
    async processBatch(contextValue) {
      received = contextValue;
      return [];
    }
  };
  const service = createOfflineSyncService({ prisma: database, processor });
  const body = {
    installationId: context().installationId,
    operations: [],
    tenantId: "attacker",
    companyId: "attacker",
    userId: "999"
  };
  const response = await service.push(
    "tenant-a",
    { id: 7, role: { name: "tecnico" } },
    body,
    enabledEnv()
  );
  assert.deepEqual(received, context());
  assert.equal(response.context.companyId, "tenant-a");
  await assert.rejects(
    service.push(
      "tenant-a",
      { id: 7, role: { name: "tecnico" } },
      {
        installationId: context().installationId,
        operations: [operation({ payload: { marker: "x".repeat(MAX_REQUEST_BYTES) } })]
      },
      enabledEnv()
    ),
    (error) =>
      error.statusCode === 413 &&
      error.code === "OFFLINE_SYNC_REQUEST_TOO_LARGE" &&
      !error.message.includes("x".repeat(100))
  );
});

test("error interno por operacion se sanitiza sin payload ni detalle", async () => {
  const database = repository();
  database.$transaction = async () => {
    throw new Error("database password=secret payload=private");
  };
  const processor = createSyncProcessor({ prisma: database });
  const [item] = await processor.processBatch(context(), [operation()]);
  assert.deepEqual(
    [item.status, item.code],
    ["RETRYABLE_ERROR", "SYNC_STORAGE_UNAVAILABLE"]
  );
  assert.equal(JSON.stringify(item).includes("secret"), false);
  assert.equal(JSON.stringify(item).includes("private"), false);
});

test("contrato limita tipo, lote, bytes y tiempo", () => {
  assert.deepEqual(pushSchema.body.properties.operations.items.properties.operationType.enum, [
    "TEST_OPERATION"
  ]);
  assert.equal(MAX_OPERATIONS, 20);
  assert.equal(MAX_REQUEST_BYTES, 256 * 1024);
  assert.equal(SYNC_TIMEOUT_MS, 15_000);
  assert.equal(pushSchema.body.additionalProperties, false);
  assert.equal(pushSchema.body.properties.operations.items.additionalProperties, false);
});
