import "fake-indexeddb/auto";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { initializeOfflineReadStorage } from "../lib/offline/access.ts";
import {
  bootstrapToLocalSnapshot,
  validateBootstrapForContext
} from "../lib/offline/bootstrapClient.ts";
import { contextDatabaseName } from "../lib/offline/context.ts";
import { OFFLINE_SCHEMA_V1 } from "../lib/offline/database.ts";
import { OfflineStorageError } from "../lib/offline/errors.ts";
import { OfflineSnapshotHydrator } from "../lib/offline/hydrator.ts";
import { OfflineTechnicianReadService } from "../lib/offline/readService.ts";
import {
  clearOfflineDataOnLogout,
  readAuthorizedOfflineContext,
  rememberOfflineContext
} from "../lib/offline/session.ts";
import {
  clearAllOfflineData,
  clearCurrentCompanyData,
  clearCurrentEnvironmentData,
  DexieOfflineStorageAdapter
} from "../lib/offline/storageAdapter.ts";

const contextA = Object.freeze({
  environmentId: "test",
  companyId: "company-a",
  tenantId: "company-a",
  userId: "technician-a"
});

const testNow = () => new Date("2026-07-27T13:00:00.000Z");

function offlineAdapter(context = contextA, options = {}) {
  return new DexieOfflineStorageAdapter(context, { now: testNow, ...options });
}

function snapshot(context = contextA, version = 1, overrides = {}) {
  return {
    context: { ...context },
    schemaVersion: 2,
    snapshotId: "11111111-1111-4111-8111-111111111111",
    serverCheckpoint: "bootstrap:checkpoint",
    generatedAt: "2026-07-27T12:00:00.000Z",
    expiresAt: "2026-07-28T12:00:00.000Z",
    orders: [
      {
        serverId: "order-1",
        orderId: "order-1",
        orderNumber: "TEST-001",
        status: "pendiente",
        assignedTechnicianId: context.userId,
        customerDisplayName: "Cliente de prueba",
        serviceAddress: "Direccion de prueba 1",
        scheduledAt: "2026-07-27T14:00:00.000Z",
        minimumOperationalData: {
          referenceDisplayName: "Referencia de prueba",
          serviceSummary: "Inspeccion controlada",
          contactPhone: "0000000000"
        },
        serverVersion: version,
        serverUpdatedAt: "2026-07-27T11:00:00.000Z"
      }
    ],
    activities: [
      {
        serverId: "activity-1",
        activityId: "activity-1",
        orderId: "order-1",
        activityType: "inspection",
        title: "Actividad de prueba",
        description: "Descripcion no productiva",
        status: "pending",
        sequence: 1,
        required: true,
        serverVersion: version,
        serverUpdatedAt: "2026-07-27T11:00:00.000Z"
      }
    ],
    checklists: [
      {
        serverId: "checklist-1",
        checklistId: "checklist-1",
        orderId: "order-1",
        label: "Verificacion de prueba",
        sequence: 1,
        required: true,
        value: null,
        serverVersion: version,
        serverUpdatedAt: "2026-07-27T11:00:00.000Z"
      }
    ],
    catalogs: [
      {
        serverId: "catalog-1",
        catalogType: "service_status",
        code: "pending",
        label: "Pendiente",
        serverVersion: version,
        serverUpdatedAt: "2026-07-27T11:00:00.000Z"
      }
    ],
    ...overrides
  };
}

async function hydratedAdapter(context = contextA, options = {}) {
  const adapter = offlineAdapter(context, options);
  await adapter.open();
  await new OfflineSnapshotHydrator(adapter).hydrate(snapshot(context));
  return adapter;
}

function bootstrapResponse(context = contextA, overrides = {}) {
  const local = snapshot(context);
  return {
    schemaVersion: 2,
    snapshotId: "11111111-1111-4111-8111-111111111111",
    generatedAt: local.generatedAt,
    expiresAt: local.expiresAt,
    environmentId: context.environmentId,
    companyId: context.companyId,
    userId: context.userId,
    serverCheckpoint: "bootstrap:checkpoint",
    orders: local.orders,
    activities: local.activities,
    checklists: local.checklists,
    catalogs: local.catalogs,
    metadata: {
      ttlSeconds: 86400,
      hasMore: false,
      versionStrategy: "READ_TIMESTAMP_REVISION"
    },
    ...overrides
  };
}

