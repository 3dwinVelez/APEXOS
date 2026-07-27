import Dexie from "dexie";
import { ApexOfflineDatabase } from "./database.ts";
import {
  contextDatabaseName,
  contextDatabaseSegments,
  normalizeContext,
  OFFLINE_DATABASE_PREFIX
} from "./context.ts";
import { OfflineStorageError, toOfflineStorageError } from "./errors.ts";
import {
  DexieOfflineActivityRepository,
  DexieOfflineCatalogRepository,
  DexieOfflineChecklistRepository,
  DexieOfflineMetadataRepository,
  DexieOfflineOrderRepository
} from "./repositories.ts";
import { materializeSnapshot, validateOfflineSnapshot } from "./snapshot.ts";
import {
  OFFLINE_LOCAL_SCHEMA_VERSION,
  OFFLINE_LOCAL_TTL_MS,
  type OfflineCleanupResult,
  type OfflineReadStorageAdapter,
  type OfflineReadStorageTransaction,
  type OfflineSnapshot,
  type OfflineStorageContext
} from "./types.ts";

export interface OfflineStorageDiagnostics {
  record(event: {
    code: string;
    operation: string;
    retryable: boolean;
    schemaVersion: number;
  }): void;
}

export interface DexieOfflineStorageOptions {
  ttlMs?: number;
  now?: () => Date;
  migrationFailure?: () => boolean;
  openFailure?: () => void;
  transactionFailure?: () => void;
  diagnostics?: OfflineStorageDiagnostics;
}

const NOOP_DIAGNOSTICS: OfflineStorageDiagnostics = { record: () => undefined };

export class DexieOfflineStorageAdapter implements OfflineReadStorageAdapter {
  readonly schemaVersion = OFFLINE_LOCAL_SCHEMA_VERSION;
  readonly context: OfflineStorageContext;
  private readonly options: DexieOfflineStorageOptions;
  private db: ApexOfflineDatabase | null = null;
  private databaseName = "";
  private opening: Promise<void> | null = null;

  constructor(context: OfflineStorageContext, options: DexieOfflineStorageOptions = {}) {
    this.context = normalizeContext(context);
    this.options = options;
  }

  private diagnostics(): OfflineStorageDiagnostics {
    return this.options.diagnostics || NOOP_DIAGNOSTICS;
  }

  private now(): Date {
    return this.options.now?.() || new Date();
  }

  async open(): Promise<void> {
    if (this.db?.isOpen()) return;
    if (this.opening) return this.opening;
    this.opening = this.openInternal();
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }

