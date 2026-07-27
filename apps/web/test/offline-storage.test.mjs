import "fake-indexeddb/auto";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { initializeOfflineReadStorage } from "../lib/offline/access.ts";
import { contextDatabaseName } from "../lib/offline/context.ts";
import { OFFLINE_SCHEMA_V1 } from "../lib/offline/database.ts";
import { OfflineStorageError } from "../lib/offline/errors.ts";
import { OfflineSnapshotHydrator } from "../lib/offline/hydrator.ts";
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

function snapshot(context = contextA, version = 1, overrides = {}) {
  return {
    context: { ...context },
    schemaVersion: 2,
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
  const adapter = new DexieOfflineStorageAdapter(context, options);
  await adapter.open();
  await new OfflineSnapshotHydrator(adapter).hydrate(snapshot(context));
  return adapter;
}

afterEach(async () => {
  await clearAllOfflineData();
});

test("crea, abre, cierra y elimina una base por contexto", async () => {
  const adapter = new DexieOfflineStorageAdapter(contextA);
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
});

test("persiste tras cerrar y reabrir el navegador simulado", async () => {
  const first = await hydratedAdapter();
  const name = first.getDatabaseNameForTesting();
  await first.close();
  const second = new DexieOfflineStorageAdapter(contextA);
  await second.open();
  assert.equal(second.getDatabaseNameForTesting(), name);
  const order = await second.transaction((repositories) =>
    repositories.orders.getById(contextA, "order-1")
  );
  assert.equal(order?.serverVersion, 1);
});

test("dos pestanas del mismo contexto consultan el mismo snapshot", async () => {
  const first = await hydratedAdapter();
  const second = new DexieOfflineStorageAdapter(contextA);
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
  const adapter = new DexieOfflineStorageAdapter(contextA);
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
  await assert.rejects(
    adapter.replaceSnapshot({
      ...snapshot(contextA),
      orders: [{ ...snapshot(contextA).orders[0], assignedTechnicianId: "technician-b" }]
    }),
    (error) => error instanceof OfflineStorageError && error.code === "CONTEXT_MISMATCH"
  );
  await assert.rejects(
    adapter.replaceSnapshot({ ...snapshot(contextA), schemaVersion: 99 }),
    (error) => error instanceof OfflineStorageError && error.code === "SCHEMA_INCOMPATIBLE"
  );
});

test("rechaza campos prohibidos y no crea tablas futuras", async () => {
  const adapter = new DexieOfflineStorageAdapter(contextA);
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
  assert.equal(names.includes("offlineOperations"), false);
  assert.equal(names.includes("offlineEvidence"), false);
  assert.equal(names.includes("offlineConflicts"), false);
  db.close();
});

test("marca datos expirados como no vigentes y los limpia por contexto", async () => {
  const adapter = new DexieOfflineStorageAdapter(contextA, {
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
      const adapter = new DexieOfflineStorageAdapter(context);
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
  const first = new DexieOfflineStorageAdapter(contextA);
  await first.open();
  const firstId = (await first.getInstallationIdentity()).installationId;
  await first.deleteDatabase();

  const second = new DexieOfflineStorageAdapter(contextA);
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

test("migra v1 a v2 conservando datos y agregando retentionState", async () => {
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

  const adapter = new DexieOfflineStorageAdapter(contextA);
  await adapter.open();
  const metadata = await adapter.transaction((repositories) => repositories.metadata.get(contextA));
  assert.equal(metadata?.retentionState, "ACTIVE");
  const inspect = new Dexie(name);
  await inspect.open();
  assert.equal(inspect.verno, 2);
  assert.equal((await inspect.table("offlineSchemaState").get("schema")).migrationStatus, "READY");
  inspect.close();
});

test("aborta de forma controlada una migracion fallida sin bucle", async () => {
  const name = await contextDatabaseName(contextA);
  const legacy = new Dexie(name);
  legacy.version(1).stores(OFFLINE_SCHEMA_V1);
  await legacy.open();
  legacy.close();
  let attempts = 0;
  const adapter = new DexieOfflineStorageAdapter(contextA, {
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
  const failing = new DexieOfflineStorageAdapter(contextA, {
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
  const reopened = new DexieOfflineStorageAdapter(contextA);
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
    const adapter = new DexieOfflineStorageAdapter(contextA, { openFailure: failure });
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