function capability(context = contextA) {
  return {
    technician: true,
    environmentId: context.environmentId,
    companyId: context.companyId,
    userId: context.userId,
    authorizationSource: "server"
  };
}

afterEach(async () => {
  await clearAllOfflineData();
});

test("crea, abre, cierra y elimina una base por contexto", async () => {
  const adapter = offlineAdapter(contextA);
  await adapter.open();
  const name = adapter.getDatabaseNameForTesting();
  assert.match(name, /^apexos-offline-v2-[a-f0-9]{24}-[a-f0-9]{24}-[a-f0-9]{24}$/);
  assert.equal(name.includes(contextA.companyId), false);
  assert.ok((await Dexie.getDatabaseNames()).includes(name));
  await adapter.close();
  await adapter.open();
  await adapter.deleteDatabase();
  assert.equal((await Dexie.getDatabaseNames()).includes(name), false);
});

test("hidrata y consulta ordenes, actividades, checklist, catalogo y metadata", async () => {
  const adapter = await hydratedAdapter();
  const result = await adapter.transaction(async (repositories) => ({
    order: await repositories.orders.getById(contextA, "order-1"),
    orders: await repositories.orders.listByTechnician(contextA, contextA.userId),
    activities: await repositories.activities.listByOrder(contextA, "order-1"),
    checklists: await repositories.checklists.listByOrder(contextA, "order-1"),
    catalogs: await repositories.catalogs.listByType(contextA, "service_status"),
    metadata: await repositories.metadata.get(contextA)
  }));
  assert.equal(result.order?.orderNumber, "TEST-001");
  assert.equal(result.orders.length, 1);
  assert.equal(result.activities.length, 1);
  assert.equal(result.checklists.length, 1);
  assert.equal(result.catalogs.length, 1);
  assert.equal(result.metadata?.retentionState, "ACTIVE");
  assert.equal(result.metadata?.snapshotId, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.metadata?.serverCheckpoint, "bootstrap:checkpoint");
});

test("conserva el mismo item de checklist cuando pertenece a ordenes distintas", async () => {
  const adapter = offlineAdapter(contextA);
  await adapter.open();
  const value = snapshot(contextA);
  const secondOrder = {
    ...value.orders[0],
    serverId: "order-2",
    orderId: "order-2",
    orderNumber: "TEST-002"
  };
  const sharedChecklistSnapshot = {
    ...value,
    orders: [...value.orders, secondOrder],
    checklists: [
      ...value.checklists,
      {
        ...value.checklists[0],
        orderId: "order-2",
        serverVersion: value.checklists[0].serverVersion + 100
      }
    ]
  };
  await new OfflineSnapshotHydrator(adapter).hydrate(sharedChecklistSnapshot);
  await new OfflineSnapshotHydrator(adapter).hydrate(sharedChecklistSnapshot);
  const read = new OfflineTechnicianReadService(adapter, contextA);
  assert.equal((await read.listChecklist("order-1")).length, 1);
  assert.equal((await read.listChecklist("order-2")).length, 1);
  await adapter.deleteDatabase();
});

test("persiste tras cerrar y reabrir el navegador simulado", async () => {
  const first = await hydratedAdapter();
  const name = first.getDatabaseNameForTesting();
  await first.close();
  const second = offlineAdapter(contextA);
  await second.open();
  assert.equal(second.getDatabaseNameForTesting(), name);
  const order = await second.transaction((repositories) =>
    repositories.orders.getById(contextA, "order-1")
  );
  assert.equal(order?.serverVersion, 1);
});

test("dos pestanas del mismo contexto consultan el mismo snapshot", async () => {
  const first = await hydratedAdapter();
  const second = offlineAdapter(contextA);
  await second.open();
  const [fromFirst, fromSecond] = await Promise.all([
    first.transaction((repositories) => repositories.orders.list(contextA)),
    second.transaction((repositories) => repositories.orders.list(contextA))
  ]);
  assert.deepEqual(fromFirst, fromSecond);
  await second.close();
});

test("aumenta snapshot por serverVersion y rechaza una revision inferior", async () => {
  const adapter = await hydratedAdapter();
  await adapter.replaceSnapshot(snapshot(contextA, 2));
  await assert.rejects(
    adapter.replaceSnapshot(snapshot(contextA, 1)),
    (error) => error instanceof OfflineStorageError && error.code === "SNAPSHOT_STALE"
  );
  const order = await adapter.transaction((repositories) =>
    repositories.orders.getById(contextA, "order-1")
  );
  assert.equal(order?.serverVersion, 2);
});

