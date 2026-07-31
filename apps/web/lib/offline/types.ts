import type {
  OfflineActivityRepository,
  OfflineChecklistRepository,
  OfflineOrderRepository,
  OfflineRepositoryContext,
  OfflineStorageEstimate
} from "@apex-os/types/offline";

export const OFFLINE_LOCAL_SCHEMA_VERSION = 3;
export const OFFLINE_SNAPSHOT_SCHEMA_VERSION = 2;
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
  snapshotId: string;
  serverCheckpoint: string;
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

export type OfflineOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "RETRYABLE"
  | "BLOCKED"
  | "CONFLICT"
  | "CONFIRMED"
  | "DISCARDED";

export type OfflineOperationErrorCategory =
  | "NETWORK"
  | "TIMEOUT"
  | "SERVER_TEMPORARY"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "VALIDATION"
  | "CONFLICT"
  | "LOCAL_STORAGE"
  | "UNKNOWN";

export type OfflineOperationType =
  | "OBSERVATION_ADDED"
  | "ACTIVITY_COMPLETED"
  | "CHECKLIST_ITEM_UPDATED"
  | "SERVICE_STARTED"
  | "SERVICE_COMPLETION_REQUESTED"
  | "LOCATION_EVENT_RECORDED"
  | "EVIDENCE_REGISTERED"
  | "TEST_OPERATION";

export interface OfflineOperationRecord {
  operationId: string;
  idempotencyKey: string;
  environmentId: string;
  companyId: string;
  userId: string;
  installationId: string;
  entityType: string;
  entityId: string;
  operationType: OfflineOperationType;
  payload: Record<string, unknown>;
  baseVersion: number;
  sequence: number;
  createdAtDevice: string;
  createdAtLocal: string;
  updatedAtLocal: string;
  status: OfflineOperationStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorCategory: OfflineOperationErrorCategory | null;
  dependsOn: string[];
  schemaVersion: 1;
}

export interface OfflineOperationMetadataRecord {
  key: "queue";
  environmentId: string;
  companyId: string;
  userId: string;
  nextSequence: number;
  counts: Partial<Record<OfflineOperationStatus, number>>;
  lastOperationCreatedAt: string | null;
  lastTransitionAt: string | null;
  lastErrorCode: string | null;
  lastCleanupAt: string | null;
  schemaVersion: 1;
}

export interface OfflineSnapshot {
  context: OfflineStorageContext;
  schemaVersion: number;
  snapshotId: string;
  serverCheckpoint: string;
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
  metadata: {
    get(context: OfflineRepositoryContext): Promise<OfflineMetadataRecord | null>;
  };
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