  private async openInternal(): Promise<void> {
    try {
      this.databaseName = await contextDatabaseName(this.context);
      const db = new ApexOfflineDatabase(this.databaseName, this.options.migrationFailure);
      this.options.openFailure?.();
      let blocked = false;
      db.on("blocked", () => {
        blocked = true;
        this.diagnostics().record({
          code: "DATABASE_BLOCKED",
          operation: "open",
          retryable: true,
          schemaVersion: this.schemaVersion
        });
      });
      await db.open();
      if (blocked) {
        db.close();
        throw new OfflineStorageError(
          "DATABASE_BLOCKED",
          "Otra pestana mantiene bloqueada la base local.",
          true
        );
      }
      this.db = db;
      const now = this.now().toISOString();
      const installation = await db.offlineSchemaState.get("installation");
      await db.offlineSchemaState.put({
        key: "installation",
        installationId: installation?.installationId || globalThis.crypto.randomUUID(),
        createdAt: installation?.createdAt || now,
        lastSeenAt: now,
        schemaVersion: this.schemaVersion
      });
    } catch (error) {
      this.db?.close();
      this.db = null;
      const mapped =
        this.options.migrationFailure?.() && !(error instanceof OfflineStorageError)
          ? new OfflineStorageError(
              "MIGRATION_FAILED",
              "La migracion local no pudo completarse.",
              false,
              error
            )
          : toOfflineStorageError(error);
      this.diagnostics().record({
        code: mapped.code,
        operation: "open",
        retryable: mapped.retryable,
        schemaVersion: this.schemaVersion
      });
      throw mapped;
    }
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private requireDb(): ApexOfflineDatabase {
    if (!this.db?.isOpen()) {
      throw new OfflineStorageError("DATABASE_CLOSED", "La base local no esta abierta.", true);
    }
    return this.db;
  }

  private repositories(db = this.requireDb()): OfflineReadStorageTransaction {
    const now = () => this.now();
    return {
      orders: new DexieOfflineOrderRepository(db, this.context, now),
      activities: new DexieOfflineActivityRepository(db, this.context, now),
      checklists: new DexieOfflineChecklistRepository(db, this.context, now),
      catalogs: new DexieOfflineCatalogRepository(db, this.context, now),
      metadata: new DexieOfflineMetadataRepository(db, this.context, now)
    };
  }

  async transaction<T>(
    work: (repositories: OfflineReadStorageTransaction) => Promise<T>
  ): Promise<T> {
    const db = this.requireDb();
    try {
      return await db.transaction(
        "r",
        [
          db.offlineOrders,
          db.offlineActivities,
          db.offlineChecklists,
          db.offlineCatalogs,
          db.offlineMetadata
        ],
        () => work(this.repositories(db))
      );
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async replaceSnapshot(snapshotValue: unknown): Promise<void> {
    const db = this.requireDb();
    const snapshot = validateOfflineSnapshot(snapshotValue, this.context);
    const materialized = materializeSnapshot(
      snapshot,
      this.context,
      this.now(),
      this.options.ttlMs ?? OFFLINE_LOCAL_TTL_MS
    );
    try {
      await db.transaction(
        "rw",
        [
          db.offlineOrders,
          db.offlineActivities,
          db.offlineChecklists,
          db.offlineCatalogs,
          db.offlineMetadata
        ],
        async () => {
          await this.rejectStaleSnapshot(db, snapshot);
          this.options.transactionFailure?.();
          await Promise.all([
            db.offlineOrders.clear(),
            db.offlineActivities.clear(),
            db.offlineChecklists.clear(),
            db.offlineCatalogs.clear()
          ]);
          await db.offlineOrders.bulkPut(materialized.orders);
          await db.offlineActivities.bulkPut(materialized.activities);
          await db.offlineChecklists.bulkPut(materialized.checklists);
          await db.offlineCatalogs.bulkPut(materialized.catalogs);
          await db.offlineMetadata.put({
            key: "snapshot",
            snapshotId: snapshot.snapshotId,
            serverCheckpoint: snapshot.serverCheckpoint,
            environmentId: this.context.environmentId,
            companyId: this.context.companyId,
            tenantId: this.context.tenantId,
            userId: this.context.userId,
            schemaVersion: this.schemaVersion,
            generatedAt: snapshot.generatedAt,
            hydratedAt: materialized.storedAt,
            expiresAt: materialized.expiresAt,
            retentionState: "ACTIVE"
          });
        }
      );
    } catch (error) {
      const mapped = toOfflineStorageError(error);
      this.diagnostics().record({
        code: mapped.code,
        operation: "replaceSnapshot",
        retryable: mapped.retryable,
        schemaVersion: this.schemaVersion
      });
      throw mapped;
    }
  }

  private async rejectStaleSnapshot(
    db: ApexOfflineDatabase,
    snapshot: OfflineSnapshot
  ): Promise<void> {
    const assertNoStale = <T extends { serverVersion: number }>(
      stored: T[],
      incoming: T[],
      versionKey: (record: T) => string
    ) => {
      const versions = new Map<string, number>(
        stored.map((record) => [versionKey(record), record.serverVersion] as const)
      );
      for (const record of incoming) {
        const current = versions.get(versionKey(record));
        if (current !== undefined && record.serverVersion < current) {
          throw new OfflineStorageError(
            "SNAPSHOT_STALE",
            "El snapshot contiene una version inferior a la almacenada."
          );
        }
      }
    };
    assertNoStale(
      await db.offlineOrders.toArray(),
      snapshot.orders,
      (record) => record.serverId
    );
    assertNoStale(
      await db.offlineActivities.toArray(),
      snapshot.activities,
      (record) => record.serverId
    );
    assertNoStale(
      await db.offlineChecklists.toArray(),
      snapshot.checklists,
      (record) => `${record.orderId}:${record.serverId}`
    );
    assertNoStale(
      await db.offlineCatalogs.toArray(),
      snapshot.catalogs,
      (record) => record.serverId
    );
  }

  async estimate(): Promise<{ usageBytes: number; quotaBytes: number }> {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    return {
      usageBytes: Number(estimate?.usage || 0),
      quotaBytes: Number(estimate?.quota || 0)
    };
  }

  async getInstallationIdentity(): Promise<{
    installationId: string;
    createdAt: string;
    lastSeenAt: string;
    schemaVersion: number;
  }> {
    const state = await this.requireDb().offlineSchemaState.get("installation");
    if (!state?.installationId || !state.createdAt || !state.lastSeenAt) {
      throw new OfflineStorageError("CORRUPT_DATA", "La identidad de instalacion es invalida.");
    }
    return {
      installationId: state.installationId,
      createdAt: state.createdAt,
      lastSeenAt: state.lastSeenAt,
      schemaVersion: state.schemaVersion
    };
  }

  async clearExpiredData(now = this.now().toISOString()): Promise<OfflineCleanupResult> {
    const db = this.requireDb();
    const timestamp = Date.parse(now);
    if (Number.isNaN(timestamp)) {
      throw new OfflineStorageError("CONTEXT_INVALID", "Fecha de limpieza invalida.");
    }
    try {
      const tables = [
        db.offlineOrders,
        db.offlineActivities,
        db.offlineChecklists,
        db.offlineCatalogs
      ];
      let recordsDeleted = 0;
      await db.transaction("rw", [...tables, db.offlineMetadata], async () => {
        for (const table of tables) {
          recordsDeleted += await table.where("expiresAt").belowOrEqual(now).delete();
        }
        const metadata = await db.offlineMetadata.get("snapshot");
        if (metadata && Date.parse(metadata.expiresAt) <= timestamp) {
          await db.offlineMetadata.delete("snapshot");
          recordsDeleted += 1;
        }
      });
      return {
        databasesDeleted: 0,
        recordsDeleted,
        code: recordsDeleted ? "CLEARED" : "NOT_FOUND"
      };
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async clearCurrentUserData(): Promise<OfflineCleanupResult> {
    await this.deleteDatabase();
    return { databasesDeleted: 1, recordsDeleted: 0, code: "CLEARED" };
  }

  async deleteDatabase(): Promise<void> {
    if (!this.databaseName) this.databaseName = await contextDatabaseName(this.context);
    await this.close();
    try {
      await Dexie.delete(this.databaseName);
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  getDatabaseNameForTesting(): string {
    return this.databaseName;
  }
}

async function deleteMatchingDatabases(predicate: (name: string) => boolean): Promise<OfflineCleanupResult> {
  const names = (await Dexie.getDatabaseNames()).filter(
    (name) => name.startsWith(`${OFFLINE_DATABASE_PREFIX}-`) && predicate(name)
  );
  let deleted = 0;
  for (const name of names) {
    await Dexie.delete(name);
    deleted += 1;
  }
  return {
    databasesDeleted: deleted,
    recordsDeleted: 0,
    code: deleted ? "CLEARED" : "NOT_FOUND"
  };
}

export async function clearCurrentCompanyData(
  context: OfflineStorageContext
): Promise<OfflineCleanupResult> {
  const segments = await contextDatabaseSegments(context);
  const prefix = `${OFFLINE_DATABASE_PREFIX}-${segments.environment}-${segments.company}-`;
  return deleteMatchingDatabases((name) => name.startsWith(prefix));
}

export async function clearCurrentEnvironmentData(
  context: OfflineStorageContext
): Promise<OfflineCleanupResult> {
  const segments = await contextDatabaseSegments(context);
  const prefix = `${OFFLINE_DATABASE_PREFIX}-${segments.environment}-`;
  return deleteMatchingDatabases((name) => name.startsWith(prefix));
}

export async function clearAllOfflineData(): Promise<OfflineCleanupResult> {
  return deleteMatchingDatabases(() => true);
}

export async function loadOfflineOperationQueueRepository() {
  return import("./operationQueue.ts");
}
