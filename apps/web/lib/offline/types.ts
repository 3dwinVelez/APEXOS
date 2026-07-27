import type {
  OfflineActivityRepository,
  OfflineChecklistRepository,
  OfflineMetadataRepository,
  OfflineOrderRepository,
  OfflineRepositoryContext,
  OfflineStorageEstimate
} from "@apex-os/types/offline";

export const OFFLINE_LOCAL_SCHEMA_VERSION = 2;
export const OFFLINE_LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

export type OfflineStorageContext = OfflineRepositoryContext & {
  environmentId: string;
  companyId: string;
};

export type RetentionState =
  | "ACTIVE"
  | "EXPIRED_RETAINED"
  | "BLOCKED"
  | "DELETE_REQUIRED";

export interface OfflineLocalRecord {
  localKey: string;
  localId: string;
  serverId: string;
  environmentId: string;
  companyId: string;
  userId: string;
  serverVersion: number;
  serverUpdatedAt: string;
  storedAt: string;
  expiresAt: string;
  schemaVersion: number;
}

export interface OfflineOrderRecord extends OfflineLocalRecord {
  orderId: string;
  orderNumber: string;
  status: string;
  assignedTechnicianId: string;
  customerDisplayName: string;
  serviceAddress: string;
  scheduledAt: string | null;
  minimumOperationalData: {
    referenceDisplayName?: string;
    serviceSummary?: string;
    contactPhone?: string;
  };
  syncStatus: "SYNCED";
  updatedAtLocal: string;
  entityVersion: number;
}

export interface OfflineActivityRecord extends OfflineLocalRecord {
  activityId: string;
  orderId: string;
  activityType: string;
  title: string;
  description: string;
  status: string;
  sequence: number;
  required: boolean;
  syncStatus: "SYNCED";
  updatedAtLocal: string;
  entityVersion: number;
}

export interface OfflineChecklistRecord extends OfflineLocalRecord {
  checklistId: string;
  orderId: string;
  label: string;
  sequence: number;
  required: boolean;
  value: string | boolean | number | null;
  syncStatus: "SYNCED";
  updatedAtLocal: string;
  entityVersion: number;
}

export interface OfflineCatalogRecord extends OfflineLocalRecord {
  catalogType: string;
  code: string;
  label: string;
}

export interface OfflineMetadataRecord {
  key: "snapshot";
  environmentId: string;
  companyId: string;
  tenantId: string;
  userId: string;
  schemaVersion: number;
  generatedAt: string;
  hydratedAt: string;
  expiresAt: string;
  retentionState?: RetentionState;
}

export interface OfflineSchemaStateRecord {
  key: "installation" | "schema";
  installationId?: string;
  createdAt?: string;
  lastSeenAt?: string;
  schemaVersion: number;
  migratedAt?: string;
  migrationStatus?: "READY" | "FAILED";
  migrationCode?: string;
}

export interface OfflineSnapshot {
  context: OfflineStorageContext;
  schemaVersion: number;
  generatedAt: string;
  expiresAt?: string;
  orders: Array<
    Omit<
      OfflineOrderRecord,
      | "localKey"
      | "localId"
      | "environmentId"
      | "companyId"
      | "userId"
      | "storedAt"
      | "expiresAt"
      | "schemaVersion"
      | "syncStatus"
      | "updatedAtLocal"
      | "entityVersion"
    >
  >;
  activities: Array<
    Omit<
      OfflineActivityRecord,
      | "localKey"
      | "localId"
      | "environmentId"
      | "companyId"
      | "userId"
      | "storedAt"
      | "expiresAt"
      | "schemaVersion"
      | "syncStatus"
      | "updatedAtLocal"
      | "entityVersion"
    >
  >;
  checklists: Array<
    Omit<
      OfflineChecklistRecord,
      | "localKey"
      | "localId"
      | "environmentId"
      | "companyId"
      | "userId"
      | "storedAt"
      | "expiresAt"
      | "schemaVersion"
      | "syncStatus"
      | "updatedAtLocal"
      | "entityVersion"
    >
  >;
  catalogs: Array<
    Omit<
      OfflineCatalogRecord,
      | "localKey"
      | "localId"
      | "environmentId"
      | "companyId"
      | "userId"
      | "storedAt"
      | "expiresAt"
      | "schemaVersion"
    >
  >;
}

export interface OfflineCatalogRepository {
  listByType(context: OfflineStorageContext, catalogType: string): Promise<OfflineCatalogRecord[]>;
}

export interface OfflineReadStorageTransaction {
  orders: Pick<OfflineOrderRepository<OfflineOrderRecord>, "getById" | "list"> & {
    listByTechnician(
      context: OfflineRepositoryContext,
      technicianId: string
    ): Promise<OfflineOrderRecord[]>;
  };
  activities: Pick<OfflineActivityRepository<OfflineActivityRecord>, "listByOrder">;
  checklists: Pick<OfflineChecklistRepository<OfflineChecklistRecord>, "listByOrder">;
  catalogs: OfflineCatalogRepository;
  metadata: Pick<OfflineMetadataRepository, "get">;
}

export interface OfflineReadStorageAdapter {
  readonly schemaVersion: number;
  readonly context: OfflineStorageContext;
  open(): Promise<void>;
  close(): Promise<void>;
  transaction<T>(work: (repositories: OfflineReadStorageTransaction) => Promise<T>): Promise<T>;
  estimate(): Promise<OfflineStorageEstimate>;
  getInstallationIdentity(): Promise<{
    installationId: string;
    createdAt: string;
    lastSeenAt: string;
    schemaVersion: number;
  }>;
  clearExpiredData(now?: string): Promise<OfflineCleanupResult>;
  clearCurrentUserData(): Promise<OfflineCleanupResult>;
  deleteDatabase(): Promise<void>;
}

export interface OfflineCleanupResult {
  databasesDeleted: number;
  recordsDeleted: number;
  code: "CLEARED" | "NOT_FOUND" | "PARTIAL";
}

export interface OfflineServerCapability {
  technician: boolean;
  environmentId: string;
  companyId: string;
  userId: string;
  authorizationSource: "server";
}

export type OfflineStorageAccess =
  | { mode: "offline-read"; adapter: OfflineReadStorageAdapter }
  | { mode: "connected"; reason: "DISABLED" | "CONTEXT_MISMATCH" | "STORAGE_UNAVAILABLE" };
