import Dexie from "dexie";
import { assertSameContext, contextDatabaseName, normalizeContext } from "./context.ts";
import { ApexOfflineDatabase } from "./database.ts";
import { OfflineStorageError, toOfflineStorageError } from "./errors.ts";
import type {
  OfflineOperationErrorCategory,
  OfflineOperationMetadataRecord,
  OfflineOperationRecord,
  OfflineOperationStatus,
  OfflineOperationType,
  OfflineStorageContext
} from "./types.ts";

export const OFFLINE_QUEUE_LIMITS = Object.freeze({
  maxPendingOperations: 500,
  maxPayloadBytes: 16 * 1024,
  maxStructuredBytes: 5 * 1024 * 1024,
  maxRetries: 8,
  processingTimeoutMs: 5 * 60 * 1000
});

const RETRYABLE_CATEGORIES = new Set<OfflineOperationErrorCategory>([
  "NETWORK",
  "TIMEOUT",
  "SERVER_TEMPORARY"
]);
const VALID_TRANSITIONS: Record<OfflineOperationStatus, ReadonlySet<OfflineOperationStatus>> = {
  PENDING: new Set(["PROCESSING", "DISCARDED", "BLOCKED"]),
  PROCESSING: new Set(["CONFIRMED", "RETRYABLE", "BLOCKED", "CONFLICT"]),
  RETRYABLE: new Set(["PROCESSING", "DISCARDED", "BLOCKED"]),
  BLOCKED: new Set(["DISCARDED"]),
  CONFLICT: new Set(["DISCARDED"]),
  CONFIRMED: new Set(),
  DISCARDED: new Set()
};

export interface EnqueueOfflineOperation {
  operationId: string;
  idempotencyKey: string;
  installationId: string;
  entityType: string;
  entityId: string;
  operationType: OfflineOperationType;
  payload: Record<string, unknown>;
  baseVersion: number;
  createdAtDevice: string;
  dependsOn?: string[];
}

export interface OfflineQueueOptions {
  now?: () => Date;
  allowedOperationTypes?: readonly OfflineOperationType[];
  limits?: Partial<typeof OFFLINE_QUEUE_LIMITS>;
  migrationFailure?: () => boolean;
  openFailure?: () => void;
  transactionFailure?: () => void;
}

function assertText(value: unknown, label: string, max = 200): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new OfflineStorageError("OPERATION_INVALID", `${label} no es valido.`);
  }
}

function assertDate(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new OfflineStorageError("OPERATION_INVALID", `${label} no es ISO-8601.`);
  }
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new OfflineStorageError("OPERATION_INVALID", "operationId debe ser UUID.");
  }
}

function assertSafePayload(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OfflineStorageError("OPERATION_INVALID", "El payload debe ser un objeto.");
  }
  const forbidden = /token|password|secret|credential|cookie|authorization/i;
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    for (const [key, nested] of Object.entries(current)) {
      if (forbidden.test(key)) {
        throw new OfflineStorageError("OPERATION_INVALID", "El payload contiene un campo prohibido.");
      }
      visit(nested);
    }
  };
  visit(value);
}

function backoffMs(retryCount: number): number {
  return Math.min(60 * 60 * 1000, 5_000 * 2 ** Math.max(0, retryCount - 1));
}

export class DexieOfflineOperationQueueRepository {
  readonly context: OfflineStorageContext;
  private readonly options: OfflineQueueOptions;
  private readonly limits: typeof OFFLINE_QUEUE_LIMITS;
  private db: ApexOfflineDatabase | null = null;

  constructor(context: OfflineStorageContext, options: OfflineQueueOptions = {}) {
    this.context = normalizeContext(context);
    this.options = options;
    this.limits = { ...OFFLINE_QUEUE_LIMITS, ...options.limits };
  }

  private now(): Date {
    return this.options.now?.() || new Date();
  }

