import type { OfflineRepositoryContext } from "@apex-os/types/offline";
import { assertSameContext } from "./context.ts";
import { OfflineStorageError, toOfflineStorageError } from "./errors.ts";
import type { ApexOfflineDatabase } from "./database.ts";
import type {
  OfflineActivityRecord,
  OfflineCatalogRecord,
  OfflineChecklistRecord,
  OfflineMetadataRecord,
  OfflineOrderRecord,
  OfflineStorageContext
} from "./types.ts";

function isFresh(expiresAt: string, now = Date.now()): boolean {
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) {
    throw new OfflineStorageError("CORRUPT_DATA", "Un registro local tiene expiracion invalida.");
  }
  return expires > now;
}

abstract class ContextBoundRepository {
  protected readonly db: ApexOfflineDatabase;
  protected readonly storageContext: OfflineStorageContext;
  protected readonly now: () => Date;

  constructor(db: ApexOfflineDatabase, context: OfflineStorageContext, now: () => Date = () => new Date()) {
    this.db = db;
    this.storageContext = context;
    this.now = now;
  }

  protected assertContext(context: OfflineRepositoryContext): void {
    assertSameContext(this.storageContext, {
      ...this.storageContext,
      tenantId: context.tenantId,
      userId: context.userId
    });
  }

  protected assertRecordContext(record: {
    environmentId: string;
    companyId: string;
    userId: string;
  }): void {
    if (
      record.environmentId !== this.storageContext.environmentId ||
      record.companyId !== this.storageContext.companyId ||
      record.userId !== this.storageContext.userId
    ) {
      throw new OfflineStorageError("CORRUPT_DATA", "El registro pertenece a otro contexto.");
    }
  }
}

export class DexieOfflineOrderRepository extends ContextBoundRepository {
  async getById(
    context: OfflineRepositoryContext,
    id: string
  ): Promise<OfflineOrderRecord | null> {
    this.assertContext(context);
    try {
      const record = await this.db.offlineOrders.get(`order:${id}`);
      if (!record) return null;
      this.assertRecordContext(record);
      return isFresh(record.expiresAt, this.now().getTime()) ? record : null;
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async list(context: OfflineRepositoryContext): Promise<OfflineOrderRecord[]> {
    this.assertContext(context);
    try {
      const records = await this.db.offlineOrders.toArray();
      records.forEach((record) => this.assertRecordContext(record));
      return records.filter((record) => isFresh(record.expiresAt, this.now().getTime()));
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async listByTechnician(
    context: OfflineRepositoryContext,
    technicianId: string
  ): Promise<OfflineOrderRecord[]> {
    this.assertContext(context);
    try {
      const records = await this.db.offlineOrders
        .where("assignedTechnicianId")
        .equals(technicianId)
        .toArray();
      records.forEach((record) => this.assertRecordContext(record));
      return records.filter((record) => isFresh(record.expiresAt, this.now().getTime()));
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }
}

export class DexieOfflineActivityRepository extends ContextBoundRepository {
  async listByOrder(
    context: OfflineRepositoryContext,
    orderId: string
  ): Promise<OfflineActivityRecord[]> {
    this.assertContext(context);
    try {
      const records = await this.db.offlineActivities.where("orderId").equals(orderId).sortBy("sequence");
      records.forEach((record) => this.assertRecordContext(record));
      return records.filter((record) => isFresh(record.expiresAt, this.now().getTime()));
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }
}

export class DexieOfflineChecklistRepository extends ContextBoundRepository {
  async listByOrder(
    context: OfflineRepositoryContext,
    orderId: string
  ): Promise<OfflineChecklistRecord[]> {
    this.assertContext(context);
    try {
      const records = await this.db.offlineChecklists.where("orderId").equals(orderId).sortBy("sequence");
      records.forEach((record) => this.assertRecordContext(record));
      return records.filter((record) => isFresh(record.expiresAt, this.now().getTime()));
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }
}

export class DexieOfflineCatalogRepository extends ContextBoundRepository {
  async listByType(
    context: OfflineStorageContext,
    catalogType: string
  ): Promise<OfflineCatalogRecord[]> {
    assertSameContext(this.storageContext, context);
    try {
      const records = await this.db.offlineCatalogs.where("catalogType").equals(catalogType).toArray();
      records.forEach((record) => this.assertRecordContext(record));
      return records.filter((record) => isFresh(record.expiresAt, this.now().getTime()));
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }
}

export class DexieOfflineMetadataRepository extends ContextBoundRepository {
  async get(context: OfflineRepositoryContext): Promise<OfflineMetadataRecord | null> {
    this.assertContext(context);
    try {
      const metadata = await this.db.offlineMetadata.get("snapshot");
      if (!metadata) return null;
      if (
        metadata.environmentId !== this.storageContext.environmentId ||
        metadata.companyId !== this.storageContext.companyId ||
        metadata.tenantId !== this.storageContext.tenantId ||
        metadata.userId !== this.storageContext.userId
      ) {
        throw new OfflineStorageError("CORRUPT_DATA", "La metadata pertenece a otro contexto.");
      }
      return isFresh(metadata.expiresAt, this.now().getTime())
        ? metadata
        : { ...metadata, retentionState: "EXPIRED_RETAINED" };
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }
}