test("rechaza snapshot de otra empresa, usuario o esquema", async () => {
  const adapter = offlineAdapter(contextA);
  await adapter.open();
  const otherCompany = {
    ...contextA,
    companyId: "company-b",
    tenantId: "company-b"
  };
  await assert.rejects(
    adapter.replaceSnapshot(snapshot(otherCompany)),
    (error) => error instanceof OfflineStorageError && error.code === "CONTEXT_MISMATCH"
  );
  await adapter.replaceSnapshot({
    ...snapshot(contextA),
    orders: [{ ...snapshot(contextA).orders[0], assignedTechnicianId: "employee-17" }]
  });
  assert.equal(
    (await new OfflineTechnicianReadService(adapter, contextA).getOrder("order-1"))
      .assignedTechnicianId,
    "employee-17"
  );
  await assert.rejects(
    adapter.replaceSnapshot({ ...snapshot(contextA), schemaVersion: 99 }),
    (error) => error instanceof OfflineStorageError && error.code === "SCHEMA_INCOMPATIBLE"
  );
});

test("rechaza campos prohibidos y crea solo tablas autorizadas hasta Fase 4", async () => {
  const adapter = offlineAdapter(contextA);
  await adapter.open();
  await assert.rejects(
    adapter.replaceSnapshot({
      ...snapshot(contextA),
      orders: [{ ...snapshot(contextA).orders[0], token: "prohibido" }]
    }),
    (error) => error instanceof OfflineStorageError && error.code === "SNAPSHOT_INVALID"
  );
  const db = new Dexie(adapter.getDatabaseNameForTesting());
  await db.open();
  const names = db.tables.map((table) => table.name);
  assert.equal(names.includes("offlineOperations"), true);
  assert.equal(names.includes("offlineOperationMetadata"), true);
  assert.equal(names.includes("offlineEvidence"), false);
  assert.equal(names.includes("offlineConflicts"), false);
  assert.equal(names.includes("offlineUploads"), false);
  db.close();
});

test("marca datos expirados como no vigentes y los limpia por contexto", async () => {
  const adapter = offlineAdapter(contextA, {
    now: () => new Date("2026-07-29T12:00:00.000Z")
  });
  await adapter.open();
  await adapter.replaceSnapshot(
    snapshot(contextA, 1, {
      generatedAt: "2026-07-27T12:00:00.000Z",
      expiresAt: "2026-07-28T12:00:00.000Z"
    })
  );
  const order = await adapter.transaction((repositories) =>
    repositories.orders.getById(contextA, "order-1")
  );
  assert.equal(order, null);
  const cleanup = await adapter.clearExpiredData("2026-07-29T12:00:00.000Z");
  assert.equal(cleanup.recordsDeleted, 5);
});

test("limpia por usuario, empresa, ambiente y de forma total", async () => {
  const companyB = { ...contextA, companyId: "company-b", tenantId: "company-b" };
  const userB = { ...contextA, userId: "technician-b" };
  const qa = { ...contextA, environmentId: "qa" };
  const adapters = await Promise.all(
    [contextA, companyB, userB, qa].map(async (context) => {
      const adapter = offlineAdapter(context);
      await adapter.open();
      return adapter;
    })
  );
  await adapters[2].clearCurrentUserData();
  assert.equal((await Dexie.getDatabaseNames()).length, 3);
  await clearCurrentCompanyData(contextA);
  assert.equal((await Dexie.getDatabaseNames()).length, 2);
  await clearCurrentEnvironmentData(contextA);
  assert.equal((await Dexie.getDatabaseNames()).length, 1);
  await clearAllOfflineData();
  assert.equal((await Dexie.getDatabaseNames()).length, 0);
});

test("regenera installationId despues de eliminacion manual", async () => {
  const first = offlineAdapter(contextA);
  await first.open();
  const firstId = (await first.getInstallationIdentity()).installationId;
  await first.deleteDatabase();

  const second = offlineAdapter(contextA);
  await second.open();
  const secondId = (await second.getInstallationIdentity()).installationId;
  assert.notEqual(firstId, secondId);
});