  async open(): Promise<void> {
    if (this.db?.isOpen()) return;
    try {
      this.db = new ApexOfflineDatabase(
        await contextDatabaseName(this.context),
        this.options.migrationFailure
      );
      this.options.openFailure?.();
      await this.db.open();
      await this.resetInterruptedOperations();
    } catch (error) {
      this.db?.close();
      this.db = null;
      throw toOfflineStorageError(error);
    }
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private requireDb(): ApexOfflineDatabase {
    if (!this.db?.isOpen()) {
      throw new OfflineStorageError("DATABASE_CLOSED", "La cola local esta cerrada.", true);
    }
    return this.db;
  }

  private assertRecordContext(record: OfflineOperationRecord): void {
    if (
      record.environmentId !== this.context.environmentId ||
      record.companyId !== this.context.companyId ||
      record.userId !== this.context.userId
    ) {
      throw new OfflineStorageError("CORRUPT_DATA", "La operacion pertenece a otro contexto.");
    }
  }

  private validateInput(input: EnqueueOfflineOperation): void {
    assertUuid(input.operationId);
    assertText(input.idempotencyKey, "idempotencyKey");
    assertText(input.installationId, "installationId");
    assertText(input.entityType, "entityType");
    assertText(input.entityId, "entityId");
    assertDate(input.createdAtDevice, "createdAtDevice");
    if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
      throw new OfflineStorageError("OPERATION_INVALID", "baseVersion no es valido.");
    }
    if (!this.options.allowedOperationTypes?.includes(input.operationType)) {
      throw new OfflineStorageError("OPERATION_TYPE_DISABLED", "El tipo de operacion no esta habilitado.");
    }
    assertSafePayload(input.payload);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(input.payload)).byteLength;
    if (payloadBytes > this.limits.maxPayloadBytes) {
      throw new OfflineStorageError("OPERATION_LIMIT_EXCEEDED", "El payload supera el limite local.");
    }
  }

  async enqueue(input: EnqueueOfflineOperation): Promise<OfflineOperationRecord> {
    this.validateInput(input);
    const db = this.requireDb();
    const existingById = await db.offlineOperations.get(input.operationId);
    if (existingById) {
      this.assertRecordContext(existingById);
      return existingById;
    }
    const existingByKey = await db.offlineOperations
      .where("idempotencyKey")
      .equals(input.idempotencyKey)
      .first();
    if (existingByKey) {
      this.assertRecordContext(existingByKey);
      return existingByKey;
    }
    try {
      return await db.transaction(
        "rw",
        [db.offlineOperations, db.offlineOperationMetadata],
        async () => {
          const duplicate = await db.offlineOperations
            .where("idempotencyKey")
            .equals(input.idempotencyKey)
            .first();
          if (duplicate) return duplicate;
          const activeCount = await db.offlineOperations
            .where("status")
            .anyOf(["PENDING", "PROCESSING", "RETRYABLE", "BLOCKED", "CONFLICT"])
            .count();
          if (activeCount >= this.limits.maxPendingOperations) {
            throw new OfflineStorageError(
              "OPERATION_LIMIT_EXCEEDED",
              "La cola alcanzo el limite de operaciones pendientes."
            );
          }
          const structuredBytes = (await db.offlineOperations.toArray()).reduce(
            (total, operation) =>
              total + new TextEncoder().encode(JSON.stringify(operation.payload)).byteLength,
            new TextEncoder().encode(JSON.stringify(input.payload)).byteLength
          );
          if (structuredBytes > this.limits.maxStructuredBytes) {
            throw new OfflineStorageError(
              "OPERATION_LIMIT_EXCEEDED",
              "La cola supera el limite total de almacenamiento estructurado."
            );
          }
          const dependencies = [...new Set(input.dependsOn || [])];
          await this.assertDependencies(db, input.operationId, dependencies);
          const metadata = await this.metadata(db);
          const now = this.now().toISOString();
          const record: OfflineOperationRecord = {
            ...input,
            dependsOn: dependencies,
            environmentId: this.context.environmentId,
            companyId: this.context.companyId,
            userId: this.context.userId,
            sequence: metadata.nextSequence,
            createdAtLocal: now,
            updatedAtLocal: now,
            status: "PENDING",
            retryCount: 0,
            nextRetryAt: null,
            lastAttemptAt: null,
            lastErrorCode: null,
            lastErrorCategory: null,
            schemaVersion: 1
          };
          this.options.transactionFailure?.();
          await db.offlineOperations.add(record);
          await this.updateMetadata(db, {
            ...metadata,
            nextSequence: metadata.nextSequence + 1,
            lastOperationCreatedAt: now,
            lastTransitionAt: now
          });
          return record;
        }
      );
    } catch (error) {
      if (error instanceof Dexie.ConstraintError || (error instanceof Error && error.name === "ConstraintError")) {
        const duplicate = await db.offlineOperations
          .where("idempotencyKey")
          .equals(input.idempotencyKey)
          .first();
        if (duplicate) return duplicate;
      }
      throw toOfflineStorageError(error);
    }
  }

  private async assertDependencies(
    db: ApexOfflineDatabase,
    operationId: string,
    dependencies: string[]
  ): Promise<void> {
    if (dependencies.includes(operationId)) {
      throw new OfflineStorageError("OPERATION_DEPENDENCY_INVALID", "Dependencia circular.");
    }
    const records = await db.offlineOperations.bulkGet(dependencies);
    if (records.some((record) => !record)) {
      throw new OfflineStorageError("OPERATION_DEPENDENCY_INVALID", "Dependencia inexistente.");
    }
    records.forEach((record) => {
      if (record) this.assertRecordContext(record);
    });
    const visit = async (id: string, seen: Set<string>): Promise<void> => {
      if (id === operationId || seen.has(id)) {
        throw new OfflineStorageError("OPERATION_DEPENDENCY_INVALID", "Dependencia circular.");
      }
      seen.add(id);
      const record = await db.offlineOperations.get(id);
      for (const parent of record?.dependsOn || []) await visit(parent, new Set(seen));
    };
    for (const dependency of dependencies) await visit(dependency, new Set());
  }

  async getById(operationId: string): Promise<OfflineOperationRecord | null> {
    const record = await this.requireDb().offlineOperations.get(operationId);
    if (!record) return null;
    this.assertRecordContext(record);
    return record;
  }

  async getByIdempotencyKey(key: string): Promise<OfflineOperationRecord | null> {
    const record = await this.requireDb().offlineOperations.where("idempotencyKey").equals(key).first();
    if (!record) return null;
    this.assertRecordContext(record);
    return record;
  }

  async listPending(): Promise<OfflineOperationRecord[]> {
    const records = await this.requireDb().offlineOperations
      .where("status")
      .anyOf(["PENDING", "PROCESSING", "RETRYABLE"])
      .sortBy("sequence");
    records.forEach((record) => this.assertRecordContext(record));
    return records;
  }

  async listByStatus(status: OfflineOperationStatus): Promise<OfflineOperationRecord[]> {
    const records = await this.requireDb().offlineOperations
      .where("status")
      .equals(status)
      .sortBy("sequence");
    records.forEach((record) => this.assertRecordContext(record));
    return records;
  }

  async getNextExecutable(): Promise<OfflineOperationRecord | null> {
    const db = this.requireDb();
    const now = this.now().getTime();
    const candidates = await db.offlineOperations
      .where("status")
      .anyOf(["PENDING", "RETRYABLE"])
      .sortBy("sequence");
    for (const candidate of candidates) {
      this.assertRecordContext(candidate);
      if (candidate.nextRetryAt && Date.parse(candidate.nextRetryAt) > now) continue;
      const dependencies = await db.offlineOperations.bulkGet(candidate.dependsOn);
      if (dependencies.some((item) => item && ["BLOCKED", "CONFLICT", "DISCARDED"].includes(item.status))) {
        await this.transition(candidate.operationId, "BLOCKED", {
          errorCode: "DEPENDENCY_BLOCKED",
          errorCategory: "VALIDATION"
        });
        continue;
      }
      if (dependencies.every((item) => item?.status === "CONFIRMED")) return candidate;
    }
    return null;
  }

  private async transition(
    operationId: string,
    status: OfflineOperationStatus,
    error?: { errorCode: string; errorCategory: OfflineOperationErrorCategory }
  ): Promise<OfflineOperationRecord> {
    const db = this.requireDb();
    return db.transaction("rw", [db.offlineOperations, db.offlineOperationMetadata], async () => {
      const record = await db.offlineOperations.get(operationId);
      if (!record) throw new OfflineStorageError("OPERATION_NOT_FOUND", "Operacion no encontrada.");
      this.assertRecordContext(record);
      if (!VALID_TRANSITIONS[record.status].has(status)) {
        throw new OfflineStorageError("OPERATION_TRANSITION_INVALID", "Transicion no permitida.");
      }
      const now = this.now().toISOString();
      const updated: OfflineOperationRecord = {
        ...record,
        status,
        updatedAtLocal: now,
        lastAttemptAt: status === "PROCESSING" ? now : record.lastAttemptAt,
        lastErrorCode: error?.errorCode || (status === "CONFIRMED" ? null : record.lastErrorCode),
        lastErrorCategory:
          error?.errorCategory || (status === "CONFIRMED" ? null : record.lastErrorCategory)
      };
      await db.offlineOperations.put(updated);
      const metadata = await this.metadata(db);
      await this.updateMetadata(db, {
        ...metadata,
        lastTransitionAt: now,
        lastErrorCode: error?.errorCode || metadata.lastErrorCode
      });
      return updated;
    });
  }

  markProcessing(id: string) { return this.transition(id, "PROCESSING"); }
  markConfirmed(id: string) { return this.transition(id, "CONFIRMED"); }
  markBlocked(id: string, code = "BLOCKED") {
    return this.transition(id, "BLOCKED", { errorCode: code, errorCategory: "AUTHORIZATION" });
  }
  markConflict(id: string, code = "CONFLICT") {
    return this.transition(id, "CONFLICT", { errorCode: code, errorCategory: "CONFLICT" });
  }
  markDiscarded(id: string) { return this.transition(id, "DISCARDED"); }

  async markRetryable(
    id: string,
    code: string,
    category: OfflineOperationErrorCategory
  ): Promise<OfflineOperationRecord> {
    if (!RETRYABLE_CATEGORIES.has(category)) {
      throw new OfflineStorageError("OPERATION_TRANSITION_INVALID", "La categoria no es reintentable.");
    }
    const current = await this.getById(id);
    if (!current) throw new OfflineStorageError("OPERATION_NOT_FOUND", "Operacion no encontrada.");
    if (current.retryCount + 1 >= this.limits.maxRetries) return this.markBlocked(id, "MAX_RETRIES");
    const updated = await this.transition(id, "RETRYABLE", {
      errorCode: code,
      errorCategory: category
    });
    return this.incrementRetry(updated.operationId);
  }

  async incrementRetry(id: string): Promise<OfflineOperationRecord> {
    const db = this.requireDb();
    const record = await db.offlineOperations.get(id);
    if (!record || record.status !== "RETRYABLE") {
      throw new OfflineStorageError("OPERATION_TRANSITION_INVALID", "El reintento no es valido.");
    }
    const retryCount = record.retryCount + 1;
    const updated = {
      ...record,
      retryCount,
      nextRetryAt: new Date(this.now().getTime() + backoffMs(retryCount)).toISOString(),
      updatedAtLocal: this.now().toISOString()
    };
    await db.offlineOperations.put(updated);
    return updated;
  }

  async resetInterruptedOperations(): Promise<number> {
    const db = this.requireDb();
    const threshold = this.now().getTime() - this.limits.processingTimeoutMs;
    const records = await db.offlineOperations.where("status").equals("PROCESSING").toArray();
    let changed = 0;
    for (const record of records) {
      if (record.lastAttemptAt && Date.parse(record.lastAttemptAt) <= threshold) {
        await db.offlineOperations.put({
          ...record,
          status: "RETRYABLE",
          updatedAtLocal: this.now().toISOString(),
          nextRetryAt: this.now().toISOString(),
          lastErrorCode: "PROCESSING_INTERRUPTED",
          lastErrorCategory: "LOCAL_STORAGE"
        });
        changed += 1;
      }
    }
    return changed;
  }

  async deleteConfirmedBefore(isoDate: string): Promise<number> {
    assertDate(isoDate, "cleanupBefore");
    const db = this.requireDb();
    const records = await db.offlineOperations.where("status").equals("CONFIRMED").toArray();
    const ids = records
      .filter((record) => record.updatedAtLocal < isoDate)
      .map((record) => record.operationId);
    await db.offlineOperations.bulkDelete(ids);
    const metadata = await this.metadata(db);
    await this.updateMetadata(db, { ...metadata, lastCleanupAt: this.now().toISOString() });
    return ids.length;
  }

  async clearOperationsByContext(context: OfflineStorageContext): Promise<number> {
    assertSameContext(this.context, context);
    const db = this.requireDb();
    const count = await db.offlineOperations.count();
    await db.transaction("rw", [db.offlineOperations, db.offlineOperationMetadata], async () => {
      await db.offlineOperations.clear();
      await db.offlineOperationMetadata.delete("queue");
    });
    return count;
  }

  async countByStatus(): Promise<Partial<Record<OfflineOperationStatus, number>>> {
    const counts: Partial<Record<OfflineOperationStatus, number>> = {};
    for (const status of Object.keys(VALID_TRANSITIONS) as OfflineOperationStatus[]) {
      counts[status] = await this.requireDb().offlineOperations.where("status").equals(status).count();
    }
    return counts;
  }

  async getMetadata(): Promise<OfflineOperationMetadataRecord> {
    return this.metadata(this.requireDb());
  }

  private async metadata(db: ApexOfflineDatabase): Promise<OfflineOperationMetadataRecord> {
    const metadata =
      (await db.offlineOperationMetadata.get("queue")) || {
        key: "queue",
        environmentId: this.context.environmentId,
        companyId: this.context.companyId,
        userId: this.context.userId,
        nextSequence: 1,
        counts: {},
        lastOperationCreatedAt: null,
        lastTransitionAt: null,
        lastErrorCode: null,
        lastCleanupAt: null,
        schemaVersion: 1
      };
    if (
      metadata.environmentId !== this.context.environmentId ||
      metadata.companyId !== this.context.companyId ||
      metadata.userId !== this.context.userId
    ) {
      throw new OfflineStorageError("CORRUPT_DATA", "La metadata de cola pertenece a otro contexto.");
    }
    return metadata;
  }

  private async updateMetadata(
    db: ApexOfflineDatabase,
    metadata: OfflineOperationMetadataRecord
  ): Promise<void> {
    metadata.counts = await this.countByStatusWithin(db);
    await db.offlineOperationMetadata.put(metadata);
  }

  private async countByStatusWithin(
    db: ApexOfflineDatabase
  ): Promise<Partial<Record<OfflineOperationStatus, number>>> {
    const records = await db.offlineOperations.toArray();
    return records.reduce<Partial<Record<OfflineOperationStatus, number>>>((counts, record) => {
      counts[record.status] = (counts[record.status] || 0) + 1;
      return counts;
    }, {});
  }
}
