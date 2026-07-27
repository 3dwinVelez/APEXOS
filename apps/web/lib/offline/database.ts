import Dexie, { type EntityTable } from "dexie";
import type {
  OfflineActivityRecord,
  OfflineCatalogRecord,
  OfflineChecklistRecord,
  OfflineMetadataRecord,
  OfflineOperationMetadataRecord,
  OfflineOperationRecord,
  OfflineOrderRecord,
  OfflineSchemaStateRecord
} from "./types.ts";

export const OFFLINE_SCHEMA_V1 = {
  offlineOrders:
    "localKey,serverId,assignedTechnicianId,serverVersion,expiresAt,[companyId+userId]",
  offlineActivities: "localKey,serverId,orderId,serverVersion,expiresAt,[companyId+userId]",
  offlineChecklists: "localKey,serverId,orderId,serverVersion,expiresAt,[companyId+userId]",
  offlineCatalogs: "localKey,catalogType,serverId,serverVersion,expiresAt,[companyId+userId]",
  offlineMetadata: "key,expiresAt",
  offlineSchemaState: "key"
} as const;

export const OFFLINE_SCHEMA_V2 = {
  ...OFFLINE_SCHEMA_V1,
  offlineMetadata: "key,expiresAt,retentionState"
} as const;

export const OFFLINE_SCHEMA_V3 = {
  ...OFFLINE_SCHEMA_V2,
  offlineOperations:
    "operationId,&idempotencyKey,status,sequence,entityType,entityId,createdAtLocal,nextRetryAt,[environmentId+companyId+userId],[status+sequence]",
  offlineOperationMetadata: "key,[environmentId+companyId+userId]"
} as const;

export class ApexOfflineDatabase extends Dexie {
  offlineOrders!: EntityTable<OfflineOrderRecord, "localKey">;
  offlineActivities!: EntityTable<OfflineActivityRecord, "localKey">;
  offlineChecklists!: EntityTable<OfflineChecklistRecord, "localKey">;
  offlineCatalogs!: EntityTable<OfflineCatalogRecord, "localKey">;
  offlineMetadata!: EntityTable<OfflineMetadataRecord, "key">;
  offlineSchemaState!: EntityTable<OfflineSchemaStateRecord, "key">;
  offlineOperations!: EntityTable<OfflineOperationRecord, "operationId">;
  offlineOperationMetadata!: EntityTable<OfflineOperationMetadataRecord, "key">;

  constructor(name: string, migrationFailure?: () => boolean) {
    super(name, { cache: "disabled" });
    this.version(1).stores(OFFLINE_SCHEMA_V1);
    this.version(2)
      .stores(OFFLINE_SCHEMA_V2)
      .upgrade(async (transaction) => {
        if (migrationFailure?.()) throw new Error("Injected migration failure");
        await transaction
          .table<OfflineMetadataRecord, string>("offlineMetadata")
          .toCollection()
          .modify((metadata) => {
            metadata.retentionState = metadata.retentionState || "ACTIVE";
          });
        await transaction.table<OfflineSchemaStateRecord, string>("offlineSchemaState").put({
          key: "schema",
          schemaVersion: 2,
          migratedAt: new Date().toISOString(),
          migrationStatus: "READY"
        });
      });
    this.version(3)
      .stores(OFFLINE_SCHEMA_V3)
      .upgrade(async (transaction) => {
        if (migrationFailure?.()) throw new Error("Injected migration failure");
        await transaction.table<OfflineSchemaStateRecord, string>("offlineSchemaState").put({
          key: "schema",
          schemaVersion: 3,
          migratedAt: new Date().toISOString(),
          migrationStatus: "READY"
        });
      });
  }
}