test("rechaza un registro local manipulado con contexto ajeno", async () => {
  const adapter = await hydratedAdapter();
  const inspect = new Dexie(adapter.getDatabaseNameForTesting());
  await inspect.open();
  await inspect.table("offlineOrders").update("order:order-1", { companyId: "company-b" });
  inspect.close();
  await assert.rejects(
    adapter.transaction((repositories) => repositories.orders.getById(contextA, "order-1")),
    (error) => error instanceof OfflineStorageError && error.code === "CORRUPT_DATA"
  );
});

test("migra v1 a v3 conservando datos, retencion y estado de schema", async () => {
  const name = await contextDatabaseName(contextA);
  const legacy = new Dexie(name);
  legacy.version(1).stores(OFFLINE_SCHEMA_V1);
  await legacy.open();
  await legacy.table("offlineMetadata").put({
    key: "snapshot",
    environmentId: contextA.environmentId,
    companyId: contextA.companyId,
    tenantId: contextA.tenantId,
    userId: contextA.userId,
    schemaVersion: 1,
    generatedAt: "2026-07-27T12:00:00.000Z",
    hydratedAt: "2026-07-27T12:00:00.000Z",
    expiresAt: "2026-07-28T12:00:00.000Z"
  });
  legacy.close();

  const adapter = offlineAdapter(contextA);
  await adapter.open();
  const metadata = await adapter.transaction((repositories) => repositories.metadata.get(contextA));
  assert.equal(metadata?.retentionState, "ACTIVE");
  const inspect = new Dexie(name);
  await inspect.open();
  assert.equal(inspect.verno, 3);
  assert.equal(await inspect.table("offlineOperations").count(), 0);
  assert.equal((await inspect.table("offlineSchemaState").get("schema")).migrationStatus, "READY");
  assert.equal((await inspect.table("offlineSchemaState").get("schema")).schemaVersion, 3);
  inspect.close();
});

test("aborta de forma controlada una migracion fallida sin bucle", async () => {
  const name = await contextDatabaseName(contextA);
  const legacy = new Dexie(name);
  legacy.version(1).stores(OFFLINE_SCHEMA_V1);
  await legacy.open();
  legacy.close();
  let attempts = 0;
  const adapter = offlineAdapter(contextA, {
    migrationFailure: () => {
      attempts += 1;
      return true;
    }
  });
  await assert.rejects(
    adapter.open(),
    (error) => error instanceof OfflineStorageError && error.code === "MIGRATION_FAILED"
  );
  assert.ok(attempts <= 2);
  await Dexie.delete(name);
});

test("una transaccion abortada conserva el snapshot anterior", async () => {
  const stable = await hydratedAdapter();
  await stable.close();
  const failing = offlineAdapter(contextA, {
    transactionFailure: () => {
      throw new DOMException("abort", "AbortError");
    }
  });
  await failing.open();
  await assert.rejects(
    failing.replaceSnapshot(snapshot(contextA, 2)),
    (error) => error instanceof OfflineStorageError && error.code === "TRANSACTION_ABORTED"
  );
  await failing.close();
  const reopened = offlineAdapter(contextA);
  await reopened.open();
  const order = await reopened.transaction((repositories) =>
    repositories.orders.getById(contextA, "order-1")
  );
  assert.equal(order?.serverVersion, 1);
});

test("clasifica cuota insuficiente, almacenamiento restringido y bloqueo", async () => {
  for (const [failure, code] of [
    [() => { throw new DOMException("quota", "QuotaExceededError"); }, "QUOTA_EXCEEDED"],
    [() => { throw new DOMException("unavailable", "InvalidStateError"); }, "STORAGE_UNAVAILABLE"],
    [() => { throw new OfflineStorageError("DATABASE_BLOCKED", "blocked", true); }, "DATABASE_BLOCKED"]
  ]) {
    const adapter = offlineAdapter(contextA, { openFailure: failure });
    await assert.rejects(
      adapter.open(),
      (error) => error instanceof OfflineStorageError && error.code === code
    );
  }
});

test("flag apagada no carga Dexie, no abre base y no realiza fetch", async () => {
  let loaderCalls = 0;
  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch inesperado");
  };
  try {
    const access = await initializeOfflineReadStorage(
      {
        technician: false,
        environmentId: contextA.environmentId,
        companyId: contextA.companyId,
        userId: contextA.userId,
        authorizationSource: "server",
        clientEnabled: true
      },
      contextA,
      async () => {
        loaderCalls += 1;
        throw new Error("no debe cargar");
      }
    );
    assert.deepEqual(access, { mode: "connected", reason: "DISABLED" });
    assert.equal(loaderCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal((await Dexie.getDatabaseNames()).length, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("contexto manipulado o IndexedDB fallido degrada al flujo conectado", async () => {
  const capability = {
    technician: true,
    environmentId: contextA.environmentId,
    companyId: contextA.companyId,
    userId: contextA.userId,
    authorizationSource: "server"
  };
  const mismatch = await initializeOfflineReadStorage(
    capability,
    { ...contextA, userId: "attacker" },
    async () => {
      throw new Error("no debe cargar");
    }
  );
  assert.deepEqual(mismatch, { mode: "connected", reason: "CONTEXT_MISMATCH" });
  const unavailable = await initializeOfflineReadStorage(capability, contextA, async () => {
    throw new Error("IndexedDB unavailable");
  });
  assert.deepEqual(unavailable, { mode: "connected", reason: "STORAGE_UNAVAILABLE" });
});

test("contrato bootstrap valido hidrata la base correcta y queda solo lectura", async () => {
  const response = validateBootstrapForContext(
    bootstrapResponse(),
    capability(),
    contextA,
    Date.parse("2026-07-27T13:00:00.000Z")
  );
  const adapter = offlineAdapter(contextA, {
    now: () => new Date("2026-07-27T13:00:00.000Z")
  });
  await adapter.open();
  await new OfflineSnapshotHydrator(adapter).hydrate(
    bootstrapToLocalSnapshot(response, contextA)
  );
  const read = new OfflineTechnicianReadService(adapter, contextA);
  assert.equal((await read.listOrders()).length, 1);
  assert.equal((await read.getOrder("order-1"))?.orderNumber, "TEST-001");
  assert.equal((await read.listActivities("order-1")).length, 1);
  assert.equal((await read.listChecklist("order-1")).length, 1);
  assert.equal((await read.snapshotState()).fresh, true);
  assert.equal("create" in read, false);
  assert.equal("update" in read, false);
  assert.equal("delete" in read, false);
});

test("cliente rechaza usuario, empresa, ambiente, schema y expiracion incompatibles", () => {
  const cases = [
    bootstrapResponse(contextA, { userId: "other-user" }),
    bootstrapResponse(contextA, { companyId: "other-company" }),
    bootstrapResponse(contextA, { environmentId: "qa" }),
    bootstrapResponse(contextA, { schemaVersion: 99 }),
    bootstrapResponse(contextA, { expiresAt: "2026-07-27T12:30:00.000Z" })
  ];
  for (const response of cases) {
    assert.throws(() =>
      validateBootstrapForContext(
        response,
        capability(),
        contextA,
        Date.parse("2026-07-27T13:00:00.000Z")
      )
    );
  }
});

test("snapshot bootstrap inferior no reemplaza revision local superior", async () => {
  const adapter = await hydratedAdapter();
  await adapter.replaceSnapshot(snapshot(contextA, 2));
  const lower = bootstrapResponse(contextA);
  await assert.rejects(
    new OfflineSnapshotHydrator(adapter).hydrate(
      bootstrapToLocalSnapshot(
        validateBootstrapForContext(
          lower,
          capability(),
          contextA,
          Date.parse("2026-07-27T13:00:00.000Z")
        ),
        contextA
      )
    ),
    (error) => error instanceof OfflineStorageError && error.code === "SNAPSHOT_STALE"
  );
  assert.equal(
    (await new OfflineTechnicianReadService(adapter, contextA).getOrder("order-1"))
      ?.serverVersion,
    2
  );
});

test("logout explicito elimina descriptor y base del contexto autorizado", async () => {
  const storage = new Map();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const claims = Buffer.from(
    JSON.stringify({
      id: contextA.userId,
      tenant_id: contextA.tenantId,
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  try {
    localStorage.setItem("token", `header.${claims}.signature`);
    const adapter = await hydratedAdapter();
    rememberOfflineContext(contextA, new Date(Date.now() + 3600000).toISOString());
    assert.deepEqual(readAuthorizedOfflineContext(), contextA);
    const name = adapter.getDatabaseNameForTesting();
    await adapter.close();
    await clearOfflineDataOnLogout();
    assert.equal(readAuthorizedOfflineContext(), null);
    assert.equal((await Dexie.getDatabaseNames()).includes(name), false);
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }
});
